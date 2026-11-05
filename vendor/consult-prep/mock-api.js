/*
 * 離線模擬資料中心（mock-api.js）
 * 與 gas/Code.gs 相同的 action 介面；資料存於 localStorage（索引、答案）與 IndexedDB（檔案內容）。
 * Node 環境（測試）自動改用記憶體儲存。
 *
 * 使用：在 api.js 之前載入 schema.js，之後載入本檔；CONSULT_CONFIG.GAS_URL 為空時 api.js 自動轉呼叫 CONSULT_MOCK_API.handle(payload)。
 * 示範資料：window.CONSULT_MOCK_SEED（mock/seed-data.js）存在時，首次啟用自動載入。
 * 管理密碼：預設 grace2026（可由 CONSULT_CONFIG.mockPassword 覆寫；僅供離線示範）。
 * 登入：remember=true 簽發 30 天效期，否則 12 小時（與 Code.gs 相同）。
 * 名冊與填寫進度：存於同一 localStorage 物件（roster、progress）；roster_lookup 限流計數只在記憶體。
 * 2.5.0：優先批次（batches）、通知範本（templates）、LINE 綁定與推播模擬（line）；
 *   LINE 模擬：line_settings_save 後視為已設定；Webhook 以與 LINE 相同形狀的 body（destination＋events）呼叫 handle；
 *   推播成功計入 line.used；line.limit／line.used 可由 CONSULT_MOCK_API._db().line 調整以模擬額度不足。
 */
(function (root, factory) {
  var api = factory(root);
  root.CONSULT_MOCK_API = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LS_KEY = 'consult_mock_db_v5';   // v5：作業封存結構、刪除、即時填寫進度、PDF 背景產生（2.3.0）；v4 以前不再讀取
  var DB_NAME = 'consult_mock_files';
  var TOKEN_TTL = 12 * 60 * 60 * 1000;               // 未勾選記住此裝置
  var TOKEN_TTL_REMEMBER = 30 * 24 * 60 * 60 * 1000; // 勾選記住此裝置（亦為效期上限，與 Code.gs 一致）

  function S() {
    var s = root.CONSULT_SCHEMA || (typeof require === 'function' ? require('../src/schema.js') : null);
    if (!s) throw new Error('mock-api 需要 CONSULT_SCHEMA');
    return s;
  }
  /** 3.0 函式層（schema3.js；瀏覽器須於 schema.js、model3.js 之後載入） */
  function S3() {
    var s = root.CONSULT_SCHEMA3 || (typeof require === 'function' ? (root.CONSULT_MODEL3 || require('../src/model3.js'), require('../src/schema3.js')) : null);
    if (!s) throw new Error('mock-api 需要 CONSULT_SCHEMA3');
    return s;
  }
  function isV3(a) { return !S3().isLegacy(a); }
  function password() { return ((root.CONSULT_CONFIG || {}).mockPassword) || 'grace2026'; }

  /* ---------------- 儲存層 ---------------- */
  var mem = { db: null, files: {}, rl: { fails: {}, locks: {}, minute: {} }, lookupTokens: {}, bindCodes: {} };
  function hasLS() { try { return !!(root.localStorage && root.localStorage.getItem); } catch (e) { return false; } }
  function loadDb() {
    if (mem.db) return mem.db;
    var raw = null;
    if (hasLS()) { try { raw = root.localStorage.getItem(LS_KEY); } catch (e) { raw = null; } }
    mem.db = raw ? JSON.parse(raw) : { index: [], submissions: {}, pending: {}, tokens: {}, seeded: false };
    if (!mem.db.roster) mem.db.roster = { entries: {}, count: 0, updatedAt: '' };
    if (!mem.db.roster.masked) mem.db.roster.masked = {};
    if (!mem.db.progress) mem.db.progress = {};
    if (!mem.db.batches) mem.db.batches = {};
    if (!mem.db.batchOrder) mem.db.batchOrder = [];
    if (!mem.db.templates) mem.db.templates = [];
    if (!mem.db.line) mem.db.line = { settings: null, bindings: {}, adminCodes: {}, used: 0, limit: S().LINE.monthlyQuota, pushed: [], retryKeys: {} };
    if (!mem.db.drive) mem.db.drive = {};            // 3.0：名冊鍵雜湊 → { rootFolderId, rootUrl, rootName, folders:{ itemId:folderId }, ownerEmail, counts:{ folderId:{ count, shortcuts, updated } } }
    if (!mem.db.supplements) mem.db.supplements = {}; // 3.0：回執 → [需求…]
    ensure31(mem.db);                                  // 3.1：追蹤名單、通知圖卡、記帳、還原
    if (recomputeGapCounts(mem.db)) saveDb();
    return mem.db;
  }
  /** 與 Code.gs recomputeGapCounts 相同：索引列缺口數由作業原始答案以現行 schema 重算（已移除類別不計）；回傳更新列數 */
  function recomputeGapCounts(db) {
    var s = S(), updated = 0;
    (db.index || []).forEach(function (ix) {
      var sub = db.submissions[ix.receiptId];
      var n = gapCountFromJson(s, sub && sub.data);
      if (n == null || ix.gapCount === n) return;
      ix.gapCount = n; updated++;
      if (sub && sub.index && sub.index !== ix) sub.index.gapCount = n;
    });
    return updated;
  }
  function gapCountFromJson(s, data) {
    if (!data || typeof data !== 'object') return null;
    if (data.raw && typeof data.raw === 'object') {
      if (isV3(data.raw)) return S3().gapCount3(S3().normalizeAnswers3(data.raw), data.driveStatus || null);
      return s.gapCount(s.normalizeAnswers(data.raw));
    }
    if (!data.gaps) return null;
    var legacy = s.LEGACY_CATEGORY_IDS || [];
    return s.gapCountOf({ uploadsMissing: (data.gaps.uploadsMissing || []).filter(function (x) { return !x || legacy.indexOf(x.id) < 0; }), noneStages: data.gaps.noneStages || [] });
  }
  /** 填寫進度鍵（與 Code.gs progressKeyOf 相同）：名冊主鍵＝正規化後的帳號或 Email；名冊查無時即正規化輸入 */
  function progressKeyOf(account) { return S().rosterKey(account); }
  /** 名冊鍵雜湊（離線模擬：兩組 FNV-1a 32 位元組成 16 碼十六進位；連線版為 SHA-256 前 16 碼，兩者皆只在各自環境內一致） */
  function keyHash(k) {
    k = String(k == null ? '' : k);
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < k.length; i++) {
      var c = k.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (c * 31 + i) & 0xffff; h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }
  /** 鍵雜湊 → { key(正規化鍵), name, masked }；查無回 null */
  /** 名冊條目（依鍵雜湊去重）→ [{ key, name, masked }] */
  function rosterRows(db) {
    var seen = {}, out = [];
    Object.keys(db.roster.entries).forEach(function (k) {
      var h = keyHash(k); if (seen[h]) return; seen[h] = 1;
      out.push({ key: h, name: db.roster.entries[k], masked: db.roster.masked[k] || S().maskKey(k) });
    });
    return out;
  }
  /** 進行中批次（未封存且未截止）成員索引：{ 鍵雜湊: [{ id, title }] } */
  function activeBatchIndex(db) {
    var idx = {}, now = Date.now();
    (db.batchOrder || []).forEach(function (id) {
      var b = db.batches[id]; if (!b || b.archived) return;
      var dl = S().parseDeadline(b.deadline); if (dl != null && now > dl) return;
      b.members.forEach(function (m) { (idx[m.key] = idx[m.key] || []).push({ id: b.id, title: b.title }); });
    });
    return idx;
  }
  function rosterByHash(db, h) {
    var keys = Object.keys(db.roster.entries);
    for (var i = 0; i < keys.length; i++) if (keyHash(keys[i]) === h) return { key: keys[i], name: db.roster.entries[keys[i]], masked: db.roster.masked[keys[i]] || S().maskKey(keys[i]) };
    return null;
  }
  function visibleBatchesFor(db, h, nowMs) {
    var s = S();
    return db.batchOrder.map(function (id) { return db.batches[id]; }).filter(function (b) { return b && s.batchVisible(b, nowMs) && !!s.batchMember(b, h); });
  }
  function pickBatchFor(db, h, nowMs) { return S().pickBatch(visibleBatchesFor(db, h, nowMs), nowMs); }
  function lineBindingOf(db, h) { var e = db.line.bindings[h]; return e && e.userId ? { bound: true, blocked: !!e.blocked, boundAt: e.boundAt || '', by: e.by || 'code', name: e.name || '' } : { bound: false, blocked: false, boundAt: '', by: '', name: '' }; }
  function lineChatUrlFor(db, h) { var e = db.line.bindings[h]; return e && e.userId ? S().lineChatUrl(db.line.chatAccount || '', e.userId) : ''; }
  /** LINE 個人資料模擬：db.line.notFriends 內的 userId → 404；db.line.profiles 有名稱者回名稱；其他回 null（失敗不阻擋） */
  var LINE_NOT_FRIEND_MSG = 'Messaging API 查無此 LINE 使用者，無法推播（可能未加好友、已封鎖，或貼上的是聊天室網址內的 ID——該 ID 與推播用的 userId 不同）。請對方先傳任一訊息給官方帳號，再從「最近傳訊者」選取';
  function lineProfile(db, userId) {
    if (!lineConfigured(db)) return { ok: false };
    if ((db.line.notFriends || []).indexOf(userId) >= 0) return { notFriend: true };
    var n = (db.line.profiles || {})[userId];
    return n ? { ok: true, displayName: n } : { ok: false };
  }
  /** batch_status 計算（與 Code.gs batchStatus 相同規則）；notify_recipients 的「批次未送出者」共用 */
  function batchStatusData(db, bs) {
    var s = S();
    var nowBS2 = Date.now(), createdMs = s.timeToMs(bs.createdAt);
    var byHashIdx = {};
    db.index.forEach(function (ix) { var h = keyHash(progressKeyOf(ix.account)); if (!byHashIdx[h] || byHashIdx[h].submittedAt < ix.submittedAt) byHashIdx[h] = ix; });
    var byHashProg = {};
    Object.keys(db.progress).forEach(function (k) { var pr = db.progress[k]; if (pr.status !== '已移除') byHashProg[keyHash(pr.key || progressKeyOf(pr.account))] = pr; });
    var sum = { none: 0, filling: 0, submitted: 0, onTime: 0, late: 0, bound: 0, blocked: 0 };
    var mem2 = bs.members.map(function (m) {
      var o = { key: m.key, name: m.name, masked: m.masked, callName: m.callName, state: 'none', percent: null, sectionLabel: '', startedAt: '', lastSeen: '', receiptId: '', submittedAt: '', onTime: null, lineBound: false, lineBlocked: false, lineName: '', lineBy: '', chatUrl: '', lastNotifiedAt: '', lastNotifyOk: null, lastNotifyError: '' };
      var ix = byHashIdx[m.key], subMs = ix ? s.timeToMs(ix.submittedAt) : null;
      if (ix && (ix.batchId === bs.id || (createdMs != null && subMs != null && subMs >= createdMs))) {
        o.state = 'submitted'; o.receiptId = ix.receiptId; o.submittedAt = ix.submittedAt; o.startedAt = ix.startedAt || '';
        o.onTime = ix.batchId === bs.id && ix.onTime != null ? ix.onTime : s.isOnTime(ix.submittedAt, bs.deadline);
        sum.submitted++; if (o.onTime) sum.onTime++; else sum.late++;
      } else {
        var pr2 = byHashProg[m.key];
        if (pr2 && pr2.status === '填寫中') { o.state = 'filling'; o.percent = pr2.percent == null ? null : pr2.percent; o.sectionLabel = pr2.sectionLabel || ''; o.startedAt = pr2.startedAt; o.lastSeen = pr2.lastSeen; sum.filling++; }
        else sum.none++;
      }
      var lb = lineBindingOf(db, m.key); o.lineBound = lb.bound; o.lineBlocked = lb.blocked; o.lineName = lb.name; o.lineBy = lb.by; if (lb.bound) o.chatUrl = lineChatUrlFor(db, m.key);
      if (lb.blocked) sum.blocked++; else if (lb.bound) sum.bound++;
      var n = bs.notify && bs.notify[m.key]; if (n) { o.lastNotifiedAt = n.at; o.lastNotifyOk = n.ok; o.lastNotifyError = n.error || ''; }
      return o;
    });

    return { batch: batchPublic(bs), members: mem2, summary: sum, now: tpeStamp(new Date(nowBS2)) };
  }
  /** 鍵 → 批次成員資料（最新建立者優先） */
  function memberIndex(db) {
    var idx = {};
    db.batchOrder.map(function (id) { return db.batches[id]; }).filter(Boolean).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
      .forEach(function (b) { b.members.forEach(function (m) { if (!idx[m.key]) idx[m.key] = m; }); });
    return idx;
  }
  function notifyRow(db, h, midx) {
    var r = rosterByHash(db, h), bm = midx[h], lb = lineBindingOf(db, h);
    if (!r && !bm) return null;
    var name = (r && r.name) || bm.name;
    return { key: h, name: name, masked: (r && r.masked) || (bm && bm.masked) || '', callName: (bm && bm.callName) || S().callName(name), lineBound: lb.bound, lineBlocked: lb.blocked, lineName: lb.name, chatUrl: lb.bound ? lineChatUrlFor(db, h) : '' };
  }
  /** notify_preview／notify_push 共用整理（規則同 Code.gs notifyBuild）；錯誤以 { error, code } 回傳 */
  function notifyBuild(db, req) {
    var s = S(), nowMs = Date.now(), seen = {}, keys = [];
    (Array.isArray(req.keys) ? req.keys : []).forEach(function (k) { k = String(k).toLowerCase(); if (/^[0-9a-f]{16}$/.test(k) && !seen[k]) { seen[k] = 1; keys.push(k); } });
    if (!keys.length) return { error: '請選擇收件人', code: 'ERR_VALIDATION' };
    if (keys.length > s.NOTIFY.maxRecipients) return { error: '一次最多 ' + s.NOTIFY.maxRecipients + ' 位', code: 'ERR_VALIDATION' };
    var t = null;
    if (req.templateId) { t = templateById(db, String(req.templateId)); if (!t) return { error: '找不到該範本', code: 'ERR_NOT_FOUND' }; }
    var over = String(req.bodyOverride == null ? '' : req.bodyOverride).replace(/\r\n?/g, '\n');
    var body = over.trim() ? over : (t ? t.body : '');
    if (!body.trim()) return { error: '請選擇範本或輸入通知內容', code: 'ERR_VALIDATION' };
    if (body.length > s.NOTIFY.maxBodyLength) return { error: '通知內容不可超過 ' + s.NOTIFY.maxBodyLength + ' 字', code: 'ERR_VALIDATION' };
    var dlMs = null;
    if (req.deadline) { dlMs = s.parseDeadline(req.deadline); if (dlMs == null) return { error: '截止時間格式不正確', code: 'ERR_VALIDATION' }; }
    var midx = memberIndex(db), cn = req.callNames && typeof req.callNames === 'object' ? req.callNames : {};
    var recips = [], missing = [];
    keys.forEach(function (h) {
      var r = notifyRow(db, h, midx); if (!r) { missing.push(h); return; }
      var c = String(cn[h] == null ? '' : cn[h]).trim().slice(0, s.BATCH.maxCallNameLength); if (c) r.callName = c;
      var pb = pickBatchFor(db, h, nowMs);
      r.batchId = pb ? pb.id : ''; r.batchTitle = pb ? pb.title : '';
      r.deadline = pb ? pb.deadline : (dlMs != null ? s.deadlineIso(dlMs) : '');
      recips.push(r);
    });
    return { body: body, template: t ? { id: t.id, name: t.name } : null, recips: recips, missing: missing, overridden: !!over.trim() };
  }
  function notifyText(db, body, r, withBind) {
    var s = S();
    var vars = { '稱呼': r.callName, '截止時間': r.deadline ? s.formatDeadline(r.deadline) : '', '作業連結': s.NOTIFY.workUrl, '綁定連結': '' };   // 2.6.1：不再產生綁定連結
    return s.renderTemplate(body, vars);
  }
  function notifyMsg(r, text) {
    var s = S();
    return { key: r.key, name: r.name, masked: r.masked, callName: r.callName, lineBound: r.lineBound, lineBlocked: r.lineBlocked, lineName: r.lineName, batchTitle: r.batchTitle,
      deadlineText: r.deadline ? s.formatDeadline(r.deadline) : '', text: text, length: text.length, tooLong: text.length > s.LINE.maxTextLength };
  }
  /** 逐人推播（line_push、notify_push 共用）；seed(m) 為冪等鍵 */
  function pushMessages(db, msgs, seed) {
    var s = S(), sent = [], failed = [], records = [], usedNow = 0;
    msgs.forEach(function (m) {
      var at = tpeStamp(new Date());
      if (m.tooLong) { failed.push({ key: m.key, name: m.name, error: '訊息超過 ' + s.LINE.maxTextLength + ' 字' }); records.push({ key: m.key, at: at, ok: false, error: '訊息過長' }); return; }
      var rk = seed(m), rec = { key: m.key, name: m.name, at: at };
      if (db.line.retryKeys[rk]) rec.duplicate = true;
      else { db.line.retryKeys[rk] = 1; db.line.used++; usedNow++; db.line.pushed.push({ to: db.line.bindings[m.key].userId, text: m.text, retryKey: rk, at: at }); }
      sent.push(rec); records.push({ key: m.key, at: at, ok: true, error: '' });
    });
    return { sent: sent, failed: failed, records: records, usedNow: usedNow };
  }
  /** 發送紀錄（最新在前，保留 50 筆） */
  function notifyLogAppend(db, o) {
    var s = S();
    db.notifyLog = db.notifyLog || [];
    var first = String(o.body || '').split('\n').filter(function (x) { return x.trim(); })[0] || '';
    var e = { id: 'n' + Date.now().toString(36) + rand(3), at: tpeStamp(new Date()), source: o.source, title: o.title, template: o.template || '', summary: first.slice(0, 40),
      count: o.sent.length + o.failed.length, ok: o.sent.length, fail: o.failed.length, skipped: (o.skipped || []).length,
      body: String(o.body || '').slice(0, 1500), imageUrl: o.imageUrl || '', note: o.note && String(o.note).trim() ? String(o.note).trim().slice(0, 500) : undefined,   // 3.2.5 補充說明
      results: o.sent.map(function (x) { return { name: x.name, state: 'ok', note: x.duplicate ? '重送略過' : '' }; })
        .concat(o.failed.map(function (x) { return { name: x.name, state: 'fail', note: String(x.error || '').slice(0, 40) }; }))
        .concat((o.skipped || []).map(function (x) { return { name: x.name, state: 'skip', note: x.reason || '' }; })) };
    db.notifyLog.unshift(e);
    db.notifyLog = db.notifyLog.slice(0, s.NOTIFY.maxLogs);
    return e.id;
  }
  function lineConfigured(db) { return !!(db.line.settings && db.line.settings.channelId && db.line.settings.channelSecret); }
  function batchPublic(b) {
    var s = S();
    return { id: b.id, title: b.title, deadline: b.deadline, deadlineText: s.formatDeadline(b.deadline), hint: b.hint, archived: !!b.archived, createdAt: b.createdAt, updatedAt: b.updatedAt, count: b.members.length,
      members: b.members.map(function (m) { return { key: m.key, name: m.name, masked: m.masked, callName: m.callName }; }) };
  }
  function pickMembers(b, keys) {
    if (!Array.isArray(keys) || !keys.length) return b.members;
    var set = {}; keys.forEach(function (k) { set[String(k).toLowerCase()] = 1; });
    return b.members.filter(function (m) { return set[m.key]; });
  }
  /** 後台通知內的綁定碼（7 天；同一成員沿用） */
  function adminBindCode(db, key) {
    var s = S(), now = Date.now();
    Object.keys(db.line.adminCodes).forEach(function (c) { if (!(db.line.adminCodes[c].exp > now)) delete db.line.adminCodes[c]; });
    var hit = Object.keys(db.line.adminCodes).filter(function (c) { return db.line.adminCodes[c].key === key; })[0];
    if (hit) return hit;
    var code; do { code = newCode(); } while (db.line.adminCodes[code] || mem.bindCodes[code]);
    db.line.adminCodes[code] = { key: key, exp: now + s.LINE.adminCodeDays * 86400000 };
    return code;
  }
  function newCode() { var s = S(), a = s.LINE.bindCodeAlphabet, o = ''; for (var i = 0; i < s.LINE.bindCodeLength; i++) o += a[Math.floor(Math.random() * a.length)]; return o; }
  function renderForMember(db, b, m, t, bound, withBind) {
    var s = S();
    var vars = { '稱呼': m.callName || s.callName(m.name), '截止時間': s.formatDeadline(b.deadline), '作業連結': s.NOTIFY.workUrl, '綁定連結': '' };
    return s.renderTemplate(t.body, vars);
  }
  function ensureDefaultTemplate(db) {
    var s = S();
    if (db.templates.length) return;
    db.templates.push({ id: s.NOTIFY.defaultTemplateId, name: s.NOTIFY.defaultTemplateName, body: s.NOTIFY.defaultTemplateBody, updatedAt: tpeStamp(new Date()) });
  }
  function templateById(db, id) { return db.templates.filter(function (t) { return t.id === id; })[0] || null; }
  /** Webhook 事件（與 Code.gs handleLineWebhook 相同規則）→ { bound:[key], invalid, ignored, follow, unfollow, replies:[text] } */
  function handleLineWebhook(db, body) {
    var s = S(), out = { bound: [], invalid: 0, ignored: 0, follow: 0, unfollow: 0, replies: [] };
    (Array.isArray(body.events) ? body.events.slice(0, 50) : []).forEach(function (ev) {
      if (!ev || typeof ev !== 'object') return;
      var userId = ev.source && ev.source.type === 'user' ? String(ev.source.userId || '') : '';
      if (userId && S().LINE.userIdRe.test(userId) && (ev.type === 'message' || ev.type === 'follow')) {
        var tR = ev.type === 'message' && ev.message ? (ev.message.type === 'text' ? String(ev.message.text || '').replace(/\s+/g, ' ').slice(0, 20) : '［' + String(ev.message.type || '') + '］') : '';
        db.line.recent = (db.line.recent || []).filter(function (r) { return r.u !== userId; });
        db.line.recent.unshift({ u: userId, at: tpeStamp(new Date()), t: tR, k: ev.type === 'follow' ? 'follow' : 'message' });
        db.line.recent = db.line.recent.slice(0, 20);
      }
      if (userId && ev.type === 'message' && ev.message) {   // 3.1.3：追蹤學姐各自保存最新一則訊息（前 100 字＋時間；先記錄再回覆）
        var hLm = Object.keys(db.line.bindings).filter(function (k) { return db.line.bindings[k] && db.line.bindings[k].userId === userId; })[0], eLm = hLm ? watchLoad(db, hLm) : null;
        if (hLm) { var kIn = String(ev.message.type || 'text'); chatLogAppend(db, [{ key: hLm, dir: 'in', kind: kIn, text: kIn === 'text' ? String(ev.message.text || '') : '［' + ({ image: '圖片', sticker: '貼圖' }[kIn] || kIn) + '］', at: tpeStamp(ev.timestamp ? new Date(Number(ev.timestamp)) : new Date()) }]); }
        if (eLm) { var kLm = String(ev.message.type || 'text'); eLm.lm = { t: kLm === 'text' ? String(ev.message.text || '').replace(/\s+/g, ' ').trim().slice(0, 100) : '［' + ({ image: '圖片', sticker: '貼圖', video: '影片', audio: '語音', file: '檔案', location: '位置' }[kLm] || kLm) + '］', at: tpeStamp(ev.timestamp ? new Date(Number(ev.timestamp)) : new Date()), k: kLm }; watchStore(db, eLm); out.lastMsg = (out.lastMsg || 0) + 1; }
      }
      if (ev.type === 'follow') { out.follow++; Object.keys(db.line.bindings).forEach(function (h) { if (db.line.bindings[h].userId === userId) db.line.bindings[h].blocked = false; }); return; }
      if (ev.type === 'unfollow') { out.unfollow++; Object.keys(db.line.bindings).forEach(function (h) { if (db.line.bindings[h].userId === userId) db.line.bindings[h].blocked = true; }); return; }
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') { out.ignored++; return; }
      if (suppFromEventMock(db, ev)) { out.supp = (out.supp || 0) + 1; return; }   // 3.2.7 補充請求（先於教材關鍵字與「確認」；只記錄不回覆）
      if (handleMaterialKeyword(db, ev, out)) return;   // 3.2 回覆「領取諮詢教材」（先於回覆確認判斷）
      if (watchAckFromEvent(db, ev, out)) return;   // 3.1 回覆「確認」
      var code = s.parseBindMessage(ev.message.text);
      if (!code) { out.ignored++; return; }
      if (!userId) { out.invalid++; return; }
      var key = '';
      var fc = mem.bindCodes[code];
      if (fc && fc.exp > Date.now()) { key = fc.key; delete mem.bindCodes[code]; }
      else if (db.line.adminCodes[code] && db.line.adminCodes[code].exp > Date.now()) { key = db.line.adminCodes[code].key; delete db.line.adminCodes[code]; }
      if (!key) { out.invalid++; if (lineConfigured(db)) out.replies.push(s.LINE.bindFailText); return; }
      db.line.bindings[key] = { userId: userId, boundAt: tpeStamp(new Date()), blocked: false };
      out.bound.push(key);
      var cn = '';
      db.batchOrder.forEach(function (id) { var m = s.batchMember(db.batches[id], key); if (m && m.callName && !cn) cn = m.callName; });
      if (!cn) { var r = rosterByHash(db, key); cn = s.callName(r ? r.name : ''); }
      if (lineConfigured(db)) out.replies.push(s.renderTemplate(s.LINE.bindDoneText, { '稱呼': cn }));
    });
    db.line.lastWebhook = out;
    return out;
  }
  function saveDb() {
    if (hasLS()) { try { root.localStorage.setItem(LS_KEY, JSON.stringify(mem.db)); } catch (e) { /* ignore */ } }
  }

  function idb() {
    try {
      if (!root.indexedDB) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('files'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      });
    } catch (e) { return Promise.resolve(null); }
  }
  function putFile(id, record) {
    return idb().then(function (db) {
      if (!db) { mem.files[id] = record; return; }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(record, id);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function getFile(id) {
    return idb().then(function (db) {
      if (!db) return mem.files[id] || null;
      return new Promise(function (resolve) {
        var tx = db.transaction('files', 'readonly');
        var r = tx.objectStore('files').get(id);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    });
  }

  /* ---------------- 工具 ---------------- */
  function err(msg, code, detail) { var e = new Error(msg); e.code = code || 'ERR_BAD_REQUEST'; if (detail) e.detail = detail; return e; }
  function fail(msg, code, detail) { var r = { ok: false, error: msg, code: code || 'ERR_BAD_REQUEST' }; if (detail) r.detail = detail; return Promise.resolve(r); }
  /** schema 檢查結果 → 錯誤（與 Code.gs issueError 相同） */
  function issueErr(p) { return err(p.message, p.errorCode || 'ERR_VALIDATION', p.code); }
  function issueFail(p) { return fail(p.message, p.errorCode || 'ERR_VALIDATION', p.code); }
  function ok(data) { return Promise.resolve({ ok: true, data: data }); }
  function rand(n) { var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < n; i++) o += c[Math.floor(Math.random() * c.length)]; return o; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function tpeDate(d) {
    var t = new Date(d.getTime() + 8 * 3600 * 1000);
    return { date: t.getUTCFullYear() + '.' + pad2(t.getUTCMonth() + 1) + '.' + pad2(t.getUTCDate()), time: pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()) + ':' + pad2(t.getUTCSeconds()) };
  }
  /** yyyy.mm.dd HH:mm:ss（Asia/Taipei） */
  function tpeStamp(d) { var t = tpeDate(d); return t.date + ' ' + t.time; }
  function safeName(s) {
    var out = String(s == null ? '' : s).replace(/[\\\/:*?"<>|\u0000-\u001f\u007f]/g, '＿').replace(/[\s　]+/g, ' ').replace(/^\.+|\.+$/g, '').trim();
    return (out || '未命名').slice(0, 60);
  }
  function extOf(n) { var m = /\.([A-Za-z0-9]+)$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  /** UTF-8 位元組數（與 GAS 的 blob 大小一致） */
  function byteLen(str) {
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    return unescape(encodeURIComponent(str)).length;
  }
  function b64Bytes(b64) {
    b64 = String(b64 || '');
    var pad = (b64.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }
  function deepGet(o, p) { var c = o; p.split('.').forEach(function (k) { c = c == null ? undefined : c[k]; }); return c; }
  function industryLabel(a) { return isV3(a) ? S3().industryLabel(a) : S().industryText(a); }
  function roleText(v) { var s = S(); return s.roleById(v) ? s.roleById(v).label : String(v == null ? '' : v).trim().slice(0, 30); }

  /* ---------------- 3.0 雲端資料夾模擬 ---------------- */
  /** 模擬的雲端：db.drive[hash] 登錄；counts[folderId] 為各子資料夾檔案數（示範或測試以 _driveSimulatePut 放入） */
  function driveRec(db, account) { var h = keyHash(progressKeyOf(account)); return db.drive[h] || null; }
  function driveMerge(db, answers) {
    var rec = driveRec(db, deepGet(answers, 'student.account'));
    if (!rec) return answers;
    var nmM = String(deepGet(answers, 'student.name') || '').trim();
    if ((rec.name && rec.name !== nmM) || (answers.drive && answers.drive.mode === 'link')) return answers;   // 同 Code.gs：本名不符或改走貼連結者不合併
    var a = JSON.parse(JSON.stringify(answers));
    a.drive = a.drive || {};
    if (!a.drive.rootFolderId && rec.rootFolderId) { a.drive.rootFolderId = rec.rootFolderId; a.drive.mode = a.drive.mode || 'oauth'; }
    if (!a.drive.rootUrl && rec.rootUrl) a.drive.rootUrl = rec.rootUrl;
    if (!a.drive.ownerEmail && rec.ownerEmail) a.drive.ownerEmail = rec.ownerEmail;
    a.drive.folders = a.drive.folders || {};
    Object.keys(rec.folders || {}).forEach(function (k) { if (!a.drive.folders[k]) a.drive.folders[k] = rec.folders[k]; });
    return a;
  }
  /** 各分類計數（與 Code.gs driveStatusFor 同形狀；mock 由 counts 表取值） */
  function driveStatusFor(db, answers) {
    var d = (answers && answers.drive) || {}, folders = d.folders || {};
    var allCounts = {};
    Object.keys(db.drive).forEach(function (h) { Object.keys(db.drive[h].counts || {}).forEach(function (fid) { allCounts[fid] = db.drive[h].counts[fid]; }); });
    var out = { folders: {}, root: d.rootFolderId ? { ok: true, id: d.rootFolderId, name: '' } : (d.mode === 'link' ? { ok: !/private/.test(String(d.linkUrl || '')), reason: '資料中心無法讀取此資料夾' } : { ok: false, reason: '尚未提供' }), readable: true, checkedAt: tpeStamp(new Date()), cached: false };
    if (!out.root.ok) out.readable = false;
    Object.keys(folders).forEach(function (itemId) {
      var c = allCounts[folders[itemId]] || { count: 0, shortcuts: 0, updated: '' };
      out.folders[itemId] = { count: c.count || 0, files: Math.max(0, (c.count || 0) - (c.shortcuts || 0)), shortcuts: c.shortcuts || 0, updated: c.updated || '', readable: true };
    });
    return out;
  }
  /** 示範／測試用：模擬學姐把 n 個檔案（含 shortcuts 個捷徑）放入某分類 */
  function driveSimulatePut(account, itemId, n, shortcuts) {
    var db = loadDb(), rec = driveRec(db, account);
    if (!rec || !rec.folders[itemId]) return false;
    rec.counts = rec.counts || {};
    rec.counts[rec.folders[itemId]] = { count: Number(n) || 0, shortcuts: Number(shortcuts) || 0, updated: tpeStamp(new Date()) };
    saveDb();
    return true;
  }
  function supplementPublic(r) {
    var s3 = S3();
    return { id: r.id, receiptId: r.receiptId, createdAt: r.createdAt, due: r.due || '', status: s3.supplementStatus(r.items), statusLabel: s3.supplementStatusLabel(r), total: r.items.length, done: r.items.filter(function (x) { return x.status === 'done'; }).length,
      notice: r.notice || '', link: r.link || '', pushed: r.pushed || null, finishedAt: r.finishedAt || '',
      fileOpen: s3.supplementFileOpen(r),   // 3.3.8
      items: r.items.map(function (it) {
        var o = { id: it.id, type: it.type, typeLabel: (s3.SUPPLEMENT.types.filter(function (t) { return t.id === it.type; })[0] || {}).label || it.type, ref: it.ref, title: it.title, note: it.note, due: it.due, status: it.status, doneAt: it.doneAt, content: it.content, needFolder: !!it.needFolder, folderName: it.folderName || '', folderId: it.folderId || '', toFull: !!it.toFull };
        if (it.file || it.ret) { var fp = s3.supplementFilePublic(it, suppFileLinks(r, it)); if (fp.file) o.file = fp.file; if (fp.ret) o.ret = fp.ret; }   // 3.3.8 同 Code.gs
        return o;
      }) };
  }
  function suppToken(rid, sid) { return keyHash('supp.' + rid + '.' + sid) + keyHash(sid + '.' + rid).slice(0, 8); }
  /* ---- 3.3.8 補件附檔與回傳（同 gas/drive.gs；檔案只保留在本次瀏覽） ---- */
  function suppFileSig(kind, rid, sid, iid) { return keyHash(kind + '.' + rid + '.' + sid + '.' + iid).slice(0, 12); }
  function suppFileLinks(r, it) {
    var s3 = S3(), o = {};
    if (it.file && it.file.kind === 'drive') o.sf = s3.suppDlUrl('sf', s3.suppDlToken(r.receiptId, r.id, it.id, suppFileSig('sfdl', r.receiptId, r.id, it.id)));
    if (it.ret && it.ret.id) o.sr = s3.suppDlUrl('sr', s3.suppDlToken(r.receiptId, r.id, it.id, suppFileSig('srdl', r.receiptId, r.id, it.id)));
    return o;
  }
  function suppItemOf(db, rid, sid, iid) {
    var r = ((db.supplements || {})[String(rid)] || []).filter(function (x) { return x.id === String(sid); })[0];
    return r ? { r: r, it: r.items.filter(function (x) { return x.id === String(iid); })[0] || null } : { r: null, it: null };
  }
  function suppDlUrlMock(id) { return 'https://drive.google.com/uc?export=download&confirm=t&id=' + encodeURIComponent(id); }
  function suppUpCheck(req) {
    var s3 = S3(), nm = s3.suppFileName(req.name), size = Math.floor(Number(req.size) || 0);
    if (!nm || !s3.suppFileOk(nm)) return { fail: fail('檔案格式須為 ' + s3.SUPP_FILE.exts.join('、'), 'ERR_VALIDATION') };
    if (!(size > 0 && size <= s3.SUPP_FILE.maxBytes)) return { fail: fail('檔案大小須在 50 MB 內', 'ERR_VALIDATION') };
    return { name: nm, size: size, mime: s3.suppFileMime(nm) };
  }
  function suppUpChunk(up, req) {
    var off = Number(req.offset) || 0, end = Number(req.end) || 0;
    if (Number(req.total) !== up.size || end > up.size || end <= off) return fail('分塊範圍不正確', 'ERR_VALIDATION');
    if (off !== up.received) { if (end <= up.received) return ok({ received: up.received, done: up.received === up.size, duplicate: true }); return fail('分塊順序錯誤（預期 ' + up.received + '）', 'ERR_CHUNK_ORDER', String(up.received)); }
    if (b64Bytes(req.data) !== end - off) return fail('分塊長度不符', 'ERR_VALIDATION');
    up.chunks.push(String(req.data || '')); up.received = end;
    return ok({ received: up.received, done: up.received === up.size });
  }
  function suppRetTarget(db, req, au, cred) {
    var sub = db.submissions[String(req.receiptId || '')];
    if (!sub || progressKeyOf(sub.index.account) !== au.key) return { fail: fail('找不到該份作業', 'ERR_NOT_FOUND') };
    if (au.viaLink && cred && (String(cred.receiptId) !== String(req.receiptId) || String(cred.requestId) !== String(req.requestId))) return { fail: fail('找不到該補件需求', 'ERR_NOT_FOUND') };
    var x = suppItemOf(db, req.receiptId, req.requestId, req.itemId);
    if (!x.it) return { fail: fail('找不到該補件項目', 'ERR_NOT_FOUND') };
    if (!x.it.file || !x.it.file.ret) return { fail: fail('此項目不需要回傳檔案', 'ERR_VALIDATION') };
    if (x.it.ret && x.it.ret.review === 'pass') return { fail: fail('此項回傳檔已審核通過，不需要再上傳', 'ERR_SUPP_REVIEWED') };
    x.sub = sub; return x;
  }
  /** 前台補件憑證：帳號＋lookupToken（同 clientKey）或連結 k */
  function suppAuth(db, req) {
    var ck = clientKeyOf(req); if (!ck) return { fail: fail('缺少識別碼', 'ERR_VALIDATION') };
    var acc = String(req.account || '').trim(); if (!acc) return { fail: fail('學員帳號為必填', 'ERR_VALIDATION') };
    var key = progressKeyOf(acc), h = keyHash(key);
    var lt = mem.lookupTokens[String(req.lookupToken || '')];
    if (lt && lt.ck === ck && lt.key === h && lt.exp > Date.now()) return { key: key, h: h, viaLink: false };
    if (req.receiptId && req.requestId && req.k === suppToken(String(req.receiptId), String(req.requestId))) {
      var sub = db.submissions[req.receiptId];
      if (sub && progressKeyOf(sub.index.account) === key) return { key: key, h: h, viaLink: true };
    }
    return { fail: fail('查詢憑證已失效，請重新輸入學員帳號', 'ERR_AUTH') };
  }

  /** 作業資料夾名稱：本名_諮詢作業（同名加 _yyyy.mm.dd，再重複加序號；與 Code.gs 相同） */
  function uniqueFolderName(db, name, dateStr) {
    var names = Object.keys(db.submissions).map(function (k) { return db.submissions[k].folderName; });
    return S().archiveFolderName(name, dateStr, names);
  }
  /** 示範用 PDF（作業內容；離線為英文占位） */
  function makePdf(sub) {
    var data = sub.data, ix = sub.index;
    var gaps = data.gaps || {};
    var lines = [ix.receiptId, ix.name, ix.role];
    if (data.legacy === false) lines = lines.concat((gaps.notYet || []).map(function (g) { return 'notyet: ' + g.id; }), (gaps.emptyFolders || []).map(function (g) { return 'empty: ' + g.id; }));
    else lines = lines.concat((gaps.uploadsMissing || []).map(function (g) { return 'gap: ' + g.id; }));
    return textPdf(lines);
  }
  function renderPdfFor(db, rid) {
    var sub = db.submissions[rid];
    if (!sub) return Promise.resolve(null);
    if (sub.files.some(function (f) { return f.label === '作業內容 PDF'; })) { sub.pdf = 'ready'; return Promise.resolve({ receiptId: rid, ready: true, existed: true }); }
    var pdfStr = makePdf(sub), pdfId = 'mockfile_' + rid + '_pdf';
    sub.files.push({ fileId: pdfId, name: sub.base + '_作業內容.pdf', size: byteLen(pdfStr), mime: 'application/pdf', label: '作業內容 PDF' });
    sub.files.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    sub.pdf = 'ready';
    return putFile(pdfId, { name: sub.base + '_作業內容.pdf', mime: 'application/pdf', base64: toB64(pdfStr) }).then(function () { saveDb(); return { receiptId: rid, ready: true }; });
  }

  /* ---------------- 缺口與標籤化（與 Code.gs 共用 schema 邏輯） ---------------- */
  function computeGaps(answers, attachments) { return S().computeGaps(answers, attachments || []); }

  function buildLabeled(answers, attachments, receiptId, submittedAt, driveStatus) {
    var meta = { receiptId: receiptId, submittedAt: submittedAt, timezone: 'Asia/Taipei' };
    if (isV3(answers)) { var out = S3().buildLabeledData3(answers, meta, driveStatus || null); out.driveStatus = driveStatus || null; return out; }
    return S().buildLabeledData(answers, attachments, meta);
  }

  /** 匯出工作表（與 Code.gs buildExportTabs 相同結構）：[{ id, name, rows }] */
  function exportTabs(db) {
    var s = S(), s3 = S3();
    var tabs = s3.EXPORT_TABS_ALL.map(function (t) { return { id: t.id, name: t.name, rows: [t.headers.slice()] }; });
    var byId = {};
    tabs.forEach(function (t) { byId[t.id] = t; });
    db.index.forEach(function (ix) {
      var sub = db.submissions[ix.receiptId];
      var g = sub && sub.data && sub.data.gaps;
      var gapN = ix.gapCount != null ? ix.gapCount : (g ? (g.gapCount != null ? g.gapCount : s.gapCountOf(g)) : '');
      byId.index.rows.push([ix.receiptId, ix.submittedAt, ix.name, ix.account, ix.role, ix.industry, ix.brand, ix.fileCount, gapN, ix.status, '', ix.startedAt || '', ix.durationMin == null ? '' : ix.durationMin, ix.batchId || '', ix.onTime == null ? '' : (ix.onTime ? '準時' : '逾期'), ix.driveUrl || '', ix.dataDone || '']);
      if (!sub || !sub.data) return;
      var rows = s3.exportRows3(sub.data, ix, (db.supplements || {})[ix.receiptId] || []);
      Object.keys(rows).forEach(function (k) { if (byId[k]) rows[k].forEach(function (r) { byId[k].rows.push(r); }); });
    });
    return tabs;
  }

  /* ---------------- 模擬 PDF（純文字 PDF，供後台下載測試） ---------------- */
  function textPdf(lines) {
    // 極簡 PDF：僅 ASCII 顯示，標題列用英文占位，內文字數不限（中文無法以內建字型顯示，故放提示）
    var content = 'BT /F1 12 Tf 40 760 Td 14 TL (Consult Prep - mock PDF) Tj T* (Zhong wen nei rong qing can yue JSON) Tj T* ';
    lines.slice(0, 40).forEach(function (l) { content += '(' + String(l).replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '\\$&').slice(0, 90) + ') Tj T* '; });
    content += 'ET';
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    var pdf = '%PDF-1.4\n', offsets = [];
    objs.forEach(function (o, i) { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return pdf;
  }
  function toB64(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  /** 各分塊的 base64 各自含補位，需先解碼再合併重新編碼 */
  function joinChunksB64(chunks) {
    if (typeof Buffer !== 'undefined') return Buffer.concat(chunks.map(function (c) { return Buffer.from(c || '', 'base64'); })).toString('base64');
    var bin = chunks.map(function (c) { return atob(c || ''); }).join('');
    return btoa(bin);
  }

  /* ---------------- 3.1：追蹤名單、名冊發送、回覆確認、通知圖卡、額度、自動追蹤、軟刪除（與 gas/watch.gs 同規則） ---------------- */
  var WATCH = { ID: 'watch', TITLE: '官方關注名單', MAX_MEMBERS: 500, MAX_NOTE: 200, MAX_NOTIFY_KEEP: 10, UNDO_TTL_MS: 10 * 60 * 1000, NOTICE_MAX: 30, NOTICE_MAX_BYTES: 3 * 1024 * 1024, QUOTA_WARN_RATIO: 0.2,
    ACK_RE: /^(?![\s\S]*(?:不確認|未確認|沒確認|沒有確認|無法確認|待確認|請確認|請你確認|煩請確認|麻煩確認|能否確認|是否確認|要確認|確認一下|確認看看|確認嗎|確認吧))[\s\S]*確認/ };
  function ensure31(db) {
    if (!db.watch) db.watch = { order: [], entries: {} };
    if (!db.noticeImages) db.noticeImages = [];
    if (!db.quota) db.quota = {};
    if (!db.undo) db.undo = {};
    if (!db.digest) db.digest = {};
    if (!db.chat) db.chat = [];
    return db;
  }
  function watchAll(db) { ensure31(db); return db.watch.order.map(function (h) { return db.watch.entries[h]; }).filter(Boolean); }
  function watchLoad(db, h) { ensure31(db); h = String(h || '').toLowerCase(); return /^[0-9a-f]{16}$/.test(h) ? (db.watch.entries[h] || null) : null; }
  function watchStore(db, e) { ensure31(db); e.fl = e.fl || {}; e.nt = (e.nt || []).slice(-WATCH.MAX_NOTIFY_KEEP); db.watch.entries[e.k] = e; if (db.watch.order.indexOf(e.k) < 0) db.watch.order.push(e.k); }
  /** 3.1.3 LINE 對話紀錄（同 watch.gs chatLogAppend／chatLog）：db.chat=[{ at, key, dir, kind, text, img, ok, err }] */
  function chatLogAppend(db, rows) {
    ensure31(db);
    (rows || []).forEach(function (r) { if (!r || !/^[0-9a-f]{16}$/.test(String(r.key || ''))) return; db.chat.push({ at: r.at || tpeStamp(new Date()), key: r.key, dir: r.dir === 'in' ? 'in' : 'out', kind: String(r.kind || ''), text: String(r.text || '').slice(0, r.dir === 'in' ? 500 : 5000), img: r.img || '', ok: r.ok == null ? null : !!r.ok, err: r.err || '', manual: r.manual ? 1 : 0 }); });
  }
  function chatLog(db, h) {
    ensure31(db);
    var ins = db.chat.filter(function (x) { return x.key === h && x.dir === 'in'; }).slice(-30), outs = db.chat.filter(function (x) { return x.key === h && x.dir === 'out'; }).slice(-50);
    var rows = ins.concat(outs).map(function (x) { var o = { seq: db.chat.indexOf(x) + 1, at: x.at, dir: x.dir, kind: x.kind, text: x.text, imageUrl: x.img, ok: x.ok, error: x.err }; if (x.manual) o.manual = true; return o; });
    var e = watchLoad(db, h), legacy = 0;
    if (e) (e.nt || []).forEach(function (n) { var m = String(n.at).slice(0, 16); if (rows.some(function (o) { return o.dir === 'out' && String(o.at).slice(0, 16) === m; })) return; rows.push({ at: n.at, dir: 'out', kind: n.kind, text: '', imageUrl: '', ok: !!n.ok, error: n.err || '', summary: true, img: n.img === 1 }); legacy++; });
    if (e && e.lm && e.lm.at && !rows.some(function (x) { return x.dir === 'in' && String(x.at).slice(0, 16) === String(e.lm.at).slice(0, 16); })) { rows.push({ at: e.lm.at, dir: 'in', kind: e.lm.k || 'text', text: e.lm.t, imageUrl: '', ok: null, error: '', summary: true }); legacy++; }
    rows.sort(function (a, b) { return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : (a.seq || 0) - (b.seq || 0); });
    rows.forEach(function (x) { delete x.seq; });
    var r = rosterByHash(db, h) || {};
    return { key: h, name: r.name || (e && e.n) || '', callName: (e && e.c) || S().callName(r.name || ''), rows: rows, legacy: legacy, inKeep: 30 };
  }
  function watchRemove(db, h) { ensure31(db); delete db.watch.entries[h]; db.watch.order = db.watch.order.filter(function (x) { return x !== h; }); }
  function watchUpsert(db, h, o, nowStr) {
    var s = S(), r = rosterByHash(db, h) || {};
    var e = watchLoad(db, h) || { k: h, n: '', m: '', c: '', d: '', at: nowStr, by: o.by || 'admin', dc: 0, td: 0, note: '', ack: '', ackCount: 0, nt: [], fl: {} };
    e.n = r.name || o.name || e.n; e.m = r.masked || o.masked || e.m;
    if (o.callName != null && String(o.callName).trim()) e.c = String(o.callName).trim().slice(0, s.BATCH.maxCallNameLength);
    if (!e.c) e.c = s.callName(e.n);
    if (o.deadline) { var ms = s.parseDeadline(o.deadline); if (ms == null) throw err('截止時間格式不正確', 'ERR_VALIDATION'); var iso = s.deadlineIso(ms); if (iso !== e.d) { e.d = iso; e.fl = {}; } }
    if (o.src) e.src = o.src;
    watchStore(db, e);
    return e;
  }
  function watchNotifyRecord(db, entries, kind, img) {
    var s = S();
    (entries || []).forEach(function (r) {
      var e = watchLoad(db, r.key); if (!e) return;
      e.nt = (e.nt || []).concat([{ at: r.at, ok: !!r.ok, kind: kind, err: String(r.error || '').slice(0, 80), img: (r.img != null ? r.img : img) ? 1 : 0 }]).slice(-WATCH.MAX_NOTIFY_KEEP);
      if (kind === 'notify' || kind === 'resend') { e.ack = ''; e.fl.noAck = 0; }
      if (r.ok && s.REMIND_RULES.notifyKinds.indexOf(kind) >= 0 && e.d) { var f = s.notifyFlags(s.parseDeadline(e.d) - (s.timeToMs(r.at) || Date.now())); if (f.h48) e.fl.h48 = 1; if (f.h24) e.fl.h24 = 1; }   // 3.1.3 同 watch.gs
      watchStore(db, e);
    });
  }
  /** roster_lookup／submit：追蹤名單優先（鍵雜湊 → batch 形狀） */
  function watchBriefFor(db, h, nowMs) {
    var s = S(), e = watchLoad(db, h);
    if (!e || !e.d) return null;
    var dl = s.parseDeadline(e.d);
    if (dl != null && nowMs - dl > s.BATCH.visibleAfterDeadlineDays * 86400000) return null;
    return { id: WATCH.ID, title: WATCH.TITLE, deadline: e.d, deadlineText: s.formatDeadline(e.d), hint: s.BATCH.defaultHint, callName: e.c || s.callName(e.n), overdue: dl != null && nowMs > dl };
  }
  function stateIndexes(db) {
    var byIdx = {}, byProg = {};
    db.index.forEach(function (ix) { var h = keyHash(progressKeyOf(ix.account)); if (!byIdx[h] || byIdx[h].submittedAt < ix.submittedAt) byIdx[h] = ix; });
    Object.keys(db.progress).forEach(function (k) { var pr = db.progress[k]; if (pr.status !== '已移除') byProg[keyHash(pr.key || progressKeyOf(pr.account))] = pr; });
    return { byIdx: byIdx, byProg: byProg };
  }
  /** 3.2.4：本次流程（e.rs）開始後的送出才算（同 watch.gs watchMemberState） */
  function wState(db, h, e, idx) { return memberState31(db, h, e ? e.d : '', e ? S().timeToMs(e.rs || e.at) : null, idx, !!(e && e.rs)); }
  function wCycleDone(db, e, st) { if (!e || st.state !== 'submitted') return false; if (e.td === 1) return true; var mf = latestMaterial(db, e.k), s = S(); return !!(mf && mf.state === 'delivered' && (!e.rs || (s.timeToMs(mf.deliveredAt) || 0) >= (s.timeToMs(e.rs) || 0))); }
  function wCycleRestart(db, h, nowStr) {
    var e = watchLoad(db, h); if (!e) return false;
    var st = wState(db, h, e, stateIndexes(db)); if (!wCycleDone(db, e, st)) return false;
    e.hist = (e.hist || []).concat([{ at: e.rs || e.at, d: e.d, sub: st.submittedAt || '', rid: st.receiptId || '', td: e.td === 1 ? 1 : 0, tda: e.tda || '' }]).slice(-10);
    e.rd = (e.rd || 1) + 1; e.rs = nowStr; e.td = 0; e.tda = ''; e.dc = 0; e.ack = ''; e.ackCount = 0; e.fl = {}; watchStore(db, e); return true;
  }
  /* 3.2.4 歷次紀錄（同 watch.gs studentHistory32／rosterHistorySum） */
  function receiptsOf(db, h) { return (db.index || []).filter(function (ix) { return keyHash(progressKeyOf(ix.account)) === h; }); }
  function counselsOfMock(db, h) {
    var out = [], x = db.students && db.students.entries[h], c = x && x.snap && x.snap.counsels;
    if (c) { (c.past || []).forEach(function (p) { out.push({ at: p.at, title: p.title || '', status: '已完成' }); }); if (c.next) out.push({ at: c.next.at, title: c.next.title || '', status: c.next.status || '已預約' }); }
    var ce = db.counsel && db.counsel.entries[h]; if (ce && ce.nc && !out.some(function (y) { return y.at === ce.nc.at; })) out.push({ at: ce.nc.at, title: (ce.nc.items || []).join('＋'), status: '已預約' });
    return out;
  }
  function studentHistoryMock(db, h) { ensure32(db); return S().studentHistory({ receipts: receiptsOf(db, h), watch: watchLoad(db, h), counsels: counselsOfMock(db, h), materials: (db.materials || []).filter(function (f) { return f.rosterKey === h; }), nowMs: Date.now() }); }
  function rosterHistorySumMock(db, h) { var hs = studentHistoryMock(db, h).summary; return hs.count ? hs : null; }
  function memberState31(db, h, deadline, sinceMs, idx, strict) {
    var s = S(), o = { state: 'none', percent: null, sectionLabel: '', startedAt: '', lastSeen: '', receiptId: '', submittedAt: '', onTime: null };
    var ix = idx.byIdx[h], subMs = ix ? s.timeToMs(ix.submittedAt) : null;
    if (ix && (sinceMs == null || (subMs != null && subMs >= sinceMs) || (!strict && ix.batchId === WATCH.ID))) {
      o.state = 'submitted'; o.receiptId = ix.receiptId; o.submittedAt = ix.submittedAt; o.startedAt = ix.startedAt || '';
      o.onTime = deadline ? s.isOnTime(ix.submittedAt, deadline) : (ix.onTime != null ? ix.onTime : null);
      return o;
    }
    var pr = idx.byProg[h];
    if (pr && pr.status === '填寫中') { o.state = 'filling'; o.percent = pr.percent == null ? null : pr.percent; o.sectionLabel = pr.sectionLabel || ''; o.startedAt = pr.startedAt; o.lastSeen = pr.lastSeen; }
    return o;
  }
  function watchRowOut(db, e, nowMs, idx) {
    var s = S(), dl = s.parseDeadline(e.d), st = wState(db, e.k, e, idx), lb = lineBindingOf(db, e.k);
    var last = (e.nt || []).length ? e.nt[e.nt.length - 1] : null;
    return { key: e.k, name: e.n, masked: e.m, callName: e.c, deadline: e.d, deadlineText: e.d ? s.formatDeadline(e.d) : '', overdue: dl != null && nowMs > dl && st.state !== 'submitted', hoursLeft: dl == null ? null : Math.round((dl - nowMs) / 3600000),
      state: st.state, percent: st.percent, sectionLabel: st.sectionLabel, startedAt: st.startedAt, lastSeen: st.lastSeen, receiptId: st.receiptId, submittedAt: st.submittedAt, onTime: st.onTime,
      dataConfirmed: e.dc === 1, toolDone: e.td === 1, note: e.note || '', ack: e.ack ? { at: e.ack, count: e.ackCount || 1 } : null,
      lastNotify: last ? { at: last.at, ok: last.ok, kind: last.kind, error: last.err || '', withImage: last.img === 1 } : null, notifyCount: (e.nt || []).length, notifies: (e.nt || []).slice().reverse(),
      reminders: { h48: e.fl && e.fl.h48 === 1, h24: e.fl && e.fl.h24 === 1, noAck: e.fl && e.fl.noAck === 1, overdue: e.fl && e.fl.overdue === 1 },
      lineBound: lb.bound, lineBlocked: lb.blocked, lineIssue: lb.issue || '', lineName: lb.name || '', chatUrl: lb.bound ? lineChatUrlFor(db, e.k) : '', addedAt: e.at, addedBy: e.by || '', source: e.src || '',
      lastMessage: e.lm && e.lm.at ? { text: String(e.lm.t || ''), at: e.lm.at, kind: e.lm.k || 'text' } : null,
      ackState: (function () {   // 3.2.5 確認自動回覆偵測狀態（與 gas 同一份 schema.ackStateEval）
        if (!s.ackStateEval) return null;
        var kinds = ['notify', 'resend', 'batch', 'supplement'], nts = (e.nt || []).filter(function (n) { return n && n.ok === true && kinds.indexOf(n.kind) >= 0; });
        var sp = st.receiptId ? ((db.supplements || {})[st.receiptId] || []) : [];
        var a = s.ackStateEval({ watched: true, notified: nts.length > 0, submitted: st.state === 'submitted', acked: !!e.ack, deadlineMs: dl, now: nowMs, sakId: e.sak && e.sak.id || '',
          supps: sp.map(function (r) { var c0 = s.timeToMs(r.createdAt); return { id: r.id, finished: !!r.finishedAt, dueMs: r.due ? s.timeToMs(r.due + ' 23:59:59') : null, notifiedAfter: nts.some(function (n) { var m = s.timeToMs(n.at); return (n.kind === 'supplement' || n.kind === 'resend') && m != null && (c0 == null || m >= c0 - 120000); }) }; }) });
        a.label = s.ackStateLabel(a); delete a.suppId; return a;
      })() };
  }
  function watchListData(db) {
    var nowMs = Date.now(), idx = stateIndexes(db);
    var rows = watchAll(db).map(function (e) { return watchRowOut(db, e, nowMs, idx); });
    var summary = { total: rows.length, none: 0, filling: 0, submitted: 0, onTime: 0, late: 0, acked: 0, overdue: 0, dataConfirmed: 0, toolDone: 0, unreachable: 0 };
    rows.forEach(function (r) { summary[r.state]++; if (r.state === 'submitted') { if (r.onTime) summary.onTime++; else if (r.onTime === false) summary.late++; } if (r.ack) summary.acked++; if (r.overdue) summary.overdue++; if (r.dataConfirmed) summary.dataConfirmed++; if (r.toolDone) summary.toolDone++; if (!r.lineBound || r.lineBlocked) summary.unreachable++; });
    rows.sort(function (a, b) { var sa = a.state === 'submitted' ? 1 : 0, sb = b.state === 'submitted' ? 1 : 0; if (sa !== sb) return sa - sb; if (!sa) return (a.deadline || '9') < (b.deadline || '9') ? -1 : (a.deadline || '9') > (b.deadline || '9') ? 1 : 0; return a.submittedAt < b.submittedAt ? 1 : -1; });
    return { rows: rows, summary: summary, now: tpeStamp(new Date(nowMs)), title: WATCH.TITLE };
  }
  function watchMembersIn(req) {
    var s = S(), out = [], seen = {};
    var list = Array.isArray(req.recipients) ? req.recipients : Array.isArray(req.members) ? req.members : (Array.isArray(req.keys) ? req.keys.map(function (k) { return { key: k }; }) : []);
    list.forEach(function (m) { if (!m) return; var k = String(typeof m === 'string' ? m : m.key || '').toLowerCase(); if (!/^[0-9a-f]{16}$/.test(k) || seen[k]) return; seen[k] = 1; out.push({ key: k, deadline: (typeof m === 'object' && m.deadline) || req.deadline || '', callName: typeof m === 'object' ? m.callName : '', imageId: typeof m === 'object' && m.imageId ? String(m.imageId).slice(0, 128) : '' }); });
    if (!out.length) throw err('請選擇學姐', 'ERR_VALIDATION');
    if (out.length > WATCH.MAX_MEMBERS) throw err('追蹤名單一次最多 ' + WATCH.MAX_MEMBERS + ' 位', 'ERR_VALIDATION');
    out.forEach(function (m) { if (!m.deadline) throw err('請為每位學姐設定截止時間', 'ERR_VALIDATION'); if (s.parseDeadline(m.deadline) == null) throw err('截止時間格式不正確', 'ERR_VALIDATION'); });
    return out;
  }
  /* 額度記帳（月度；LINE 額度以 db.line.used／limit 模擬） */
  function quotaKey() { var t = tpeDate(new Date()); return t.date.slice(0, 4) + t.date.slice(5, 7); }
  function quotaMonth(db) { ensure31(db); var o = db.quota[quotaKey()]; if (!o) o = db.quota[quotaKey()] = { total: 0, byKind: {}, days: {} }; return o; }
  function quotaAccount(db, kind, n, extra) { var o = quotaMonth(db); n = Math.max(0, Number(n) || 0); o.byKind[kind] = (o.byKind[kind] || 0) + n + (Number(extra) || 0); o.total += n; var day = tpeDate(new Date()).date.slice(8, 10); o.days[day] = (o.days[day] || 0) + n; }
  /** 3.3.7 書籤版本狀態（同 gas bookmarkletStatus） */
  function bmStatusMock(db) {
    var s = S(), last = db.bmLast || {}, out = {}, old = [];
    ['roster', 'orders', 'linemap'].forEach(function (k) { var x = last[k]; if (!x) return; var c = s.bookmarkletCheck(x.version); out[k] = { version: c.version, label: c.label, at: x.at || '', role: x.role || '', roleLabel: x.role === 'assistant' ? '助教' : x.role === 'principal' ? '校長' : '', outdated: c.outdated }; if (c.outdated) old.push(k); });
    return { latest: s.BOOKMARKLET.version, kinds: s.BOOKMARKLET.kinds, last: out, outdated: old };
  }
  /** 3.3.7 額度依方案（同資料中心 schema.lineQuotaEval）：db.line.type 'limited'|'none'、db.line.limit；設定 db.quotaCfg */
  function quotaCfgOf(db) { return S().lineQuotaCfg(db.quotaCfg || null); }
  function lineQuotaNow(db) { var c = quotaCfgOf(db); return S().lineQuotaEval({ type: db.line.type || 'limited', value: db.line.limit, used: db.line.used }, { reserveRatio: c.reserveRatio, overage: c.mainOverage }); }
  function lineQuotaUnknownMock(db) { var c = quotaCfgOf(db), q = S().lineQuotaEval({ type: 'limited', value: c.mainLimit, used: 0 }, { reserveRatio: c.reserveRatio, overage: c.mainOverage, estimated: true }); q.unknown = true; return q; }
  function quotaGuardMock(q, n) { var c = S().lineQuotaSend(q, n); if (!c.enough) throw err('本月 LINE 剩餘則數 ' + q.remaining + ' 則，不足以發送 ' + n + ' 則（差 ' + c.shortBy + ' 則）', 'ERR_LINE_QUOTA', String(c.shortBy)); return c; }
  function quotaCfgPublicMock(db) { var c = quotaCfgOf(db); return { mainLimit: c.mainLimit, adminLimit: c.adminLimit, reservePct: Math.round(c.reserveRatio * 1000) / 10, mainOverage: c.mainOverage, lastMain: db.line.settings ? { type: db.line.type || 'limited', limit: (db.line.type === 'none' ? null : db.line.limit) } : null, lastAdmin: null }; }
  function lineQuotaStatusData(db) {
    var s = S(), now = new Date(), t = tpeDate(now), y = Number(t.date.slice(0, 4)), m = Number(t.date.slice(5, 7)), d = Number(t.date.slice(8, 10));
    var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    var acc = quotaMonth(db), configured = lineConfigured(db), c = quotaCfgOf(db);
    var q = configured ? lineQuotaNow(db) : S().lineQuotaEval({ type: 'limited', value: c.mainLimit, used: acc.total }, { reserveRatio: c.reserveRatio, overage: c.mainOverage, estimated: true });
    var remaining = q.remaining, level = q.level;
    var byKind = { notify: 0, remind: 0, resend: 0, digest: 0, auto: 0, ack: 0, supplement: 0, batch: 0 };
    Object.keys(acc.byKind).forEach(function (k) { byKind[k] = (byKind[k] || 0) + acc.byKind[k]; });
    var forecast = Math.round(q.used / Math.max(1, d) * daysInMonth);
    return { configured: configured, type: q.type, used: q.used, limit: q.limit, remaining: remaining, unlimited: !!q.unlimited, overage: !!q.overage, over: !!q.over, overBy: q.overBy || 0, overageNote: q.over && q.overage ? s.LINE.overageNote : '', reserve: q.reserve, reservePct: Math.round(c.reserveRatio * 1000) / 10, cfg: quotaCfgPublicMock(db), resetDate: ny + '.' + pad2(nm) + '.01', level: level, byKind: byKind, accounted: acc.total, forecastEnd: forecast, forecastExceeds: q.limit != null && forecast > q.limit, paused: !!q.paused, dayOfMonth: d, daysInMonth: daysInMonth, checkedAt: tpeStamp(now), cached: false, estimated: !configured };
  }
  /** 逐人推播（文字＋圖卡同一則）：msgs=[{ key, name, text, deadline }]；回 { sent, failed, records, usedNow } */
  function pushMessages31(db, msgs, seed, imageUrl) {
    var s = S(), sent = [], failed = [], records = [], usedNow = 0;
    msgs.forEach(function (m) {
      var at = tpeStamp(new Date());
      if (m.tooLong) { failed.push({ key: m.key, name: m.name, error: '訊息超過 ' + s.LINE.maxTextLength + ' 字' }); records.push({ key: m.key, at: at, ok: false, error: '訊息過長' }); return; }
      var rk = seed(m), rec = { key: m.key, name: m.name, at: at };
      if (db.line.retryKeys[rk]) rec.duplicate = true;
      else { db.line.retryKeys[rk] = 1; db.line.used++; usedNow++; db.line.pushed.push({ to: db.line.bindings[m.key].userId, text: m.text, imageUrl: m.imageUrl || imageUrl || '', retryKey: rk, at: at }); records.push({ key: m.key, at: at, ok: true, error: '' }); }
      sent.push(rec);
    });
    return { sent: sent, failed: failed, records: records, usedNow: usedNow };
  }
  function noticeImageById(db, id) { ensure31(db); return db.noticeImages.filter(function (x) { return x.id === String(id || ''); })[0] || null; }
  function notifyAssign(db, req) {
    var s = S(), members = watchMembersIn(req), t = null;
    if (req.templateId) { t = templateById(db, String(req.templateId)); if (!t) throw err('找不到該範本', 'ERR_NOT_FOUND'); }
    ensureDefaultTemplate(db);
    if (!t && !String(req.bodyOverride || '').trim()) t = templateById(db, s.NOTIFY.defaultTemplateId);
    var over = String(req.bodyOverride == null ? '' : req.bodyOverride).replace(/\r\n?/g, '\n'), body = over.trim() ? over : (t ? t.body : '');
    if (!body.trim()) throw err('請選擇範本或輸入通知內容', 'ERR_VALIDATION');
    if (body.length > s.NOTIFY.maxBodyLength) throw err('通知內容不可超過 ' + s.NOTIFY.maxBodyLength + ' 字', 'ERR_VALIDATION');
    var image = req.imageId ? noticeImageById(db, req.imageId) : null;
    if (req.imageId && !image) throw err('找不到該通知圖卡', 'ERR_NOT_FOUND');
    var imgById = {};
    members.forEach(function (m) { if (m.imageId && !imgById[m.imageId]) { var im = noticeImageById(db, m.imageId); if (!im) throw err('找不到該通知圖卡', 'ERR_NOT_FOUND'); imgById[m.imageId] = im; } });
    var configured = lineConfigured(db), quota = configured ? lineQuotaNow(db) : lineQuotaUnknownMock(db);
    var messages = [], skipped = [];
    members.forEach(function (m) {
      var r = rosterByHash(db, m.key), w = watchLoad(db, m.key);
      if (!r && !w) { skipped.push({ key: m.key, name: '', reason: '名冊中找不到' }); return; }
      var name = (r && r.name) || w.n, callName = String(m.callName || '').trim().slice(0, s.BATCH.maxCallNameLength) || (w && w.c) || s.callName(name);
      var iso = s.deadlineIso(s.parseDeadline(m.deadline));
      var dv = db.drive && db.drive[m.key], text = s.renderTemplate(body, { '稱呼': callName, '名字': callName, '截止時間': s.formatDeadline(iso), '作業連結': s.NOTIFY.workUrl, '作業網址': s.NOTIFY.workUrl, '綁定連結': '', '雲端資料夾': dv && dv.rootUrl ? dv.rootUrl : '' });   // 3.2 {雲端資料夾}
      var lb = lineBindingOf(db, m.key);
      var row = { key: m.key, name: name, masked: (r && r.masked) || (w && w.m) || '', callName: callName, deadline: iso, deadlineText: s.formatDeadline(iso), text: text, length: text.length, tooLong: text.length > s.LINE.maxTextLength, lineBound: lb.bound, lineBlocked: lb.blocked, inWatch: !!w, willSend: configured && lb.bound && !lb.blocked && text.length <= s.LINE.maxTextLength };
      var pim = m.imageId ? imgById[m.imageId] : image; row.imageId = pim ? pim.id : ''; row.imageUrl = pim ? pim.url : '';
      messages.push(row);
      if (!configured) skipped.push({ key: m.key, name: name, reason: 'LINE 尚未設定' });
      else if (!lb.bound) skipped.push({ key: m.key, name: name, reason: '未對應 LINE' });
      else if (lb.blocked) skipped.push({ key: m.key, name: name, reason: '已封鎖官方帳號' });
      else if (row.tooLong) skipped.push({ key: m.key, name: name, reason: '訊息過長' });
    });
    var toSend = messages.filter(function (m) { return m.willSend; }), willSend = toSend.length, qs = s.lineQuotaSend(quota, willSend);
    var title = t ? (over.trim() ? t.name + '（本次修改）' : t.name) : '自訂內容';
    var imgOut = image ? { id: image.id, name: image.name, kind: image.kind || '', url: image.url } : null, kind = req.kind === 'resend' ? 'resend' : 'notify';
    var perImg = Object.keys(imgById).length, anyImg = !!image || perImg > 0;
    if (!imgOut && perImg) imgOut = { id: '', name: '個人化圖卡', kind: 'personal', url: '', count: perImg };
    var out = { template: t ? { id: t.id, name: t.name } : null, title: title, image: imgOut, quota: quota, messages: messages, willSend: willSend, skipped: skipped, afterRemaining: qs.afterRemaining, enough: qs.enough, shortBy: qs.shortBy, overage: qs.overage, overageNote: qs.note, lineConfigured: configured, pausedReminders: !!quota.paused };
    if (req.preview === true || req.dryRun === true) { out.preview = true; return out; }
    if (willSend && !qs.enough) throw err('本月 LINE 剩餘 ' + quota.remaining + ' 則，不足以發送 ' + willSend + ' 則（差 ' + qs.shortBy + ' 則）', 'ERR_LINE_QUOTA', String(qs.shortBy));
    var nowStr = tpeStamp(new Date()), added = [], updated = [];
    messages.forEach(function (m) { var existed = !!watchLoad(db, m.key); if (existed && kind !== 'resend' && S().CYCLE_RESTART) wCycleRestart(db, m.key, nowStr); watchUpsert(db, m.key, { deadline: m.deadline, callName: m.callName, by: 'notify', name: m.name, masked: m.masked }, nowStr); (existed ? updated : added).push(m.key); });
    var runId = String(req.runId || '').trim().slice(0, 40) || tpeStamp(new Date()).slice(0, 13).replace(/[. :]/g, ''), bodyHash = keyHash(body + '|' + (image ? image.id : '')).slice(0, 8);
    var res = { sent: [], failed: [], records: [], usedNow: 0 };
    if (willSend) res = pushMessages31(db, toSend, function (m) { return 'assign.' + runId + '.' + bodyHash + '.' + m.key + '.' + m.deadline + (m.imageId ? '.' + m.imageId : ''); }, image ? image.url : '');
    var imgOf = {}, msgOf = {}; messages.forEach(function (m) { imgOf[m.key] = !!m.imageUrl; msgOf[m.key] = m; });
    res.records.forEach(function (r) { r.img = imgOf[r.key] ? 1 : 0; });
    watchNotifyRecord(db, res.records, kind, anyImg);
    chatLogAppend(db, res.records.map(function (r) { var m = msgOf[r.key] || {}; return { key: r.key, dir: 'out', kind: kind, text: m.text, img: m.imageUrl, ok: r.ok, err: r.error, at: r.at }; }));
    quotaAccount(db, kind, res.usedNow);
    var logId = notifyLogAppend(db, { source: kind === 'resend' ? 'resend' : 'assign', title: WATCH.TITLE, template: title + (root.CONSULT_FLEX ? '（卡片）' : perImg ? '＋個人化圖卡' : image ? '＋圖卡' : ''), note: req.note, body: body, sent: res.sent, failed: res.failed, skipped: skipped });
    return { template: out.template, title: title, image: imgOut, runId: runId, sent: res.sent, failed: res.failed, skipped: skipped, logId: logId, watch: { added: added, updated: updated }, quota: lineQuotaNow(db), afterRemaining: lineQuotaNow(db).remaining };
  }
  /* 自動追蹤 */
  function automationDefaults() { var A = S().AUTOMATION; return { enabled: A.kinds.reduce(function (o, k) { o[k] = true; return o; }, {}), texts: JSON.parse(JSON.stringify(A.texts)), adminRecipients: [], digestHour: A.digestHour, updatedAt: '' }; }
  function automationLoad(db) {
    var A = S().AUTOMATION, cfg = automationDefaults(), o = db.automation;
    if (o && typeof o === 'object') {
      A.kinds.forEach(function (k) { if (o.enabled && typeof o.enabled[k] === 'boolean') cfg.enabled[k] = o.enabled[k]; });
      var legacy = A.legacyTexts || {};
      Object.keys(cfg.texts).forEach(function (k) { if (o.texts && typeof o.texts[k] === 'string' && o.texts[k].trim() && (legacy[k] || []).indexOf(o.texts[k]) < 0) cfg.texts[k] = o.texts[k]; });
      if (Array.isArray(o.adminRecipients)) cfg.adminRecipients = o.adminRecipients.filter(function (r) { return r && (r.userId || r.adminUserId); });
      if (o.digestHour != null && isFinite(Number(o.digestHour))) cfg.digestHour = Math.max(0, Math.min(23, Number(o.digestHour)));
      cfg.updatedAt = o.updatedAt || '';
      if (o.reportMode && typeof o.reportMode === 'object') cfg.reportMode = o.reportMode;
    }
    return cfg;
  }
  function automationSaveCfg(db, cfg) { cfg.updatedAt = tpeStamp(new Date()); db.automation = cfg; return cfg; }
  /* 3.2.12 內部提醒（離線模擬）：設定存 db.adminRemind；清單為虛構示範資料（相對現在時間） */
  function remindCore() { if (typeof CONSULT_REMIND !== 'undefined' && CONSULT_REMIND) return CONSULT_REMIND; return require('../src/remind.js'); }
  function adminRemindMock(db) {
    var RM = remindCore(), now = Date.now(), H = 3600000, cfg = RM.normalize(db.adminRemind), st = RM.normState(db.adminRemindState), A = automationLoad(db);
    cfg.work.now = A.enabled.submitNotify !== false;
    var at = function (h) { return tpeStamp(new Date(now - h * H)); };
    var items = {
      tool: [{ key: 'a1b2c3d4e5f60718', name: '範例小美', at: at(10), extra: '定價計算表 v2' }, { key: 'b1b2c3d4e5f60718', name: '範例佩君', at: at(13), extra: 'IG 排程模板 v1' }, { key: 'c1b2c3d4e5f60718', name: '範例雅婷', at: at(3), extra: '客戶分級問卷 v1' }],
      work: [{ key: 'r20261103001', name: '範例小美', at: at(5), note: '未讀' }, { key: 'r20261103002', name: '虛構雅婷', at: at(8), note: '未讀' }, { key: 'd1b2c3d4e5f60718', name: '範例曉晴', at: at(26), note: '已送出待看' }],
      issue: [{ key: 'b1b2c3d4e5f60718', name: '範例佩君', at: at(1), extra: 'IG 排程模板 v1', note: '功能異常' }],
      deliver: [{ key: 'e1b2c3d4e5f60718', name: '範例映彤', at: at(26), extra: '專屬教材' }, { key: 'f1b2c3d4e5f60718', name: '範例晴禾', at: at(3), extra: '專屬教材' }]
    };
    if (!st.since.tool) RM.KINDS.forEach(function (k) { st.since[k] = now - 6 * H; });
    var rc = { principal: 0, assistant: 0 }, list = (A.adminRecipients || []).map(function (r) { var role = S().recipientRole(r.role) === 'assistant' ? 'assistant' : 'principal', on = S().recipientEnabled(r); if (on) rc[role]++; return { id: r.id || r.userId || r.adminUserId, name: r.name || '', role: role, enabled: on, tail: String(r.adminUserId || r.userId || '').slice(-4), channel: 'admin' }; });
    var stats = JSON.parse(JSON.stringify(RM.DEFAULT_STATS)); stats.assumed = true; stats.recips = rc; stats.report = { time: '22:00', principal: true, assistant: true };
    var next = {}; RM.KINDS.forEach(function (k) { next[k] = RM.nextSend(cfg, k, items, now, st); });
    return { settings: cfg, defaults: RM.DEFAULTS, state: { since: st.since, sent: st.sent, last: st.last }, items: items, stats: stats, estimate: RM.estimate(cfg, stats),
      timeline: RM.timeline(cfg, st, items, now, { report: stats.report }), next: next, recipients: list, report: stats.report, triggerReady: true, triggerCount: 6, adminLine: { configured: adminLineConfigured(db) }, now: now, limit: RM.LIMIT };
  }
  function automationPublic(cfg) {
    var A = S().AUTOMATION, R = S().REPORT, db = loadDb(), modes = {};
    R.kinds.forEach(function (k) { modes[k] = reportModeOf(cfg, k); });
    return { enabled: cfg.enabled, texts: cfg.texts, defaults: A.texts, labels: A.labels, kinds: A.kinds, audience: A.audience, vars: A.vars,
      adminRecipients: cfg.adminRecipients.map(function (r) { return recipPublic(db, r); }), digestHour: cfg.digestHour, updatedAt: cfg.updatedAt || '', quotaReservePct: Math.round(quotaCfgOf(db).reserveRatio * 1000) / 10, triggerReady: true, reportMode: modes,
      reportKinds: R.kinds, reportLabels: R.labels, roles: R.roles, roleLabels: R.roleLabels, adminLine: { configured: adminLineConfigured(db) } };
  }

  /** 3.1.3 匯報紀錄（同 watch.gs reportLogAppend）：db.reports=[{ at, kind, title, mode, text, results }] */
  function reportLogAppend(db, o) { ensure31(db); db.reports = db.reports || []; db.reports.push({ at: tpeStamp(new Date()), kind: o.kind || '', title: o.title || '', mode: o.mode || 'line', text: String(o.text || '').slice(0, 5000), results: (o.results || []).slice(0, 10) }); }
  function reportModeOf(cfg, k) { return (cfg.reportMode || {})[k] === 'admin' ? 'admin' : 'line'; }
  var REPORT_TITLE = { digest: '每日摘要', submitNotify: '送出通知', overdue: '逾期通知' };
  /**
   * 對管理收件人推播（3.2 路由：天使助教帳號已設定且收件人有 adminUserId → admin channel；否則 @52grace）
   * rk：匯報類別（principal／digest 依收件人角色篩選；submitNotify、overdue 全部；test 只發 onlyId）
   */
  function adminPush(db, text, kind, seed, rk, onlyId) {
    var s = S(), cfg = automationLoad(db), title = rk ? (s.REPORT.titles[rk] || '') : '';
    var off = 0, recips = cfg.adminRecipients.filter(function (r) { if (onlyId) return recipId(r) === onlyId; if (!s.recipientEnabled(r)) { off++; return false; } return recipWants(r, rk); });   // 3.2.4：略過關閉接收者
    if (onlyId && recips[0] && !s.recipientEnabled(recips[0])) return { sent: 0, failed: 1, skipped: 0, results: [{ name: recips[0].name || '', ok: false, error: '此收件人已關閉接收', channel: '' }] };
    if (onlyId && recips[0] && recipChannel(db, recips[0]) === 'standby') return { sent: 0, failed: 1, skipped: 0, results: [{ name: recips[0].name || '', ok: false, error: '主帳號收件人只在天使助教未設定或未連線時備援', channel: '' }] };
    var standby = recips.filter(function (r) { return recipChannel(db, r) === 'standby'; }).length;
    recips = recips.filter(function (r) { return recipChannel(db, r) !== 'standby'; });
    if (rk && rk !== 'test' && reportModeOf(cfg, rk) === 'admin') { reportLogAppend(db, { kind: rk, title: title, mode: 'admin', text: text }); return { sent: 0, failed: 0, skipped: 0, results: [], adminOnly: true }; }
    if (!recips.length || (!lineConfigured(db) && !adminLineConfigured(db))) { if (rk && rk !== 'test') reportLogAppend(db, { kind: rk, title: title, mode: 'line', text: text, results: [{ name: '（無管理收件人或 LINE 未設定）', ok: false, error: '未推播' }] }); return { sent: 0, failed: 0, skipped: recips.length, results: [] }; }
    var results = [], sentMain = 0, sentAdmin = 0, body = String(text).slice(0, s.LINE.maxTextLength);
    recips.forEach(function (r) {
      var ch = recipChannel(db, r), to = ch === 'admin' ? r.adminUserId : r.userId, nm = r.name || ('…' + String(to || '').slice(-4));
      if (ch === 'none') { results.push({ name: nm, ok: false, error: '沒有可用的 LINE 頻道', channel: '' }); return; }
      var rr = pushRaw(db, ch, to, [{ type: 'text', text: body }], 'admin.' + kind + '.' + seed + '.' + to);
      if (rr.ok && !rr.duplicate) { if (ch === 'admin') sentAdmin++; else sentMain++; }
      results.push({ name: nm, ok: !!rr.ok, error: rr.error || '', channel: ch });
    });
    quotaAccount(db, kind, sentMain);
    if (sentAdmin) adminQuotaAccount(db, kind, sentAdmin);
    if (rk && rk !== 'test') reportLogAppend(db, { kind: rk, title: title, mode: 'line', text: body, results: results });
    return { sent: sentMain + sentAdmin, failed: results.filter(function (x) { return !x.ok; }).length, skipped: 0, results: results, admin: sentAdmin, main: sentMain, standby: standby, off: off, backup: sentMain > 0 };
  }

  function automationOnSubmit(db, account, name, receiptId, submittedAt, onTime, hasDeadline) {
    var s = S(), cfg = automationLoad(db), out = { thanks: null, submitNotify: null };
    var mainOk = lineConfigured(db);
    if (!mainOk && !adminLineConfigured(db)) return out;
    var h = keyHash(progressKeyOf(account));
    if (cfg.enabled.thanks && mainOk) {
      var lb = lineBindingOf(db, h), q = lineQuotaNow(db);
      if (lb.bound && !lb.blocked && !q.paused) {
        var e = watchLoad(db, h), cn = (e && e.c) || s.callName(name), rk = 'thanks.' + receiptId;
        if (!db.line.retryKeys[rk]) { var thx = s.renderTemplate(cfg.texts.thanks, s.automationVars({ callName: cn, deadline: (watchLoad(db, h) || {}).d || '' })); db.line.retryKeys[rk] = 1; db.line.used++; db.line.pushed.push({ to: db.line.bindings[h].userId, text: thx, retryKey: rk, at: tpeStamp(new Date()) }); quotaAccount(db, 'auto', 1); chatLogAppend(db, [{ key: h, dir: 'out', kind: 'thanks', text: thx, ok: true }]); }
        out.thanks = true;
        if (e) { e.nt = (e.nt || []).concat([{ at: submittedAt, ok: true, kind: 'thanks', err: '' }]).slice(-WATCH.MAX_NOTIFY_KEEP); watchStore(db, e); }
      }
    }
    if (cfg.enabled.submitNotify) { var punctual = !hasDeadline ? '未設定截止時間' : (onTime ? '準時完成' : '已逾截止時間'); out.submitNotify = adminPush(db, s.renderTemplate(cfg.texts.submitNotify, { '本名': name, '送出時間': submittedAt, '準時': punctual }), 'auto', receiptId, 'submitNotify').sent; }
    return out;
  }
  function runAutomation(db, opts) {
    opts = opts || {};
    var s = S(), cfg = automationLoad(db), nowMs = Date.now(), now = new Date(nowMs), t = tpeDate(now);
    var report = { at: tpeStamp(now), remind48: [], remind24: [], noAck: [], overdue: [], held: [], digest: null, paused: false, skipped: [], dry: !!opts.dry, configured: lineConfigured(db) };
    if (!report.configured) { report.skipped.push('LINE 尚未設定'); return report; }
    var quota = lineQuotaNow(db); report.quota = { used: quota.used, limit: quota.limit, remaining: quota.remaining, reserve: quota.reserve, unlimited: !!quota.unlimited }; report.paused = !!quota.paused;
    var idx = stateIndexes(db), rows = watchAll(db).map(function (e) { return { e: e, row: watchRowOut(db, e, nowMs, idx) }; });
    var budget = quota.budget == null ? Infinity : quota.budget;   // 3.3.7 剩餘 − 保留（比例）
    var pushSister = function (x, kind, text) {
      if (report.paused || budget <= 0) { report.skipped.push(kind + '：額度不足，' + x.row.name); return false; }
      if (!x.row.lineBound || x.row.lineBlocked) { report.skipped.push(kind + '：LINE 無法送達，' + x.row.name); return false; }
      if (opts.dry) { budget--; return true; }
      var rk = 'auto.' + kind + '.' + x.e.k + '.' + x.e.d + '.' + t.date, at = tpeStamp(new Date());
      if (!db.line.retryKeys[rk]) { db.line.retryKeys[rk] = 1; db.line.used++; budget--; quotaAccount(db, 'remind', 1); db.line.pushed.push({ to: db.line.bindings[x.e.k].userId, text: text, retryKey: rk, at: at }); chatLogAppend(db, [{ key: x.e.k, dir: 'out', kind: kind, text: text, ok: true, at: at }]); }
      x.e.nt = (x.e.nt || []).concat([{ at: at, ok: true, kind: kind, err: '' }]).slice(-WATCH.MAX_NOTIFY_KEEP);
      return true;
    };
    var overdueNames = [];
    rows.forEach(function (x) {
      var e = x.e, row = x.row;
      if (row.state === 'submitted' || !e.d) return;
      var dl = s.parseDeadline(e.d), left = dl == null ? null : dl - nowMs; e.fl = e.fl || {};
      var vars = s.automationVars({ callName: e.c || s.callName(e.n), deadline: e.d }), changed = false;
      if (left != null && left > 0) {
        var plan = s.reminderPlan({ deadlineMs: dl, nowMs: nowMs, flags: e.fl, notifies: e.nt, ack: e.ack, enabled: cfg.enabled });   // 3.1.3 防重複（同 watch.gs）
        if (plan.hold) report.held.push(plan.hold + '：' + e.n);
        if (plan.remind48) { if (pushSister(x, 'remind48', s.renderTemplate(cfg.texts.remind48, vars))) { e.fl.h48 = 1; report.remind48.push(e.n); changed = true; } }
        if (plan.remind24) { if (pushSister(x, 'remind24', s.renderTemplate(cfg.texts.remind24, vars))) { e.fl.h24 = 1; e.fl.h48 = 1; report.remind24.push(e.n); changed = true; } }
        if (plan.noAck) { if (pushSister(x, 'noAck', s.renderTemplate(cfg.texts.noAck, vars))) { e.fl.noAck = 1; report.noAck.push(e.n); changed = true; } }
      } else if (left != null && left <= 0 && cfg.enabled.overdue && e.fl.overdue !== 1) { overdueNames.push(e.n + '｜截止 ' + s.shortTime(e.d)); e.fl.overdue = 1; changed = true; report.overdue.push(e.n); }
      if (changed && !opts.dry) watchStore(db, e);
    });
    if (overdueNames.length && !opts.dry) { var odL = overdueNames.map(function (x) { return s.REPORT.L2 + x; }).join('\n'); report.overdueResult = adminPush(db, s.renderTemplate(cfg.texts.overdue, { '名單': odL, '學姐名單': odL, '人數': String(overdueNames.length) }), 'auto', tpeStamp(now).slice(0, 13).replace(/[. :]/g, ''), 'overdue'); }
    var hour = Number(t.time.slice(0, 2)), today = t.date;
    if (cfg.enabled.digest && (hour === cfg.digestHour || opts.forceDigest)) dailyReportsMock(db, cfg, report, opts);   // 3.2 校長匯報（principal）＋助教匯報（digest）
    return report;
  }
  /* 軟刪除與還原 */
  function undoCreate(db, kind, payload, label) {
    ensure31(db);
    var now = Date.now();
    Object.keys(db.undo).forEach(function (k) { if (!db.undo[k] || db.undo[k].exp < now) delete db.undo[k]; });
    var token = 'u' + rand(20).replace(/[^A-Za-z0-9]/g, 'A'), exp = now + WATCH.UNDO_TTL_MS;
    db.undo[token] = { kind: kind, exp: exp, label: String(label || '').slice(0, 80), payload: payload, at: tpeStamp(new Date(now)) };
    return { token: token, expiresAt: tpeStamp(new Date(exp)), label: db.undo[token].label };
  }
  function undoDelete(db, req) {
    ensure31(db);
    var token = String(req.undoToken || ''), rec = db.undo[token];
    if (!/^u[A-Za-z0-9]{20}$/.test(token)) throw err('還原憑證格式不正確', 'ERR_VALIDATION');
    if (!rec) throw err('已超過可還原時間（10 分鐘）或已還原', 'ERR_NOT_FOUND');
    if (rec.exp < Date.now()) { delete db.undo[token]; throw err('已超過可還原時間（10 分鐘）', 'ERR_NOT_FOUND'); }
    var pl = rec.payload || {}, detail = {};
    if (rec.kind === 'submission') {
      var restored = [];
      (pl.receiptIds || []).forEach(function (rid) { var tr = db.trash && db.trash[rid]; if (!tr || db.submissions[rid]) return; db.submissions[rid] = tr.sub; db.index.push(tr.sub.index); if (tr.supp) db.supplements[rid] = tr.supp; delete db.trash[rid]; restored.push(rid); Object.keys(db.progress).forEach(function (k) { if (db.progress[k].receiptId === rid) db.progress[k].status = '已送出'; }); });
      detail = { receiptIds: restored };
      (pl.prog || []).forEach(function (x) { if (db.progress[x.k] && db.progress[x.k].status === '已移除') db.progress[x.k].status = x.status; });
    } else if (rec.kind === 'progress') {
      var nP = 0; (pl.prog || []).forEach(function (x) { if (db.progress[x.k] && db.progress[x.k].status === '已移除') { db.progress[x.k].status = x.status; nP++; } }); detail = { restored: nP };
    } else if (rec.kind === 'watch') { if (pl.entry && pl.entry.k) { watchStore(db, pl.entry); detail = { key: pl.entry.k, name: pl.entry.n }; } }
    else if (rec.kind === 'notifyLog') { if (pl.entry) { db.notifyLog = db.notifyLog || []; if (!db.notifyLog.some(function (x) { return x.id === pl.entry.id; })) { db.notifyLog.unshift(pl.entry); db.notifyLog.sort(function (a, b) { return a.at < b.at ? 1 : -1; }); } detail = { id: pl.entry.id }; } }
    else if (rec.kind === 'template') { if (pl.template && !templateById(db, pl.template.id)) db.templates.push(pl.template); detail = { id: pl.template && pl.template.id, name: pl.template && pl.template.name }; }
    else if (rec.kind === 'noticeImage') { if (pl.rec && !noticeImageById(db, pl.rec.id)) db.noticeImages.unshift(pl.rec); detail = { id: pl.rec && pl.rec.id }; }
    else if (rec.kind === 'autoRecipient') { var cfg = automationLoad(db); if (pl.rec && !cfg.adminRecipients.some(function (r) { return r.userId === pl.rec.userId; })) cfg.adminRecipients.push(pl.rec); automationSaveCfg(db, cfg); detail = { userIdTail: String(pl.rec && pl.rec.userId).slice(-4) }; }
    else if (rec.kind === 'materialLib') { ensure32(db); if (pl.row && !db.matLib.some(function (x) { return x.id === pl.row.id; })) db.matLib.push(pl.row); detail = { id: pl.row && pl.row.id }; }
    else throw err('不支援的還原類型', 'ERR_VALIDATION');
    delete db.undo[token];
    return { restored: true, kind: rec.kind, label: rec.label, detail: detail };
  }
  /** Webhook「確認」：已對應且在追蹤名單者記錄 ack 並回覆致謝；回 true 表示已處理 */
  function watchAckFromEvent(db, ev, out) {
    var s = S();
    if (!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || !WATCH.ACK_RE.test(String(ev.message.text || ''))) return false;
    var userId = ev.source && ev.source.type === 'user' ? String(ev.source.userId || '') : '';
    var h = Object.keys(db.line.bindings).filter(function (k) { return db.line.bindings[k] && db.line.bindings[k].userId === userId; })[0];
    out.acks = out.acks || [];
    if (!h) return true;
    var e = watchLoad(db, h);
    var cnA = e ? (e.c || s.callName(e.n)) : s.callName((rosterByHash(db, h) || {}).name || '');
    if (e) {
      e.ack = tpeStamp(new Date()); e.ackCount = (e.ackCount || 0) + 1; e.fl = e.fl || {}; e.fl.noAck = 1; watchStore(db, e);
      quotaAccount(db, 'ack', 0, 1);
      out.acks.push(h);
    }
    if (lineConfigured(db)) { var ackT = s.renderTemplate(automationLoad(db).texts.ackReply, s.automationVars({ callName: cnA, deadline: e && e.d ? e.d : '', plain: true })); out.replies.push(ackT); chatLogAppend(db, [{ key: h, dir: 'out', kind: 'ackReply', text: ackT, ok: true }]); }
    return true;
  }
  /** 3.1 示範：追蹤名單（seeds.watch）、管理收件人（seeds.automation）；舊批次成員遷移（同 migrateBatchesToWatch） */
  function seedWatch(db, seeds) {
    var s = S(), nowStr = tpeStamp(new Date());
    if (seeds.watch) {
      (seeds.watch.members || []).forEach(function (acc) { var k = s.rosterKey(acc), h = keyHash(k); if (!db.roster.entries[k]) return; watchUpsert(db, h, { deadline: seeds.watch.deadline, by: 'migrate', src: 'b20261011-DEMO1' }, nowStr); });
      (seeds.watch.lineBound || []).forEach(function (acc) { var h = keyHash(s.rosterKey(acc)); if (!db.line.bindings[h]) db.line.bindings[h] = { userId: 'U' + keyHash(acc) + keyHash(acc + '.line'), boundAt: tpeStamp(new Date(Date.now() - 3 * 86400000)), blocked: false, by: 'map', name: '' }; });
    }
    (db.batchOrder || []).forEach(function (id) {
      var b = db.batches[id]; if (!b || b.archived || b.migrated) return;
      b.members.forEach(function (m) { var e = watchLoad(db, m.key); if (e) { if (!e.d && b.deadline) { e.d = b.deadline; watchStore(db, e); } return; } e = { k: m.key, n: m.name, m: m.masked || '', c: m.callName || s.callName(m.name), d: b.deadline, at: b.createdAt || nowStr, by: 'migrate', dc: 0, td: 0, note: '', ack: '', ackCount: 0, nt: [], fl: {}, src: b.id }; var n = b.notify && b.notify[m.key]; if (n && n.at) e.nt.push({ at: n.at, ok: !!n.ok, kind: 'batch', err: n.error || '' }); watchStore(db, e); });
      b.migrated = nowStr;
    });
    if (seeds.automation) { var cfg = automationLoad(db); (seeds.automation.adminRecipients || []).forEach(function (r) { if (!cfg.adminRecipients.some(function (x) { return x.userId === r.userId; })) cfg.adminRecipients.push({ userId: r.userId, name: r.name || '', key: '', at: nowStr }); }); automationSaveCfg(db, cfg); }
  }

  /* ---------------- 3.2：天使助教帳號、匯報、學院後台同步、諮詢準備台、諮詢教材、啟動資料（同 gas；介面見 docs/CONTRACT-3.2.md） ---------------- */
  var ADMIN_LINE = { oaId: '@734keoum', channelId: '2012319831' };
  function ensure32(db) {
    ensure31(db);
    if (!db.lineAdmin) db.lineAdmin = { settings: null, used: 0, limit: 200, pushed: [], recent: [], retryKeys: {}, profiles: {}, replies: [] };
    if (!db.counsel) db.counsel = { entries: {}, syncAt: '' };
    if (!db.prepSettings) db.prepSettings = { leadHours: S().PREP.leadHoursDefault };
    if (!db.matLib) db.matLib = [];
    if (!db.materials) db.materials = [];
    if (!db.reports) db.reports = [];
    if (!db.quotaAdmin) db.quotaAdmin = {};
    if (!db.students) db.students = { entries: {}, syncAt: '', completedAt: '' };   // 3.2 學員詳情快照（鍵＝名冊鍵雜湊）
    if (!db.audit) db.audit = [];   // 3.2.1 操作紀錄
    return db;
  }
  /** 3.2 學員詳情：同 gas studentSync／studentSummaryAll／studentDetail */
  function studentSyncMock(db, req) {
    ensure32(db);
    var s = S(), s3 = S3(), ST = s3.STUDENT;
    if (!ST.sourceRe.test(String(req.source || ''))) return { fail: fail('來源須為官網後台頁面', 'ERR_VALIDATION') };
    if (!Array.isArray(req.students) || !req.students.length) return { fail: fail('學員資料格式錯誤', 'ERR_VALIDATION') };
    if (req.students.length > ST.maxBatch) return { fail: fail('每批最多 ' + ST.maxBatch + ' 位', 'ERR_VALIDATION') };
    var syncAt = tpeStamp(new Date()), saved = 0, unmatched = 0, invalid = 0;
    req.students.forEach(function (x) {
      var k = x && typeof x === 'object' ? s.rosterKey(x.uid) : '';
      if (!k) { invalid++; return; }
      if (!db.roster.entries[k]) { unmatched++; return; }
      var snap = s3.normalizeStudentSnapshot(x); if (!snap) { invalid++; return; }
      snap.syncAt = syncAt;
      db.students.entries[keyHash(k)] = { syncAt: syncAt, snap: snap }; saved++;
    });
    db.students.syncAt = syncAt; if (req.final === true) db.students.completedAt = syncAt;
    return { data: { saved: saved, unmatched: unmatched, invalid: invalid, syncAt: syncAt, total: Object.keys(db.students.entries).length } };
  }
  function studentSummaryMock(db) {
    ensure32(db);
    var s3 = S3(), now = Date.now();
    var rows = rosterRows(db).map(function (e) { var x = db.students.entries[e.key]; return { key: e.key, name: e.name, masked: e.masked, syncAt: x ? x.syncAt : '', summary: x ? s3.studentSummary(x.snap, now) : null }; });
    return { zones: s3.STUDENT.summaryZones.slice(), rows: rows, syncAt: db.students.syncAt || '', completedAt: db.students.completedAt || '', total: rows.filter(function (r) { return r.summary; }).length };
  }
  function studentDetailMock(db, req) {
    ensure32(db);
    var s = S(), s3 = S3(), h = keyOfReq(req);
    if (!/^[0-9a-f]{16}$/.test(h)) return { fail: fail('學姐鍵格式不正確', 'ERR_VALIDATION') };
    var r = rosterByHash(db, h); if (!r) return { fail: fail('名冊查無此學姐', 'ERR_NOT_FOUND') };
    var x = db.students.entries[h] || null, idx = stateIndexes(db), e = watchLoad(db, h), st = wState(db, h, e, idx), ix = idx.byIdx[h] || null;
    var c = db.counsel.entries[h] || null, mf = latestMaterial(db, h), drv = db.drive[h], lb = lineBindingOf(db, h);
    return { data: { key: h, name: r.name, masked: r.masked, synced: !!x, syncAt: x ? x.syncAt : '', snapshot: x ? s3.studentDetailView(x.snap, Date.now()) : null,
      work: { state: st.state, percent: st.percent, receiptId: st.receiptId, submittedAt: st.submittedAt, dataDone: ix ? ix.dataDone || '' : '', status: ix ? ix.status || '' : '', supplement: ix && ix.status === s3.STATUS_SUPPLEMENT.open ? 'open' : ix && ix.status === s3.STATUS_SUPPLEMENT.done ? 'done' : '', ackState: e ? watchRowOut(db, e, Date.now(), idx).ackState : null },
      inWatch: !!e, nextCounsel: c && c.nc ? c.nc : null,
      material: mf ? { flowId: mf.flowId, material: mf.material, state: mf.state, stateLabel: s.materialStateLabel(mf.state), matchPending: !!mf.matchPending, replyOrderedAt: mf.replyOrderedAt || '', receivedAt: mf.receivedAt || '', deliveredAt: mf.deliveredAt || '' } : null,
      drive: { registered: !!drv, rootUrl: drv ? drv.rootUrl || '' : '' }, lineBound: lb.bound, chatUrl: lb.bound ? lineChatUrlFor(db, h) : '' } };
  }
  /** 3.2 示範學員詳情（離線模擬，非真實學員）：依名冊前幾位產生 */
  function seedStudentsMock(db) {
    var s3 = S3(), now = Date.now(), day = 86400000, d = function (n) { var t = new Date(now + n * day + 8 * 3600000); return t.getUTCFullYear() + '.' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '.' + ('0' + t.getUTCDate()).slice(-2); };
    var courses = function (n, t, prefix) { var o = []; for (var i = 0; i < t; i++) o.push({ title: '《' + prefix + ' ' + (i + 1) + '》', onShelf: i < t - 2, count: i < n ? 1 : 0, lastAt: i < n ? d(-10 * (i + 1)) : '' }); return o; };
    var accs = ['yating.lin@gmail.com', 'grace_lin88', 'sung.sunny', 'hsiu_yun', 'yu_an', 'hui_ning'], at = tpeStamp(new Date());
    accs.forEach(function (acc, i) {
      var k = S().rosterKey(acc); if (!db.roster.entries[k]) return;
      var snap = s3.normalizeStudentSnapshot({
        profile: { level: { code: ['SUPREME', 'GOLD', 'SILVER', 'GOLD', 'BASIC', 'GOLD'][i], name: ['至尊', '黃金', '白銀', '黃金', '基本', '黃金'][i], expireAt: d(38 + i * 40) }, status: 'Y', points: { balance: 41962 - i * 8000, expireAt: d(350) }, registeredAt: d(-800 + i * 120), lastLoginAt: d(-1 - i) + ' 21:36', birthday: '199' + i + '.0' + (i + 3) + '.1' + i },
        zones: [{ name: '正課區', courses: courses(25 - i * 4, 31, '正課') }, { name: '案例專區', courses: courses(52 - i * 8, 155, '案例') }, { name: 'AI應用專區', courses: courses(3, 6, 'AI 應用') }, { name: '私享專場', courses: courses(34 - i * 5, 58, '私享') }, { name: '限時專區', bought: 3, total: 12, lastAt: d(-170) }],
        purchases: [{ at: d(-3) + ' 10:00', title: '《AI指令設計》', points: -1200 }, { at: d(-5) + ' 12:00', title: '《寶藏開箱室》M7', points: -500 }], pointsSpent: 128400 - i * 9000,
        studyPlan: { current: { startAt: d(-10), state: '進行中', tasks: [{ title: '《人性行銷｜佈局力》', zone: '正課區', dueAt: d(-7), state: '已下單', done: true }, { title: '《領頭羊實戰系統》', zone: 'AI應用專區', dueAt: d(-8), state: '逾期未下單' }, { title: '《課件操手｜搞定問題》', zone: '正課區', dueAt: d(3), state: '待下單' }] }, history: [{ startAt: d(-200), state: '完成' }, { startAt: d(-140), state: '未完成' }] },
        study: { weeks: [3.2, 5.1, 2.4, 6.8, 4.0, 7.5, 5.6, 2.1].map(function (h, j) { return { start: d(-7 * (7 - j)), hours: Math.max(0, h - i) }; }), totalHours: 412.5 - i * 50 },
        counsels: { next: { at: d(2) + ' 15:00', title: '《1V1諮詢》佈局設計‧30分鐘', status: '已確認' }, past: [{ at: d(-24) + ' 14:00', title: '人性行銷—故事力', minutes: 30 }, { at: d(-48) + ' 14:00', title: '版面健檢', minutes: 45 }].concat(i === 5 ? [{ at: d(-330) + ' 10:30', title: '開發社群價值', minutes: 60 }] : []), counts: { confirmed: 25 - i, pending: 2, total: 33 } },
        levelHistory: [{ at: d(-300), from: '黃金', to: '至尊' }]
      });
      snap.syncAt = at;
      db.students.entries[keyHash(k)] = { syncAt: at, snap: snap };
    });
    db.students.syncAt = at; db.students.completedAt = at;
  }
  function keyOfReq(req) { return String((req && (req.rosterKey || req.key)) || '').toLowerCase(); }
  function adminLineConfigured(db) { ensure32(db); var st = db.lineAdmin.settings; return !!(st && st.channelId && st.channelSecret); }
  function recipId(r) { return String(r.userId || r.adminUserId || ''); }
  /** 3.2.4：管理通知只走天使助教；主帳號只在天使助教未設定時備援（schema.recipientRoute；與 watch.gs 同） */
  function recipChannel(db, r) { return S().recipientRoute(r, adminLineConfigured(db) && !(db.lineAdmin && db.lineAdmin.down), lineConfigured(db)); }
  function recipPublic(db, r) {
    return { id: recipId(r), userId: r.userId || '', userIdTail: String(r.userId || '').slice(-4), adminUserId: r.adminUserId || '', adminUserIdTail: String(r.adminUserId || '').slice(-4),
      name: r.name || '', role: S().recipientRole(r.role), key: r.key || '', at: r.at || '', channel: recipChannel(db, r), enabled: S().recipientEnabled(r), backup: !!r.userId };
  }
  function findRecip(cfg, id) {
    id = String(id || '');
    if (!id) return null;
    return cfg.adminRecipients.filter(function (r) { return r.userId === id || r.adminUserId === id || (id.length === 4 && (String(r.userId || '').slice(-4) === id || String(r.adminUserId || '').slice(-4) === id)); })[0] || null;
  }
  function adminQuotaAccount(db, kind, n) { ensure32(db); var k = quotaKey(), o = db.quotaAdmin[k] || (db.quotaAdmin[k] = { total: 0, byKind: {} }); o.total += n; o.byKind[kind] = (o.byKind[kind] || 0) + n; }
  /** 收件人是否接收此類匯報：principal／digest 依角色；submitNotify、overdue、test 全部 */
  function recipWants(r, rk) { var s = S(); if (rk !== 'principal' && rk !== 'digest') return true; return s.REPORT.roleReport[s.recipientRole(r.role)] === rk; }
  function bindingOwner(db, userId) { var hit = ''; Object.keys(db.line.bindings).some(function (h) { if (db.line.bindings[h] && db.line.bindings[h].userId === userId) { hit = h; return true; } return false; }); return hit; }

  /* ---- 匯報內容 ---- */
  function prepRowsMock(db) {
    ensure32(db);
    var s = S(), idx = stateIndexes(db), wl = {}, keys = {};
    watchAll(db).forEach(function (e) { wl[e.k] = e; keys[e.k] = 1; });
    Object.keys(db.counsel.entries).forEach(function (h) { if (db.counsel.entries[h] && db.counsel.entries[h].nc) keys[h] = 1; });
    return Object.keys(keys).map(function (h) {
      var e = wl[h], r = rosterByHash(db, h) || {}, c = db.counsel.entries[h] || null, st = wState(db, h, e, idx), lb = lineBindingOf(db, h);
      var p = c && c.p && c.nc && c.p.at === c.nc.at ? c.p : {}, mf = latestMaterial(db, h), drv = db.drive[h];
      return { key: h, name: r.name || (e && e.n) || '', callName: (e && e.c) || s.callName(r.name || ''), inWatch: !!e, notified: s.prepNotified(e ? e.nt : null), nextCounsel: c && c.nc ? c.nc : null,
        hw: { state: st.state, percent: st.percent, receiptId: st.receiptId, submittedAt: st.submittedAt, supp: (function (ix) { var t = String((ix && ix.status) || ''); return st.state === 'submitted' && !!ix && ix.receiptId === st.receiptId && /補件/.test(t) && t !== '已補件'; })(idx.byIdx[h]) },   // 3.3.5 同 prep.gs prepSuppOpen_
        dataConfirmed: e ? e.dc === 1 : p.dc === 1, toolDone: e ? e.td === 1 : p.td === 1,
        drive: { registered: !!drv, rootFolderId: drv ? drv.rootFolderId : '', rootUrl: drv ? drv.rootUrl : '' },
        material: mf ? { flowId: mf.flowId, state: mf.state, stateLabel: s.materialStateLabel(mf.state), matchPending: !!mf.matchPending, cycle: mf.cycle || '', notifiedAt: mf.notifiedAt || '', deliveredAt: mf.deliveredAt || '', amount: Number(mf.amount) || 0, matchIssue: mf.matchIssue || '', abandoned: !!mf.abandonedAt, closed: !!mf.closedAt } : null,
        lineBound: lb.bound, chatUrl: lb.bound ? lineChatUrlFor(db, h) : '', syncAt: c ? c.y || '' : '' };
    });
  }
  /* ---- 工具測試流程＋3.2.8 上傳工具（同 gas/tooltest.gs；db.tooltest[key]＝{ k, s, t, u, v, c, dn, rs, by, lg, tk, tf, tn, tz, ua, hs }） ---- */
  var TT = { LABELS: { make: '製作中', test: '待測試', fix: '等待校長修改', pass: '已通過' }, EVENTS: { mark_done: [['make', 'fix'], 'test', 'assistant'], pass: [['test'], 'pass', 'principal'], needfix: [['test'], 'fix', 'principal'], feedback: [['test'], 'fix', 'principal'], undo: [['pass'], 'test', ''] },
    FB_TYPES: { needfix: '需要修改', broken: '功能異常', ux: '使用不流暢', other: '其他' }, SMALL: 8 * 1024 * 1024, MAX: 100 * 1024 * 1024, CHUNK: 8 * 1024 * 1024 };
  function ttFresh(h, c) { return { k: h, s: 'make', t: '', u: '', v: 0, c: c || '', dn: '', rs: '', by: '', lg: [], at: tpeStamp(new Date()) }; }
  /* 3.3.0 教材定價（同 tooltest.gs tooltestPriceNeed_／tooltestPutPrice_） */
  function ttPriceIn(req) { var raw = req && req.price != null ? String(req.price).replace(/[,\s]/g, '') : ''; if (raw === '') return null; var n = Math.round(Number(raw)); return isFinite(n) && n > 0 && n <= 10000000 ? n : NaN; }
  function ttPriceCheck(e, req) { var n = ttPriceIn(req); if (n !== n) return '教材定價需為 1 以上的整數（新台幣）'; if (n == null && !(Number(e.pi) > 0)) return '請填教材定價'; return ''; }
  function ttPutPrice(e, req) {
    var n = ttPriceIn(req), now = tpeStamp(new Date()); if (n == null || n !== n) return;
    if (!(Number(e.pi) > 0)) { e.pi = n; e.pp = n; e.pl = (e.pl || []).concat([{ at: now, by: 'principal', ev: 'init', from: 0, to: n, rs: '' }]); return; }
    if (n !== (Number(e.pp) || Number(e.pi))) { e.pl = (e.pl || []).concat([{ at: now, by: 'principal', ev: 'upload', from: Number(e.pp) || Number(e.pi), to: n, rs: '上傳新版時調整' }]); e.pp = n; }
  }
  function ttLoad(db, h, cycle) { db.tooltest = db.tooltest || {}; var e = db.tooltest[h]; if (!e || (cycle && e.c && e.c !== cycle)) e = ttFresh(h, cycle); if (cycle && !e.c) e.c = cycle; return e; }
  function ttPublic(db, h, e) {
    var re = rosterByHash(db, h) || {}, w = watchLoad(db, h), name = re.name || (w && w.n) || '', st = e ? e.s : 'make';
    return { key: h, name: name, callName: (w && w.c) || S().callName(name), state: st, stateLabel: TT.LABELS[st], deliverable: st === 'pass', deliverLabel: st === 'pass' ? '可交付' : '', tool: e ? e.t || '' : '', toolUrl: e ? e.u || '' : '',
      version: e && e.v ? 'v' + e.v : '', versionNo: e ? Number(e.v) || 0 : 0, cycle: e ? e.c || '' : '', sentAt: e ? e.dn || '' : '', resultAt: e ? e.rs || '' : '', log: e ? (e.lg || []).slice().reverse() : [],
      toolKind: e && e.u ? (e.tk || 'url') : '', toolFileId: e ? e.tf || '' : '', toolFileName: e ? e.tn || '' : '', toolSize: e ? Number(e.tz) || 0 : 0, uploadedAt: e ? e.ua || '' : '', toolHistory: e ? (e.hs || []).slice().reverse() : [],
      feedback: e ? (e.feedback || []).slice().reverse().map(function (x) { return { at: x.at, version: x.v, types: x.ty, typeLabels: x.ty.map(function (t) { return TT.FB_TYPES[t]; }), text: x.tx, shots: (x.sh || []).map(function (y) { return { id: y.f, name: y.n, url: 'https://drive.google.com/file/d/' + y.f + '/view' }; }) }; }) : [], uploadedBy: e && e.ua ? 'principal' : '', started: !!(e && (e.st || e.u || Number(e.pi) > 0 || (e.s && e.s !== 'make'))), startedAt: e ? e.st || '' : '',
      createdAt: e ? e.at || '' : '', priceInitial: e ? Number(e.pi) || 0 : 0, priceCurrent: e ? Number(e.pp) || Number(e.pi) || 0 : 0, priceConfirmed: e && Number(e.pc) > 0 ? Number(e.pc) : 0, priceConfirmedAt: e ? e.pca || '' : '',
      priceChanged: !!(e && Number(e.pc) > 0 && Number(e.pi) > 0 && Number(e.pc) !== Number(e.pi)), priceReason: e ? e.prs || '' : '', priceLog: e ? (e.pl || []).slice().reverse() : [], passAt: e && e.s === 'pass' ? e.rs || '' : '',   // 3.3.0
      retestNeeded: !!(e && e.rt && e.s === 'test'), retestAt: e ? e.rt || '' : '', retestNote: e && e.rt && e.s === 'test' ? '工具已更新，需重新測試' : '',   // 3.3.0 上傳新版
      toolVersions: e ? (e.hs || []).filter(function (x) { return Number(x.v) === Number(e.v); }).slice(-1).map(function (x) { var kd = (x.k || 'url') === 'url' ? 'url' : (x.ok || ttKindByName(x.n, '')), cur = Number(x.v) === Number(e.v); return { v: Number(x.v) || 0, name: x.t || '', kind: kd, fileName: x.n || '', at: x.at || '', current: cur, openUrl: ttOpenUrlOf(h, e, kd, x.f, x.u, cur ? 0 : x.v) }; }) : [],
      toolOpenKind: ttOpenKind(e), toolOpenUrl: ttOpenUrl(h, e), toolLatestUrl: e && e.ot && e.u ? TT.FRONT + 'tool.html#' + h + '.' + e.ot : ttOpenUrl(h, e), toolOpenNote: ttOpenKind(e) === 'zip' ? TT.ZIP_NOTE : '', toolRelRefs: ttOpenKind(e) === 'html' ? (e.or || []) : [] };   // 3.3.0 開啟工具（同 tooltest.gs）
  }
  /* 3.3.0 開啟工具（同 tooltest.gs tooltestKindByName_／tooltestOpenUrl_／tooltestRelRefs_） */
  TT.ZIP_NOTE = '請下載後解壓縮，開啟 index.html，並使用展示模式測試';
  TT.FRONT = 'https://grace63188.github.io/consult-prep/';
  function ttKindByName(n, m) { n = String(n || '').toLowerCase(); m = String(m || '').toLowerCase(); if (/\.html?$/.test(n) || m === 'text/html') return 'html'; if (/\.zip$/.test(n) || /^application\/(x-)?zip/.test(m)) return 'zip'; return 'file'; }
  function ttOpenKind(e) { if (!e || !e.u) return ''; if (e.ok) return e.ok; return (e.tk || 'url') === 'url' ? 'url' : ttKindByName(e.tn, ''); }
  function ttOpenUrlOf(h, e, k, fid, u, v) { if (!k) return ''; if (k === 'html') return e.ot && fid ? TT.FRONT + 'tool.html#' + h + '.' + e.ot + (v ? '.' + v : '') : u; if (k === 'zip' && fid) return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fid); return u; }
  function ttOpenUrl(h, e) { return ttOpenUrlOf(h, e, ttOpenKind(e), e && e.tf, e && e.u, 0); }
  function ttRelRefs(html) {
    var s = String(html || ''), out = [], m, ok = function (u) { u = String(u || '').trim().replace(/^['"]|['"]$/g, ''); if (!u || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{|\$\{)/i.test(u) || !/^[\w\-.\/%~@]+\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|bmp|json|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|webm|html?|txt|csv|pdf)(?:[?#][^\s"'<>]*)?$/i.test(u)) return; if (out.indexOf(u) < 0 && out.length < 5) out.push(u.slice(0, 80)); };
    var a = /<(?:script|img|source|iframe|audio|video|embed|track|input)\b[^>]*?\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi; while ((m = a.exec(s))) ok(m[1]);
    var b = /<link\b[^>]*?\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi; while ((m = b.exec(s))) ok(m[1]);
    var c = /(^|[^\w.$])url\(\s*("[^"]*"|'[^']*'|[^)\s]+)\s*\)/gi; while ((m = c.exec(s))) ok(m[2]);
    return out;
  }
  function ttB64Text(b64) { try { var bin = atob(String(b64 || '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(u); } catch (e) { return ''; } }
  /* 3.2.10 上傳即送測（同 tooltest.gs tooltestCommitTool_）：製作中／等待校長修改 → 待測試，通知助教 */
  function ttSubmit(db, h, e, extra) {
    if (e.__prev === 'pass' || (e.__prev === 'test' && e.rt)) e.rt = e.ua; delete e.__prev;   // 3.3.0 已過測試後上傳新版 → 需重新測試
    e.s = 'test'; e.dn = e.ua; e.rs = ''; e.by = 'principal'; db.tooltest[h] = e;
    mem.ttNotified = (mem.ttNotified || []).concat([{ event: 'test', to: 'assistant', key: h }]); saveDb();
    return ok(Object.assign({ row: ttPublic(db, h, e), shared: true, notified: true, notifyTo: 'assistant' }, extra || {}));
  }
  function ttPut(e, x) {
    var u = String(x.u || '').trim(); if (!/^https:\/\/[^\s"'<>]+$/.test(u) || u.length > 300) return '工具網址需為 https 開頭';
    var t = String(x.t || x.n || e.t || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 40); if (!t) return '請填工具名稱';
    var now = tpeStamp(new Date());
    e.t = t; e.u = u; e.tk = x.k === 'file' ? 'file' : 'url'; e.tf = x.f || ''; e.tn = x.n || ''; e.tz = Number(x.z) || 0; e.ua = now; e.v = (Number(e.v) || 0) + 1;
    e.ok = e.tk === 'url' ? 'url' : ttKindByName(e.tn, x.m); e.or = e.ok === 'html' ? (x.or || []).slice(0, 5) : []; if (!e.ot) { var hx = ''; for (var hi = 0; hi < 40; hi++) hx += '0123456789abcdef'[Math.floor(Math.random() * 16)]; e.ot = hx; }   // 3.3.0
    e.hs = (e.hs || []).concat([{ v: e.v, t: e.t, k: e.tk, u: e.u, f: e.tf, n: e.tn, at: now, ok: e.ok }]).slice(-20); e.lg = (e.lg || []).concat([{ at: now, ev: 'upload' }]).slice(-12);
    return '';
  }
  /* 3.3.0 上傳新版：交付前任何階段可上傳；已交付後不可 */
  function ttUploadBlock(db, h, e) {
    if (['make', 'fix', 'test', 'pass'].indexOf(e.s) < 0) return ['目前狀態「' + TT.LABELS[e.s] + '」不可上傳工具', e.s];
    if (e.s === 'test' || e.s === 'pass') { var f = orderCurFlow(db, h, e); if (f && f.state === 'delivered') return ['已交付教材，不可再上傳新版', 'delivered']; }
    return null;
  }
  function tooltestMock(db, action, req) {
    var h = keyOfReq(req), cycle = String(req.cycle || '').slice(0, 40);
    if (action === 'tooltest_list') {
      db.tooltest = db.tooltest || {}; var seen = {}, rows = [];
      Object.keys(db.tooltest).forEach(function (k) { seen[k] = 1; rows.push(ttPublic(db, k, db.tooltest[k])); });
      (Array.isArray(req.keys) ? req.keys : []).forEach(function (k) { k = String(k || '').toLowerCase(); if (/^[0-9a-f]{16}$/.test(k) && !seen[k]) { seen[k] = 1; rows.push(ttPublic(db, k, null)); } });
      var counts = { all: rows.length, make: 0, test: 0, fix: 0, pass: 0 }; rows.forEach(function (r) { counts[r.state]++; });
      return ok({ rows: rows, counts: counts, labels: TT.LABELS });
    }
    if (action === 'tooltest_upload_chunk' || action === 'tooltest_upload_finish') {
      var up = (mem.ttUploads || {})[String(req.uploadId || '')]; if (!up) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
      if (action === 'tooltest_upload_chunk') {
        var off = Number(req.offset) || 0, end = Number(req.end) || 0;
        if (Number(req.total) !== up.size || end > up.size || end <= off) return fail('分塊範圍不正確', 'ERR_VALIDATION');
        if (off !== up.received) return fail('分塊順序錯誤（預期 ' + up.received + '）', 'ERR_CHUNK_ORDER', String(up.received));
        if (b64Bytes(req.data) !== end - off) return fail('分塊長度不符', 'ERR_VALIDATION');
        up.received = end; return ok({ received: end, done: end === up.size });
      }
      if (up.received !== up.size) return fail('檔案尚未上傳完成', 'ERR_INCOMPLETE');
      var eF = ttLoad(db, up.k, up.c), bF = ttUploadBlock(db, up.k, eF); if (bF) return fail(bF[0], 'ERR_TOOLTEST_STATE', bF[1]); eF.__prev = eF.s;
      ttPutPrice(eF, { price: up.price });
      var fidF = 'mocktool' + rand(14), errF = ttPut(eF, { t: up.t, k: 'file', u: 'https://drive.google.com/file/d/' + fidF + '/view', f: fidF, n: up.name, z: up.size }); if (errF) return fail(errF, 'ERR_VALIDATION');
      delete mem.ttUploads[req.uploadId]; return ttSubmit(db, up.k, eF);
    }
    if (!/^[0-9a-f]{16}$/.test(h)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
    var e = ttLoad(db, h, cycle);
    if (/^tooltest_upload_/.test(action)) {
      if (req.by === 'assistant') return fail('上傳工具由校長操作', 'ERR_TOOLTEST_ROLE');
      var bU = ttUploadBlock(db, h, e); if (bU) return fail(bU[0], 'ERR_TOOLTEST_STATE', bU[1]); if (action !== 'tooltest_upload_begin') e.__prev = e.s;
      var errP = ttPriceCheck(e, req); if (errP) return fail(errP, 'ERR_VALIDATION');
      if (action !== 'tooltest_upload_begin') ttPutPrice(e, req);
      if (action === 'tooltest_upload_url') { var errU = ttPut(e, { t: req.tool, k: 'url', u: req.url }); if (errU) return fail(errU, 'ERR_VALIDATION'); return ttSubmit(db, h, e); }
      var nm = safeName(String(req.name || 'tool')).slice(0, 120);
      if (!String(req.tool || '').trim() && !String(req.name || '').trim()) return fail('請填工具名稱', 'ERR_VALIDATION');
      if (action === 'tooltest_upload_file') {
        var n = b64Bytes(req.data); if (!(n > 0) || n > TT.SMALL) return fail('小檔上傳限 1 位元組至 8 MB，較大檔案改用分段上傳', 'ERR_VALIDATION');
        var refs = ttKindByName(nm, req.mime) === 'html' ? ttRelRefs(ttB64Text(req.data)) : [];
        var fid = 'mocktool' + rand(14), errFi = ttPut(e, { t: req.tool, k: 'file', u: 'https://drive.google.com/file/d/' + fid + '/view', f: fid, n: nm, z: n, m: req.mime, or: refs }); if (errFi) return fail(errFi, 'ERR_VALIDATION');
        return ttSubmit(db, h, e, refs.length ? { openWarn: { refs: refs, message: '偵測到相對路徑資源（' + refs.join('、') + '），請改為單一 HTML 或打包為 zip' } } : null);
      }
      if (action === 'tooltest_upload_begin') {
        var size = Number(req.size) || 0; if (!(size > 0) || size > TT.MAX) return fail('檔案大小須為 1 位元組至 100 MB', 'ERR_VALIDATION');
        var id = 'tu' + rand(16); mem.ttUploads = mem.ttUploads || {}; mem.ttUploads[id] = { k: h, c: cycle, t: String(req.tool || ''), name: nm, size: size, received: 0, price: req.price };
        return ok({ uploadId: id, chunkBytes: TT.CHUNK });
      }
    }
    var ev = action.replace('tooltest_', ''), rule = TT.EVENTS[ev]; if (!rule) return fail('未知動作', 'ERR_VALIDATION');
    if (rule[0].indexOf(e.s) < 0) return fail('目前狀態「' + TT.LABELS[e.s] + '」不可' + (ev === 'feedback' ? '回報問題' : '執行此動作'), 'ERR_TOOLTEST_STATE', e.s);
    if (ev === 'mark_done' && req.by === 'assistant') return fail('上傳工具由校長操作', 'ERR_TOOLTEST_ROLE');
    if (ev !== 'mark_done' && req.by === 'principal') return fail('測試結果由助教回報', 'ERR_TOOLTEST_ROLE');
    var now = tpeStamp(new Date());
    if (ev === 'feedback') {   // 3.2.10 回報問題（同 tooltest.gs tooltestFbParse_）
      var seen = {}, ty = (Array.isArray(req.types) ? req.types : []).filter(function (t) { if (!TT.FB_TYPES[t] || seen[t]) return false; seen[t] = 1; return true; });
      var tx = String(req.text == null ? '' : req.text).replace(/\r\n?/g, '\n').trim(), shots = Array.isArray(req.shots) ? req.shots : [];
      if (!ty.length) return fail('請選擇問題類型', 'ERR_VALIDATION');
      if (!tx) return fail('請填寫說明', 'ERR_VALIDATION');
      if (tx.length > 500) return fail('說明最多 500 字', 'ERR_VALIDATION');
      if (shots.length > 3) return fail('截圖最多 3 張', 'ERR_VALIDATION');
      for (var si = 0; si < shots.length; si++) { if (!/^image\//.test(String(shots[si].mime || ''))) return fail('截圖需為圖片檔（PNG、JPG、GIF、WEBP、HEIC）', 'ERR_VALIDATION'); var sb = b64Bytes(shots[si].data); if (!(sb > 0) || sb > 5 * 1024 * 1024) return fail('每張截圖限 5 MB 以內', 'ERR_VALIDATION'); }
      e.feedback = (e.feedback || []).concat([{ at: now, v: Number(e.v) || 0, ty: ty, tx: tx, sh: shots.map(function (x, i) { return { f: 'mockshot' + rand(14), n: safeName(String(x.name || '截圖' + (i + 1))).slice(0, 120) }; }) }]).slice(-20);
    }
    if (ev === 'mark_done') { if (req.toolUrl) { var errM = ttPut(e, { t: req.tool, k: 'url', u: req.toolUrl }); if (errM) return fail(errM, 'ERR_VALIDATION'); } if (!e.u) return fail('尚未上傳工具，請先上傳工具再標記完成', 'ERR_TOOLTEST_NO_TOOL'); e.dn = now; e.rs = ''; }
    else if (ev === 'undo') { var mfU = latestMaterial(db, h); if (mfU && mfU.cycle === e.c && mfU.state !== 'unnotified') return fail('已發送下單通知，不可復原測試結果', 'ERR_TOOLTEST_STATE', e.s); e.rs = ''; if (Number(e.pc) > 0) { delete e.pc; delete e.pca; } } else e.rs = now;
    var wasRetest = ev === 'pass' && !!e.rt; if (ev === 'pass') delete e.rt;   // 3.3.0 重新測試通過
    e.s = rule[1]; e.by = req.by === 'assistant' ? 'assistant' : 'principal'; e.lg = (e.lg || []).concat([req.proxy === true ? { at: now, ev: ev, px: 1 } : { at: now, ev: ev }]).slice(-12);
    if (ev === 'pass' && (wasRetest || Number(e.pc) > 0)) { db.tooltest[h] = e; var fa = orderCurFlow(db, h, e); if (fa && fa.state === 'ordered' && fa.matchBy === 'sync') { orderDeliverRun(db, fa, 'auto'); } }
    db.tooltest[h] = e; mem.ttNotified = (mem.ttNotified || []).concat(rule[2] ? [{ event: rule[1], to: rule[2], key: h }] : []); saveDb();
    return ok({ row: ttPublic(db, h, e), notified: !!rule[2], notifyTo: rule[2] });
  }
  function prepBoardMock(db, req) {
    var b = S().prepCompute({ rows: prepRowsMock(db), nowMs: Date.now(), leadHours: db.prepSettings.leadHours, from: req && req.from, to: req && req.to });
    b.now = tpeStamp(new Date()); b.syncAt = db.counsel.syncAt || '';
    return b;
  }
  function digestVarsMock(db, cfg, paused) {
    var s = S(), wl = watchListData(db), summary = wl.summary, today = tpeDate(new Date()).date, nowMs = Date.now();
    var byState = function (st) { return wl.rows.filter(function (x) { return x.state === st; }).map(function (x) { return x.name; }).join('、') || '—'; };
    var todayNames = wl.rows.filter(function (x) { return x.state === 'submitted' && String(x.submittedAt).slice(0, 10) === today; }).map(function (x) { return x.name; });
    var rl = s.remindList(wl.rows, nowMs);
    var lines = ['追蹤名單 ' + summary.total + ' 位：已送出 ' + summary.submitted + '（準時 ' + summary.onTime + '、逾期 ' + summary.late + '）、填寫中 ' + summary.filling + '、未開始 ' + summary.none];
    var vars = { '日期': today, '摘要': lines.join('\n'), '總數': String(summary.total), '已繳交數': String(summary.submitted), '準時數': String(summary.onTime), '逾期繳交數': String(summary.late), '填寫中數': String(summary.filling), '未開始數': String(summary.none), '已確認數': String(summary.acked), '逾期未送出數': String(summary.overdue), '無法送達數': String(summary.unreachable),
      '已繳交名單': byState('submitted'), '填寫中名單': byState('filling'), '未開始名單': byState('none'), '逾期名單': wl.rows.filter(function (x) { return x.overdue; }).map(function (x) { return x.name; }).join('、') || '—', '今日送出名單': todayNames.join('、') || '—',
      '需提醒名單': s.remindListText(rl), '已用則數': String(db.line.used), '剩餘則數': String(Math.max(0, db.line.limit - db.line.used)), '提醒暫停': paused ? '，學姐提醒已暫停' : '' };
    var hash = keyHash(JSON.stringify([summary.total, summary.submitted, summary.filling, summary.none, summary.acked, summary.overdue, todayNames, rl.map(function (x) { return x.name + x.reason; })]));
    return { text: s.renderTemplate(cfg.texts.digest, vars), hash: hash };
  }
  function reportTextMock(db, kind, cfg) {
    var s = S(), today = tpeDate(new Date()).date, paused = !!lineQuotaNow(db).paused;
    cfg = cfg || automationLoad(db);
    if (kind === 'principal') { var t = s.reportPrincipalText(prepBoardMock(db, {}), today, Date.now()); return { text: t, hash: keyHash(t.replace(today, '')) }; }
    if (kind === 'digest') return digestVarsMock(db, cfg, paused);
    if (kind === 'submitNotify') return { text: s.renderTemplate(cfg.texts.submitNotify, { '本名': '（學姐本名）', '名字': '（學姐本名）', '送出時間': tpeStamp(new Date()).slice(0, 16), '準時': '準時完成' }), hash: '' };
    if (kind === 'overdue') {
      var od = watchListData(db).rows.filter(function (x) { return x.overdue; }).map(function (x) { return s.REPORT.L2 + x.name + '｜截止 ' + s.shortTime(x.deadline); });
      return { text: s.renderTemplate(cfg.texts.overdue, { '名單': od.join('\n') || s.REPORT.L2 + '無', '學姐名單': od.join('\n') || s.REPORT.L2 + '無', '人數': String(od.length) }), hash: '' };
    }
    return { text: '', hash: '' };
  }
  /** 每日匯報（principal＋digest）：runAutomation 於 digestHour 呼叫 */
  function dailyReportsMock(db, cfg, report, opts) {
    var today = tpeDate(new Date()).date, st = db.digest || {};
    ['principal', 'digest'].forEach(function (kind) {
      var prev = kind === 'digest' ? { date: st.date, hash: st.hash } : (st.principal || {});
      var hasRecip = cfg.adminRecipients.some(function (r) { return S().recipientEnabled(r) && recipWants(r, kind); });
      var d = reportTextMock(db, kind, cfg), out;
      if (!hasRecip && reportModeOf(cfg, kind) !== 'admin') out = { sent: false, reason: '無此角色的管理收件人', text: d.text };
      else if (prev.date === today && !opts.forceDigest) out = { sent: false, reason: '今日已發' };
      else if (prev.hash === d.hash && !opts.forceDigest) out = { sent: false, reason: '無變化' };
      else { out = { sent: true, text: d.text }; if (!opts.dry) out.result = adminPush(db, d.text, 'digest', today + '.' + kind, kind); }
      if (!opts.dry && (out.sent || out.reason === '無變化')) { if (kind === 'digest') { st.date = today; st.hash = d.hash; } else st.principal = { date: today, hash: d.hash }; }
      if (kind === 'digest') report.digest = out; else report.principal = out;
    });
    if (!opts.dry) db.digest = st;
  }
  function reportListMock(db, req) {
    var s = S(), cfg = automationLoad(db), days = Math.max(1, Math.min(60, Number(req.days) || 60)), since = tpeStamp(new Date(Date.now() - days * 86400000)), acc = quotaMonth(db).byKind;
    var rows = (db.reports || []).filter(function (r) { return r.at >= since && (!req.kind || r.kind === req.kind); }).slice().reverse();
    var pr = reportTextMock(db, 'principal', cfg).text, dg = reportTextMock(db, 'digest', cfg).text, qa = db.quotaAdmin[quotaKey()] || { total: 0 };
    return { today: { date: tpeDate(new Date()).date, text: dg, principal: pr, digest: dg }, rows: rows, reportMode: automationPublic(cfg).reportMode, used: { digest: acc.digest || 0, auto: acc.auto || 0, total: (acc.digest || 0) + (acc.auto || 0), admin: qa.total || 0 },
      recipients: cfg.adminRecipients.filter(function (r) { return s.recipientEnabled(r); }).map(function (r) { return r.name || ''; }), keepDays: s.REPORT.keepDays };
  }

  /* ---- 諮詢教材 ---- */
  function latestMaterial(db, h) { ensure32(db); var l = db.materials.filter(function (f) { return f.rosterKey === h; }); return l.length ? l[l.length - 1] : null; }
  function materialFind(db, id) { ensure32(db); return db.materials.filter(function (f) { return f.flowId === String(id || ''); })[0] || null; }
  function materialPublic(db, f) {
    var s = S(), r = rosterByHash(db, f.rosterKey) || {}, e = watchLoad(db, f.rosterKey), lb = lineBindingOf(db, f.rosterKey), o = {};
    s.MATERIAL.headers.forEach(function (k) { o[k] = f[k] == null ? '' : f[k]; });
    o.amount = Number(f.amount) || 0; o.fileSize = Number(f.fileSize) || 0;
    ['matchPending', 'lineFileSent', 'unzipCard', 'deliverCard'].forEach(function (k) { o[k] = !!f[k]; });
    if (f.unzipCard == null) o.unzipCard = true;
    o.orderEvidence = f.orderEvidence || null;
    o.name = r.name || (e && e.n) || ''; o.callName = (e && e.c) || s.callName(o.name); o.stateLabel = s.materialStateLabel(f.state);
    o.deadlineText = f.deadline ? s.formatDeadline(f.deadline) : ''; o.lineBound = lb.bound && !lb.blocked; o.chatUrl = lb.bound ? lineChatUrlFor(db, f.rosterKey) : '';
    o.clickN = Number(f.clickN) || 0; o.remindN = Number(f.remindN) || 0; o.deliverAuto = !!f.deliverAuto;   // 3.3.0
    o.timeline = s.orderTimeline(f); o.tab = f.closedAt ? '' : f.abandonedAt ? 'log' : f.state === 'delivered' ? 'log' : f.state === 'ordered' ? 'ready' : f.state === 'notified' ? 'wait' : '';
    o.closed = !!f.closedAt; o.orderExpired = !f.closedAt && !f.abandonedAt && s.orderDeadlineOver(f, Date.now()); o.orderExpiredText = o.orderExpired ? s.ORDER.expiredLabel : ''; o.abandoned = !!f.abandonedAt; o.deliverVersion = Number(f.deliverVersion) || 0;   // 3.3.2／3.3.3
    var ttR = (db.tooltest || {})[f.rosterKey], reusable = !!(ttR && ttR.u && (ttR.tk || 'url') === 'file' && ttR.tf);
    o.matchIssueText = f.matchIssue ? (s.ORDER.issues[f.matchIssue] || f.matchIssue) : ''; o.deliverReady = !!((f.deliverSource || (f.driveFileId ? 'zip' : 'tool')) === 'tool' ? reusable : f.driveFileId);   // 3.3.3 o.deadlineMs = f.deadline ? s.parseDeadline(f.deadline) : null; var dlMs = f.dlDeadline ? s.parseDeadline(f.dlDeadline) : null; o.dlDeadlineMs = dlMs; o.dlExpired = !!(f.dlRevokedAt || (dlMs != null && Date.now() > dlMs)); o.dlClickN = Number(f.dlClickN) || 0;   // 3.3.0
    var tt0 = (db.tooltest || {})[f.rosterKey]; if (tt0) o.tool = { name: tt0.t || '', url: tt0.u || '', kind: tt0.u ? (tt0.tk || 'url') : '', reusable: reusable, openKind: ttOpenKind(tt0), uploadedAt: tt0.ua || '', fileId: tt0.tf || '', fileName: tt0.tn || '', version: Number(tt0.v) || 0, priceInitial: Number(tt0.pi) || 0, priceConfirmed: Number(tt0.pc) || 0, cycle: tt0.c || '', state: tt0.s || '', retestNeeded: !!(tt0.rt && tt0.s === 'test') };
    var ce0 = db.counsel && db.counsel.entries && db.counsel.entries[f.rosterKey]; if (ce0 && ce0.nc && ce0.nc.at) o.counselAt = ce0.nc.at;
    return o;
  }
  function materialSummary(db) { var o = { unnotified: 0, notified: 0, ordered: 0, delivered: 0, matchPending: 0 }; ensure32(db); db.materials.forEach(function (f) { o[f.state] = (o[f.state] || 0) + 1; if (f.matchPending) o.matchPending++; }); return o; }
  function materialFields(db, f, req, requireDeadline) {
    var s = S(), M = s.MATERIAL;
    if (req.libId != null && req.libId !== '') { var lib = db.matLib.filter(function (x) { return x.id === String(req.libId); })[0]; if (!lib) throw err('找不到該教材', 'ERR_NOT_FOUND'); f.libId = lib.id; if (!req.material) f.material = lib.name; if (req.amount == null || req.amount === '') f.amount = lib.amount; }
    if (req.material != null && String(req.material).trim()) f.material = String(req.material).trim().slice(0, M.maxNameLength);
    if (req.amount != null && req.amount !== '') { var a = Math.round(Number(String(req.amount).replace(/,/g, ''))); if (!isFinite(a) || a < 0 || a > M.maxAmount) throw err('金額格式不正確', 'ERR_VALIDATION'); f.amount = a; }
    if (req.deadline != null && req.deadline !== '') { var ms = s.parseDeadline(req.deadline); if (ms == null) throw err('下單期限格式不正確', 'ERR_VALIDATION'); f.deadline = s.deadlineIso(ms); }
    if (!f.material) throw err('請填寫教材名稱', 'ERR_VALIDATION');
    if (requireDeadline && !f.deadline) throw err('請填寫下單期限', 'ERR_VALIDATION');
  }
  function materialNew(db, h) {
    var now = tpeStamp(new Date());
    return { flowId: 'mf' + tpeDate(new Date()).date.replace(/\./g, '') + '-' + rand(5), rosterKey: h, libId: '', material: '', amount: 0, deadline: '', state: 'unnotified', notifiedAt: '', replyOrderedAt: '', matchPending: false, matchedAt: '', orderEvidence: null,
      driveFileId: '', fileName: '', fileSize: 0, lineFileSent: false, deliverTextMode: '', unzipCard: true, deliverCard: false, deliveredAt: '', receivedAt: '', updatedAt: now, createdAt: now };
  }
  function materialFlowFor(db, req) {
    var f = req.flowId ? materialFind(db, req.flowId) : null;
    if (req.flowId && !f) throw err('找不到該教材流程', 'ERR_NOT_FOUND');
    if (!f) { var h = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(h) || !rosterByHash(db, h)) throw err('名冊中找不到該學姐', 'ERR_NOT_FOUND'); f = materialNew(db, h); f.__new = true; }
    return f;
  }
  function materialStore(db, f) { delete f.__new; f.updatedAt = tpeStamp(new Date()); if (db.materials.indexOf(f) < 0) db.materials.push(f); return f; }
  function pushRaw(db, ch, to, messages, rk) {
    var L = ch === 'admin' ? db.lineAdmin : db.line;
    if (L.retryKeys[rk]) return { ok: true, duplicate: true };
    if (ch !== 'admin' && db.line.used >= db.line.limit) return { ok: false, error: 'HTTP 429 本月免費則數已用完' };
    L.retryKeys[rk] = 1; L.used++; L.pushed.push({ to: to, text: (messages.filter(function (m) { return m.type === 'text'; })[0] || {}).text || '', imageUrl: (messages.filter(function (m) { return m.type === 'image'; })[0] || {}).originalContentUrl || '', messages: messages, retryKey: rk, at: tpeStamp(new Date()), channel: ch || 'main' });
    return { ok: true };
  }
  /* ---- 3.3.0 確認金額、確認下單、等待下單、比對、自動交付（同 gas/order.gs） ---- */
  function orderNow() { return tpeStamp(new Date()); }
  function orderAdmin(db, text, seed) { try { adminPush(db, text, 'auto', 'ord.' + seed, 'auto'); } catch (e) { /* ignore */ } }
  function orderCurFlow(db, h, e) { var f = latestMaterial(db, h); if (!f) return null; var pb = Object.assign({}, ttPublic(db, h, e)); if (pb.state === 'test' && pb.retestNeeded) pb.state = 'pass'; var st = S().orderStageOf(pb, f); return st === 'wait' || st === 'ready' || st === 'log' || f.state === 'unnotified' ? f : null; }
  function orderRecipient(db, h) {
    var r = rosterByHash(db, h); if (!r || !r.name) return { ok: false, reason: '名冊中找不到該學姐' };
    if (!lineConfigured(db)) return { ok: false, reason: '尚未設定 LINE 官方帳號' };
    var lb = lineBindingOf(db, h); if (!lb.bound) return { ok: false, reason: '未對應 LINE' }; if (lb.blocked) return { ok: false, reason: '已封鎖官方帳號' };
    var uid = db.line.bindings[h].userId, n = Object.keys(db.line.bindings).filter(function (k) { return db.line.bindings[k] && db.line.bindings[k].userId === uid; }).length;
    if (n !== 1) return { ok: false, reason: '此 LINE 同時對應 ' + n + ' 位學姐' };
    return { ok: true, userId: uid, name: r.name };
  }
  function orderFx(type, data) { var F = typeof CONSULT_FLEX !== 'undefined' ? CONSULT_FLEX : (typeof window !== 'undefined' ? window.CONSULT_FLEX : null); if (!F) return null; try { return F.messages(F.build(type, data)); } catch (e) { return null; } }
  function orderCard(db, f, extra) {
    var r = rosterByHash(db, f.rosterKey) || {}, w = watchLoad(db, f.rosterKey), d = { callName: (w && w.c) || S().callName(r.name || ''), name: r.name || '', material: f.material, amount: f.amount, deadline: f.deadline, orderUrl: 'https://grace63188.github.io/consult-prep/go.html?t=' + f.flowId + '.' + keyHash('click.' + f.flowId).slice(0, 12), claimData: 'grace=order_claim&f=' + f.flowId, puzzle: true, unit: 'NT$' };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; }); return orderFx('materialOrder', d);
  }
  function orderSource(db, f) {
    if ((f.deliverSource || (f.driveFileId ? 'zip' : 'tool')) === 'tool') {   // 3.3.2 只限檔案型工具；3.3.3 預設交付最後通過測試的工具
      var t = (db.tooltest || {})[f.rosterKey]; if (!t || !t.u) return { ok: false, reason: '沒有可沿用的工具檔' };
      if ((t.tk || 'url') !== 'file' || !t.tf) return { ok: false, reason: '網址型工具不可沿用，請上傳教材 ZIP' };
      var kd = ttOpenKind(t); kd = kd === 'html' || kd === 'zip' ? kd : 'file';
      if (!f.deliverFileId) f.deliverFileId = 'copy-' + t.tf;
      return { ok: true, url: kd === 'html' ? 'https://grace63188.github.io/consult-prep/tool.html#dl.' + f.flowId + '.' + keyHash('dl.' + f.flowId).slice(0, 12) : 'https://drive.google.com/file/d/' + f.deliverFileId + '/view?usp=sharing', kind: kd, source: 'tool', name: t.tn || t.t || '專屬工具', size: Number(t.tz) || 0 };
    }
    if (!f.driveFileId) return { ok: false, reason: '尚未上傳教材檔' };
    return { ok: true, url: 'https://drive.google.com/file/d/' + f.driveFileId + '/view?usp=sharing', kind: 'zip', source: 'zip', name: f.fileName || '教材.zip', size: Number(f.fileSize) || 0 };
  }
  /* 3.3.0 下載期限（同 order.gs orderDlSettings_／orderDlDeadline_／orderDl／orderDlSweep_） */
  function dlSettings(db) { var d = Math.floor(Number((db.orderDl || {}).days)); return { days: d >= 1 && d <= 60 ? d : 7 }; }
  function dlDeadline(db, v) { var s = S(); if (v != null && String(v).trim() !== '') { var ms = s.parseDeadline(v); if (ms == null) return { error: '請填下載期限（日期與時間）' }; if (ms < Date.now()) return { error: '下載期限已過，請重新選擇' }; return { iso: s.deadlineIso(ms) }; } return { iso: s.orderQuickDeadline(Date.now(), dlSettings(db).days) }; }
  function dlUrl(f) { return 'https://grace63188.github.io/consult-prep/dl.html?t=' + f.flowId + '.' + keyHash('dl.' + f.flowId).slice(0, 12); }
  function orderDeliverRun(db, f, by, dlIso) {
    if (f.state === 'delivered' || f.deliveredAt) return { already: true };
    if (f.state !== 'ordered') return { skipped: true };
    var tt0 = (db.tooltest || {})[f.rosterKey]; if (tt0 && tt0.s !== 'pass') return { pending: true, retest: true, reason: '工具已更新，需重新測試通過才可交付' };   // 3.3.0
    var src = orderSource(db, f); if (!src.ok) return { pending: true, reason: src.reason };
    var chk = orderRecipient(db, f.rosterKey);
    if (!chk.ok) { f.deliverHold = chk.reason; f.matchIssue = 'recipient'; materialStore(db, f); orderAdmin(db, '【交付暫停】' + (chk.name || '') + '：' + chk.reason, f.flowId); return { hold: true, reason: chk.reason }; }
    f.dlDeadline = dlIso || S().orderFlowDlDeadline(f, Date.now(), dlSettings(db).days);   // 3.3.4
    var w = watchLoad(db, f.rosterKey), fx = orderFx('materialDeliver', { callName: (w && w.c) || S().callName(chk.name), material: f.material, fileName: src.name, fileMeta: S().ORDER.deliverKinds[src.kind], kind: src.kind, deliveredAt: Date.now(), url: dlUrl(f), puzzle: true, dlDeadline: f.dlDeadline });
    var r = pushRaw(db, 'main', chk.userId, fx || [{ type: 'text', text: '教材交付' }], 'mat.deliver.' + f.flowId);
    if (!r.ok) { f.deliverHold = r.error; materialStore(db, f); return { hold: true, reason: r.error }; }
    if (!r.duplicate) quotaAccount(db, 'notify', 1);
    f.deliverVersion = src.source === 'tool' && (db.tooltest || {})[f.rosterKey] ? Number(db.tooltest[f.rosterKey].v) || '' : '';   // 3.3.3
    f.state = 'delivered'; f.deliveredAt = orderNow(); f.deliverAuto = by === 'auto'; f.deliverUrl = src.url; f.deliverSource = src.source; f.deliverKind = src.kind; f.deliverHold = ''; f.matchIssue = ''; f.dlClickAt = ''; f.dlClickN = 0; f.dlRevokedAt = ''; materialStore(db, f);
    return { delivered: true };
  }
  function orderMock(db, req) {
    var s = S(), a = req.action, h = keyOfReq(req), e = h ? (db.tooltest || {})[h] : null, now = orderNow();
    var tl = function (x) { e.pl = (e.pl || []).concat([x]).slice(-20); };
    switch (a) {
      case 'order_price_confirm': {
        if (req.by && req.by !== 'principal') return fail('確認金額由校長操作', 'ERR_ORDER_ROLE');
        if (!e || e.s !== 'pass') return fail('助教測試通過後才可確認金額', 'ERR_ORDER_STATE');
        var cf = orderCurFlow(db, h, e); if (cf && cf.state !== 'unnotified') return fail('已發送下單通知，金額已鎖定', 'ERR_ORDER_STATE');
        var bad = s.orderPriceIssue(e.pi, req.amount, req.reason); if (bad) return fail(bad, 'ERR_VALIDATION');
        var am = Math.round(Number(String(req.amount).replace(/[,\s]/g, ''))), pi = Number(e.pi) || 0, from = Number(e.pp) || pi, rs = String(req.reason || '').trim().slice(0, 60);
        if (am !== from) tl({ at: now, by: 'principal', ev: pi && am === pi ? 'restore' : 'change', from: from, to: am, rs: pi && am === pi ? '還原原定價' : rs });
        e.pp = am; e.pc = am; e.pca = now; e.prs = pi && am !== pi ? rs : ''; if (!pi) e.pi = am;
        tl({ at: now, by: 'principal', ev: 'confirm', from: from, to: am, rs: e.prs });
        orderAdmin(db, '【金額已確認】' + h, 'done.' + h + '.' + now); saveDb();
        return ok({ row: ttPublic(db, h, e), notified: true, notifyTo: 'assistant' });
      }
      case 'order_price_reopen': {
        if (!e || e.s !== 'pass' || !(Number(e.pc) > 0)) return fail('目前沒有已確認的金額', 'ERR_ORDER_STATE');
        var cr = orderCurFlow(db, h, e); if (cr && cr.state !== 'unnotified') return fail('已發送下單通知，不可退回確認金額', 'ERR_ORDER_STATE');
        tl({ at: now, by: 'assistant', ev: 'reopen', from: Number(e.pc), to: 0, rs: String(req.reason || '').trim().slice(0, 60) || '助教退回確認金額' }); delete e.pc; delete e.pca; saveDb();
        return ok({ row: ttPublic(db, h, e), notified: true, notifyTo: 'principal' });
      }
      case 'order_notify': {
        if (!e || e.s !== 'pass') return fail('助教測試通過後才可發送下單通知', 'ERR_ORDER_STATE');
        if (!(Number(e.pc) > 0)) return fail('校長確認金額後才可發送下單通知', 'ERR_ORDER_STATE');
        var url = String(req.orderUrl || '').trim(), ui = s.orderUrlIssue(url); if (ui) return fail(ui, 'ERR_VALIDATION');
        var dms = s.parseDeadline(req.deadline); if (dms == null) return fail('請填下單期限（日期與時間）', 'ERR_VALIDATION'); if (dms < Date.now()) return fail('下單期限已過，請重新選擇', 'ERR_VALIDATION');
        var dlIso = ''; if (req.downloadDeadline != null && String(req.downloadDeadline).trim() !== '') { var dli = s.orderDownloadIssue(dms, req.downloadDeadline); if (dli) return fail(dli, 'ERR_VALIDATION'); dlIso = s.deadlineIso(s.parseDeadline(req.downloadDeadline)); }   // 3.3.4
        var cur = orderCurFlow(db, h, e); if (cur && cur.state !== 'unnotified') return fail('已發送下單通知', 'ERR_ORDER_STATE', cur.state);
        if (e.c && db.materials.some(function (x) { return x.rosterKey === h && !x.closedAt && x.cycle === e.c && x.state !== 'unnotified'; })) return fail('本次諮詢已發送下單通知', 'ERR_ORDER_STATE');   // 3.3.2
        var f = cur || materialNew(db, h);
        f.material = (String(req.material || '').trim() || f.material || e.t || '諮詢教材').slice(0, 60); f.amount = Number(e.pc); f.deadline = s.deadlineIso(dms); f.downloadDeadline = dlIso; f.cycle = e.c || ''; f.orderUrl = url; f.orderProductId = s.orderProductIdOf(url); f.orderBy = 'assistant';
        var chk = orderRecipient(db, h), fx = orderCard(db, f), r0 = rosterByHash(db, h) || {}, w0 = watchLoad(db, h);
        if (req.preview === true) return ok({ preview: true, card: fx, text: fx ? fx[0].altText : '', recipient: { name: r0.name || '', callName: (w0 && w0.c) || s.callName(r0.name || ''), ok: chk.ok, reason: chk.reason || '' }, willSend: chk.ok ? 1 : 0, quota: lineQuotaNow(db), flow: { material: f.material, amount: f.amount, deadline: f.deadline, deadlineText: s.formatDeadline(f.deadline), downloadDeadline: f.downloadDeadline || '', orderUrl: f.orderUrl, orderProductId: f.orderProductId } });
        if (!chk.ok) return fail('無法發送給學姐：' + chk.reason, 'ERR_ORDER_RECIPIENT');
        var pr = pushRaw(db, 'main', chk.userId, fx, 'mat.order.' + f.flowId); if (!pr.ok) return fail('LINE 推播失敗：' + pr.error, 'ERR_LINE_API');
        f.state = 'notified'; f.notifiedAt = now; f.matchIssue = ''; f.deliverHold = ''; f.closedAt = ''; materialStore(db, f); if (!pr.duplicate) quotaAccount(db, 'notify', 1);
        db.materials.forEach(function (x) { if (x.rosterKey === h && x.flowId !== f.flowId && !x.closedAt && (x.state === 'notified' || x.state === 'unnotified')) x.closedAt = now; });   // 3.3.2 舊的等待下單關閉
        saveDb();
        return ok({ flow: materialPublic(db, f), sent: 1 });
      }
      case 'order_remind': return fail('提醒下單已停用（等待期間不再提醒學姐）', 'ERR_BAD_REQUEST');   // 3.3.3
      case 'order_abandon': {
        var fA = materialFind(db, req.flowId); if (!fA) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (fA.state !== 'notified' || fA.closedAt || fA.abandonedAt) return fail('只有等待下單中可放棄領取', 'ERR_ORDER_STATE');
        fA.abandonedAt = now; fA.abandonReason = String(req.reason || '').trim().slice(0, 60); fA.abandonBy = req.by === 'assistant' ? 'assistant' : 'principal'; materialStore(db, fA); saveDb(); return ok({ flow: materialPublic(db, fA) });
      }
      case 'order_restore': {
        var fB = materialFind(db, req.flowId); if (!fB) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (!fB.abandonedAt) return fail('只有已放棄的流程可恢復', 'ERR_ORDER_STATE');
        fB.abandonedAt = ''; fB.abandonReason = ''; fB.abandonBy = ''; materialStore(db, fB); saveDb(); return ok({ flow: materialPublic(db, fB) });
      }
      case 'order_remind_legacy': {
        var fR = materialFind(db, req.flowId); if (!fR) return fail('找不到該教材流程', 'ERR_NOT_FOUND'); if (fR.state !== 'notified') return fail('只有等待下單中可提醒', 'ERR_ORDER_STATE');
        var cR = orderRecipient(db, fR.rosterKey); if (!cR.ok) return fail('無法發送給學姐：' + cR.reason, 'ERR_ORDER_RECIPIENT');
        fR.remindN = (Number(fR.remindN) || 0) + 1; var rR = pushRaw(db, 'main', cR.userId, orderCard(db, fR, { remind: true }), 'mat.remind.' + fR.flowId + '.' + fR.remindN); if (!rR.ok) return fail(rR.error, 'ERR_LINE_API');
        fR.remindAt = now; materialStore(db, fR); saveDb(); return ok({ flow: materialPublic(db, fR), sent: 1 });
      }
      case 'order_targets': { var W = s.orderSyncFlows(db.materials, Date.now()), ks = []; W.forEach(function (x) { if (ks.indexOf(x.rosterKey) < 0) ks.push(x.rosterKey); }); return ok({ keys: ks, total: ks.length, since: W.map(function (x) { return x.notifiedAt; }).sort()[0] || '', terms: s.orderKeywords(db.matProducts), productIds: W.map(function (x) { return x.orderProductId; }).filter(Boolean), syncAt: (db.orderSync || {}).at || '', last: db.orderSync || {} }); }
      case 'order_status': { var c = { wait: 0, ready: 0, log: 0, issue: 0, expired: 0 }; db.materials.forEach(function (x) { if (x.closedAt) return; if (x.state === 'notified') { c.wait++; if (x.matchIssue) c.issue++; if (s.orderDeadlineOver(x, Date.now())) c.expired++; } else if (x.state === 'ordered') c.ready++; else if (x.state === 'delivered') c.log++; }); return ok({ syncAt: (db.orderSync || {}).at || '', last: db.orderSync || {}, counts: c, dl: dlSettings(db) }); }
      case 'order_dl_settings_save': { var dd = Math.floor(Number(req.days)); if (!(dd >= 1 && dd <= 60)) return fail('預設下載期限需為 1–60 天', 'ERR_VALIDATION'); db.orderDl = { days: dd }; saveDb(); return ok({ days: dd }); }
      case 'order_dl': {
        var mt = /^(mf[0-9A-Za-z-]{4,40})\.([0-9a-f]{12})$/.exec(String(req.t || '')), fL = mt ? materialFind(db, mt[1]) : null;
        if (!fL || mt[2] !== keyHash('dl.' + fL.flowId).slice(0, 12) || fL.state !== 'delivered') return fail('連結無效', 'ERR_NOT_FOUND');
        var msL = fL.dlDeadline ? s.parseDeadline(fL.dlDeadline) : null;
        if (fL.dlRevokedAt || (msL != null && Date.now() > msL)) return ok({ expired: true, deadline: fL.dlDeadline || '', material: fL.material || '諮詢教材' });
        if (!fL.dlClickAt) fL.dlClickAt = now; fL.dlClickN = (Number(fL.dlClickN) || 0) + 1; materialStore(db, fL); saveDb();
        return ok({ url: fL.deliverUrl, deadline: fL.dlDeadline || '', material: fL.material || '諮詢教材' });
      }
      case 'order_sync': {
        if (!Array.isArray(req.purchases)) return fail('購買紀錄格式錯誤', 'ERR_VALIDATION');
        var only = Array.isArray(req.keys) ? req.keys : null, kw = s.orderKeywords(db.matProducts), used = {}, matched = [], issues = [];
        var list = s.orderPurchasesMerge(req.purchases.map(s.orderPurchaseNorm).filter(Boolean)).map(function (p) { p.key = keyHash(s.rosterKey(p.uid)); return p; });
        db.materials.forEach(function (x) { if (x.matchOrderId) used[x.matchOrderId] = 1; });
        s.orderSyncFlows(db.materials, Date.now()).filter(function (x) { return !only || only.indexOf(x.rosterKey) >= 0; }).forEach(function (x) {
          var m = s.orderMatch(x, list, { keywords: kw, used: used }), nm = (rosterByHash(db, x.rosterKey) || {}).name || ''; x.syncAt = now;
          if (!m) return;
          x.matchBasis = m.basis; x.matchNote = m.note; x.matchOrderId = m.purchase.id; x.matchAmount = m.purchase.amount == null ? '' : m.purchase.amount;
          if (!m.ok) { x.matchIssue = m.issue; issues.push({ flowId: x.flowId, rosterKey: x.rosterKey, name: nm, issue: m.issue, text: s.ORDER.issues[m.issue], note: m.note }); return; }
          used[m.purchase.id] = 1; x.state = 'ordered'; x.matchedAt = now; x.matchBy = 'sync'; x.matchIssue = '';
          x.orderEvidence = { pointId: m.purchase.id, reason: m.purchase.reason, points: m.purchase.amount || 0, at: m.purchase.at, productId: m.purchase.productId, productName: m.purchase.productName, basis: m.basis };
          var dr = orderDeliverRun(db, x, 'auto');
          matched.push({ flowId: x.flowId, rosterKey: x.rosterKey, name: nm, basis: m.basis, note: m.note, delivered: !!dr.delivered, pending: !!dr.pending, hold: dr.hold ? dr.reason : '', already: !!dr.already });
        });
        db.orderSync = { at: now, keys: only ? only.length : -1, checked: list.length, matched: matched.length, issues: issues.length }; saveDb();
        return ok({ syncAt: now, checked: list.length, matched: matched, issues: issues, delivered: matched.filter(function (x) { return x.delivered; }).length });
      }
      case 'order_mark_ordered': {
        var rsn = String(req.reason || '').trim(); if (rsn.length < 2) return fail('請填寫手動標記的原因', 'ERR_VALIDATION');
        var fM = materialFind(db, req.flowId); if (!fM) return fail('找不到該教材流程', 'ERR_NOT_FOUND'); if (fM.state !== 'notified') return fail('只有等待下單中可手動標記', 'ERR_ORDER_STATE');
        fM.state = 'ordered'; fM.matchedAt = now; fM.matchBy = 'manual'; fM.matchBasis = 'manual'; fM.matchNote = '手動標記：' + rsn.slice(0, 80); fM.matchIssue = ''; materialStore(db, fM); saveDb();
        return ok({ flow: materialPublic(db, fM) });
      }
      case 'order_deliver_source': {
        var fS = materialFind(db, req.flowId); if (!fS) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (req.source !== 'tool' && req.source !== 'zip') return fail('交付來源需為上傳教材 ZIP 或沿用工具檔', 'ERR_VALIDATION');
        var tS = (db.tooltest || {})[fS.rosterKey] || {};
        if (req.source === 'tool' && !tS.u) return fail('這位學姐沒有已上傳的工具', 'ERR_VALIDATION');
        if (req.source === 'tool' && ((tS.tk || 'url') !== 'file' || !tS.tf)) return fail('網址型工具不可沿用，請上傳教材 ZIP', 'ERR_VALIDATION');   // 3.3.2
        if (req.source === 'zip' && !fS.driveFileId) return fail('請先上傳教材 ZIP', 'ERR_VALIDATION');
        fS.deliverSource = req.source; materialStore(db, fS); saveDb(); return ok({ flow: materialPublic(db, fS) });
      }
      case 'order_deliver': {
        var fD = materialFind(db, req.flowId); if (!fD) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (req.preview === true) {
          var sp = orderSource(db, fD); if (!sp.ok) return fail(sp.reason, 'ERR_VALIDATION');
          var cp = orderRecipient(db, fD.rosterKey), rp = rosterByHash(db, fD.rosterKey) || {}, wp = watchLoad(db, fD.rosterKey);
          var dp = dlDeadline(db, req.dlDeadline); if (dp.error) return fail(dp.error, 'ERR_VALIDATION');
          var fxp = orderFx('materialDeliver', { callName: (wp && wp.c) || s.callName(rp.name || ''), material: fD.material, fileName: sp.name, fileMeta: s.ORDER.deliverKinds[sp.kind], kind: sp.kind, deliveredAt: Date.now(), url: dlUrl(fD), puzzle: true, dlDeadline: dp.iso });
          return ok({ preview: true, card: fxp, text: fxp ? fxp[0].altText : '', recipient: { name: rp.name || '', ok: cp.ok, reason: cp.reason || '' }, source: { kind: sp.source === 'tool' ? 'tool' : 'zip', fileKind: sp.kind, kindLabel: s.ORDER.deliverKinds[sp.kind] || '', name: sp.name, size: sp.size } });
        }
        if (fD.state !== 'ordered') return fail('需為待交付才可發送教材', 'ERR_MATERIAL_STATE');
        if (req.dlDeadline == null || String(req.dlDeadline).trim() === '') return fail('請填下載期限（日期與時間）', 'ERR_VALIDATION');
        var dm = dlDeadline(db, req.dlDeadline); if (dm.error) return fail(dm.error, 'ERR_VALIDATION');
        var d = orderDeliverRun(db, fD, 'manual', dm.iso); saveDb();
        if (d.pending) return fail(d.reason, 'ERR_VALIDATION'); if (d.hold) return fail('未發送：' + d.reason, 'ERR_ORDER_RECIPIENT');
        return ok({ flow: materialPublic(db, fD), delivered: !!d.delivered, already: !!d.already });
      }
      case 'order_click': return fail('連結無效', 'ERR_NOT_FOUND');
    }
    return fail('不支援的動作', 'ERR_BAD_REQUEST');
  }
  function handleMaterialKeyword(db, ev, out) {
    var s = S();
    if (!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || !s.isMaterialKeyword(ev.message.text)) return false;
    var userId = ev.source && ev.source.type === 'user' ? String(ev.source.userId || '') : '', h = userId ? bindingOwner(db, userId) : '';
    var f = h ? latestMaterial(db, h) : null;
    if (!f || f.state === 'unnotified') return true;
    var now = tpeStamp(new Date()), text;
    if (f.state === 'delivered') { f.receivedAt = now; text = s.renderTemplate(s.MATERIAL.texts.replyAfter, s.materialVars(f)); }
    else { f.replyOrderedAt = now; if (f.state === 'notified') f.matchPending = true; text = s.renderTemplate(s.MATERIAL.texts.replyBefore, s.materialVars(f)); }
    materialStore(db, f);
    out.material = (out.material || 0) + 1;
    chatLogAppend(db, [{ key: h, dir: 'out', kind: 'materialReply', text: text, ok: true }]);
    if (lineConfigured(db)) out.replies.push(text);
    return true;
  }
  function handleAdminWebhook(db, body) {
    ensure32(db);
    var s = S(), out = { recorded: 0, reports: 0, ignored: 0, replies: [] }, cfg = automationLoad(db);
    (Array.isArray(body.events) ? body.events.slice(0, 50) : []).forEach(function (ev) {
      var userId = ev && ev.source && ev.source.type === 'user' ? String(ev.source.userId || '') : '';
      if (!userId || !s.LINE.userIdRe.test(userId)) { out.ignored++; return; }
      if (ev.type === 'message' || ev.type === 'follow') {
        var t = ev.type === 'message' && ev.message ? (ev.message.type === 'text' ? String(ev.message.text || '').replace(/\s+/g, ' ').slice(0, 20) : '［' + String(ev.message.type || '') + '］') : '';
        db.lineAdmin.recent = (db.lineAdmin.recent || []).filter(function (r) { return r.u !== userId; });
        db.lineAdmin.recent.unshift({ u: userId, at: tpeStamp(new Date()), t: t, k: ev.type === 'follow' ? 'follow' : 'message' });
        db.lineAdmin.recent = db.lineAdmin.recent.slice(0, 20); out.recorded++;
      }
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || String(ev.message.text || '').replace(/\s+/g, '') !== s.REPORT.replyKeyword) { out.ignored++; return; }
      var r = cfg.adminRecipients.filter(function (x) { return x.adminUserId === userId; })[0];
      if (!r || !s.recipientEnabled(r)) { out.ignored++; return; }   // 3.2.4：關閉接收者不回覆
      var kind = s.REPORT.roleReport[s.recipientRole(r.role)], text = reportTextMock(db, kind, cfg).text;
      db.lineAdmin.replies.push({ to: userId, text: text }); out.replies.push(text); out.reports++;
      reportLogAppend(db, { kind: kind, title: s.REPORT.titles[kind], mode: 'reply', text: text, results: [{ name: r.name || '', ok: true, error: '', channel: 'admin' }] });
    });
    return out;
  }

  /* ---- 3.2 示範資料：預約、教材庫、教材流程、收件人角色 ---- */
  function seed32(db) {
    ensure32(db);
    if (db.seed32) return;
    db.seed32 = tpeStamp(new Date());
    var s = S(), now = Date.now(), day = 86400000;
    var at = function (d, hh, mm) { var t = new Date(now + d * day + 8 * 3600000); return s.deadlineIso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hh - 8, mm)); };
    var C = [['sung.sunny', 2, 15, 50, ['佈局設計']], ['hsiu_yun', 2, 17, 10, ['內容輸出設計系統（二）']], ['chien_yu', 9, 17, 20, ['版面健檢']], ['yu_an', 21, 17, 15, ['開發社群價值', '課後輔導']], ['yating.lin@gmail.com', 1, 10, 30, ['戰友輔助']]];
    C.forEach(function (c) { var k = s.rosterKey(c[0]); if (!db.roster.entries[k]) return; db.counsel.entries[keyHash(k)] = { nc: { at: at(c[1], c[2], c[3]), items: c[4], status: c[4].length > 1 ? 'combined' : 'confirmed' }, y: db.seed32 }; });
    // 3.2.4 跨年度示範：示範卉寧 2027.01.15（五）14:00 合併諮詢（已過時順延一年，保持在未來）
    var kHL = s.rosterKey('hui_ning');
    if (db.roster.entries[kHL]) { var yHL = 2027, msHL = Date.UTC(yHL, 0, 15, 6, 0); while (msHL < now + 7 * day) { yHL++; msHL = Date.UTC(yHL, 0, 15, 6, 0); } db.counsel.entries[keyHash(kHL)] = { nc: { at: s.deadlineIso(msHL), items: ['版面健檢', '佈局設計'], status: 'combined' }, y: db.seed32 }; }
    db.counsel.syncAt = db.counsel.entries && Object.keys(db.counsel.entries).length ? db.seed32 : '';
    // 3.2.4 示範：已發送作業通知者才列入諮詢準備（示範卉寧、樣本雅婷未發通知 → 不列入，諮詢詳情仍可查預約）
    ['sung.sunny', 'hsiu_yun', 'chien_yu', 'yu_an'].forEach(function (acc) { var hN = keyHash(s.rosterKey(acc)), eN = watchLoad(db, hN); if (eN && !(eN.nt || []).length) { eN.nt = [{ at: tpeStamp(new Date(now - 2 * day)), ok: true, kind: 'notify', err: '', img: 0 }]; watchStore(db, eN); } });
    seedStudentsMock(db);
    db.matLib = [{ id: 'lib01', name: '清朝苑｜經營加速器・作戰指南', amount: 15000, note: 'HTML 工具＋ZIP' }, { id: 'lib02', name: '銷售建構複習器', amount: 12345, note: 'ZIP' }];
    var kY = keyHash(s.rosterKey('yu_an'));
    if (rosterByHash(db, kY)) {
      var f = materialNew(db, kY);
      f.libId = 'lib01'; f.material = db.matLib[0].name; f.amount = 15000; f.deadline = s.deadlineIso(now + 2 * day); f.state = 'notified'; f.notifiedAt = tpeStamp(new Date(now - 3 * 3600000)); f.replyOrderedAt = tpeStamp(new Date(now - 3600000)); f.matchPending = true;
      materialStore(db, f);
    }
    var cfg = automationLoad(db); cfg.adminRecipients.forEach(function (r) { if (!r.role) r.role = 'principal'; }); automationSaveCfg(db, cfg);
  }

  /* ---- 3.2.7 補充請求（同 gas/supp.gs） ---- */
  function suppDb(db) { if (!db.supp) db.supp = { rows: [], all: [], own: {}, text: {} }; return db.supp; }
  function suppRowPublic(db, r, i) {
    var s = S(), tg = s.suppTarget(r.path), lb = r.key ? lineBindingOf(db, r.key) : null;
    return { row: i + 2, at: r.at, key: r.key || '', matched: !!r.key, name: r.name, callName: s.callName(r.name), product: r.product, path: r.path, kind: r.kind, content: r.content, raw: r.raw, userIdTail: String(r.userId || '').slice(-4),
      status: r.status, item: r.item || '', scope: r.scope || '', doneAt: r.doneAt || '', reply: r.reply || '', result: r.result || '', target: tg, defaultItem: s.suppDefaultLabel(r.content), lineBound: !!(lb && lb.bound && !lb.blocked), lineIssue: lb && lb.bound && lb.blocked ? '已封鎖官方帳號' : '' };
  }
  function suppRecord(db, text, userId, atMs) {
    var s = S(), p = s.suppParse(text); if (!p) return false;
    var h = userId ? bindingOwner(db, userId) : '', ro = h ? rosterByHash(db, h) : null;
    suppDb(db).rows.push({ at: tpeStamp(atMs ? new Date(atMs) : new Date()), key: h || '', name: (ro && ro.name) || p.name, product: p.product, path: p.path, kind: p.kind, content: p.content, raw: String(text).slice(0, 2000), userId: userId || '', status: s.SUPP.status.open });
    return true;
  }
  function suppFromEventMock(db, ev) {
    if (!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return false;
    return suppRecord(db, ev.message.text, ev.source && ev.source.type === 'user' ? String(ev.source.userId || '') : '', ev.timestamp ? Number(ev.timestamp) : 0);
  }
  /** 示範：4 則待處理（3 位已對應／1 位未對應）＋ 1 則已處理 */
  function suppSeedMock(db) {
    var sp = suppDb(db); if (sp.seeded) return; sp.seeded = true;
    var s = S(), now = Date.now(), uidOf = function (acc) { var h = keyHash(s.rosterKey(acc)), b = db.line.bindings[h]; return b && b.userId ? b.userId : 'U' + ('0000000000000000000000000000000' + acc.length).slice(-32); };
    var msg = function (name, prod, path, verb, text) { return '親愛的官方，我是' + name + '。我在《' + prod + '》的〔' + path + '〕' + verb + '：' + text; };
    var nm = function (acc) { return db.roster.entries[s.rosterKey(acc)] || ''; };
    if (nm('hsiu_yun')) suppRecord(db, msg(nm('hsiu_yun'), '諮詢教材·專屬訂製', '實際步驟 › 接待客人', '還想補充', '客人臨時改期時，要先確認新時段再退訂金差額，確認後才改單'), uidOf('hsiu_yun'), now - 26 * 3600000);
    suppRecord(db, msg('示範芷涵', '諮詢前置作業', '資源清單 › 工具系統', '還想新增', '蝦皮聊聊'), 'U' + 'f'.repeat(31) + '1', now - 20 * 3600000);
    if (nm('hsiu_yun')) suppRecord(db, msg(nm('hsiu_yun'), '諮詢教材·專屬訂製', '放入資料 › 價目表', '還想上傳', '各分店不同的季節限定價目表'), uidOf('hsiu_yun'), now - 3 * 3600000);
    if (nm('yu_an')) suppRecord(db, msg(nm('yu_an'), '諮詢教材·專屬訂製', '經營項目 › 收入來源', '還想新增', '直播帶貨分潤'), uidOf('yu_an'), now - 40 * 60000);
    var done = sp.rows[0]; if (done) { done.status = s.SUPP.status.no; done.item = '臨時改期處理'; done.doneAt = tpeStamp(new Date(now - 25 * 3600000)); done.reply = s.renderTemplate(s.SUPP.texts.no, s.suppVars({ path: done.path })); done.result = '已送出'; }
  }
  function suppTextsMock(db) { var s = S(), t = suppDb(db).text || {}; return { add: t.add || s.SUPP.texts.add, no: t.no || s.SUPP.texts.no, defaults: { add: s.SUPP.texts.add, no: s.SUPP.texts.no }, custom: { add: !!t.add, no: !!t.no }, vars: s.SUPP.vars, maxLength: s.SUPP.maxText }; }
  function suppListMock(db) {
    var s = S(), all = suppDb(db).rows.map(function (r, i) { return suppRowPublic(db, r, i); });
    var pending = all.filter(function (r) { return r.status === s.SUPP.status.open; }).reverse(), history = all.filter(function (r) { return r.status !== s.SUPP.status.open; }).sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; });
    return { pending: pending, history: history.slice(0, 200), counts: { pending: pending.length, history: history.length }, texts: suppTextsMock(db) };
  }
  function suppOptsFor(db, h) { var sp = suppDb(db); return S().suppMerge(sp.all, (h && sp.own[h]) || [], h || ''); }
  function suppResolveMock(db, req) {
    var s = S(), sp = suppDb(db), i = Number(req.row) - 2, r = sp.rows[i];
    if (!r || !(i >= 0)) return fail('找不到這則補充請求', 'ERR_NOT_FOUND');
    if (String(req.at || '') !== r.at) return fail('補充請求已變動，請重新整理', 'ERR_CONFLICT');
    if (r.status !== s.SUPP.status.open) return fail('這則補充請求已處理過', 'ERR_CONFLICT');
    var add = req.decision === 'add', tg = s.suppTarget(r.path), label = String(req.label || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, s.SUPP.maxLabel), all = req.all === true, v = S3m().v31();
    if (req.decision !== 'add' && req.decision !== 'no') return fail('請選擇同意新增或不需要', 'ERR_VALIDATION');
    if (add) {
      if (!tg) return fail('這個位置無法新增選項', 'ERR_VALIDATION');
      if (!label) return fail('請輸入項目名稱', 'ERR_VALIDATION');
      if (label.length > tg.max) return fail('這個位置的項目名稱最多 ' + tg.max + ' 字', 'ERR_VALIDATION');
      if (!r.key && !all) return fail('這位學姐尚未對應 LINE，只能加入全體選項', 'ERR_VALIDATION');
      if (tg.pick && !(tg.pick === 'tool' ? v.resources.tools : v.resources.data).some(function (g) { return g.id === req.group; })) return fail('請選擇分類', 'ERR_VALIDATION');
    }
    var text = String(req.text == null ? '' : req.text).replace(/\r\n?/g, '\n').trim();
    if (!text) return fail('請輸入回覆文字', 'ERR_VALIDATION');
    if (text.length > s.SUPP.maxText) return fail('回覆文字不可超過 ' + s.SUPP.maxText + ' 字', 'ERR_VALIDATION');
    var item = add ? label : (label || s.suppDefaultLabel(r.content)), F = root.CONSULT_FLEX;
    var msgs = F ? F.messages(F.build('suppResult', { callName: s.callName(r.name), ok: add, path: r.path, item: item, text: text }), '') : [{ type: 'text', text: text }];
    if (F && !F.validate(msgs).ok) return fail('卡片產生失敗', 'ERR_SETUP');
    var lb = r.key ? lineBindingOf(db, r.key) : { bound: false, blocked: false }, to = r.key && lb.bound ? db.line.bindings[r.key].userId : r.userId;
    var reason = !/^U[0-9a-f]{32}$/.test(String(to || '')) ? '未對應 LINE' : lb.bound && lb.blocked ? '已封鎖官方帳號' : '', q = reason ? null : lineQuotaNow(db);
    if (q && !s.lineQuotaSend(q, 1).enough) return fail('本月 LINE 剩餘則數不足 1 則', 'ERR_LINE_QUOTA');
    if (req.dryRun) return ok({ dryRun: true, messages: msgs, quota: q, canSend: !reason, reason: reason });
    var now = tpeStamp(new Date()), scope = '';
    if (add) {
      scope = all ? s.SUPP.scopeLabel.all : s.SUPP.scopeLabel.one;
      var opt = { t: tg.id, s: tg.sub, l: label, at: now }; if (tg.pick) opt.g = req.group; if (!all && (tg.id === 'upload' || tg.id === 'suppUpload')) opt.p = 1; if (all && r.key) opt.k = r.key;
      var cur = all ? sp.all : (sp.own[r.key] || []), res = s.suppOptAdd(cur, opt, all ? s.SUPP.maxAll : s.SUPP.maxOne);
      if (res.full) return fail('附加選項已達上限', 'ERR_LIMIT');
      if (all) sp.all = res.list; else sp.own[r.key] = res.list;
    }
    r.status = add ? s.SUPP.status.add : s.SUPP.status.no; r.item = item; r.scope = scope; r.doneAt = now; r.reply = text;
    var sent = false;
    if (reason) r.result = '未送出：' + reason;
    else {
      var pr = pushRaw(db, 'main', to, msgs, 'supp.' + req.row + '.' + r.at);
      sent = !!pr.ok; r.result = pr.ok ? '已送出' : '未送出：' + pr.error;
      if (pr.ok && !pr.duplicate) quotaAccount(db, 'supp', 1);
      if (r.key) chatLogAppend(db, [{ key: r.key, dir: 'out', kind: 'suppReply', text: msgs[0].altText || text, ok: !!pr.ok, err: pr.error || '' }]);
      notifyLogAppend(db, { source: 'supp', title: '補充結果', template: add ? '補充請求・同意新增' : '補充請求・不需要', body: text, sent: pr.ok ? [{ name: r.name }] : [], failed: pr.ok ? [] : [{ name: r.name, error: pr.error }], skipped: [] });
    }
    saveDb();
    var left = sp.rows.filter(function (x) { return x.status === s.SUPP.status.open; }).length;
    return ok({ row: Number(req.row), status: r.status, scope: scope, item: item, sent: sent, result: r.result, pending: left, quota: lineQuotaNow(db) });
  }
  function S3m() { return S3(); }

  /** 3.2 actions（需登入）；未處理回 null */
  function handle32(db, req) {
    ensure32(db);
    var s = S(), M = s.MATERIAL;
    if (/^order_/.test(String(req.action))) return orderMock(db, req);   // 3.3.0
    switch (req.action) {
      /* 3.2.4 提醒截止（同 watch.gs deadlineRemind；不改截止、不重建通知） */
      case 'student_history': { var hH = String(req.rosterKey || req.key || '').toLowerCase(); if (!/^[0-9a-f]{16}$/.test(hH)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION'); return ok(studentHistoryMock(db, hH)); }
      case 'remind_text_get': return ok({ text: s.remindManualText(db.remindText || ''), defaultText: s.REMIND_MANUAL.defaultText, custom: !!db.remindText, vars: s.REMIND_MANUAL.vars.map(function (v) { return v[0]; }) });
      case 'remind_text_save': {
        var tR = String(req.text == null ? '' : req.text).replace(/\r\n?/g, '\n');
        if (tR.length > s.REMIND_MANUAL.maxLength) return fail('提醒文字不可超過 ' + s.REMIND_MANUAL.maxLength + ' 字', 'ERR_VALIDATION');
        db.remindText = tR.trim() && tR !== s.REMIND_MANUAL.defaultText ? tR : ''; saveDb();
        return ok({ text: s.remindManualText(db.remindText), defaultText: s.REMIND_MANUAL.defaultText, custom: !!db.remindText, vars: s.REMIND_MANUAL.vars.map(function (v) { return v[0]; }) });
      }
      case 'deadline_remind': {
        var hD = String(req.rosterKey || req.key || '').toLowerCase(); if (!/^[0-9a-f]{16}$/.test(hD)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var eD = watchLoad(db, hD); if (!eD) return fail('不在追蹤名單', 'ERR_NOT_FOUND'); if (!eD.d) return fail('這位學姐尚未設定截止時間', 'ERR_VALIDATION');
        var stD = wState(db, hD, eD, stateIndexes(db)); if (stD.state === 'submitted') return fail('這位學姐已送出作業，不需提醒截止', 'ERR_VALIDATION');
        var rD = rosterByHash(db, hD) || {}, cnD = eD.c || s.callName(rD.name || eD.n || ''), lbD = lineBindingOf(db, hD), qD = lineQuotaNow(db), boundD = lbD.bound && !lbD.blocked;
        var bodyD = req.text != null && String(req.text).trim() ? String(req.text).slice(0, s.REMIND_MANUAL.maxLength) : s.remindManualText(db.remindText || '');
        var txD = s.renderTemplate(bodyD, s.remindManualVars({ callName: cnD, deadline: eD.d, percent: stD.percent || 0 }));
        var whyD = !lineConfigured(db) ? 'LINE 尚未設定' : !boundD ? (lbD.bound ? 'LINE 無法送達' : '尚未對應 LINE') : !S().lineQuotaSend(qD, 1).enough ? '本月 LINE 額度不足' : '';
        if (req.preview === true) return ok({ preview: true, name: rD.name || eD.n || '', callName: cnD, deadline: eD.d, deadlineText: s.formatDeadline(eD.d), percent: stD.percent || 0, state: stD.state, text: txD, lineBound: boundD, canPush: !whyD, reason: whyD, chatUrl: lbD.bound ? lineChatUrlFor(db, hD) : '', quota: qD });
        var atD = tpeStamp(new Date());
        if (whyD) return ok({ ok: false, error: whyD, code: 0, at: atD, text: txD, manual: true });
        var pD = pushRaw(db, 'main', db.line.bindings[hD].userId, [{ type: 'text', text: txD }], 'remindManual.' + hD + '.' + String(req.runId || Date.now()));
        eD.nt = (eD.nt || []).concat([{ at: atD, ok: !!pD.ok, kind: 'remind', err: pD.ok ? '' : String(pD.error || ''), img: 0 }]).slice(-WATCH.MAX_NOTIFY_KEEP); watchStore(db, eD);
        if (pD.ok && !pD.duplicate) quotaAccount(db, 'remind', 1);
        chatLogAppend(db, [{ key: hD, dir: 'out', kind: 'remind', text: txD, ok: !!pD.ok, err: pD.ok ? '' : pD.error }]);
        notifyLogAppend(db, { source: 'remind', title: '提醒截止', template: '提醒截止', body: txD, sent: pD.ok ? [{ key: hD, name: rD.name || eD.n || '', at: atD }] : [], failed: pD.ok ? [] : [{ key: hD, name: rD.name || '', error: pD.error }], skipped: [] });
        saveDb();
        return ok({ ok: !!pD.ok, error: pD.ok ? '' : String(pD.error || ''), code: pD.ok ? 200 : 429, at: atD, text: txD, manual: !pD.ok, duplicate: !!pD.duplicate });
      }
      case 'notify_manual_mark': {
        var list = Array.isArray(req.members) ? req.members : [], kind = ['notify', 'resend', 'supplement', 'material', 'remind'].indexOf(req.kind) >= 0 ? req.kind : 'notify';
        if (!list.length || list.length > 50) return fail('一次可標記 1–50 位', 'ERR_VALIDATION');
        var nowStr = tpeStamp(new Date()), marked = [], skipped = [], added = [], updated = [], logSent = [], body0 = '';
        list.forEach(function (m) {
          var h = keyOfReq(m), r = rosterByHash(db, h), w = watchLoad(db, h);
          if (!/^[0-9a-f]{16}$/.test(h) || (!r && !w)) { skipped.push({ key: h, reason: '名冊中找不到' }); return; }
          var name = (r && r.name) || w.n;
          if ((kind === 'notify' || kind === 'resend') && m.deadline) { if (s.parseDeadline(m.deadline) == null) { skipped.push({ key: h, reason: '截止時間格式不正確' }); return; } (w ? updated : added).push(h); if (w && kind === 'notify' && s.CYCLE_RESTART) wCycleRestart(db, h, nowStr); watchUpsert(db, h, { deadline: m.deadline, by: 'notify', name: name }, nowStr); }
          var img = m.imageId ? noticeImageById(db, m.imageId) : null, imgUrl = img ? img.url : String(m.imageUrl || '');
          var e = watchLoad(db, h);
          if (e) { e.nt = (e.nt || []).concat([{ at: nowStr, ok: true, kind: kind, err: '', img: imgUrl ? 1 : 0, src: 'manual' }]).slice(-WATCH.MAX_NOTIFY_KEEP); if (kind === 'notify' || kind === 'resend') { e.ack = ''; e.fl.noAck = 0; } if (e.d && s.REMIND_RULES.notifyKinds.indexOf(kind) >= 0) { var fl = s.notifyFlags(s.parseDeadline(e.d) - Date.now()); if (fl.h48) e.fl.h48 = 1; if (fl.h24) e.fl.h24 = 1; } watchStore(db, e); }
          if (kind === 'material') { var mf = latestMaterial(db, h); if (mf && mf.state === 'unnotified') { mf.state = 'notified'; mf.notifiedAt = nowStr; materialStore(db, mf); } }
          chatLogAppend(db, [{ key: h, dir: 'out', kind: kind, text: String(m.text || ''), img: imgUrl, ok: true, err: '', manual: true, at: nowStr }]);
          if (!body0) body0 = String(m.text || '');
          marked.push({ key: h, name: name, at: nowStr }); logSent.push({ name: name });
        });
        var logId = marked.length ? notifyLogAppend(db, { source: 'manual', title: String(req.title || '手動發送').slice(0, 40), template: '手動發送', body: body0, imageUrl: '', sent: logSent, failed: [], skipped: skipped.map(function (x) { return { name: x.key, reason: x.reason }; }) }) : '';
        saveDb();
        return ok({ marked: marked, skipped: skipped, logId: logId, watch: { added: added, updated: updated } });
      }
      case 'line_conversation': { var hC = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hC)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION'); return ok(chatLog(db, hC)); }
      case 'line_admin_settings_get': return ok(adminSettingsPublic(db));
      case 'line_admin_settings_save': {
        var id = String(req.channelId || '').trim(), sec = String(req.channelSecret || '').trim();
        if (!/^\d{6,20}$/.test(id)) return fail('Channel ID 須為數字', 'ERR_VALIDATION');
        if (!/^[A-Za-z0-9]{16,128}$/.test(sec)) return fail('Channel secret 格式不正確', 'ERR_VALIDATION');
        db.lineAdmin.settings = { channelId: id, channelSecret: sec, updatedAt: tpeStamp(new Date()) }; saveDb();
        var o = adminSettingsPublic(db); o.verified = true; return ok(o);
      }
      case 'line_admin_recent_senders': {
        var cfgS = automationLoad(db), byU = {};
        cfgS.adminRecipients.forEach(function (r) { if (r.adminUserId) byU[r.adminUserId] = r; });
        return ok({ configured: adminLineConfigured(db), rows: (db.lineAdmin.recent || []).map(function (r) { var nm = db.lineAdmin.profiles[r.u] || null; return { userId: r.u, userIdTail: r.u.slice(-4), displayName: nm, pictureUrl: '', reachable: adminLineConfigured(db), text: r.t || '', at: r.at || '', kind: r.k || 'message', isRecipient: !!byU[r.u], recipientName: byU[r.u] ? byU[r.u].name || '' : '' }; }) });
      }
      case 'automation_recipient_add': {
        var cfgR = automationLoad(db), nameR = String(req.name || '').trim().slice(0, 30), role = s.recipientRole(req.role), ch = req.channel === 'admin' ? 'admin' : 'main';
        if (req.key) return fail('學員不可設為管理收件人', 'ERR_STUDENT_RECIPIENT');
        var pR = s.parseLineChat(req.chatUrl || req.userId || '');
        if (!pR || !pR.userId) return fail('請貼上官方帳號聊天室網址或 LINE userId', 'ERR_VALIDATION');
        var uid = pR.userId;
        if (ch === 'main' && bindingOwner(db, uid)) return fail('此 LINE 已對應名冊學員，不可設為管理收件人', 'ERR_STUDENT_RECIPIENT');
        if (ch === 'admin') {
          if (!adminLineConfigured(db)) return fail('尚未設定天使助教官方帳號', 'ERR_LINE_ADMIN_NOT_CONFIGURED');
          if (cfgR.adminRecipients.some(function (r) { return r.adminUserId === uid; })) return fail('此 LINE 已在收件人名單', 'ERR_CONFLICT');
          if (req.linkTo) { var tgt = findRecip(cfgR, req.linkTo); if (!tgt) return fail('找不到該收件人', 'ERR_NOT_FOUND'); tgt.adminUserId = uid; if (req.role) tgt.role = role; automationSaveCfg(db, cfgR); saveDb(); return ok(automationPublic(cfgR)); }
          if (cfgR.adminRecipients.length >= s.AUTOMATION.maxRecipients) return fail('管理收件人最多 ' + s.AUTOMATION.maxRecipients + ' 位', 'ERR_VALIDATION');
          cfgR.adminRecipients.push({ userId: '', adminUserId: uid, name: nameR || db.lineAdmin.profiles[uid] || '管理收件人', role: role, key: '', at: tpeStamp(new Date()) });
          automationSaveCfg(db, cfgR); saveDb(); return ok(automationPublic(cfgR));
        }
        if (cfgR.adminRecipients.length >= s.AUTOMATION.maxRecipients) return fail('管理收件人最多 ' + s.AUTOMATION.maxRecipients + ' 位', 'ERR_VALIDATION');
        if (cfgR.adminRecipients.some(function (r) { return r.userId === uid; })) return fail('此 LINE 已在收件人名單', 'ERR_CONFLICT');
        if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
        var pfR = lineProfile(db, uid);
        if (pfR.notFriend) return fail(LINE_NOT_FRIEND_MSG, 'ERR_LINE_NOT_FRIEND');
        if (!pfR.ok) return fail('暫時無法向 LINE 確認此帳號可否推播，請稍後再試', 'ERR_LINE_API');
        if (pR.accountId && !db.line.chatAccount) db.line.chatAccount = pR.accountId;
        cfgR.adminRecipients.push({ userId: uid, adminUserId: '', name: nameR || pfR.displayName || '管理收件人', role: role, key: '', at: tpeStamp(new Date()) });
        automationSaveCfg(db, cfgR); saveDb(); return ok(automationPublic(cfgR));
      }
      case 'automation_recipient_update': {
        var cfgU = automationLoad(db), hit = findRecip(cfgU, req.id || req.userId);
        if (!hit) return fail('找不到該收件人', 'ERR_NOT_FOUND');
        if (req.name != null) hit.name = String(req.name).trim().slice(0, 30) || hit.name;
        if (req.role != null) hit.role = s.recipientRole(req.role);
        if (req.enabled != null) { if (typeof req.enabled !== 'boolean') return fail('接收開關格式錯誤', 'ERR_VALIDATION'); hit.enabled = req.enabled; }
        if (req.adminUserId != null) { var au = String(req.adminUserId || ''); if (au && !s.LINE.userIdRe.test(au)) return fail('LINE userId 格式不正確', 'ERR_VALIDATION'); if (!au && !hit.userId) return fail('收件人至少需保留一個 LINE', 'ERR_VALIDATION'); hit.adminUserId = au; }
        automationSaveCfg(db, cfgU); saveDb(); return ok(automationPublic(cfgU));
      }
      case 'automation_recipient_remove': {
        var cfgX = automationLoad(db), hitX = findRecip(cfgX, req.id || req.userId);
        if (!hitX) return fail('找不到該收件人', 'ERR_NOT_FOUND');
        var uX = undoCreate(db, 'autoRecipient', { rec: hitX }, '管理收件人「' + (hitX.name || '') + '」');
        cfgX.adminRecipients = cfgX.adminRecipients.filter(function (r) { return r !== hitX; });
        automationSaveCfg(db, cfgX); saveDb();
        return ok({ removed: true, undoToken: uX.token, undoExpiresAt: uX.expiresAt, config: automationPublic(cfgX) });
      }
      case 'automation_test': {
        var cfgT = automationLoad(db), hitT = findRecip(cfgT, req.userId || req.id), kT = req.kind === 'principal' ? 'principal' : 'digest';
        if (!hitT) return fail('只能測試發送給管理收件人', 'ERR_NOT_FOUND');
        if (!s.recipientEnabled(hitT)) return fail('此收件人已關閉接收，開啟後再測試', 'ERR_VALIDATION');
        if (req.kind && ['digest', 'principal', 'card', 'remind48', 'remind24', 'noAck', 'thanks', 'submitNotify', 'overdue', 'ackReply'].indexOf(req.kind) < 0) return fail('不支援的測試類別', 'ERR_VALIDATION');   // 3.2.6 示範模式：卡片與各提醒類別以文字代替
        var txT = s.REPORT.titles.test + '\n' + reportTextMock(db, kT, cfgT).text, rT = adminPush(db, txT, 'digest', 'test.' + Date.now(), 'test', recipId(hitT)), oneT = (rT.results || [])[0] || {};
        saveDb();
        return ok({ kind: kT, to: hitT.name || '', text: txT, ok: !!oneT.ok, code: oneT.ok ? 200 : 0, error: oneT.error || '', channel: oneT.channel || '' });
      }
      case 'report_list': return ok(reportListMock(db, req));
      case 'report_preview': {
        var kP = String(req.kind || 'principal'); if (s.REPORT.kinds.indexOf(kP) < 0) return fail('不支援的匯報類別', 'ERR_VALIDATION');
        var cfgP = automationLoad(db);
        return ok({ kind: kP, title: s.REPORT.titles[kP], text: reportTextMock(db, kP, cfgP).text, mode: reportModeOf(cfgP, kP), generatedAt: tpeStamp(new Date()) });
      }
      case 'counsel_sync': {
        if (!Array.isArray(req.rows)) return fail('預約資料格式錯誤', 'ERR_VALIDATION');
        if (req.rows.length > s.COUNSEL.maxRows) return fail('預約資料超過上限 ' + s.COUNSEL.maxRows + ' 筆', 'ERR_VALIDATION');
        var g = s.counselGroup(req.rows, Date.now()), next = {}, unmatched = 0, syncAt = tpeStamp(new Date());
        Object.keys(g.byUid).forEach(function (uid) {
          var h = keyHash(progressKeyOf(uid));
          if (!rosterByHash(db, h)) { unmatched++; return; }
          var old = db.counsel.entries[h], nc = g.byUid[uid];
          next[h] = { nc: nc, y: syncAt }; if (old && old.p && old.p.at === nc.at) next[h].p = old.p;
        });
        db.counsel = { entries: next, syncAt: syncAt }; saveDb();
        return ok({ members: Object.keys(next).length, rows: req.rows.length, unmatched: unmatched, skipped: g.skipped, syncAt: syncAt });
      }
      case 'material_order_sync': {
        if (!Array.isArray(req.points)) return fail('點數紀錄格式錯誤', 'ERR_VALIDATION');
        if (req.points.length > 5000) return fail('點數紀錄超過上限 5000 筆', 'ERR_VALIDATION');
        var used = db.materials.filter(function (f) { return f.orderEvidence && f.orderEvidence.pointId; }).map(function (f) { return f.orderEvidence.pointId; });
        var pcM = s.normalizeMatProducts(db.matProducts), mm = s.materialMatch(db.materials, req.points, function (uid) { return keyHash(progressKeyOf(uid)); }, used, pcM), now2 = tpeStamp(new Date()), matched = [];
        req.points.forEach(function (p) { if (!s.materialProductHit(p, pcM)) return; var pr = s.materialProductOf(p), k = pr.id || pr.name; if (!k) return; var hS = pcM.seen.filter(function (x) { return (x.id || x.name) === k; })[0]; if (hS) { hS.n++; hS.at = now2; } else pcM.seen.unshift({ id: pr.id, name: pr.name, at: now2, n: 1 }); });
        pcM.seen = pcM.seen.slice(0, s.MAT_PRODUCTS.maxSeen); db.matProducts = pcM;
        mm.forEach(function (x) { var f = materialFind(db, x.flowId); f.state = 'ordered'; f.orderEvidence = x.point; f.matchedAt = now2; f.matchPending = false; materialStore(db, f); var pub = materialPublic(db, f); matched.push({ flowId: f.flowId, rosterKey: f.rosterKey, name: pub.name, pointId: x.point.pointId, points: x.point.points, at: x.point.at }); });
        saveDb();
        return ok({ checked: req.points.length, matched: matched, pending: db.materials.filter(function (f) { return f.matchPending && f.state === 'notified'; }).map(function (f) { return { flowId: f.flowId, rosterKey: f.rosterKey, name: materialPublic(db, f).name, replyOrderedAt: f.replyOrderedAt }; }), syncAt: now2 });
      }
      case 'prep_board': return ok(prepBoardMock(db, req));
      case 'tooltest_start': {   // 3.3.3 開始製作（同 tooltest.gs tooltestStart）
        if (req.by === 'assistant') return fail('開始製作由校長操作', 'ERR_TOOLTEST_ROLE');
        var hS = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hS)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var eS = ttLoad(db, hS, String(req.cycle || '').slice(0, 40));
        if (eS.st || eS.u || Number(eS.pi) > 0 || (eS.s && eS.s !== 'make')) return fail('已開始製作', 'ERR_TOOLTEST_STATE');
        eS.st = tpeStamp(new Date()); eS.lg = (eS.lg || []).concat([{ at: eS.st, ev: 'start' }]); db.tooltest[hS] = eS; saveDb();
        return ok({ row: ttPublic(db, hS, eS) });
      }
      case 'tooltest_price_set': {   // 3.3.0 卡片定價（同 tooltest.gs tooltestPriceSet）
        if (req.by === 'assistant') return fail('定價由校長填寫', 'ERR_TOOLTEST_ROLE');
        var hp = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hp)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var rawP = String(req.price == null ? '' : req.price).replace(/[,\s]/g, ''), np = Math.round(Number(rawP)); if (!rawP || !(np > 0) || np > 10000000) return fail('教材定價需為 1 以上的整數（新台幣）', 'ERR_VALIDATION');
        var ep = ttLoad(db, hp, String(req.cycle || '').slice(0, 40)), fromP = Number(ep.pi) || 0, nowP = tpeStamp(new Date());
        var reP = false;
        if (Number(ep.pc) > 0 && np !== Number(ep.pc)) {   // 3.3.2 確認金額後改價：已發下單通知 → 拒絕；未發 → 清除確認金額重新確認
          var cfP = orderCurFlow(db, hp, ep); if (cfP && cfP.state !== 'unnotified') return fail('已發送下單通知，金額已鎖定，不可改價（確認金額 NT$ ' + Number(ep.pc) + '）', 'ERR_PRICE_LOCKED');
          ep.pl = (ep.pl || []).concat([{ at: nowP, by: 'principal', ev: 'reopen', from: Number(ep.pc), to: 0, rs: '卡片改價，需重新確認金額' }]).slice(-20); delete ep.pc; delete ep.pca; delete ep.prs; ep.pp = np; reP = true;
        }
        if (np !== fromP || reP) { if (np !== fromP) ep.pl = (ep.pl || []).concat([{ at: nowP, by: 'principal', ev: fromP ? 'set' : 'init', from: fromP, to: np, rs: '卡片定價' }]).slice(-20); ep.pi = np; if (!(Number(ep.pc) > 0)) ep.pp = np; db.tooltest[hp] = ep; saveDb(); }
        return ok({ row: ttPublic(db, hp, ep), reconfirm: reP });
      }
      case 'tooltest_list': case 'tooltest_mark_done': case 'tooltest_pass': case 'tooltest_needfix': case 'tooltest_feedback': case 'tooltest_undo':
      case 'tooltest_upload_url': case 'tooltest_upload_file': case 'tooltest_upload_begin': case 'tooltest_upload_chunk': case 'tooltest_upload_finish': return tooltestMock(db, req.action, req);   // 3.2.8
      case 'student_sync': { var rSS = studentSyncMock(db, req); if (rSS.fail) return rSS.fail; saveDb(); return ok(rSS.data); }
      case 'student_summary': return ok(studentSummaryMock(db));
      case 'student_detail': { var rSD = studentDetailMock(db, req); return rSD.fail ? rSD.fail : ok(rSD.data); }
      case 'prep_update': {
        var hU = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hU)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var eU = watchLoad(db, hU), cU = db.counsel.entries[hU];
        if (!eU && !(cU && cU.nc)) return fail('不在追蹤名單且沒有下次諮詢', 'ERR_NOT_FOUND');
        if (eU) { if (typeof req.dataConfirmed === 'boolean') eU.dc = req.dataConfirmed ? 1 : 0; if (typeof req.toolDone === 'boolean') { if (req.toolDone && eU.td !== 1) eU.tda = tpeStamp(new Date()); else if (!req.toolDone) eU.tda = ''; eU.td = req.toolDone ? 1 : 0; } watchStore(db, eU); }
        else { var pU = cU.p && cU.p.at === cU.nc.at ? cU.p : { at: cU.nc.at, dc: 0, td: 0 }; if (typeof req.dataConfirmed === 'boolean') pU.dc = req.dataConfirmed ? 1 : 0; if (typeof req.toolDone === 'boolean') pU.td = req.toolDone ? 1 : 0; cU.p = pU; }
        saveDb();
        var bU = prepBoardMock(db, {});
        return ok({ row: bU.rows.concat(bU.others || []).filter(function (r) { return r.key === hU; })[0] || null });
      }
      case 'prep_settings_save': {
        var lh = Number(req.leadHours); if (!isFinite(lh) || lh < s.PREP.leadHoursMin || lh > s.PREP.leadHoursMax) return fail('準備期限須為 1–168 小時', 'ERR_VALIDATION');
        db.prepSettings.leadHours = Math.round(lh); saveDb(); return ok({ leadHours: db.prepSettings.leadHours });
      }
      case 'drive_folder_summary':
      case 'drive_folder_files': {
        var hD = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hD)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var rec = db.drive[hD], files = [];
        if (!rec) { if (req.action === 'drive_folder_summary') return ok({ registered: false, folderId: '', rootUrl: '', rootName: '', files: 0, bytes: 0, googleDocs: 0, truncated: false, checkedAt: tpeStamp(new Date()) }); return fail('學姐尚未登錄雲端資料夾', 'ERR_NOT_FOUND'); }
        Object.keys(rec.folders || {}).forEach(function (itemId) { var c = (rec.counts || {})[rec.folders[itemId]]; var n = c ? c.count || 0 : 0; for (var i = 1; i <= n; i++) files.push({ id: rec.folders[itemId] + '_f' + i, name: itemId + '_' + pad2(i) + '.pdf', mimeType: 'application/pdf', size: 120000 + i * 3100, path: itemId + '/' + itemId + '_' + pad2(i) + '.pdf', export: null }); });
        files.push({ id: rec.rootFolderId + '_doc', name: '補充說明', mimeType: 'application/vnd.google-apps.document', size: 0, path: '補充說明.docx', export: s.driveExportOf('application/vnd.google-apps.document') });
        var bytes = files.reduce(function (a, f) { return a + f.size; }, 0);
        if (req.action === 'drive_folder_summary') return ok({ registered: true, folderId: rec.rootFolderId, rootUrl: rec.rootUrl, rootName: rec.rootName || '', files: files.length, bytes: bytes, googleDocs: 1, truncated: false, checkedAt: tpeStamp(new Date()) });
        return ok({ folderId: rec.rootFolderId, rootName: rec.rootName || '', files: files, total: files.length, bytes: bytes, truncated: false });
      }
      case 'drive_zip': {   // 3.3.7 離線示範：第一次呼叫產生中，第二次備妥（連結為示範檔）
        var hZ = keyOfReq(req); if (!/^[0-9a-f]{16}$/.test(hZ)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
        var recZ = db.drive[hZ]; if (!recZ) return fail('學姐尚未登錄雲端資料夾', 'ERR_NOT_FOUND');
        db.zip = db.zip || {}; var zs = db.zip[hZ];
        if (!zs || req.force === true) { db.zip[hZ] = { n: 1 }; saveDb(); return ok({ ready: false, building: true, done: 0, total: 1, stale: true, shared: false, parts: [], large: [], files: 3, bytes: 1500000 }); }
        zs.n++; zs.at = tpeStamp(new Date()); saveDb();
        return ok({ ready: true, building: false, stale: false, shared: true, sharedUntil: tpeStamp(new Date(Date.now() + 86400000)), builtAt: zs.at, files: 3, bytes: 1500000, parts: [{ url: 'https://drive.google.com/uc?export=download&confirm=t&id=demo' + hZ.slice(0, 6), name: (recZ.rootName || '示範_諮詢資料') + '_' + zs.at.slice(0, 10) + '.zip', size: 1500000, files: 3 }], large: [] });
      }
      case 'material_lib_list': return ok({ rows: db.matLib.slice(), products: s.normalizeMatProducts(db.matProducts) });
      case 'material_products_save': {
        var PP = s.MAT_PRODUCTS;
        if (!Array.isArray(req.ids) || !Array.isArray(req.keywords)) return fail('教材下單商品格式錯誤', 'ERR_VALIDATION');
        if (req.ids.length > PP.maxIds || req.keywords.length > PP.maxKeywords) return fail('商品 ID 與名稱關鍵字各最多 ' + PP.maxIds + ' 個', 'ERR_VALIDATION');
        if (req.ids.some(function (x) { return !/^#?\d{1,9}$/.test(String(x).trim()); })) return fail('商品 ID 須為數字', 'ERR_VALIDATION');
        if (!req.ids.length && !req.keywords.filter(function (x) { return String(x || '').trim(); }).length) return fail('至少保留一個商品 ID 或名稱關鍵字', 'ERR_VALIDATION');
        if (req.orderUrl && !/^https:\/\/(www\.)?graceschool\.com\.tw\//.test(String(req.orderUrl))) return fail('下單連結須為學院官網網址', 'ERR_VALIDATION');
        var curP = s.normalizeMatProducts(db.matProducts);
        db.matProducts = s.normalizeMatProducts({ ids: req.ids, keywords: req.keywords, idNames: req.idNames && typeof req.idNames === 'object' ? req.idNames : curP.idNames, displayName: req.displayName, orderUrl: req.orderUrl || curP.orderUrl, seen: curP.seen });
        saveDb(); return ok({ products: db.matProducts });
      }
      case 'material_lib_save': {
        var nm = String(req.name || '').trim().slice(0, M.maxNameLength), am = Math.round(Number(String(req.amount == null ? '' : req.amount).replace(/,/g, '')));
        if (!nm) return fail('請填寫教材名稱', 'ERR_VALIDATION');
        if (!isFinite(am) || am < 0 || am > M.maxAmount) return fail('金額格式不正確', 'ERR_VALIDATION');
        var row = req.id ? db.matLib.filter(function (x) { return x.id === String(req.id); })[0] : null;
        if (req.id && !row) return fail('找不到該教材', 'ERR_NOT_FOUND');
        if (!row) { if (db.matLib.length >= M.libMax) return fail('教材庫最多 ' + M.libMax + ' 項', 'ERR_VALIDATION'); row = { id: 'lib' + rand(6) }; db.matLib.push(row); }
        row.name = nm; row.amount = am; row.note = String(req.note || '').trim().slice(0, 60); saveDb();
        return ok({ row: row, rows: db.matLib.slice() });
      }
      case 'material_lib_delete': {
        var lr = db.matLib.filter(function (x) { return x.id === String(req.id || ''); })[0];
        if (!lr) return fail('找不到該教材', 'ERR_NOT_FOUND');
        var uL = undoCreate(db, 'materialLib', { row: lr }, '教材「' + lr.name + '」');
        db.matLib = db.matLib.filter(function (x) { return x !== lr; }); saveDb();
        return ok({ deleted: true, undoToken: uL.token, undoExpiresAt: uL.expiresAt, rows: db.matLib.slice() });
      }
      case 'material_list': {
        var hL = keyOfReq(req), st = String(req.state || '');
        var rowsL = db.materials.filter(function (f) { return (!hL || f.rosterKey === hL) && (!st || f.state === st); }).map(function (f) { return materialPublic(db, f); }).reverse();
        return ok({ rows: rowsL, summary: materialSummary(db) });
      }
      case 'material_save': {
        try {
          var fS = materialFlowFor(db, req);
          if (fS.state === 'delivered') return fail('已交付的教材不可修改', 'ERR_MATERIAL_STATE', fS.state);
          materialFields(db, fS, req, false); materialStore(db, fS); saveDb();
          return ok({ flow: materialPublic(db, fS) });
        } catch (e) { return fail(e.message, e.code, e.detail); }
      }
      case 'material_notify': {
        try {
          var fN = materialFlowFor(db, req);
          if (fN.state === 'delivered') return fail('已交付的教材不可再發下單通知', 'ERR_MATERIAL_STATE', fN.state);
          var draft = JSON.parse(JSON.stringify(fN)); materialFields(db, draft, req, true);
          var pub = materialPublic(db, draft), img = req.imageId ? noticeImageById(db, req.imageId) : null;
          if (req.imageId && !img) return fail('找不到該通知圖卡', 'ERR_NOT_FOUND');
          var body = String(req.text || '').trim() ? String(req.text) : M.texts.order;
          var pcN = s.normalizeMatProducts(db.matProducts), text = s.renderTemplate(body, s.materialVars({ callName: pub.callName, material: draft.material, amount: draft.amount, deadline: draft.deadline, product: pcN.displayName, orderUrl: pcN.orderUrl }));
          var q = lineQuotaNow(db), lb = lineBindingOf(db, fN.rosterKey), can = lineConfigured(db) && lb.bound && !lb.blocked;
          var qsN = s.lineQuotaSend(q, can ? 1 : 0);
          if (req.preview === true) return ok({ preview: true, text: text, imageUrl: img ? img.url : '', willSend: can ? 1 : 0, quota: q, afterRemaining: qsN.afterRemaining, overage: qsN.overage, overageNote: qsN.note, lineBound: can });
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          if (!can) return fail('學姐尚未對應 LINE 或無法送達，可改用手動發送後標記', 'ERR_VALIDATION');
          if (!s.lineQuotaSend(q, 1).enough) return fail('本月 LINE 剩餘 0 則', 'ERR_LINE_QUOTA', '1');
          var msgs = []; if (img) msgs.push({ type: 'image', originalContentUrl: img.url, previewImageUrl: img.url }); msgs.push({ type: 'text', text: text });
          var r = pushRaw(db, 'main', db.line.bindings[fN.rosterKey].userId, msgs, 'mat.order.' + fN.flowId + '.' + keyHash(text + (img ? img.id : '')));
          if (!r.ok) return fail(r.error, 'ERR_LINE_API');
          Object.keys(draft).forEach(function (k) { if (k !== '__new') fN[k] = draft[k]; });
          fN.state = 'notified'; fN.notifiedAt = tpeStamp(new Date()); fN.matchPending = false;
          materialStore(db, fN);
          if (!r.duplicate) quotaAccount(db, 'notify', 1);
          chatLogAppend(db, [{ key: fN.rosterKey, dir: 'out', kind: 'material', text: text, img: img ? img.url : '', ok: true }]);
          notifyLogAppend(db, { source: 'material', title: '教材下單通知', template: '教材下單通知' + (img ? '＋圖卡' : ''), body: text, imageUrl: img ? img.url : '', sent: [{ name: pub.name }], failed: [], skipped: [] });
          saveDb();
          return ok({ flow: materialPublic(db, fN), sent: r.duplicate ? 0 : 1, quota: lineQuotaNow(db) });
        } catch (e) { return fail(e.message, e.code, e.detail); }
      }
      case 'material_mark_ordered': {
        var fO = materialFind(db, req.flowId); if (!fO) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (fO.state !== 'notified' && fO.state !== 'unnotified') return fail('目前狀態不可標記已下單', 'ERR_MATERIAL_STATE', fO.state);
        fO.state = 'ordered'; fO.matchedAt = tpeStamp(new Date()); fO.matchPending = false; fO.orderEvidence = { pointId: '', reason: String(req.note || '手動標記').slice(0, 80), points: 0, at: fO.matchedAt, manual: true };
        materialStore(db, fO); saveDb(); return ok({ flow: materialPublic(db, fO) });
      }
      case 'material_unmark': {
        var fX = materialFind(db, req.flowId); if (!fX) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (fX.state !== 'ordered') return fail('只有已下單待交付可取消標記', 'ERR_MATERIAL_STATE', fX.state);
        fX.state = fX.notifiedAt ? 'notified' : 'unnotified'; fX.orderEvidence = null; fX.matchedAt = ''; fX.matchPending = !!fX.replyOrderedAt;
        materialStore(db, fX); saveDb(); return ok({ flow: materialPublic(db, fX) });
      }
      case 'material_match_pending': { var pend = db.materials.filter(function (f) { return f.matchPending && f.state === 'notified'; }).map(function (f) { return materialPublic(db, f); }); return ok({ rows: pend, total: pend.length }); }
      case 'material_upload_begin': {
        var fB = materialFind(db, req.flowId); if (!fB) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        var size = Number(req.size) || 0; if (!(size > 0) || size > M.maxFileBytes) return fail('檔案大小須為 1 位元組至 50 MB', 'ERR_VALIDATION');
        var nmB = safeName(String(req.name || 'material.zip')).slice(0, 120);
        var upId = 'mu' + rand(16); mem.matUploads = mem.matUploads || {}; mem.matUploads[upId] = { flowId: fB.flowId, name: nmB, size: size, mime: String(req.mime || 'application/zip').slice(0, 100), chunks: [], received: 0 };
        return ok({ uploadId: upId, chunkBytes: M.chunkBytes });
      }
      case 'material_upload_chunk': {
        var up = (mem.matUploads || {})[String(req.uploadId || '')]; if (!up) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
        var off = Number(req.offset) || 0, end = Number(req.end) || 0;
        if (Number(req.total) !== up.size || end > up.size || end < off) return fail('分塊範圍不正確', 'ERR_VALIDATION');
        if (off !== up.received) { if (end <= up.received) return ok({ received: up.received, done: up.received === up.size, duplicate: true }); return fail('分塊順序錯誤（預期 ' + up.received + '）', 'ERR_CHUNK_ORDER', String(up.received)); }
        if (b64Bytes(req.data) !== end - off) return fail('分塊長度不符', 'ERR_VALIDATION');
        up.chunks.push(String(req.data || '')); up.received = end;
        return ok({ received: up.received, done: up.received === up.size });
      }
      case 'material_upload_finish': {
        var upF = (mem.matUploads || {})[String(req.uploadId || '')]; if (!upF) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
        if (upF.received !== upF.size) return fail('檔案尚未上傳完成', 'ERR_INCOMPLETE');
        var fF = materialFind(db, upF.flowId); if (!fF) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        var fid = 'mockmat_' + rand(12); mem.matFiles = mem.matFiles || {}; mem.matFiles[fid] = { b64: joinChunksB64(upF.chunks), mime: upF.mime, name: upF.name };
        fF.driveFileId = fid; fF.fileName = upF.name; fF.fileSize = upF.size; fF.deliverSource = 'zip'; materialStore(db, fF); delete mem.matUploads[req.uploadId]; saveDb();
        return ok({ flow: materialPublic(db, fF) });
      }
      case 'material_file_get': {
        var fG = materialFind(db, req.flowId); if (!fG) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        var file = fG.driveFileId && (mem.matFiles || {})[fG.driveFileId];
        if (!file) return fail('示範模式的教材檔只保留在本次瀏覽，請重新上傳', 'ERR_NOT_FOUND');
        var buf = typeof Buffer !== 'undefined' ? Buffer.from(file.b64, 'base64') : null, total = buf ? buf.length : b64Bytes(file.b64);
        var o0 = Math.max(0, Number(req.offset) || 0), len = Math.min(M.getMaxBytes, Number(req.length) || M.getMaxBytes, Math.max(0, total - o0));
        var part = buf ? buf.slice(o0, o0 + len).toString('base64') : (o0 === 0 && len === total ? file.b64 : btoa(atob(file.b64).slice(o0, o0 + len)));
        return ok({ name: file.name, mime: file.mime, size: total, offset: o0, length: len, base64: part, done: o0 + len >= total });
      }
      case 'material_mark_delivered': {
        var fD = materialFind(db, req.flowId); if (!fD) return fail('找不到該教材流程', 'ERR_NOT_FOUND');
        if (fD.state !== 'ordered') return fail('需為已下單待交付才可交付', 'ERR_MATERIAL_STATE', fD.state);
        if (!fD.driveFileId) return fail('請先上傳教材檔', 'ERR_VALIDATION');
        var mode = req.deliverTextMode === 'push' ? 'push' : 'copy', pubD = materialPublic(db, fD);
        var tx = s.renderTemplate(String(req.text || '').trim() ? String(req.text) : M.texts.deliver, s.materialVars({ callName: pubD.callName, material: fD.material, fileName: fD.fileName }));
        var unzip = req.unzipCard !== false, dcard = req.deliverCard === true, imgs = [];
        if (mode === 'push') { [[unzip, req.unzipImageId], [dcard, req.deliverImageId]].forEach(function (x) { if (!x[0] || !x[1]) return; var im = noticeImageById(db, x[1]); if (!im) throw err('找不到該通知圖卡', 'ERR_NOT_FOUND'); imgs.push(im.url); }); }
        if (req.preview === true) return ok({ preview: true, text: tx, images: imgs });
        if (req.lineFileSent !== true) return fail('請先在 LINE 傳送 ZIP 檔並勾選確認', 'ERR_LINE_FILE_NOT_SENT');
        var pushed = null;
        if (mode === 'push') {
          var lbD = lineBindingOf(db, fD.rosterKey);
          if (!lineConfigured(db) || !lbD.bound || lbD.blocked) return fail('學姐 LINE 無法送達，可改用複製手動貼上', 'ERR_VALIDATION');
          var msgsD = [{ type: 'text', text: tx }].concat(imgs.map(function (u) { return { type: 'image', originalContentUrl: u, previewImageUrl: u }; }));
          var rD = pushRaw(db, 'main', db.line.bindings[fD.rosterKey].userId, msgsD, 'mat.deliver.' + fD.flowId);
          pushed = { ok: !!rD.ok, error: rD.error || '' };
          if (rD.ok && !rD.duplicate) quotaAccount(db, 'notify', 1);
          chatLogAppend(db, [{ key: fD.rosterKey, dir: 'out', kind: 'materialDeliver', text: tx, img: imgs[0] || '', ok: !!rD.ok, err: rD.error || '' }]);
          notifyLogAppend(db, { source: 'material', title: '教材交付通知', template: '教材交付通知', body: tx, imageUrl: imgs[0] || '', sent: rD.ok ? [{ name: pubD.name }] : [], failed: rD.ok ? [] : [{ name: pubD.name, error: rD.error }], skipped: [] });
          if (!rD.ok) { saveDb(); return fail('交付文字推播失敗：' + rD.error, 'ERR_LINE_API'); }
        }
        fD.state = 'delivered'; fD.deliveredAt = tpeStamp(new Date()); fD.lineFileSent = true; fD.deliverTextMode = mode; fD.unzipCard = unzip; fD.deliverCard = dcard;
        materialStore(db, fD); saveDb();
        return ok({ flow: materialPublic(db, fD), pushed: pushed, text: tx });
      }
      case 'audit_list': return ok(auditListMock(db, req));
      case 'supp_list': suppSeedMock(db); saveDb(); return ok(suppListMock(db));
      case 'supp_resolve': suppSeedMock(db); return suppResolveMock(db, req);
      case 'supp_text_get': return ok(suppTextsMock(db));
      case 'supp_text_save': { var sk = req.kind === 'no' ? 'no' : 'add', stx = String(req.text == null ? '' : req.text).replace(/\r\n?/g, '\n'); if (stx.length > S().SUPP.maxText) return fail('回覆文字不可超過 ' + S().SUPP.maxText + ' 字', 'ERR_VALIDATION'); var spt = suppDb(db); spt.text = spt.text || {}; if (stx.trim() && stx !== S().SUPP.texts[sk]) spt.text[sk] = stx; else delete spt.text[sk]; saveDb(); return ok(suppTextsMock(db)); }
      case 'version_check': { db.snapVer = db.snapVer || { e: rand(6), n: 0 }; var vv = {}; ['list', 'watch', 'roster', 'progress', 'prep', 'report', 'notifyLog', 'material', 'line', 'student'].forEach(function (g) { vv[g] = db.snapVer.e + '.' + db.snapVer.n; }); return ok({ epoch: db.snapVer.e, versions: vv, at: tpeStamp(new Date()) }); }
      case 'pdf_regenerate': { var idsR = Array.isArray(req.receiptIds) ? req.receiptIds : []; if (!idsR.length || idsR.length > 20) return fail('一次可重新產生 1–20 份', 'ERR_VALIDATION'); return ok({ rows: idsR.map(function (id) { var hitR = db.index.filter(function (x) { return x.receiptId === id; })[0]; return hitR ? { receiptId: id, ready: true, trashedOld: true } : { receiptId: String(id), ready: false, error: '找不到該份作業' }; }) }); }
      case 'snapshot_rebuild': { db.snapVer = { e: rand(6), n: 0 }; saveDb(); var vr = {}; ['list', 'watch', 'roster', 'progress', 'prep', 'report', 'notifyLog', 'material', 'line', 'student'].forEach(function (g) { vr[g] = db.snapVer.e + '.0'; }); return ok({ rebuilt: true, versions: vr }); }
      case 'bootstrap': {
        var wl = watchListData(db), rl = reportListMock(db, { days: 60 }), bd = prepBoardMock(db, {});
        var listRows = db.index.slice().sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; });
        return ok({ version: 'mock', at: tpeStamp(new Date()), list: { rows: listRows, total: listRows.length }, watch: { rows: wl.rows, summary: wl.summary }, quota: lineQuotaStatusData(db),
          reports: { today: rl.today, latest: rl.rows.slice(0, 5) }, roster: { count: db.roster.count, updatedAt: db.roster.updatedAt, rows: rosterRows(db) }, materials: { summary: materialSummary(db) },
          prep: { stats: bd.stats, today: bd.today }, adminLine: { configured: adminLineConfigured(db) }, supp: { pending: (suppSeedMock(db), suppDb(db).rows.filter(function (x) { return x.status === S().SUPP.status.open; }).length) } });
      }
      default: return null;
    }
  }
  function adminSettingsPublic(db) {
    ensure32(db);
    var st = db.lineAdmin.settings, cfgd = adminLineConfigured(db);
    return { configured: cfgd, channelId: st ? st.channelId : ADMIN_LINE.channelId, secretTail: st ? String(st.channelSecret).slice(-4) : '', updatedAt: st ? st.updatedAt : '', oaId: ADMIN_LINE.oaId, defaultChannelId: ADMIN_LINE.channelId,
      verified: cfgd, bot: cfgd ? { userId: 'Umockadminbot', basicId: ADMIN_LINE.oaId, displayName: '天使助教（示範）' } : null, quota: cfgd ? { limit: db.lineAdmin.limit, used: db.lineAdmin.used, remaining: Math.max(0, db.lineAdmin.limit - db.lineAdmin.used) } : null,
      webhookQuery: '?ch=admin', fallbackToMain: !cfgd };
  }
  /** 既有 action 的 3.2 參數別名（text → bodyOverride／body） */
  function pre32(req) {
    if (req.action === 'notify_assign' && req.text != null && req.bodyOverride == null) req.bodyOverride = req.text;
    if (req.action === 'supplement_create' && req.text != null && req.body == null) req.body = req.text;
  }
  /** 既有 action 成功後的 3.2 補充：saveAsTemplate */
  /** 3.2.1 操作紀錄（同 Code.gs AUDIT_ACTIONS／auditSummary：只記數量、ID、類別；userId 與 Email 只記末四碼）；登入識別＝token 衍生 */
  var AUDIT_ACTIONS = ['notify_assign', 'notify_manual_mark', 'deadline_remind', 'remind_text_save', 'line_push', 'notify_push', 'line_push_direct', 'supplement_create', 'material_notify', 'material_mark_delivered', 'automation_test',
    'delete_submission', 'progress_remove', 'watch_update', 'template_delete', 'notice_image_delete', 'notify_log_delete', 'automation_recipient_remove', 'material_lib_delete', 'undo_delete',
    'line_settings_save', 'line_admin_settings_save', 'automation_save', 'automation_recipient_add', 'automation_recipient_update', 'prep_settings_save', 'roster_sync', 'counsel_sync', 'material_order_sync',
    'line_bind_manual', 'line_bind_bulk', 'line_unbind', 'set_status', 'pdf_regenerate', 'material_mark_ordered', 'material_unmark', 'material_save', 'material_lib_save', 'material_products_save', 'watch_add', 'template_save', 'material_upload_finish', 'snapshot_rebuild', 'student_sync', 'supp_resolve', 'supp_text_save'];
  function auditSummaryMock(req, data) {
    var o = {}, n = function (a) { return Array.isArray(a) ? a.length : undefined; };
    ['receiptIds', 'members', 'recipients', 'accounts', 'rows', 'points', 'items', 'keys', 'students'].forEach(function (k) { if (n(req[k]) != null) o[k] = n(req[k]); });
    ['receiptId', 'flowId', 'id', 'templateId', 'kind', 'status', 'channel', 'role', 'leadHours', 'remove', 'preview', 'deliverTextMode', 'userId'].forEach(function (k) { if (req[k] != null && typeof req[k] !== 'object') { var v = String(req[k]); o[k] = /^U[0-9a-f]{32}$/i.test(v) || v.indexOf('@') >= 0 ? '…' + v.slice(-4) : v.slice(0, 40); } });
    if (req.key || req.rosterKey) o.key = String(req.key || req.rosterKey).slice(0, 16);
    if (req.channelId) o.channelId = String(req.channelId).slice(-4);
    if (data && typeof data === 'object') { if (Array.isArray(data.sent)) o.sent = data.sent.length; else if (typeof data.sent === 'number') o.sent = data.sent; if (Array.isArray(data.failed)) o.failed = data.failed.length; if (data.undoToken) o.undo = 1; }
    return JSON.stringify(o).slice(0, 400);
  }
  function auditAppendMock(req, res) {
    if (!req || !req.token || AUDIT_ACTIONS.indexOf(String(req.action)) < 0 || req.preview === true || req.dryRun === true) return;
    if (!res || (res.code === 'ERR_AUTH')) return;
    try {
      var db = loadDb(); db.audit = db.audit || [];
      db.audit.push({ at: tpeStamp(new Date()), sid: ('s' + String(req.token).replace(/[^A-Za-z0-9]/g, '')).slice(-16), action: String(req.action), summary: auditSummaryMock(req, res.ok ? res.data : null), result: res.ok ? 'ok' : String(res.code || 'fail').slice(0, 40) });
      if (db.audit.length > 2000) db.audit = db.audit.slice(-2000);
      saveDb();
    } catch (e) { /* ignore */ }
  }
  function auditListMock(db, req) {
    var size = Math.max(10, Math.min(100, Math.floor(Number(req.pageSize) || 50))), page = Math.max(1, Math.floor(Number(req.page) || 1));
    var act = String(req.act || '').slice(0, 40), q = String(req.q || '').trim().slice(0, 60).toLowerCase(), days = Math.max(0, Math.min(365, Math.floor(Number(req.days) || 0)));
    var since = days ? tpeStamp(new Date(Date.now() - days * 86400000)) : '', acts = {};
    var rows = (db.audit || []).filter(function (r) { acts[r.action] = 1; if (act && r.action !== act) return false; if (since && r.at < since) return false; if (q && (r.sid + ' ' + r.summary + ' ' + r.result + ' ' + r.at).toLowerCase().indexOf(q) < 0) return false; return true; }).slice().reverse();
    var total = rows.length, pages = Math.max(1, Math.ceil(total / size)); if (page > pages) page = pages;
    return { rows: rows.slice((page - 1) * size, page * size), total: total, page: page, pageSize: size, pages: pages, actions: Object.keys(acts).sort(), tab: '操作紀錄' };
  }
  function post32(req, res) {
    auditAppendMock(req, res);
    if (!res || !res.ok || !res.data || res.data.preview) return res;
    if ((req.action === 'notify_assign' || req.action === 'supplement_create') && req.saveAsTemplate && typeof req.saveAsTemplate === 'object') {
      var db = loadDb(), s = S(), body = String(req.action === 'notify_assign' ? req.bodyOverride || '' : req.body || '');
      var nt = s.normalizeTemplate({ name: req.saveAsTemplate.name, body: body });
      if (nt.ok && db.templates.length < s.NOTIFY.maxTemplates) {
        var t = nt.template; t.id = 't' + tpeDate(new Date()).date.replace(/\./g, '') + '-' + rand(5); t.updatedAt = tpeStamp(new Date()); t.kind = req.action === 'supplement_create' ? 'supplement' : 'notify';
        db.templates.push(t); saveDb(); res.data.savedTemplate = { id: t.id, name: t.name };
      } else res.data.savedTemplate = null;
    }
    return res;
  }

  /* ---------------- actions ---------------- */
  /** 示範資料集：預設為 3.0（3 份新架構＋1 份 2.x 舊格式）；CONSULT_CONFIG.mockSeedSet='legacy' 時為 2.x 三份（測試相容用） */
  function seedSet() {
    var all = root.CONSULT_MOCK_SEED || [];
    var which = ((root.CONSULT_CONFIG || {}).mockSeedSet) || '';
    if (which === 'legacy' && all.legacySet) return all.legacySet;
    return all;
  }
  /** 3.0 示範：依答案的資料清單為勾「有」的項目建立模擬子資料夾並放入示範檔案數（seed.drive.counts） */
  function seedDrive(db, sd) {
    if (!sd.drive || !isV3(sd.answers)) return;
    var s3 = S3(), a = s3.normalizeAnswers3(sd.answers), acc = deepGet(a, 'student.account');
    var h = keyHash(progressKeyOf(acc)), base = 'mockdrive_' + String(acc).replace(/[^A-Za-z0-9]/g, '') + '_';
    var rec = { rootFolderId: base + 'root', rootUrl: 'https://drive.google.com/drive/folders/' + base + 'root', rootName: s3.rootFolderName(deepGet(a, 'student.name')), folders: {}, counts: {}, ownerEmail: sd.drive.ownerEmail || '', name: deepGet(a, 'student.name'), at: tpeStamp(new Date()) };
    s3.folderPlan(a).forEach(function (f) { if (f.create) rec.folders[f.itemId] = base + f.itemId; });
    var toolIds = {}; if (s3.isV31(a)) s3.uploadToolItems31(a).forEach(function (t) { toolIds['tool:' + t.label] = t.id; });   // 3.2：示範計數可用「tool:工具名稱」指定行銷與體驗工具資料夾
    Object.keys(sd.drive.counts || {}).forEach(function (itemId0) { var itemId = toolIds[itemId0] || itemId0; var fid = rec.folders[itemId]; if (!fid) return; var v = sd.drive.counts[itemId0]; var n = typeof v === 'number' ? v : (v.count || 0); rec.counts[fid] = { count: n, shortcuts: typeof v === 'object' ? (v.shortcuts || 0) : 0, updated: tpeStamp(new Date(Date.now() - 2 * 86400000)) }; });
    db.drive[h] = rec;
  }
  function seedIfNeeded() {
    var db = loadDb();
    if (db.seeded) return mem.seeding || Promise.resolve();   // 3.2.1：示範資料仍在建立中時，後到的請求也等同一條鏈（避免只讀到部分示範作業）
    db.seeded = true;
    var seeds = seedSet();
    var chain = Promise.resolve();
    mem.seeding = seedChain(db, seeds, chain).then(function () { mem.seeding = null; }, function (e) { mem.seeding = null; throw e; });
    return mem.seeding;
  }
  function seedChain(db, seeds, chain) {
    seeds.forEach(function (sd, i) {
      chain = chain.then(function () {
        var when = new Date(Date.now() - (seeds.length - i) * 86400000 * 4);   // 16／12／8／4 天前（近 7 天已完成 1 位）
        var startedAt = sd.durationMin != null ? tpeStamp(new Date(when.getTime() - sd.durationMin * 60000)) : '';
        seedDrive(db, sd);
        return internalSubmit(sd.answers, sd.files || [], when, startedAt, true).then(function (r) { return renderPdfFor(db, r.receiptId).then(function () { return r; }); }).then(function (r) {
          if (sd.status) db.submissions[r.receiptId].index.status = sd.status;
          var acc = deepGet(sd.answers, 'student.account');
          var pk = progressKeyOf(acc);
          db.progress[pk] = { account: acc, name: deepGet(sd.answers, 'student.name'), role: isV3(sd.answers) ? deepGet(sd.answers, 'mainWork.name') : ((S().roleById(deepGet(sd.answers, 'role.id')) || {}).label || ''), startedAt: startedAt, lastSeen: r.submittedAtFull, status: '已送出', receiptId: r.receiptId, submittedAt: r.submittedAtFull, key: pk, percent: 100, activeMin: Math.round((sd.durationMin || 0) * 0.4) };
        });
      });
    });
    return chain.then(function () {
      // 示範名冊與已開始未送出的學員
      (seeds.roster || []).forEach(function (row) { rosterPut(db, row); });
      db.roster.updatedAt = db.roster.count ? tpeStamp(new Date()) : '';
      ensureDefaultTemplate(db);
      // 示範批次「11 月優先諮詢」（成員為示範名冊；以 Email 為鍵）與一位已綁定 LINE 的學姐
      if (seeds.batch) {
        var sb = S().normalizeBatch({ id: seeds.batch.id, title: seeds.batch.title, deadline: seeds.batch.deadline, hint: seeds.batch.hint,
          members: (seeds.batch.members || []).map(function (acc) { var k = S().rosterKey(acc); return { key: keyHash(k), name: db.roster.entries[k] || acc, masked: db.roster.masked[k] || S().maskKey(k) }; }) });
        if (sb.ok) {
          var nowS = tpeStamp(new Date());
          sb.batch.createdAt = tpeStamp(new Date(Date.now() - 20 * 86400000)); sb.batch.updatedAt = nowS; sb.batch.notify = {};
          db.batches[sb.batch.id] = sb.batch; db.batchOrder.push(sb.batch.id);
          // 示範作業屬於示範名單：索引列補上名單與準時（與正式送出時寫入的欄位一致）
          var memberKeys = {}; sb.batch.members.forEach(function (m) { memberKeys[m.key] = 1; });
          db.index.forEach(function (ix) {
            if (!memberKeys[keyHash(progressKeyOf(ix.account))]) return;
            ix.batchId = sb.batch.id; ix.onTime = S().isOnTime(ix.submittedAt, sb.batch.deadline);
            if (db.submissions[ix.receiptId]) { db.submissions[ix.receiptId].index.batchId = ix.batchId; db.submissions[ix.receiptId].index.onTime = ix.onTime; }
          });
        }
        (seeds.batch.lineBound || []).forEach(function (acc) { db.line.bindings[keyHash(S().rosterKey(acc))] = { userId: 'U' + keyHash(acc) + keyHash(acc + '.line'), boundAt: tpeStamp(new Date(Date.now() - 3 * 86400000)), blocked: false, by: 'code', name: '' }; });
        // 手動綁定示範：LINE 個人資料名稱（db.line.profiles）與非好友（db.line.notFriends）
        db.line.profiles = {}; db.line.profiles['U' + keyHash('grace_lin88') + keyHash('grace_lin88.line')] = 'Grace 雅庭';
        db.line.notFriends = [];
      }
      seedWatch(db, seeds);   // 3.1：追蹤名單（含舊批次遷移）、管理收件人
      // 3.0 示範補件需求（seeds.supplement：{ account, items, due }）：對該帳號最新作業建立一筆「未開始」需求
      if (seeds.supplement) {
        var s3x = S3(), ixS = db.index.filter(function (ix) { return progressKeyOf(ix.account) === progressKeyOf(seeds.supplement.account); }).sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; })[0];
        var subX = ixS && db.submissions[ixS.receiptId];
        if (subX && isV3(subX.data.raw)) {
          var nX = s3x.normalizeSupplementItems(seeds.supplement.items, s3x.normalizeAnswers3(subX.data.raw));
          if (nX.ok) {
            var sidX = 's' + tpeDate(new Date()).date.replace(/\./g, '') + '-DEMO1', linkX = s3x.supplementLink(ixS.receiptId, sidX, suppToken(ixS.receiptId, sidX));
            var rX = { id: sidX, receiptId: ixS.receiptId, createdAt: tpeStamp(new Date(Date.now() - 86400000)), due: seeds.supplement.due || '', items: nX.items, link: linkX, notice: '', pushed: null, finishedAt: '' };
            rX.items.forEach(function (it) { if (it.needFolder && it.folderId) it.needFolder = false; });
            rX.notice = s3x.renderSupplementNotice(s3x.SUPPLEMENT.defaultNotice, rX, { '稱呼': S().callName(ixS.name), '補件連結': linkX, '補件期限': rX.due || null });
            db.supplements[ixS.receiptId] = [rX];
            subX.index.status = s3x.STATUS_SUPPLEMENT.open;
          }
        }
      }
      (seeds.progress || []).forEach(function (p) {
        var now = Date.now();
        var pk2 = progressKeyOf(p.account);
        var legacyRole = !!S().roleById(p.role);
        var secs = legacyRole ? S().sectionsForRole(p.role, S().emptyAnswers()).filter(function (x) { return x.id !== 'student' && x.id !== 'role'; }) : S3().sectionsFor3(S3().emptyAnswers3()).filter(function (x) { return x.id !== 'student'; });
        var total = secs.length + 3, at = 3;
        secs.forEach(function (x, j) { if (x.id === p.sectionId) at = j + 3; });
        var sec = S().sectionById(p.sectionId);
        var secLabel = sec ? sec.label : S3().sectionLabel3(p.sectionId);
        db.progress[pk2] = { account: p.account, name: p.name, role: legacyRole ? S().roleById(p.role).label : String(p.role || ''), startedAt: tpeStamp(new Date(now - p.startedMinAgo * 60000)), lastSeen: tpeStamp(new Date(now - p.lastSeenMinAgo * 60000)), status: '填寫中', receiptId: '', submittedAt: '', key: pk2,
          sectionId: p.sectionId || '', sectionLabel: secLabel || '', sectionIndex: p.sectionId ? at : null, sectionTotal: p.sectionId ? total : null, percent: p.percent == null ? null : p.percent, activeMin: p.activeMin || 0, lastMs: now - p.lastSeenMinAgo * 60000 };
      });
      saveDb();
    });
  }

  /** 名冊寫入一列（帳號與 Email 正規化後皆指向本名；已存在的鍵不覆蓋）；回傳是否有新增 */
  function rosterPut(db, row) {
    var r = S().rosterRow(row);
    if (!r) return false;
    var added = false;
    r.keys.forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(db.roster.entries, k)) { db.roster.entries[k] = r.name; db.roster.masked[k] = S().maskKey(k); added = true; } });
    if (added) db.roster.count++;
    return added;
  }

  /** 3.1 身分核對（同 Code.gs requireIdentity）：名冊已同步時帳號須在名冊且本名相符；回 null 或錯誤（ERR_IDENTITY） */
  function identityCheck(db, account, name) {
    var k = S().rosterKey(account);
    if (!k) return err('請輸入學員帳號', 'ERR_IDENTITY');
    if (!db.roster.count) return null;
    var nm = Object.prototype.hasOwnProperty.call(db.roster.entries, k) ? db.roster.entries[k] : '';
    if (!nm) return err('查無對應帳號，請確認學員帳號與官網註冊的 Email 相同', 'ERR_IDENTITY');
    if (String(name || '').trim() && nm !== String(name).trim()) return err('本名與名冊不符，請確認學員帳號與本名', 'ERR_IDENTITY');
    return null;
  }
  /** startedAt：'yyyy.mm.dd HH:mm:ss'（由填寫進度取得）或 ''；耗時以送出時間計 */
  function internalSubmit(answers, files, when, startedAt, opts31NoAuto) {
    var s = S();
    var db = loadDb();
    var v3 = isV3(answers);
    answers = v3 ? S3().normalizeAnswers3(answers) : s.normalizeAnswers(answers);
    files = s.normalizeFiles(files);
    var v31 = v3 && S3().isV31(answers);
    if (v31) { var idn = identityCheck(db, deepGet(answers, 'student.account'), deepGet(answers, 'student.name')); if (idn) return Promise.reject(idn); }   // 3.1 身分核對
    if (v3) answers = driveMerge(db, answers);
    var driveSt = v3 ? driveStatusFor(db, answers) : null;
    var problem = v3 ? S3().checkSubmission3(answers, files, v31 ? driveSt : undefined) : s.checkSubmission(answers, files.map(function (f) { return { key: f.key, name: f.name, size: f.size, mime: f.mime }; }));
    if (problem) return Promise.reject(issueErr(problem));
    when = when || new Date();
    var d = tpeDate(when);
    var base = safeName(deepGet(answers, 'student.name')) + '_' + d.date;
    var folderName = uniqueFolderName(db, deepGet(answers, 'student.name'), d.date);
    var receiptId = 'CP' + d.date.replace(/\./g, '') + '-' + rand(5);
    var perKey = {};
    var attachments = files.map(function (f) {
      perKey[f.key] = (perKey[f.key] || 0) + 1;
      return { key: f.key, label: s.fileLabelForKey(f.key, answers), originalName: f.name, size: f.size || 0, mime: f.mime || 'application/octet-stream', seq: perKey[f.key], base64: f.base64 || '' };
    });
    attachments.forEach(function (a) {
      a.fileName = base + '_' + safeName(a.label) + (perKey[a.key] > 1 ? '_' + pad2(a.seq) : '') + '.' + (s.extForFile(a.originalName, a.mime) || extOf(a.originalName) || 'bin');
      a.fileId = 'mockfile_' + receiptId + '_' + rand(6);
    });
    var submittedAt = d.date + ' ' + d.time.slice(0, 5);   // 顯示到分鐘（回執、JSON）
    var labeled = buildLabeled(answers, attachments.map(function (a) { var c = Object.assign({}, a); delete c.base64; delete c.seq; return c; }), receiptId, submittedAt, driveSt);
    var work = v3 ? S3().workSummary(answers) : null, doneTxt = v3 ? S3().dataCompleteness(answers, driveSt) : null;
    var jsonName = base + '_作業資料.json', pdfName = base + '_作業內容.pdf';
    var jsonId = 'mockfile_' + receiptId + '_json', pdfId = 'mockfile_' + receiptId + '_pdf';
    var roleId = deepGet(answers, 'role.id');
    var submittedFull = d.date + ' ' + d.time;
    if (startedAt == null) {
      var pkey = progressKeyOf(deepGet(answers, 'student.account'));
      var prog = db.progress[pkey];
      startedAt = prog && prog.status !== '已送出' ? prog.startedAt : '';
      if (prog) { prog.status = '已送出'; prog.receiptId = receiptId; prog.submittedAt = submittedFull; prog.lastSeen = submittedFull; prog.key = pkey; }
    }
    var durationMin = startedAt ? s.durationMinutes(startedAt, submittedFull) : null;
    // 優先批次：依名冊鍵雜湊找可見批次，記錄批次與準時
    var hSub = keyHash(progressKeyOf(deepGet(answers, 'student.account')));
    var bh = watchBriefFor(db, hSub, when.getTime()) || pickBatchFor(db, hSub, when.getTime());   // 3.1 追蹤名單優先
    var batchId = bh ? bh.id : '', onTime = bh ? s.isOnTime(when.getTime(), bh.deadline) : null;
    // 索引列與 GAS 試算表欄位一致（送出時間含秒；不含 folderName；含缺口數、開始時間、填寫耗時、批次、準時）
    var index = {
      receiptId: receiptId, submittedAt: submittedFull, name: deepGet(answers, 'student.name'), account: deepGet(answers, 'student.account'),
      role: v3 ? work.name : ((s.roleById(roleId) || {}).label || roleId), industry: industryLabel(answers), brand: v3 ? S3().brandText3(answers) : s.brandText(answers),
      fileCount: files.length, status: '未讀', folderId: 'mockfolder_' + receiptId, gapCount: v3 ? labeled.gaps.gapCount : s.gapCountOf(labeled.gaps),
      startedAt: startedAt || '', durationMin: durationMin, batchId: batchId, onTime: onTime,
      driveUrl: v3 ? ((labeled.drive && labeled.drive.rootUrl) || '') : '', dataDone: v3 ? doneTxt.text : ''
    };
    // 雲端硬碟結構（示意）：附件依 key 置於子資料夾（path），JSON、雲端連結.txt 置於根層；PDF 由 render_pdf 背景產生
    var fileList = attachments.map(function (a) { return { fileId: a.fileId, name: a.fileName, size: a.size, mime: a.mime, key: a.key, label: a.label, path: s.archiveDirForKey(a.key, answers).join('/') }; });
    var jsonStr = JSON.stringify(labeled, null, 2);
    fileList.push({ fileId: jsonId, name: jsonName, size: byteLen(jsonStr), mime: 'application/json', label: '作業資料 JSON' });
    var linksText = s.archiveLinksText(labeled), linksId = 'mockfile_' + receiptId + '_links';
    if (linksText) fileList.push({ fileId: linksId, name: s.ARCHIVE.linksFile, size: byteLen(linksText), mime: 'text/plain', label: '雲端連結清單' });
    fileList.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    void pdfId; void pdfName;

    db.index.push(index);
    db.submissions[receiptId] = { index: index, data: labeled, files: fileList, folderName: folderName, base: base, pdf: 'pending' };
    var writes = [putFile(jsonId, { name: jsonName, mime: 'application/json', base64: toB64(jsonStr) })];
    if (linksText) writes.push(putFile(linksId, { name: s.ARCHIVE.linksFile, mime: 'text/plain', base64: toB64(linksText) }));
    attachments.forEach(function (a) { writes.push(putFile(a.fileId, { name: a.fileName, mime: a.mime, base64: a.base64 })); });
    if (!opts31NoAuto) { try { automationOnSubmit(db, deepGet(answers, 'student.account'), deepGet(answers, 'student.name'), receiptId, submittedAt, onTime, !!bh); } catch (eA) { /* 不影響送出 */ } }
    return Promise.all(writes).then(function () { saveDb(); return { receiptId: receiptId, submittedAt: submittedAt, submittedAtFull: submittedFull, fileCount: files.length, folderName: folderName, folderId: index.folderId, startedAt: startedAt || '', durationMin: durationMin, batchId: batchId, onTime: onTime, deadline: bh ? bh.deadline : '', pdf: 'pending', driveUrl: index.driveUrl, dataDone: index.dataDone }; });
  }

  /** 示意網址（離線示範無實際資料夾；格式與連線版相同） */
  function mockFolderUrl(folderId) { return 'https://drive.google.com/drive/folders/' + String(folderId || '').replace(/[^\w-]/g, ''); }

  /** 填寫進度檢視（與 Code.gs progressView 相同規則） */
  function progressView(rows, nowMs, includeSubmitted) {
    var s = S(), nowStr = tpeStamp(new Date(nowMs));
    var summary = { active: 0, idle: 0, stalled: 0, submitted: 0 }, out = [];
    rows.forEach(function (r) {
      var submitted = r.status === '已送出';
      var status = s.progressState(r.lastMs != null && !submitted ? r.lastMs : s.timeToMs(r.lastSeen), nowMs, submitted);
      if (submitted) { var sm = s.timeToMs(r.submittedAt || r.lastSeen); if (sm == null || nowMs - sm > s.SESSION.submittedDays * 86400000) return; }
      summary[status]++;
      if (submitted && !includeSubmitted) return;
      out.push({ account: r.account, name: r.name, role: r.role, sectionId: r.sectionId || '', sectionLabel: r.sectionLabel || '', sectionIndex: r.sectionIndex == null ? null : r.sectionIndex, sectionTotal: r.sectionTotal == null ? null : r.sectionTotal, percent: submitted ? 100 : (r.percent == null ? null : r.percent),
        startedAt: r.startedAt, lastSeen: r.lastSeen, elapsedMin: s.durationMinutes(r.startedAt, submitted ? (r.submittedAt || r.lastSeen) : nowStr), activeMin: Math.round(Number(r.activeMin) || 0), status: status, receiptId: r.receiptId || '', submittedAt: r.submittedAt || '',
        memberKey: keyHash(r.key || progressKeyOf(r.account)), detail: r.detail ? (function () { try { return s.pingDetail(JSON.parse(r.detail)); } catch (e) { return null; } })() : null });
    });
    var rank = { active: 0, idle: 1, stalled: 2, submitted: 3 };
    out.sort(function (a, b) { return rank[a.status] - rank[b.status] || (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0); });
    return { rows: out, total: out.length, summary: summary, cached: false, now: nowStr };
  }

  function clientKeyOf(req) { return typeof req.clientKey === 'string' && /^[A-Za-z0-9]{16,64}$/.test(req.clientKey) ? req.clientKey : ''; }
  /** 免 token action 限流（記憶體）：全站每分鐘、同 clientKey 每分鐘；超過回 fail 結果，否則 null */
  function publicRate(ck) {
    var s = S(), m = Math.floor(Date.now() / 60000);
    if (mem.rl.minute.m !== m) mem.rl.minute = { m: m, all: 0, by: {} };
    if (mem.rl.minute.all >= s.ROSTER.publicPerMinute) return fail('查詢人數較多，請稍後再試', 'ERR_RATE_LIMIT');
    if ((mem.rl.minute.by[ck] || 0) >= s.ROSTER.clientPerMinute) return fail('查詢過於頻繁，請稍後再試', 'ERR_RATE_LIMIT');
    mem.rl.minute.all++; mem.rl.minute.by[ck] = (mem.rl.minute.by[ck] || 0) + 1;
    return null;
  }

  /** 3.5.1 示範權限名單（未設定＝校長 b0970111728@gmail.com、助教 grace63188@gmail.com） */
  function mockAdminUsers(db) { return Array.isArray(db.adminUsers) && db.adminUsers.length ? db.adminUsers : [{ email: 'b0970111728@gmail.com', role: 'principal', name: '校長' }, { email: 'grace63188@gmail.com', role: 'assistant', name: '助教' }]; }
  function requireToken(req) {
    var db = loadDb();
    var t = db.tokens[req.token];
    if (!req.token || !t || t < Date.now() || t - Date.now() > TOKEN_TTL_REMEMBER) throw err('登入已過期，請重新登入', 'ERR_AUTH');
  }

  function handle(req) {
    return seedIfNeeded().then(function () {
      var db = loadDb();
      var s = S();
      // LINE Webhook 模擬（body 含 destination 與 events）：回傳處理摘要（連線版只回 { ok:true }）
      ensure32(db);
      if (db.seeded && !db.seed32 && ((root.CONSULT_CONFIG || {}).mockSeedSet) !== 'legacy') { seed32(db); saveDb(); }
      if (!req.action && typeof req.destination === 'string' && Array.isArray(req.events) && req.ch === 'admin') { var wa = handleAdminWebhook(db, req); saveDb(); return ok(wa); }   // 3.2 天使助教帳號 Webhook（連線版為 /exec?ch=admin）
      if (!req.action && typeof req.destination === 'string' && Array.isArray(req.events)) { var wh = handleLineWebhook(db, req); saveDb(); return ok(wh); }
      switch (req.action) {
        case 'ping': return ok({ version: 'mock', time: new Date().toISOString() });
        case 'bind_code': {
          var ckB = clientKeyOf(req); if (!ckB) return fail('缺少識別碼', 'ERR_VALIDATION');
          var keyB = String(req.key || '').toLowerCase();
          var lt = mem.lookupTokens[String(req.lookupToken || '')];
          if (!/^[0-9a-f]{16}$/.test(keyB)) return fail('缺少名冊鍵', 'ERR_VALIDATION');
          if (!lt || lt.ck !== ckB || lt.key !== keyB || lt.exp < Date.now()) return fail('查詢憑證已失效，請重新輸入學員帳號', 'ERR_AUTH');
          var rlB = publicRate(ckB); if (rlB) return rlB;
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號', 'ERR_LINE_NOT_CONFIGURED');
          var codeB; do { codeB = newCode(); } while (mem.bindCodes[codeB] || db.line.adminCodes[codeB]);
          var expB = Date.now() + s.LINE.bindCodeMinutes * 60000;
          mem.bindCodes[codeB] = { key: keyB, exp: expB };
          return ok({ code: codeB, bindUrl: s.bindUrl(codeB), text: s.LINE.bindCommand + ' ' + codeB, expiresAt: expB, minutes: s.LINE.bindCodeMinutes });
        }

        case 'submit_begin': {
          var answers0 = req.answers;
          if (!answers0 || typeof answers0 !== 'object' || Array.isArray(answers0)) return fail('作業內容格式錯誤', 'ERR_VALIDATION');
          if (JSON.stringify(answers0).length > s.LIMITS.maxAnswersBytes) return fail('作業內容過大', 'ERR_VALIDATION');
          var v3b = isV3(answers0);
          answers0 = v3b ? S3().normalizeAnswers3(answers0) : s.normalizeAnswers(answers0);
          var files = s.normalizeFiles(Array.isArray(req.files) ? req.files : []);
          var v31b = v3b && S3().isV31(answers0), dst31 = undefined;
          if (v31b) { var idB = identityCheck(db, deepGet(answers0, 'student.account'), deepGet(answers0, 'student.name')); if (idB) return fail(idB.message, idB.code); answers0 = driveMerge(db, answers0); dst31 = driveStatusFor(db, answers0); }
          var problem = v3b ? S3().checkSubmission3(answers0, files, dst31) : s.checkSubmission(answers0, files);
          if (problem) return issueFail(problem);
          // 同一 clientKey 重送：沿用既有回執
          if (req.clientKey) {
            var hitKey = Object.keys(db.pending).filter(function (k) { return db.pending[k].clientKey === req.clientKey; })[0];
            if (hitKey) return ok({ receiptId: hitKey, uploadToken: db.pending[hitKey].uploadToken, folderName: '', resumed: true });
          }
          var rid = 'PENDING-' + rand(8), tok = rand(16);
          db.pending[rid] = { uploadToken: tok, clientKey: req.clientKey || '', answers: answers0, files: files.map(function (f) { return { key: f.key, name: f.name, size: Number(f.size) || 0, mime: f.mime || 'application/octet-stream', chunks: [], received: 0, done: false }; }), createdAt: Date.now() };
          saveDb();
          return ok({ receiptId: rid, uploadToken: tok, folderName: '' });
        }
        case 'upload_status': {
          var ps = db.pending[req.receiptId];
          if (!ps || ps.uploadToken !== req.uploadToken) return fail('找不到進行中的送出', 'ERR_NOT_FOUND');
          return ok({ receiptId: req.receiptId, files: ps.files.map(function (f, i) { return { fileIndex: i, received: f.received, size: f.size, done: !!f.done }; }) });
        }
        case 'upload_chunk': {
          var p = db.pending[req.receiptId];
          if (!p || p.uploadToken !== req.uploadToken) return fail('找不到進行中的送出', 'ERR_NOT_FOUND');
          var f = p.files[req.fileIndex];
          if (!f) return fail('檔案序號不正確', 'ERR_VALIDATION');
          var off = Number(req.offset) || 0, end = Number(req.end) || 0, tot = Number(req.total) || 0;
          if (tot !== f.size) return fail('檔案大小與登記不符：' + f.name, 'ERR_VALIDATION');
          if (end > tot || end < off || off < 0) return fail('分塊範圍不正確', 'ERR_VALIDATION');
          if (f.done) return ok({ fileIndex: req.fileIndex, received: f.received, done: true, duplicate: true });
          if (off !== f.received) {
            if (end <= f.received) return ok({ fileIndex: req.fileIndex, received: f.received, done: !!f.done, duplicate: true });
            return fail('分塊順序錯誤（預期 ' + f.received + '）', 'ERR_CHUNK_ORDER');
          }
          if (b64Bytes(req.data) !== end - off) return fail('分塊長度不符', 'ERR_VALIDATION');
          f.chunks.push(req.data || ''); f.received = end;
          if (f.received === f.size) f.done = true;
          saveDb();
          return ok({ fileIndex: req.fileIndex, received: f.received, done: !!f.done });
        }
        case 'submit_finish': {
          if (db.finished && db.finished[req.receiptId] && db.finished[req.receiptId].token === req.uploadToken) return ok(db.finished[req.receiptId].result);
          var pd = db.pending[req.receiptId];
          if (!pd || pd.uploadToken !== req.uploadToken) return fail('找不到進行中的送出', 'ERR_NOT_FOUND');
          for (var j = 0; j < pd.files.length; j++) if (pd.files[j].received !== pd.files[j].size || !pd.files[j].done) return fail('附件尚未上傳完成：' + pd.files[j].name, 'ERR_INCOMPLETE');
          var finals = pd.files.map(function (f) { return { key: f.key, name: f.name, size: f.size, mime: f.mime, base64: joinChunksB64(f.chunks) }; });
          return internalSubmit(pd.answers, finals).then(function (r) {
            delete r.submittedAtFull;
            delete db.pending[req.receiptId];
            db.finished = db.finished || {};
            db.finished[req.receiptId] = { token: req.uploadToken, result: r, receiptId: r.receiptId };
            saveDb();
            return ok(r);
          }, function (e) { return fail(e.message, e.code, e.detail); });
        }

        case 'submit_status': {
          var fin = db.finished && db.finished[req.receiptId];
          if (fin && fin.token === req.uploadToken) return ok(Object.assign({ done: true }, fin.result));
          var pnd = db.pending[req.receiptId];
          if (pnd && pnd.uploadToken === req.uploadToken) return ok({ done: false, receiptId: req.receiptId });
          return fail('找不到該份作業', 'ERR_NOT_FOUND');
        }
        case 'render_pdf': {
          var rid0 = String(req.receiptId || '');
          var finR = null;
          Object.keys(db.finished || {}).forEach(function (k) { if (db.finished[k].result.receiptId === rid0 && db.finished[k].token === req.uploadToken) finR = db.finished[k]; });
          if (!req.token && !finR) return fail('上傳憑證不符', 'ERR_AUTH');
          if (req.token) { try { requireToken(req); } catch (e) { return fail(e.message, e.code); } }
          if (!db.submissions[rid0]) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          return renderPdfFor(db, rid0).then(ok);
        }
        case 'progress_ping': {
          var ck3 = clientKeyOf(req); if (!ck3) return fail('缺少識別碼', 'ERR_VALIDATION');
          var pf = s.pingFields(req); if (!pf) return fail('進度格式錯誤', 'ERR_VALIDATION');
          var acc3 = String(req.account || '').trim(), nm3 = String(req.name || '').trim().slice(0, 60);
          if (!acc3 || !nm3) return fail('學員帳號與本名為必填', 'ERR_VALIDATION');
          var nowMs3 = Date.now();
          mem.rl.ping = mem.rl.ping || {};
          if (mem.rl.ping[ck3] && nowMs3 - mem.rl.ping[ck3] < s.SESSION.pingMinSec * 1000) return ok({ accepted: false, throttled: true });
          mem.rl.ping[ck3] = nowMs3;
          var rl3 = publicRate(ck3); if (rl3) return rl3;
          var k3 = progressKeyOf(acc3), nowS3 = tpeStamp(new Date(nowMs3));
          var cur3 = db.progress[k3];
          if (cur3 && cur3.status === '已送出') return ok({ accepted: false, submitted: true });
          if (!cur3 || cur3.status === '已移除') cur3 = db.progress[k3] = { account: acc3, name: nm3, role: '', startedAt: nowS3, lastSeen: nowS3, status: '填寫中', receiptId: '', submittedAt: '', key: k3, activeMin: 0, lastMs: null };
          var prevMs = cur3.lastMs != null ? cur3.lastMs : s.timeToMs(cur3.lastSeen);
          cur3.activeMin = s.addActiveMinutes(cur3.activeMin, prevMs, nowMs3);
          cur3.lastMs = nowMs3; cur3.lastSeen = nowS3; cur3.name = nm3; cur3.status = '填寫中';
          cur3.role = roleText(req.role) || cur3.role;
          cur3.sectionId = pf.sectionId; cur3.sectionLabel = pf.sectionLabel; cur3.sectionIndex = pf.sectionIndex; cur3.sectionTotal = pf.sectionTotal; cur3.percent = pf.percent;
          var pd3 = s.pingDetail ? s.pingDetail(req.detail) : null; if (pd3) cur3.detail = JSON.stringify(pd3);   // 3.1.3 填寫明細
          saveDb();
          return ok({ accepted: true, activeMin: cur3.activeMin });
        }
        case 'roster_lookup': {
          var ck = clientKeyOf(req); if (!ck) return fail('缺少識別碼', 'ERR_VALIDATION');
          var q = s.rosterKey(req.q); if (!q) return fail('請輸入學員帳號或 Email', 'ERR_VALIDATION');
          var nowL = Date.now();
          if (mem.rl.locks[ck] && mem.rl.locks[ck] > nowL) return fail('查詢次數過多，請 ' + s.ROSTER.lookupLockMinutes + ' 分鐘後再試', 'ERR_RATE_LIMIT');
          var rlErr = publicRate(ck); if (rlErr) return rlErr;
          if (!db.roster.count) return ok({ found: false, empty: true });
          var nm = Object.prototype.hasOwnProperty.call(db.roster.entries, q) ? db.roster.entries[q] : '';
          if (nm) {
            delete mem.rl.fails[ck];
            var hL = keyHash(q), tokL = 'lt.' + rand(24);
            mem.lookupTokens[tokL] = { ck: ck, key: hL, exp: Date.now() + 30 * 60000 };
            var nowL2 = Date.now(), wL = watchBriefFor(db, hL, nowL2), bL = wL ? null : pickBatchFor(db, hL, nowL2);
            var outL = { found: true, name: nm, key: hL, lookupToken: tokL, lineBound: lineBindingOf(db, hL).bound, batch: wL || (bL ? s.batchBrief(bL, s.batchMember(bL, hL), nowL2) : null) };
            var soL = suppOptsFor(db, hL); if (soL.length) outL.suppOpts = soL;   // 3.2.7 補充請求附加選項
            return ok(outL);
          }
          mem.rl.fails[ck] = (mem.rl.fails[ck] || 0) + 1;
          if (mem.rl.fails[ck] >= s.ROSTER.lookupFailLimit) { mem.rl.locks[ck] = nowL + s.ROSTER.lookupLockMinutes * 60000; delete mem.rl.fails[ck]; }
          return ok({ found: false });
        }
        case 'session_start': {
          var ck2 = clientKeyOf(req); if (!ck2) return fail('缺少識別碼', 'ERR_VALIDATION');
          var acc = String(req.account || '').trim(), nm2 = String(req.name || '').trim().slice(0, 60);
          if (!acc || !nm2) return fail('學員帳號與本名為必填', 'ERR_VALIDATION');
          var rlErr2 = publicRate(ck2); if (rlErr2) return rlErr2;
          var k2 = progressKeyOf(acc), nowS = tpeStamp(new Date());
          var cur = db.progress[k2];
          var roleLabel = roleText(req.role);
          var startedMs = cur ? s.timeToMs(cur.startedAt) : null;
          var fresh = !cur || cur.status === '已送出' || cur.status === '已移除' || startedMs == null || Date.now() - startedMs > s.SESSION.restartAfterDays * 86400000;
          db.progress[k2] = Object.assign(fresh ? { activeMin: 0 } : cur, { account: fresh ? acc : (cur.account || acc), name: nm2, role: roleLabel || (cur ? cur.role : ''), startedAt: fresh ? nowS : cur.startedAt, lastSeen: nowS, lastMs: Date.now(), status: '填寫中', receiptId: fresh ? '' : cur.receiptId, submittedAt: fresh ? '' : cur.submittedAt, key: k2 });
          saveDb();
          var pr = db.progress[k2];
          return ok({ account: pr.account, name: nm2, startedAt: pr.startedAt, lastSeen: nowS, resumed: !fresh, elapsedMin: fresh ? 0 : (s.durationMinutes(pr.startedAt, nowS) || 0) });
        }

        /* ---- 3.0 雲端資料夾（前台、免 token） ---- */
        case 'drive_register': {
          var ckD = clientKeyOf(req); if (!ckD) return fail('缺少識別碼', 'ERR_VALIDATION');
          var rlD = publicRate(ckD); if (rlD) return rlD;
          var s3d = S3(), accD = String(req.account || '').trim(), nmD = String(req.name || '').trim().slice(0, 60);
          if (!accD || !nmD) return fail('學員帳號與本名為必填', 'ERR_VALIDATION');
          var rootD = String(req.rootFolderId || '');
          if (!s3d.DRIVE.idRe.test(rootD)) return fail('資料夾 ID 格式不正確', 'ERR_VALIDATION');
          if (/unshared/.test(rootD)) return fail('資料中心無法讀取此資料夾（尚未共用給 ' + s3d.DRIVE.shareEmail + '）', 'ERR_DRIVE_UNREADABLE');
          var expectD = s3d.rootFolderName(nmD), rootNameD = String(req.rootName || expectD);
          if (rootNameD.indexOf(expectD) !== 0) return fail('資料夾名稱須為「' + expectD + '」', 'ERR_VALIDATION');
          var idD = identityCheck(db, accD, nmD); if (idD) return fail(idD.message, idD.code);   // 3.1：核對失敗不登錄
          var hD = keyHash(progressKeyOf(accD));
          var recD = db.drive[hD] || { folders: {}, counts: {} };
          if (recD.rootFolderId && recD.rootFolderId !== rootD) recD.folders = {};
          var missD = [];
          Object.keys(req.folders && typeof req.folders === 'object' ? req.folders : {}).forEach(function (itemId) {
            if (!/^[A-Za-z0-9_]{1,40}$/.test(itemId)) return;
            var fid = String(req.folders[itemId] || '');
            if (!s3d.DRIVE.idRe.test(fid) || /unshared/.test(fid)) { missD.push(itemId); return; }
            recD.folders[itemId] = fid;
          });
          recD.rootFolderId = rootD; recD.rootUrl = 'https://drive.google.com/drive/folders/' + rootD; recD.rootName = rootNameD; recD.ownerEmail = String(req.ownerEmail || '').trim().toLowerCase().slice(0, 120); recD.name = nmD; recD.at = tpeStamp(new Date());
          db.drive[hD] = recD; saveDb();
          var stD = driveStatusFor(db, { drive: { mode: 'oauth', rootFolderId: rootD, folders: recD.folders } });
          return ok({ ok: true, rootFolderId: rootD, rootUrl: recD.rootUrl, rootName: rootNameD, folders: recD.folders, ownerEmail: recD.ownerEmail, verified: true, missing: missD, status: stD, shareEmail: s3d.DRIVE.shareEmail });
        }
        case 'drive_status': {
          if (req.token) break;   // 後台版於下方（需 token）
          var ckS = clientKeyOf(req); if (!ckS) return fail('缺少識別碼', 'ERR_VALIDATION');
          var rlS = publicRate(ckS); if (rlS) return rlS;
          var accS = String(req.account || '').trim(), nmS = String(req.name || '').trim().slice(0, 60);
          if (!accS || !nmS) return fail('請先完成身分核對（學員帳號與本名）', 'ERR_IDENTITY');   // 3.1：未帶本名不得取得登錄資料
          var idS = identityCheck(db, accS, nmS); if (idS) return fail(idS.message, idS.code);   // 3.1：核對失敗不回任何資料
          var recS = driveRec(db, accS);
          if (recS && recS.name && recS.name !== nmS) recS = null;
          if (!recS) return ok({ registered: false, rootFolderId: '', rootUrl: '', rootName: '', folders: {}, root: { ok: false, reason: '尚未建立' }, readable: false, checkedAt: '', cached: false });
          var stS = driveStatusFor(db, { drive: { mode: 'oauth', rootFolderId: recS.rootFolderId, folders: recS.folders } });
          stS.registered = true; stS.rootFolderId = recS.rootFolderId; stS.rootUrl = recS.rootUrl; stS.rootName = recS.rootName || '';
          return ok(stS);
        }
        /* ---- 3.2 換瀏覽器草稿轉移（前台、免 token：lookupToken＋身分核對；同 Code.gs draftSave／draftRestore） ---- */
        case 'draft_save':
        case 'draft_restore': {
          var ckF = clientKeyOf(req); if (!ckF) return fail('缺少識別碼', 'ERR_VALIDATION');
          var rlF = publicRate(ckF); if (rlF) return rlF;
          var accF = String(req.account || '').trim(), nmF = String(req.name || '').trim().slice(0, 60);
          if (!accF || !nmF) return fail('請先完成身分核對（學員帳號與本名）', 'ERR_IDENTITY');
          var kF = s.rosterKey(accF); if (!kF) return fail('請輸入學員帳號', 'ERR_IDENTITY');
          var hF = keyHash(kF), ltF = mem.lookupTokens[String(req.lookupToken || '')];
          if (!ltF || ltF.ck !== ckF || ltF.key !== hF || ltF.exp < Date.now()) return fail('查詢憑證已失效，請重新輸入學員帳號', 'ERR_AUTH');
          if (!db.roster.count) return fail('名冊尚未同步，無法轉移填寫內容', 'ERR_IDENTITY');
          var idF = identityCheck(db, accF, nmF); if (idF) return fail(idF.message, idF.code);
          var DR = { ttl: 7 * 86400000, max: 300 * 1024 }, nowF = Date.now();
          var tF = function (ms) { return tpeStamp(new Date(ms)); };
          var metaF = function (o) { return { savedAt: new Date(o.savedAt).toISOString(), savedAtMs: o.savedAt, savedAtText: tF(o.savedAt), clientAt: o.clientAt || 0, bytes: o.bytes || 0, expiresAt: new Date(o.savedAt + DR.ttl).toISOString(), expiresAtText: tF(o.savedAt + DR.ttl) }; };
          db.drafts = db.drafts || {};
          var nhF = keyHash('draftname.' + nmF);
          if (req.action === 'draft_save') {
            var dF = req.draft;
            if (!dF || typeof dF !== 'object' || Array.isArray(dF)) return fail('草稿格式錯誤', 'ERR_VALIDATION');
            var bF = JSON.stringify(dF), bytesF = typeof Blob !== 'undefined' ? new Blob([bF]).size : unescape(encodeURIComponent(bF)).length;
            if (bytesF > DR.max) return fail('填寫內容過大（上限 300 KB）', 'ERR_VALIDATION');
            var caF = Number(req.clientAt), clientAtF = isFinite(caF) && caF > 0 && caF <= nowF + 600000 ? Math.floor(caF) : nowF;
            db.drafts[hF] = { v: 1, key: hF, nh: nhF, ck: ckF, savedAt: nowF, clientAt: clientAtF, bytes: bytesF, draft: JSON.parse(bF) };
            saveDb();
            var tokF = 'lt.' + rand(24); mem.lookupTokens[tokF] = { ck: ckF, key: hF, exp: nowF + 30 * 60000 };
            return ok(Object.assign(metaF(db.drafts[hF]), { saved: true, lookupToken: tokF }));
          }
          var recF = db.drafts[hF];
          if (!recF) return ok({ found: false });
          if (nowF - recF.savedAt > DR.ttl) { delete db.drafts[hF]; saveDb(); return ok({ found: false, expired: true }); }
          if (recF.nh !== nhF) return ok({ found: false });
          var outF = Object.assign(metaF(recF), { found: true, sameDevice: recF.ck === ckF, removed: false });
          if (req.peek !== true) outF.draft = JSON.parse(JSON.stringify(recF.draft));
          if (req.remove === true) { delete db.drafts[hF]; saveDb(); outF.removed = true; }
          return ok(outF);
        }
        case 'drive_check_link': {
          var ckL = clientKeyOf(req); if (!ckL) return fail('缺少識別碼', 'ERR_VALIDATION');
          var rlL = publicRate(ckL); if (rlL) return rlL;
          var liL = s.linkIssue(req.url); if (liL) return ok({ ok: false, reason: liL.message, code: liL.code });
          var idL = S3().driveIdFromUrl(req.url);
          if (!idL) return ok({ ok: false, reason: '連結中沒有資料夾或檔案 ID；請貼上「取得連結」複製的網址' });
          if (/private|unshared/.test(idL)) return ok({ ok: false, reason: '資料中心無法讀取；請確認已將此連結共用給 ' + S3().DRIVE.shareEmail + '（可檢視）' });
          return ok(/\/file\/d\//.test(String(req.url)) ? { ok: true, kind: 'file', id: idL, name: '示範檔案' } : { ok: true, kind: 'folder', id: idL, name: '示範資料夾', count: 3 });
        }
        /* ---- 3.0 補件（前台、免 token：帳號＋lookupToken 或連結 k） ---- */
        case 'supplement_get': {
          var auG = suppAuth(db, req); if (auG.fail) return auG.fail;
          var rowsG = [];
          db.index.filter(function (ix) { return progressKeyOf(ix.account) === auG.key; }).sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; }).forEach(function (ix) {
            ((db.supplements || {})[ix.receiptId] || []).forEach(function (r) { if (auG.viaLink && (ix.receiptId !== String(req.receiptId) || r.id !== String(req.requestId))) return; rowsG.push({ receiptId: ix.receiptId, submittedAt: ix.submittedAt, workName: ix.role, request: supplementPublic(r) }); });
          });
          return ok({ rows: rowsG, open: rowsG.filter(function (x) { return x.request.status !== 'done'; }).length, total: rowsG.length });
        }
        case 'supplement_submit': {
          var auS = suppAuth(db, req); if (auS.fail) return auS.fail;
          var s3s = S3(), ridS = String(req.receiptId || ''), sidS = String(req.requestId || '');
          var subS = db.submissions[ridS];
          if (!subS || progressKeyOf(subS.index.account) !== auS.key) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var rS = ((db.supplements || {})[ridS] || []).filter(function (x) { return x.id === sidS; })[0];
          if (!rS) return fail('找不到該補件需求', 'ERR_NOT_FOUND');
          var nowS2 = tpeStamp(new Date()), appliedS = 0, errS = null;
          (Array.isArray(req.items) ? req.items : []).forEach(function (x) {
            if (errS) return;
            var it = rS.items.filter(function (y) { return y.id === String(x && x.id); })[0]; if (!it) return;
            if (it.file && it.file.ret) return;   // 3.3.8 需要回傳檔案的項目只以回傳完成
            var c = s3s.normalizeSupplementContent(x.content); if (!c) return;
            if (c.kind === 'drive' && c.folderId) it.folderId = c.folderId;
            if (c.kind === 'section') {
              // 補填區塊（同 Code.gs）：answersPatch 併入作業答案並重建作業 JSON 與索引欄；儲存只留狀態
              var patchS = c.answersPatch; delete c.answersPatch;
              if (patchS && subS.data.raw && isV3(subS.data.raw)) {
                var resS = s3s.applySupplementPatch(subS.data.raw, it, patchS);
                if (!resS.ok) { errS = fail('補填內容未通過檢查：' + resS.message, 'ERR_VALIDATION'); return; }
                if (resS.changed.length) {
                  var stA = driveStatusFor(db, resS.answers), lbA = buildLabeled(resS.answers, [], ridS, subS.data.meta.submittedAt, stA);
                  if (subS.data.supplements) lbA.supplements = subS.data.supplements;
                  subS.data = lbA;
                  var wkA = s3s.workSummary(resS.answers), dnA = s3s.dataCompleteness(resS.answers, stA);
                  subS.index.role = wkA.name; subS.index.industry = industryLabel(resS.answers); subS.index.brand = s3s.brandText3(resS.answers); subS.index.gapCount = lbA.gaps.gapCount; subS.index.dataDone = dnA.text;
                  var jsonA = JSON.stringify(lbA, null, 2), jf = subS.files.filter(function (f) { return f.label === '作業資料 JSON'; })[0];
                  if (jf) { jf.size = byteLen(jsonA); putFile(jf.fileId, { name: jf.name, mime: 'application/json', base64: toB64(jsonA) }); }
                  appliedS++; c.applied = true; c.changed = resS.changed;
                }
              }
            }
            it.content = c; it.status = 'done'; it.doneAt = nowS2;
          });
          if (errS) return errS;
          var stSub = s3s.supplementStatus(rS.items);
          var finS = stSub === 'done' || (req.finish === true && rS.items.some(function (x) { return x.status === 'done'; }));
          var drvS = false;
          if (finS) {
            rS.finishedAt = nowS2; subS.index.status = s3s.STATUS_SUPPLEMENT.done;
            // 3.2.9 同 Code.gs supplementRefreshDrive：重新讀取雲端資料夾（補件子資料夾併入 drive.folders）→ 重建作業 JSON 與索引欄
            if (subS.data.raw && isV3(subS.data.raw)) {
              var anR = JSON.parse(JSON.stringify(subS.data.raw)); anR.drive = anR.drive || {}; anR.drive.folders = anR.drive.folders || {};
              db.supplements[ridS].forEach(function (q) { (q.items || []).forEach(function (it) { if (it.type === 'data' && it.ref && it.folderId && !anR.drive.folders[it.ref]) anR.drive.folders[it.ref] = it.folderId; }); });
              var stR = driveStatusFor(db, anR), lbR = buildLabeled(anR, [], ridS, subS.data.meta.submittedAt, stR), dnR = s3s.dataCompleteness(anR, stR);
              lbR.supplements = db.supplements[ridS].map(supplementPublic); subS.data = lbR; subS.index.gapCount = lbR.gaps.gapCount; subS.index.dataDone = dnR.text; drvS = true;
              var jsonR = JSON.stringify(lbR, null, 2), jfR = subS.files.filter(function (f) { return f.label === '作業資料 JSON'; })[0];
              if (jfR) { jfR.size = byteLen(jsonR); putFile(jfR.fileId, { name: jfR.name, mime: 'application/json', base64: toB64(jsonR) }); }
            } else subS.data.supplements = db.supplements[ridS].map(supplementPublic);
          }
          if (appliedS || finS) { subS.pdf = 'pending'; subS.files = subS.files.filter(function (f) { return f.label !== '作業內容 PDF'; }); }   // 同 Code.gs：PDF 重新產生
          saveDb();
          return ok({ request: supplementPublic(rS), status: finS ? 'done' : stSub, statusLabel: finS ? s3s.SUPPLEMENT.statuses.done : s3s.SUPPLEMENT.statuses[stSub], finished: finS, driveRefreshed: drvS });
        }

        case 'supp_file_dl': {   // 3.3.8 學姐下載附檔（簽章）
          var pF = S3().suppDlParse(req.t); if (!pF || suppFileSig('sfdl', pF.rid, pF.sid, pF.iid) !== pF.sig) return fail('連結無效', 'ERR_NOT_FOUND');
          var xF = suppItemOf(db, pF.rid, pF.sid, pF.iid); if (!xF.it || !xF.it.file) return fail('此項目沒有附檔', 'ERR_NOT_FOUND');
          if (xF.it.file.kind === 'url') return ok({ url: xF.it.file.url, name: xF.it.file.name, kind: 'url' });
          if (!xF.it.file.dlAt) xF.it.file.dlAt = tpeStamp(new Date()); xF.it.file.dlN = (Number(xF.it.file.dlN) || 0) + 1; saveDb();
          return ok({ url: suppDlUrlMock(xF.it.file.id), name: xF.it.file.name, kind: 'drive' });
        }
        case 'supp_return_dl': {   // 3.3.8 後台下載回傳檔（簽章或 token）
          var xR;
          if (req.t) { var pR = S3().suppDlParse(req.t); if (!pR || suppFileSig('srdl', pR.rid, pR.sid, pR.iid) !== pR.sig) return fail('連結無效', 'ERR_NOT_FOUND'); xR = suppItemOf(db, pR.rid, pR.sid, pR.iid); }
          else { try { requireToken(req); } catch (e) { return fail(e.message, e.code); } xR = suppItemOf(db, req.receiptId, req.requestId, req.itemId); }
          if (!xR.it) return fail('找不到該補件項目', 'ERR_NOT_FOUND');
          if (!xR.it.ret || !xR.it.ret.id) return fail('學姐尚未回傳檔案', 'ERR_NOT_FOUND');
          mem.suppShared = mem.suppShared || {}; mem.suppShared[xR.it.ret.id] = Date.now() + 24 * 3600000;
          return ok({ url: suppDlUrlMock(xR.it.ret.id), name: xR.it.ret.name, size: xR.it.ret.size || 0, sharedUntil: tpeStamp(new Date(Date.now() + 24 * 3600000)) });
        }
        case 'supplement_return_begin': {   // 3.3.8 學姐回傳補件檔
          var auB = suppAuth(db, req); if (auB.fail) return auB.fail;
          var xB = suppRetTarget(db, req, auB, req); if (xB.fail) return xB.fail;
          var cB = suppUpCheck(req); if (cB.fail) return cB.fail;
          var nmRB = S3().suppFileName(String(xB.it.title || '補件') + '_' + String(xB.sub.index.name || '')).slice(0, 100) + '.' + S3().suppFileExt(cB.name);
          var upB = 'sr' + rand(16); mem.suppUploads = mem.suppUploads || {};
          mem.suppUploads[upB] = { rid: String(req.receiptId), sid: String(req.requestId), iid: String(req.itemId), ck: clientKeyOf(req), name: nmRB, size: cB.size, mime: cB.mime, chunks: [], received: 0 };
          return ok({ uploadId: upB, chunkBytes: S3().SUPP_FILE.chunkBytes, name: nmRB });
        }
        case 'supplement_return_chunk': {
          var upC = (mem.suppUploads || {})[String(req.uploadId || '')]; if (!upC || upC.ck !== clientKeyOf(req)) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
          return suppUpChunk(upC, req);
        }
        case 'supplement_return_finish': {
          var auE = suppAuth(db, req); if (auE.fail) return auE.fail;
          var upE = (mem.suppUploads || {})[String(req.uploadId || '')]; if (!upE || upE.ck !== clientKeyOf(req)) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
          if (upE.received !== upE.size) return fail('檔案尚未上傳完成', 'ERR_INCOMPLETE');
          var xE = suppRetTarget(db, { receiptId: upE.rid, requestId: upE.sid, itemId: upE.iid }, auE, req); if (xE.fail) return xE.fail;
          var s3E = S3(), nowE = tpeStamp(new Date()), itE = xE.it, rE = xE.r, oldE = itE.ret || null, fidE = 'mocksr_' + rand(12);
          mem.suppFiles = mem.suppFiles || {}; mem.suppFiles[fidE] = { b64: joinChunksB64(upE.chunks), mime: upE.mime, name: upE.name };
          var dlE = s.parseDeadline(s3E.suppFileDeadline(itE.file));
          itE.ret = { id: fidE, name: upE.name, size: upE.size, mime: upE.mime, at: nowE, n: (oldE && Number(oldE.n) || 0) + 1, review: 'pending' };
          if (dlE != null && Date.now() > dlE) itE.ret.late = true;
          if (oldE && oldE.reason) itE.ret.prevReason = oldE.reason;
          if (oldE && oldE.id) { delete mem.suppFiles[oldE.id]; mem.suppTrashed = (mem.suppTrashed || []).concat([oldE.id]); }
          itE.status = 'done'; itE.doneAt = nowE; itE.content = { kind: 'file', name: upE.name, size: upE.size };
          var stE = s3E.supplementStatus(rE.items), finE = stE === 'done' && !rE.finishedAt;
          if (finE) { rE.finishedAt = nowE; xE.sub.index.status = s3E.STATUS_SUPPLEMENT.done; xE.sub.pdf = 'pending'; }
          xE.sub.data.supplements = db.supplements[upE.rid].map(supplementPublic);
          delete mem.suppUploads[req.uploadId]; saveDb();
          return ok({ request: supplementPublic(rE), status: stE, finished: stE === 'done', replaced: !!(oldE && oldE.id) });
        }

        /* 3.5.1 Email 驗證碼登入（示範：名單內任一 Email 的驗證碼固定 123456；名單＝db.adminUsers 或預設兩位） */
        case 'login_code_send': {
          var emS = String(req.email || '').trim().toLowerCase(), uS = mockAdminUsers(db).filter(function (u) { return u.email === emS; })[0];
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emS)) return fail('請輸入正確的 Email', 'ERR_VALIDATION');
          if (!uS) return fail('此 Email 未在後台權限名單', 'ERR_FORBIDDEN');
          mem.otp = mem.otp || {}; mem.otp[emS] = { code: '123456', exp: Date.now() + 600000 };
          return ok({ sent: true, expiresAt: mem.otp[emS].exp, remaining: 2, masked: emS.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2'), demoCode: '123456' });
        }
        case 'login_code_verify': {
          var emV = String(req.email || '').trim().toLowerCase(), uV = mockAdminUsers(db).filter(function (u) { return u.email === emV; })[0], oV = (mem.otp || {})[emV];
          if (!uV) return fail('此 Email 未在後台權限名單', 'ERR_FORBIDDEN');
          if (!oV || oV.exp < Date.now()) return fail('驗證碼已過期或尚未寄送，請重新寄送', 'ERR_OTP_EXPIRED');
          if (String(req.code || '').replace(/\s+/g, '') !== oV.code) return fail('驗證碼不符，請再試一次', 'ERR_AUTH');
          delete mem.otp[emV];
          var rememberV = req.remember === true || req.remember === 'true' || req.remember === 1, tokenV = 'mock.' + rand(24), nowV = Date.now();
          db.tokens[tokenV] = nowV + (rememberV ? TOKEN_TTL_REMEMBER : TOKEN_TTL); db.tokenUsers = db.tokenUsers || {}; db.tokenUsers[tokenV] = { email: uV.email, role: uV.role }; saveDb();
          return ok({ token: tokenV, expiresAt: db.tokens[tokenV], remember: rememberV, email: uV.email, role: uV.role, name: uV.name || (uV.role === 'assistant' ? '助教' : '校長') });
        }
        case 'login': {
          if (String(req.password || '') !== password()) return fail('密碼錯誤', 'ERR_AUTH');
          var remember = req.remember === true || req.remember === 'true' || req.remember === 1;
          var token = 'mock.' + rand(24);
          var nowMs = Date.now();
          Object.keys(db.tokens).forEach(function (k) { if (db.tokens[k] < nowMs) delete db.tokens[k]; });
          db.tokens[token] = nowMs + (remember ? TOKEN_TTL_REMEMBER : TOKEN_TTL); saveDb();
          return ok({ token: token, expiresAt: db.tokens[token], remember: remember });
        }
      }
      try { requireToken(req); } catch (e) { return fail(e.message, e.code); }
      pre32(req);
      if (!/^(version_check|audit_list|bootstrap|watch_list|list|list_meta|get|report_list|report_preview|prep_board|student_summary|student_detail|material_list|material_lib_list|material_match_pending|material_file_get|line_conversation|chat_log|notify_log|template_list|roster_browse|roster_status|roster_search|automation_get|line_quota_status|progress_list|line_admin_settings_get|line_admin_recent_senders|line_recent_senders|drive_folder_summary|drive_folder_files|supplement_list|notice_image_list|line_settings_status|line_map_status|bookmarklet_status|remind_text_get|student_history)$/.test(String(req.action))) { db.snapVer = db.snapVer || { e: rand(6), n: 0 }; db.snapVer.n++; }   // 3.2 寫入遞增版本號（同 gas snapBump）
      var r32 = handle32(db, req);   // 3.2 新增與改版 action
      if (r32) return r32;
      switch (req.action) {
        case 'admin_users_get': { var meG = (db.tokenUsers || {})[req.token] || null; return ok({ users: mockAdminUsers(db).map(function (u) { return { email: u.email, role: u.role, roleLabel: u.role === 'assistant' ? '助教' : '校長', name: u.name || '', at: u.at || '' }; }), me: meG, roles: { principal: '校長', assistant: '助教' }, max: 50 }); }
        case 'admin_users_save': {
          var meU = (db.tokenUsers || {})[req.token] || null;
          if (!meU) return fail('請以校長 Email 登入後再修改權限名單', 'ERR_FORBIDDEN');
          if (meU.role !== 'principal') return fail('只有校長可以修改權限名單', 'ERR_FORBIDDEN');
          var seenU = {}, outU = [];
          (Array.isArray(req.users) ? req.users : []).forEach(function (u) { var e = String(u && u.email || '').trim().toLowerCase(); if (!e || seenU[e]) return; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw Object.assign(new Error('Email 格式不正確：' + e), { code: 'ERR_VALIDATION' }); seenU[e] = 1; outU.push({ email: e, role: u.role === 'assistant' ? 'assistant' : 'principal', name: String(u.name || '').slice(0, 40), at: u.at || tpeStamp(new Date()) }); });
          if (!outU.length) return fail('權限名單不可為空', 'ERR_VALIDATION');
          if (!outU.some(function (u) { return u.role === 'principal'; })) return fail('名單至少要有一位校長', 'ERR_VALIDATION');
          if (!seenU[meU.email]) return fail('不可把目前登入的 Email 移出名單', 'ERR_VALIDATION');
          db.adminUsers = outU; saveDb();
          return ok({ users: outU.map(function (u) { return { email: u.email, role: u.role, roleLabel: u.role === 'assistant' ? '助教' : '校長', name: u.name, at: u.at }; }), saved: outU.length });
        }
        case 'roster_sync': {
          if (!Array.isArray(req.rows)) return fail('名冊格式錯誤', 'ERR_VALIDATION');
          if (req.rows.length > s.ROSTER.maxRows) return fail('名冊超過上限 ' + s.ROSTER.maxRows + ' 筆', 'ERR_VALIDATION');
          var entries = {}, masked = {}, cnt = 0, skipped = 0, dups = 0;
          req.rows.forEach(function (row) {
            var rr = s.rosterRow(row); if (!rr) { skipped++; return; }
            var added = false;
            rr.keys.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(entries, k)) { dups++; return; } entries[k] = rr.name; masked[k] = s.maskKey(k); added = true; });
            if (added) cnt++;
          });
          db.roster = { entries: entries, masked: masked, count: cnt, updatedAt: tpeStamp(new Date()) };
          saveDb();
          return ok({ count: cnt, keys: Object.keys(entries).length, skipped: skipped, duplicates: dups, shards: 1, updatedAt: db.roster.updatedAt });
        }
        case 'roster_search': {
          var qS = s.halfWidth(req.q == null ? '' : req.q).replace(/\s+/g, '').toLowerCase();
          if (!qS) return fail('請輸入要搜尋的名字', 'ERR_VALIDATION');
          var idxS = activeBatchIndex(db);
          var hits = rosterRows(db).filter(function (r) { return s.rosterNameHit(r.name, qS); })
            .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : (a.masked < b.masked ? -1 : 1); })
            .map(function (r) { return { key: r.key, name: r.name, masked: r.masked, batches: idxS[r.key] || [] }; });
          return ok({ rows: hits.slice(0, 30), total: hits.length, truncated: hits.length > 30 });
        }
        case 'roster_match': {
          var txt = String(req.text == null ? '' : req.text);
          if (!txt.trim()) return fail('請貼上要辨識的文字', 'ERR_VALIDATION');
          if (txt.length > s.ROSTER_MATCH.maxTextLength) return fail('文字過長（上限 ' + s.ROSTER_MATCH.maxTextLength + ' 字）', 'ERR_VALIDATION');
          var entM = rosterRows(db);
          if (!entM.length) return ok({ groups: [], empty: true });
          var idxM = activeBatchIndex(db);
          var rM = s.matchRosterText(txt, entM);
          return ok({ groups: rM.groups.map(function (g) { return { token: g.token, total: g.total, matches: g.matches.map(function (e) { return { key: e.key, name: e.name, masked: e.masked, batches: idxM[e.key] || [] }; }) }; }), empty: false });
        }
        case 'batch_list': {
          var nowBL = Date.now();
          var rowsBL = db.batchOrder.map(function (id) { return db.batches[id]; }).filter(function (b) { return b && (!b.archived || req.includeArchived); })
            .map(function (b) { var dl = s.parseDeadline(b.deadline); return { id: b.id, title: b.title, deadline: b.deadline, deadlineText: s.formatDeadline(b.deadline), hint: b.hint, count: b.members.length, archived: !!b.archived, createdAt: b.createdAt, updatedAt: b.updatedAt, overdue: dl != null && nowBL > dl }; });
          rowsBL.sort(function (a, b) { return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0; });
          return ok({ rows: rowsBL, total: rowsBL.length });
        }
        case 'batch_save': {
          var nb = s.normalizeBatch(req);
          if (!nb.ok) return fail(nb.message, 'ERR_VALIDATION');
          var bb = nb.batch, oldB = bb.id ? db.batches[bb.id] : null;
          if (bb.id && !oldB) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
          var nowBS = tpeStamp(new Date());
          if (!bb.id) bb.id = 'b' + tpeDate(new Date()).date.replace(/\./g, '') + '-' + rand(5);
          bb.createdAt = oldB ? oldB.createdAt : nowBS; bb.updatedAt = nowBS; bb.notify = oldB ? oldB.notify : {};
          db.batches[bb.id] = bb; if (db.batchOrder.indexOf(bb.id) < 0) db.batchOrder.push(bb.id);
          saveDb();
          return ok(batchPublic(bb));
        }
        case 'batch_archive': {
          var ba = db.batches[String(req.id || '')];
          if (!ba) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
          ba.archived = req.archived !== false; ba.updatedAt = tpeStamp(new Date()); saveDb();
          return ok({ id: ba.id, archived: ba.archived });
        }
        case 'batch_status': {
          var bs = db.batches[String(req.id || '')];
          if (!bs) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
          return ok(batchStatusData(db, bs));
        }
        case 'template_list':
          ensureDefaultTemplate(db);
          db.templates.forEach(function (t) { if (String(t.body || '').indexOf('{綁定連結}') >= 0) { var sb = s.stripBindLine(t.body); if (sb.trim()) t.body = sb; } if (s.NOTIFY.ackMarker && String(t.body || '').indexOf(s.NOTIFY.ackMarker) < 0) t.body = String(t.body || '').replace(/\s+$/, '') + '\n\n' + s.NOTIFY.ackFooter; });   // 2.6.1 一次性遷移；3.1 範本結尾請學姐回覆「確認」（與 Code.gs 相同）
          return ok({ rows: db.templates.map(function (t) { return { id: t.id, name: t.name, body: t.body, updatedAt: t.updatedAt, vars: s.templateVars(t.body), kind: t.kind === 'supplement' ? 'supplement' : 'notify' }; }), total: db.templates.length, vars: s.NOTIFY.vars.slice() });
        case 'template_save': {
          var nt = s.normalizeTemplate(req);
          if (!nt.ok) return fail(nt.message, 'ERR_VALIDATION');
          var tt = nt.template, oldT = tt.id ? templateById(db, tt.id) : null;
          if (tt.id && !oldT) return fail('找不到該範本', 'ERR_NOT_FOUND');
          if (!tt.id) { if (db.templates.length >= s.NOTIFY.maxTemplates) return fail('範本最多 ' + s.NOTIFY.maxTemplates + ' 份', 'ERR_VALIDATION'); tt.id = 't' + tpeDate(new Date()).date.replace(/\./g, '') + '-' + rand(5); }
          tt.updatedAt = tpeStamp(new Date());
          var kindT = req.kind === 'supplement' ? 'supplement' : (oldT && oldT.kind) || 'notify';
          if (oldT) { oldT.name = tt.name; oldT.body = tt.body; oldT.updatedAt = tt.updatedAt; oldT.kind = kindT; } else { tt.kind = kindT; db.templates.push(tt); }
          saveDb();
          return ok({ id: tt.id, name: tt.name, body: tt.body, updatedAt: tt.updatedAt, vars: s.templateVars(tt.body), kind: kindT });
        }
        case 'template_delete': {
          var tid = String(req.id || '');
          if (!templateById(db, tid)) return fail('找不到該範本', 'ERR_NOT_FOUND');
          if (db.templates.length <= 1) return fail('至少保留一份範本', 'ERR_VALIDATION');
          var uT = undoCreate(db, 'template', { template: templateById(db, tid) }, '範本「' + templateById(db, tid).name + '」');
          db.templates = db.templates.filter(function (t) { return t.id !== tid; }); saveDb();
          return ok({ id: tid, deleted: true, undoToken: uT.token, undoExpiresAt: uT.expiresAt });
        }
        case 'message_preview': {
          var bp = db.batches[String(req.batchId || '')]; if (!bp) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
          var tp = templateById(db, String(req.templateId || '')); if (!tp) return fail('找不到該範本', 'ERR_NOT_FOUND');
          var cfg = lineConfigured(db);
          var msgs = pickMembers(bp, req.keys).map(function (m) { var bd = lineBindingOf(db, m.key).bound; var text = renderForMember(db, bp, m, tp, bd, cfg); return { key: m.key, name: m.name, masked: m.masked, callName: m.callName, lineBound: bd, text: text, length: text.length }; });
          saveDb();
          return ok({ batch: { id: bp.id, title: bp.title, deadline: bp.deadline, deadlineText: s.formatDeadline(bp.deadline) }, template: { id: tp.id, name: tp.name }, lineConfigured: cfg, messages: msgs });
        }
        case 'line_settings_save': {
          var cid = String(req.channelId || '').trim(), sec = String(req.channelSecret || '').trim();
          if (!/^\d{6,20}$/.test(cid)) return fail('Channel ID 須為數字', 'ERR_VALIDATION');
          if (!/^[A-Za-z0-9]{16,128}$/.test(sec)) return fail('Channel secret 格式不正確', 'ERR_VALIDATION');
          db.line.settings = { channelId: cid, channelSecret: sec, updatedAt: tpeStamp(new Date()) }; saveDb();
          return ok({ configured: true, channelId: cid, secretTail: sec.slice(-4), updatedAt: db.line.settings.updatedAt, oaId: s.LINE.oaId, verified: true });
        }
        case 'line_settings_status': {
          var st = db.line.settings;
          return ok({ configured: lineConfigured(db), channelId: st ? st.channelId : s.LINE.channelId, secretTail: st ? st.channelSecret.slice(-4) : '', updatedAt: st ? st.updatedAt : '', oaId: s.LINE.oaId, monthlyQuota: quotaCfgOf(db).mainLimit, quotaCfg: quotaCfgPublicMock(db), chatAccountId: db.line.chatAccount || '',
            quota: lineConfigured(db) ? lineQuotaNow(db) : null });
        }
        case 'line_push': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          var bq = db.batches[String(req.batchId || '')]; if (!bq) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
          var tq = templateById(db, String(req.templateId || '')); if (!tq) return fail('找不到該範本', 'ERR_NOT_FOUND');
          var quota = lineQuotaNow(db);
          var msgsQ = [], skippedQ = [];
          pickMembers(bq, req.keys).forEach(function (m) {
            var lbq = lineBindingOf(db, m.key);
            if (!lbq.bound) { skippedQ.push({ key: m.key, name: m.name, masked: m.masked, reason: '未對應 LINE' }); return; }
            if (lbq.blocked) { skippedQ.push({ key: m.key, name: m.name, masked: m.masked, reason: '已封鎖官方帳號' }); return; }
            var text = renderForMember(db, bq, m, tq, true, false);
            msgsQ.push({ key: m.key, name: m.name, masked: m.masked, callName: m.callName, lineBound: true, text: text, length: text.length, tooLong: text.length > s.LINE.maxTextLength });
          });
          var binfo = { id: bq.id, title: bq.title, deadline: bq.deadline, deadlineText: s.formatDeadline(bq.deadline) }, tinfo = { id: tq.id, name: tq.name };
          if (req.dryRun) return ok({ dryRun: true, batch: binfo, template: tinfo, quota: quota, toSend: msgsQ.length, messages: msgsQ, skipped: skippedQ });
          if (!msgsQ.length) return fail('沒有可推播的成員（皆未綁定 LINE）', 'ERR_VALIDATION');
          if (!s.lineQuotaSend(quota, msgsQ.length).enough) return fail('本月 LINE 剩餘則數 ' + quota.remaining + ' 則，不足以發送 ' + msgsQ.length + ' 則', 'ERR_LINE_QUOTA');
          var runId = String(req.runId || '').trim().slice(0, 40) || tpeStamp(new Date()).slice(0, 13).replace(/[. :]/g, '');
          var outQ = pushMessages(db, msgsQ, function (m) { return 'rk.' + bq.id + '.' + tq.id + '.' + m.key + '.' + runId; });
          bq.notify = bq.notify || {};
          outQ.records.forEach(function (r) { bq.notify[r.key] = { at: r.at, ok: r.ok, error: r.error }; });
          var logQ = notifyLogAppend(db, { source: 'batch', title: bq.title, template: tq.name, body: tq.body, sent: outQ.sent, failed: outQ.failed, skipped: skippedQ });
          saveDb();
          return ok({ batch: binfo, template: tinfo, runId: runId, sent: outQ.sent, failed: outQ.failed, skipped: skippedQ, logId: logQ, quota: lineQuotaNow(db) });
        }
        case 'line_bind_manual': {
          var hM = String(req.key || '').toLowerCase();
          if (!/^[0-9a-f]{16}$/.test(hM)) return fail('成員鍵格式不正確', 'ERR_VALIDATION');
          var rowM = notifyRow(db, hM, memberIndex(db));
          if (!rowM) return fail('名冊與關注名單中找不到該學姐', 'ERR_NOT_FOUND');
          var pM = s.parseLineChat(req.chatUrl != null && req.chatUrl !== '' ? req.chatUrl : req.userId);
          if (!pM) return fail('無法從網址解析 LINE 使用者；請貼上官方帳號聊天室的完整網址', 'ERR_VALIDATION');
          var ownerM = Object.keys(db.line.bindings).filter(function (h) { return db.line.bindings[h] && db.line.bindings[h].userId === pM.userId && h !== hM; })[0];
          if (ownerM) { var ownRow = notifyRow(db, ownerM, memberIndex(db)); return fail('此 LINE 已對應其他學姐' + (ownRow && ownRow.name ? '（' + ownRow.name + '）' : '') + '；請先於該學姐處解除綁定', 'ERR_CONFLICT'); }
          var prM = lineProfile(db, pM.userId);
          if (prM.notFriend) return fail(LINE_NOT_FRIEND_MSG, 'ERR_LINE_NOT_FRIEND');
          var nmM = prM.ok ? prM.displayName : null, acM = pM.accountId || db.line.chatAccount || '';
          var outM = { key: hM, name: rowM.name, userIdTail: pM.userId.slice(-4), displayName: nmM, accountId: acM, preview: !!req.preview, bound: false, by: 'admin', chatUrl: s.lineChatUrl(acM, pM.userId) };
          if (req.preview) return ok(outM);
          if (pM.accountId && !db.line.chatAccount) db.line.chatAccount = pM.accountId;
          db.line.bindings[hM] = { userId: pM.userId, boundAt: tpeStamp(new Date()), blocked: false, by: 'admin', name: nmM || '' };
          saveDb();
          outM.bound = true; outM.boundAt = db.line.bindings[hM].boundAt;
          return ok(outM);
        }
        case 'line_unbind': {
          var hU = String(req.key || '').toLowerCase();
          if (!/^[0-9a-f]{16}$/.test(hU)) return fail('成員鍵格式不正確', 'ERR_VALIDATION');
          var had = !!db.line.bindings[hU]; delete db.line.bindings[hU]; saveDb();
          return ok({ key: hU, bound: false, removed: had });
        }
        case 'notify_recipients': {
          var kindR = String(req.kind || 'keys'), keysR = [], midxR = memberIndex(db);
          var finishR = function () {
            var seenR = {}, rowsR = [];
            keysR.forEach(function (h) { if (seenR[h] || rowsR.length >= s.NOTIFY.maxRecipients) return; seenR[h] = 1; var r = notifyRow(db, h, midxR); if (r) rowsR.push(r); });
            return ok({ rows: rowsR, total: rowsR.length });
          };
          if (kindR === 'keys') keysR = (Array.isArray(req.keys) ? req.keys : []).map(function (k) { return String(k).toLowerCase(); }).filter(function (k) { return /^[0-9a-f]{16}$/.test(k); });
          else if (kindR === 'bound') keysR = Object.keys(db.line.bindings).filter(function (h) { var e = db.line.bindings[h]; return e && e.userId && !e.blocked; });
          else if (kindR === 'batch') { var bR = db.batches[String(req.batchId || '')]; if (!bR) return fail('找不到該關注名單', 'ERR_NOT_FOUND'); keysR = bR.members.map(function (m) { return m.key; }); }
          else if (kindR === 'batchOpen') {
            var bO = db.batches[String(req.batchId || '')]; if (!bO) return fail('找不到該關注名單', 'ERR_NOT_FOUND');
            keysR = batchStatusData(db, bO).members.filter(function (m) { return m.state !== 'submitted'; }).map(function (m) { return m.key; });
          } else if (kindR === 'stalled') {
            keysR = progressView(Object.keys(db.progress).map(function (k) { return db.progress[k]; }).filter(function (p) { return p.status !== '已移除'; }), Date.now(), false).rows
              .filter(function (r) { return r.status === 'stalled'; }).map(function (r) { return keyHash(progressKeyOf(r.account)); });
          } else return fail('篩選類別不正確', 'ERR_VALIDATION');
          return finishR();
        }
        case 'notify_preview': {
          var nP = notifyBuild(db, req); if (nP.error) return fail(nP.error, nP.code);
          var cfgP = lineConfigured(db);
          var resP = { template: nP.template, lineConfigured: cfgP, messages: nP.recips.map(function (r) { return notifyMsg(r, notifyText(db, nP.body, r, cfgP)); }), missing: nP.missing };
          saveDb();
          return ok(resP);
        }
        case 'line_push_direct':
        case 'notify_push': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          var reqN = req.action === 'line_push_direct' ? Object.assign({}, req, { bodyOverride: req.body, templateId: '' }) : req;
          var nN = notifyBuild(db, reqN); if (nN.error) return fail(nN.error, nN.code);
          var quotaN = lineQuotaNow(db);
          var msgsN = [], skippedN = [];
          nN.recips.forEach(function (r) {
            if (!r.lineBound) { skippedN.push({ key: r.key, name: r.name, masked: r.masked, reason: '未對應 LINE' }); return; }
            if (r.lineBlocked) { skippedN.push({ key: r.key, name: r.name, masked: r.masked, reason: '已封鎖官方帳號' }); return; }
            msgsN.push(notifyMsg(r, notifyText(db, nN.body, r, false)));
          });
          var titleN = nN.template ? (nN.overridden ? nN.template.name + '（本次修改）' : nN.template.name) : '自訂內容';
          if (req.dryRun) return ok({ dryRun: true, template: nN.template, title: titleN, quota: quotaN, toSend: msgsN.length, messages: msgsN, skipped: skippedN });
          if (!msgsN.length) return fail('沒有可推播的收件人（皆未綁定 LINE）', 'ERR_VALIDATION');
          if (!s.lineQuotaSend(quotaN, msgsN.length).enough) return fail('本月 LINE 剩餘則數 ' + quotaN.remaining + ' 則，不足以發送 ' + msgsN.length + ' 則', 'ERR_LINE_QUOTA');
          var runN = String(req.runId || '').trim().slice(0, 40) || tpeStamp(new Date()).slice(0, 13).replace(/[. :]/g, '');
          var hashN = keyHash(nN.body).slice(0, 8);
          var outN = pushMessages(db, msgsN, function (m) { return 'notify.' + runN + '.' + hashN + '.' + m.key; });
          var logN = notifyLogAppend(db, { source: 'notify', title: '發送通知', template: titleN, body: nN.body, sent: outN.sent, failed: outN.failed, skipped: skippedN });
          saveDb();
          return ok({ template: nN.template, title: titleN, runId: runN, sent: outN.sent, failed: outN.failed, skipped: skippedN, logId: logN, quota: lineQuotaNow(db) });
        }
        case 'line_map_status': {
          var entS = rosterRows(db).filter(function (e) { return !(db.line.bindings[e.key] && db.line.bindings[e.key].userId); });
          var totS = rosterRows(db).length;
          entS.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
          return ok({ total: totS, bound: totS - entS.length, pending: entS.map(function (e) { return { key: e.key, name: e.name, masked: e.masked }; }), chatAccountId: db.line.chatAccount || '' });
        }
        case 'line_bind_bulk': {
          var itB = Array.isArray(req.items) ? req.items : [];
          if (!itB.length) return fail('沒有要寫入的對應', 'ERR_VALIDATION');
          if (itB.length > 500) return fail('一次最多 500 筆', 'ERR_VALIDATION');
          var inR = {}; rosterRows(db).forEach(function (e) { inR[e.key] = 1; });
          var outB = { bound: 0, skipped: [], invalid: 0 }, seenB = {}, atB = tpeStamp(new Date()), usedB = {};
          Object.keys(db.line.bindings).forEach(function (x) { var e = db.line.bindings[x]; if (e && e.userId) usedB[e.userId] = x; });
          itB.forEach(function (it) {
            var h = String(it && it.key || '').toLowerCase(), u = String(it && it.userId || '');
            if (!/^[0-9a-f]{16}$/.test(h) || !s.LINE.userIdRe.test(u) || !inR[h] || seenB[h]) { outB.invalid++; return; }
            seenB[h] = 1;
            if (db.line.bindings[h] && db.line.bindings[h].userId) { outB.skipped.push({ key: h, reason: '已對應' }); return; }
            if (usedB[u] && usedB[u] !== h) { outB.skipped.push({ key: h, reason: '此 LINE 已對應其他學姐' }); return; }
            usedB[u] = h;
            db.line.bindings[h] = { userId: u, boundAt: atB, blocked: false, by: 'map', name: String(it.label || '').trim().slice(0, 40) };
            outB.bound++;
          });
          var acB = String(req.accountId || '').trim();
          if (acB && /^[A-Za-z0-9@._-]{2,64}$/.test(acB) && !db.line.chatAccount) db.line.chatAccount = acB;
          saveDb();
          return ok(outB);
        }
        case 'notify_log': {
          var limL = Math.min(s.NOTIFY.maxLogs, Number(req.limit) || 50);
          var rowsL = (db.notifyLog || []).slice(0, limL);
          return ok({ rows: rowsL, total: rowsL.length });
        }
        /* ---- 3.1 後台：追蹤名單、名冊發送、通知圖卡、額度、自動追蹤、還原 ---- */
        case 'roster_browse': {
          var entB = rosterRows(db);
          if (!entB.length) return ok({ rows: [], total: 0, page: 1, pageSize: 50, pages: 0, watchCount: watchAll(db).length, empty: true });
          var qB = s.halfWidth(req.q == null ? '' : req.q).replace(/\s+/g, '').toLowerCase();
          if (qB.length > 120) return fail('搜尋字串過長', 'ERR_VALIDATION');
          if (qB && qB.indexOf('@') >= 0) { var hqB = keyHash(s.rosterKey(qB)); entB = entB.filter(function (e) { return e.key === hqB; }); }
          else if (qB) entB = entB.filter(function (e) { return s.rosterNameHit(e.name, qB); });
          var wAllB = {}; watchAll(db).forEach(function (w) { wAllB[w.k] = w; });
          if (req.onlyUnwatched === true) entB = entB.filter(function (e) { return !wAllB[e.key]; });
          entB.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
          var psB = Math.max(1, Math.min(100, Number(req.pageSize) || 50)), totB = entB.length, pagesB = Math.ceil(totB / psB), pgB = Math.max(1, Math.min(pagesB || 1, Number(req.page) || 1));
          var idxB = stateIndexes(db);
          var rowsB = entB.slice((pgB - 1) * psB, pgB * psB).map(function (e) {
            var w = wAllB[e.key], lb = lineBindingOf(db, e.key), st = wState(db, e.key, w, idxB);
            return { key: e.key, name: e.name, masked: e.masked, callName: w ? w.c : s.callName(e.name), inWatch: !!w, deadline: w ? w.d : '', deadlineText: w && w.d ? s.formatDeadline(w.d) : '', state: st.state, submittedAt: st.submittedAt, lineBound: lb.bound, lineBlocked: lb.blocked, chatUrl: lb.bound ? lineChatUrlFor(db, e.key) : '', notified: !!w && s.watchNotified(w.nt), percent: st.percent, toolDone: !!w && w.td === 1, phase: s.workPhase({ inWatch: !!w, notified: !!w && s.watchNotified(w.nt), state: st.state, toolDone: !!w && w.td === 1, matDelivered: !!w && wCycleDone(db, w, st) }), history: rosterHistorySumMock(db, e.key) };
          });
          return ok({ rows: rowsB, total: totB, page: pgB, pageSize: psB, pages: pagesB, watchCount: Object.keys(wAllB).length, empty: false });
        }
        case 'watch_list': return ok(watchListData(db));
        case 'watch_add': {
          var memA; try { memA = watchMembersIn(req); } catch (eA) { return fail(eA.message, eA.code); }
          var nowA = tpeStamp(new Date()), addedA = [], updA = [];
          for (var ia = 0; ia < memA.length; ia++) { var mA = memA[ia]; if (!rosterByHash(db, mA.key)) return fail('名冊中找不到該學姐', 'ERR_NOT_FOUND'); var exA = !!watchLoad(db, mA.key); try { watchUpsert(db, mA.key, { deadline: mA.deadline, callName: mA.callName, by: 'admin' }, nowA); } catch (eU) { return fail(eU.message, eU.code); } (exA ? updA : addedA).push(mA.key); }
          saveDb();
          return ok({ added: addedA, updated: updA, rows: watchListData(db).rows.filter(function (r) { return addedA.indexOf(r.key) >= 0 || updA.indexOf(r.key) >= 0; }) });
        }
        case 'watch_update': {
          var hW = String(req.key || '').toLowerCase(), eW = watchLoad(db, hW);
          if (!eW) return fail('追蹤名單中沒有這位學姐', 'ERR_NOT_FOUND');
          if (req.remove === true) { var uW = undoCreate(db, 'watch', { entry: eW, name: eW.n }, eW.n + ' 自追蹤名單移除'); watchRemove(db, hW); saveDb(); return ok({ removed: true, key: hW, name: eW.n, undoToken: uW.token, undoExpiresAt: uW.expiresAt }); }
          var nowW = tpeStamp(new Date());
          if (req.deadline != null && req.deadline !== '') { try { watchUpsert(db, hW, { deadline: req.deadline }, nowW); } catch (eD) { return fail(eD.message, eD.code); } }
          eW = watchLoad(db, hW);
          if (req.callName != null) eW.c = String(req.callName).trim().slice(0, s.BATCH.maxCallNameLength) || s.callName(eW.n);
          if (typeof req.dataConfirmed === 'boolean') eW.dc = req.dataConfirmed ? 1 : 0;
          if (typeof req.toolDone === 'boolean') { if (req.toolDone && eW.td !== 1) eW.tda = tpeStamp(new Date()); else if (!req.toolDone) eW.tda = ''; eW.td = req.toolDone ? 1 : 0; }
          if (req.note != null) eW.note = String(req.note).trim().slice(0, WATCH.MAX_NOTE);
          eW.updatedAt = nowW; watchStore(db, eW); saveDb();
          return ok({ row: watchRowOut(db, eW, Date.now(), stateIndexes(db)) });
        }
        case 'notify_assign': {
          try { var outNA = notifyAssign(db, req); saveDb(); return ok(outNA); } catch (eNA) { return fail(eNA.message, eNA.code, eNA.detail); }
        }
        case 'notice_image_upload': {
          var nameI = String(req.name || '').trim().slice(0, 80) || '通知圖卡', kindI = ['notice', 'deadline', 'supplement'].indexOf(req.kind) >= 0 ? req.kind : '', atI = tpeStamp(new Date()), recI;
          if (req.url) { var uI = String(req.url); if (!/^https:\/\/[^\s"'<>]+$/.test(uI) || uI.length > 1000) return fail('圖片網址須為 https', 'ERR_VALIDATION'); recI = { id: 'img' + tpeStamp(new Date()).replace(/[^\d]/g, '') + rand(3), name: nameI, kind: kindI, at: atI, url: uI, preview: uI, size: 0, external: true }; }
          else {
            var mimeI = String(req.mime || ''), b64I = String(req.base64 || '');
            if (['image/png', 'image/jpeg'].indexOf(mimeI) < 0) return fail('圖卡須為 PNG 或 JPEG', 'ERR_VALIDATION');
            if (!b64I || b64Bytes(b64I) > WATCH.NOTICE_MAX_BYTES) return fail('圖卡大小上限 3MB', 'ERR_VALIDATION');
            var idI = 'mocknotice_' + rand(10);
            recI = { id: idI, name: nameI, kind: kindI, at: atI, url: 'https://lh3.googleusercontent.com/d/' + idI + '=w1920', preview: 'data:' + mimeI + ';base64,' + b64I, size: b64Bytes(b64I), external: false };
            putFile(idI, { name: safeName(nameI) + (mimeI === 'image/png' ? '.png' : '.jpg'), mime: mimeI, base64: b64I });
          }
          db.noticeImages = db.noticeImages.filter(function (x) { return x.id !== recI.id; }); db.noticeImages.unshift(recI); db.noticeImages = db.noticeImages.slice(0, WATCH.NOTICE_MAX);
          saveDb();
          return ok(recI);
        }
        case 'notice_image_list': return ok({ rows: db.noticeImages, total: db.noticeImages.length });
        case 'notice_image_delete': {
          var recDel = noticeImageById(db, req.id); if (!recDel) return fail('找不到該通知圖卡', 'ERR_NOT_FOUND');
          var uI2 = undoCreate(db, 'noticeImage', { rec: recDel }, '通知圖卡「' + recDel.name + '」');
          db.noticeImages = db.noticeImages.filter(function (x) { return x.id !== recDel.id; }); saveDb();
          return ok({ deleted: true, id: recDel.id, undoToken: uI2.token, undoExpiresAt: uI2.expiresAt });
        }
        case 'line_quota_status': return ok(lineQuotaStatusData(db));
        case 'bookmarklet_status': return ok(bmStatusMock(db));   // 3.3.7 書籤版本
        case 'bookmarklet_seen': {
          var bk = ['roster', 'orders', 'linemap'].indexOf(String(req.kind)) >= 0 ? String(req.kind) : ''; if (!bk) return fail('書籤種類不正確', 'ERR_VALIDATION');
          var bc = s.bookmarkletCheck(req.version), br = req.role === 'assistant' ? 'assistant' : req.role === 'principal' ? 'principal' : '';
          db.bmLast = db.bmLast || {}; db.bmNotified = db.bmNotified || {};
          db.bmLast[bk] = { version: bc.version, at: tpeStamp(new Date()), role: br };
          var bn = 'v' + (bc.version || 'none'), bFirst = bc.outdated && !db.bmNotified[bn], bSent = false;
          if (bFirst) { db.bmNotified[bn] = tpeStamp(new Date()); var bp = adminPush(db, '【書籤更新】\n◆ 偵測到舊版書籤\n・' + (s.BOOKMARKLET.kinds[bk] || '書籤') + '：' + bc.label + '\n・最新版本：v' + bc.latest, 'auto', 'bm.' + (bc.version || 'none'), ''); bSent = (bp && bp.sent) > 0; }
          saveDb();
          var bst = bmStatusMock(db); bst.check = bc; bst.notified = bSent; bst.alreadyNotified = bc.outdated && !bFirst;
          return ok(bst);
        }
        case 'line_quota_cfg_set': {   // 3.3.7 額度設定（備援上限、保留比例）
          if (req.reservePct != null && req.reservePct !== '' && !(Number(req.reservePct) >= 0 && Number(req.reservePct) <= 50)) return fail('保留比例須介於 0–50%', 'ERR_VALIDATION');
          var cq = quotaCfgOf(db), pk = function (k) { return req[k] == null || req[k] === '' ? cq[k] : req[k]; };
          db.quotaCfg = s.lineQuotaCfg({ mainLimit: pk('mainLimit'), adminLimit: pk('adminLimit'), reservePct: req.reservePct == null || req.reservePct === '' ? cq.reserveRatio * 100 : req.reservePct, mainOverage: req.mainOverage == null ? cq.mainOverage : req.mainOverage !== false });
          saveDb();
          return ok({ cfg: quotaCfgPublicMock(db) });
        }
        case 'admin_remind_get': return ok(adminRemindMock(db));   // 3.2.12 內部提醒（與 gas/remind.gs 同形狀；清單為虛構示範資料）
        case 'admin_remind_save': {
          var RM = remindCore(); if (!req.settings || typeof req.settings !== 'object') return fail('缺少設定內容', 'ERR_VALIDATION');
          var prevR = RM.normalize(db.adminRemind), nextR = RM.normalize(req.settings); nextR.updatedAt = tpeStamp(new Date());
          var stR = RM.normState(db.adminRemindState); RM.touchSince(stR, RM.changedKinds(prevR, nextR), Date.now()); db.adminRemindState = stR; db.adminRemind = nextR;
          var cfgR = automationLoad(db); if (cfgR.enabled.submitNotify !== nextR.work.now) { cfgR.enabled.submitNotify = !!nextR.work.now; db.automation = cfgR; }
          saveDb(); return ok(adminRemindMock(db));
        }
        case 'admin_remind_test': {
          var hitR = (automationLoad(db).adminRecipients || []).filter(function (r) { return (r.id || r.userId || r.adminUserId) === req.id || r.userId === req.id || r.adminUserId === req.id; })[0];
          if (!hitR) return fail('只能測試發送給管理收件人', 'ERR_NOT_FOUND');
          return ok({ kind: req.kind || 'work', to: hitR.name || '', ok: true, error: '', channel: 'admin', text: '【測試】示範卡片（離線模擬不發送）' });
        }
        case 'automation_get': return ok(automationPublic(automationLoad(db)));
        case 'automation_save': {
          var AA = s.AUTOMATION, cfgA = automationLoad(db);
          if (req.enabled && typeof req.enabled === 'object') AA.kinds.forEach(function (k) { if (typeof req.enabled[k] === 'boolean') cfgA.enabled[k] = req.enabled[k]; });
          if (req.texts && typeof req.texts === 'object') { var tooLong = ''; Object.keys(cfgA.texts).forEach(function (k) { if (typeof req.texts[k] !== 'string') return; var v = req.texts[k].replace(/\r\n?/g, '\n'); if (v.length > AA.maxTextLength) tooLong = tooLong || k; cfgA.texts[k] = v.trim() ? v : AA.texts[k]; }); if (tooLong) return fail('「' + AA.labels[tooLong] + '」文字不可超過 ' + AA.maxTextLength + ' 字', 'ERR_VALIDATION'); }
          if (req.reportMode && typeof req.reportMode === 'object') { cfgA.reportMode = cfgA.reportMode || {}; s.REPORT.kinds.forEach(function (k) { var v = req.reportMode[k]; if (v === 'line' || v === 'admin') cfgA.reportMode[k] = v; }); }
          if (req.digestHour != null) { var hr = Number(req.digestHour); if (!isFinite(hr) || hr < 0 || hr > 23) return fail('每日摘要時間須為 0–23', 'ERR_VALIDATION'); cfgA.digestHour = Math.floor(hr); }
          automationSaveCfg(db, cfgA); saveDb();
          return ok(automationPublic(cfgA));
        }
        case 'automation_recipient_add': {
          var cfgR = automationLoad(db), uidR = '', keyR = '', pR = null, nameR = String(req.name || '').trim().slice(0, 30);
          if (req.key) return fail('學員不可設為管理收件人', 'ERR_STUDENT_RECIPIENT');   // 3.1.3 個資保護（同 watch.gs）
          if (false) { keyR = String(req.key).toLowerCase(); var bR2 = db.line.bindings[keyR]; if (!bR2 || !bR2.userId) return fail('該學姐尚未對應 LINE', 'ERR_NOT_FOUND'); uidR = bR2.userId; if (!nameR) nameR = (rosterByHash(db, keyR) || {}).name || ''; }
          else { pR = s.parseLineChat(req.chatUrl || req.userId || ''); if (!pR || !pR.userId) return fail('請貼上官方帳號聊天室網址或 LINE userId', 'ERR_VALIDATION'); uidR = pR.userId; }
          if (Object.keys(db.line.bindings).some(function (h) { return db.line.bindings[h] && db.line.bindings[h].userId === uidR; })) return fail('此 LINE 已對應名冊學員，不可設為管理收件人', 'ERR_STUDENT_RECIPIENT');
          if (cfgR.adminRecipients.length >= s.AUTOMATION.maxRecipients) return fail('管理收件人最多 ' + s.AUTOMATION.maxRecipients + ' 位', 'ERR_VALIDATION');
          if (cfgR.adminRecipients.some(function (r) { return r.userId === uidR; })) return fail('此 LINE 已在收件人名單', 'ERR_CONFLICT');
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          var pfR = lineProfile(db, uidR);
          if (pfR.notFriend) return fail(LINE_NOT_FRIEND_MSG, 'ERR_LINE_NOT_FRIEND');
          if (!pfR.ok) return fail('暫時無法向 LINE 確認此帳號可否推播，請稍後再試', 'ERR_LINE_API');
          if (!nameR) nameR = pfR.displayName || '';
          if (pR && pR.accountId && !db.line.chatAccount) db.line.chatAccount = pR.accountId;
          cfgR.adminRecipients.push({ userId: uidR, name: nameR || '管理收件人', key: keyR, at: tpeStamp(new Date()) });
          automationSaveCfg(db, cfgR); saveDb();
          return ok(automationPublic(cfgR));
        }
        case 'line_recent_senders': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          var recU = {}; automationLoad(db).adminRecipients.forEach(function (r) { recU[r.userId] = 1; });
          var rowsU = (db.line.recent || []).map(function (r) { var pf = lineProfile(db, r.u), hk = ''; Object.keys(db.line.bindings).some(function (h) { if (db.line.bindings[h].userId === r.u) { hk = h; return true; } return false; });
            return { userId: r.u, userIdTail: r.u.slice(-4), displayName: pf.ok ? pf.displayName : null, reachable: !!pf.ok, text: r.t || '', at: r.at || '', kind: r.k || 'message', boundKey: hk, boundName: hk ? ((rosterByHash(db, hk) || {}).name || '') : '', isRecipient: !!recU[r.u] }; });
          return ok({ rows: rowsU, bot: { userId: 'Umockbot', basicId: s.LINE.oaId, premiumId: '', displayName: 'G.R.A.C.E（示範）', chatAccountId: db.line.chatAccount || '', chatAccountMatches: db.line.chatAccount === 'Umockbot' } });
        }
        case 'line_followers_sync': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          return ok({ available: false, code: 403, error: '示範模式不提供好友名單' });
        }
        case 'line_followers_match': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          return ok({ available: false, code: 403, error: '示範模式不提供好友名單' });
        }
        case 'line_bind_verify': {
          if (!lineConfigured(db)) return fail('尚未設定 LINE 官方帳號（Channel ID 與 Channel secret）', 'ERR_LINE_NOT_CONFIGURED');
          var outV = { checked: 0, reachable: 0, notFound: [], failed: 0 };
          Object.keys(db.line.bindings).forEach(function (h) { var b = db.line.bindings[h]; if (!b || !b.userId) return; outV.checked++; var pf = lineProfile(db, b.userId); if (pf.ok) outV.reachable++; else if (pf.notFriend) outV.notFound.push({ key: h, name: (rosterByHash(db, h) || {}).name || '', by: b.by || 'code' }); else outV.failed++; });
          return ok(outV);
        }
        case 'automation_recipient_remove': {
          var cfgX = automationLoad(db), uidX = String(req.userId || '');
          var hitX = cfgX.adminRecipients.filter(function (r) { return r.userId === uidX || (uidX.length === 4 && String(r.userId).slice(-4) === uidX); })[0];
          if (!hitX) return fail('找不到該收件人', 'ERR_NOT_FOUND');
          var uX = undoCreate(db, 'autoRecipient', { rec: hitX }, '管理收件人「' + (hitX.name || '') + '」');
          cfgX.adminRecipients = cfgX.adminRecipients.filter(function (r) { return r !== hitX; });
          automationSaveCfg(db, cfgX); saveDb();
          return ok({ removed: true, undoToken: uX.token, undoExpiresAt: uX.expiresAt, config: automationPublic(cfgX) });
        }
        case 'automation_run': { var repA = runAutomation(db, { dry: req.dry === true, forceDigest: req.forceDigest === true }); saveDb(); return ok(repA); }
        case 'undo_delete': { try { var outU = undoDelete(db, req); saveDb(); return ok(outU); } catch (eUD) { return fail(eUD.message, eUD.code); } }
        case 'notify_log_delete': {
          var idNL = String(req.id || ''), entNL = (db.notifyLog || []).filter(function (x) { return x.id === idNL; })[0];
          if (!entNL) return fail('找不到該發送紀錄', 'ERR_NOT_FOUND');
          var uNL = undoCreate(db, 'notifyLog', { id: idNL, entry: entNL }, '發送紀錄 ' + entNL.at);
          db.notifyLog = db.notifyLog.filter(function (x) { return x.id !== idNL; }); saveDb();
          return ok({ deleted: true, id: idNL, undoToken: uNL.token, undoExpiresAt: uNL.expiresAt });
        }
        case 'roster_status':
          return ok({ count: db.roster.count, keys: Object.keys(db.roster.entries).length, shards: db.roster.count ? 1 : 0, updatedAt: db.roster.updatedAt, empty: !db.roster.count });
        /* ---- 3.0 後台：雲端資料夾狀態、補件需求 ---- */
        case 'drive_status': {
          var subD = db.submissions[String(req.receiptId || '')];
          if (!subD) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var rawD = subD.data.raw || {};
          var stA = driveStatusFor(db, rawD);
          var drA = rawD.drive || {};
          stA.registered = !!(drA.rootFolderId || drA.linkUrl); stA.rootFolderId = drA.rootFolderId || ''; stA.rootUrl = drA.rootUrl || drA.linkUrl || ''; stA.rootName = S3().rootFolderName(subD.index.name);
          return ok(stA);
        }
        case 'supplement_create': {
          var s3c = S3(), subC = db.submissions[String(req.receiptId || '')];
          if (!subC) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var ansC = subC.data.raw && isV3(subC.data.raw) ? s3c.normalizeAnswers3(subC.data.raw) : null;
          var normC = s3c.normalizeSupplementItems(req.items, ansC);
          if (!normC.ok) return fail(normC.message, 'ERR_VALIDATION');
          var dueC = String(req.due || '').trim();
          if (dueC && !/^\d{4}\.\d{2}\.\d{2}$/.test(dueC)) return fail('期限格式須為 yyyy.mm.dd', 'ERR_VALIDATION');
          var imgIdC = req.imageId || '';
          if (Array.isArray(req.recipients) && req.recipients.length) { var rcC = req.recipients.filter(function (x) { return x && x.receiptId === req.receiptId; })[0] || req.recipients[0]; if (rcC && rcC.imageId) imgIdC = String(rcC.imageId); }
          var imgC = imgIdC ? noticeImageById(db, imgIdC) : null;
          if (imgIdC && !imgC) return fail('找不到該通知圖卡', 'ERR_NOT_FOUND');
          var fnC = s3c.normalizeSupplementFile(req.file, normC.items.length);   // 3.3.8 附檔（選填）
          if (!fnC.ok) return fail(fnC.message, 'ERR_VALIDATION');
          if (fnC.file) {
            if (fnC.file.kind === 'drive' && (keyHash('sfup.' + fnC.file.id) !== String((req.file && req.file.ref) || '') || !(mem.suppFiles || {})[fnC.file.id])) return fail('附檔尚未上傳完成，請重新上傳', 'ERR_VALIDATION');
            fnC.file.at = tpeStamp(new Date()); var itC = normC.items[fnC.file.item]; delete fnC.file.item; itC.file = fnC.file;
          }
          var ridC = subC.index.receiptId, listC = db.supplements[ridC] = db.supplements[ridC] || [];
          if (listC.length >= s3c.SUPPLEMENT.maxRequestsPerReceipt) return fail('此作業的補件需求已達上限', 'ERR_VALIDATION');
          var sidC = 's' + tpeDate(new Date()).date.replace(/\./g, '') + '-' + rand(5);
          var hC = keyHash(progressKeyOf(subC.index.account)), cnC = s.callName(subC.index.name);
          db.batchOrder.forEach(function (id) { var m = s.batchMember(db.batches[id], hC); if (m && m.callName) cnC = m.callName; });
          var linkC = s3c.supplementLink(ridC, sidC, suppToken(ridC, sidC));
          var rC = { id: sidC, receiptId: ridC, createdAt: tpeStamp(new Date()), due: dueC, items: normC.items, link: linkC, notice: '', pushed: null, finishedAt: '' };
          rC.items.forEach(function (it) { if (it.needFolder && it.folderId) it.needFolder = false; });
          var bodyC = String(req.body == null ? '' : req.body);
          var dvC = db.drive && db.drive[hC]; rC.notice = s3c.renderSupplementNotice(bodyC.trim() ? bodyC : s3c.SUPPLEMENT.defaultNotice, rC, { '稱呼': cnC, '補件連結': linkC, '補件期限': dueC || null, '雲端資料夾': dvC && dvC.rootUrl ? dvC.rootUrl : '' });
          var cfgC = lineConfigured(db);
          if (req.notify === true && cfgC) {
            var lbC = lineBindingOf(db, hC);
            if (lbC.bound && !lbC.blocked) {
              var outC = pushMessages31(db, [{ key: hC, name: subC.index.name, masked: '', callName: cnC, lineBound: true, text: rC.notice, length: rC.notice.length, tooLong: false }], function () { return 'supp.' + ridC + '.' + sidC; }, imgC ? imgC.url : '');
              rC.pushed = { sent: outC.sent.length, failed: outC.failed.length, skipped: 0, at: rC.createdAt, error: outC.failed.length ? outC.failed[0].error : '', withImage: !!imgC };
              outC.records.forEach(function (x) { x.img = imgC ? 1 : 0; }); watchNotifyRecord(db, outC.records, 'supplement', !!imgC);
              chatLogAppend(db, outC.records.map(function (x) { return { key: x.key, dir: 'out', kind: 'supplement', text: rC.notice, img: imgC ? imgC.url : '', ok: x.ok, err: x.error, at: x.at }; }));
              notifyLogAppend(db, { source: 'supplement', title: '補件需求', template: '補件需求' + (root.CONSULT_FLEX ? '（卡片）' : imgC ? '＋圖卡' : ''), note: req.note || '', body: rC.notice, sent: outC.sent, failed: outC.failed, skipped: [] });
            } else rC.pushed = { sent: 0, failed: 0, skipped: 1, at: rC.createdAt, error: lbC.bound ? '已封鎖官方帳號' : 'LINE 無法送達' };
          }
          listC.unshift(rC);
          subC.index.status = s3c.STATUS_SUPPLEMENT.open;
          saveDb();
          return ok({ request: supplementPublic(rC), notice: rC.notice, link: linkC, pushed: rC.pushed, lineConfigured: cfgC, image: imgC ? { id: imgC.id, url: imgC.url } : null });
        }
        case 'supplement_list': {
          var rowsL2 = [];
          if (req.receiptId) rowsL2 = ((db.supplements || {})[String(req.receiptId)] || []).map(supplementPublic);
          else Object.keys(db.supplements || {}).forEach(function (rid) { db.supplements[rid].forEach(function (r) { rowsL2.push(supplementPublic(r)); }); });
          rowsL2.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
          return ok({ rows: rowsL2, total: rowsL2.length });
        }
        case 'supplement_file_begin': {   // 3.3.8 補件附檔上傳（後台）
          if (!db.submissions[String(req.receiptId || '')]) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var cU = suppUpCheck(req); if (cU.fail) return cU.fail;
          var upU = 'sf' + rand(16); mem.suppUploads = mem.suppUploads || {};
          mem.suppUploads[upU] = { admin: true, name: cU.name, size: cU.size, mime: cU.mime, chunks: [], received: 0 };
          return ok({ uploadId: upU, chunkBytes: S3().SUPP_FILE.chunkBytes });
        }
        case 'supplement_file_chunk': {
          var upK = (mem.suppUploads || {})[String(req.uploadId || '')]; if (!upK || !upK.admin) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
          return suppUpChunk(upK, req);
        }
        case 'supplement_file_finish': {
          var upN = (mem.suppUploads || {})[String(req.uploadId || '')]; if (!upN || !upN.admin) return fail('上傳已失效，請重新上傳', 'ERR_NOT_FOUND');
          if (upN.received !== upN.size) return fail('檔案尚未上傳完成', 'ERR_INCOMPLETE');
          var fidN = 'mocksf_' + rand(12); mem.suppFiles = mem.suppFiles || {}; mem.suppFiles[fidN] = { b64: joinChunksB64(upN.chunks), mime: upN.mime, name: upN.name };
          delete mem.suppUploads[req.uploadId];
          return ok({ file: { id: fidN, name: upN.name, size: upN.size, mime: upN.mime, ref: keyHash('sfup.' + fidN) } });
        }
        case 'supplement_review': {   // 3.3.8 審核學姐回傳檔
          var s3V = S3(), resV = String(req.result || ''), rsV = String(req.reason == null ? '' : req.reason).trim();
          if (resV !== 'pass' && resV !== 'reject') return fail('審核結果須為通過或退回', 'ERR_VALIDATION');
          if (resV === 'reject' && !rsV) return fail('請填寫退回原因', 'ERR_VALIDATION');
          if (rsV.length > s3V.SUPP_FILE.maxReasonLength) return fail('退回原因不可超過 ' + s3V.SUPP_FILE.maxReasonLength + ' 字', 'ERR_VALIDATION');
          var subV = db.submissions[String(req.receiptId || '')]; if (!subV) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var xV = suppItemOf(db, req.receiptId, req.requestId, req.itemId); if (!xV.it) return fail('找不到該補件項目', 'ERR_NOT_FOUND');
          if (!xV.it.ret || !xV.it.ret.id) return fail('學姐尚未回傳檔案', 'ERR_NOT_FOUND');
          if (xV.it.ret.review !== 'pending') return fail('此回傳檔已審核（' + (s3V.SUPP_FILE.reviews[xV.it.ret.review] || '') + '）', 'ERR_SUPP_REVIEWED');
          var nowV = tpeStamp(new Date()), pushedV = null;
          xV.it.ret.review = resV; xV.it.ret.reviewAt = nowV;
          if (resV === 'reject') {
            xV.it.ret.reason = rsV; xV.it.status = 'open'; xV.it.doneAt = ''; xV.r.finishedAt = ''; subV.index.status = s3V.STATUS_SUPPLEMENT.open;
            var hV = keyHash(progressKeyOf(subV.index.account)), lbV = lineBindingOf(db, hV);
            if (req.notify !== false && lineConfigured(db) && lbV.bound && !lbV.blocked) {
              var cnV = s.callName(subV.index.name), txV = cnV + '學姐好，補件檔案「' + xV.it.title + '」需要修改後重新回傳。\n原因：' + rsV + '\n補件連結：' + xV.r.link;
              var outV = pushMessages31(db, [{ key: hV, name: subV.index.name, callName: cnV, lineBound: true, text: txV, length: txV.length, tooLong: false }], function () { return 'supprej.' + req.receiptId + '.' + req.itemId + '.' + Date.now(); }, '');
              pushedV = { sent: outV.sent.length, failed: outV.failed.length, skipped: 0, error: '' };
            } else pushedV = { sent: 0, failed: 0, skipped: 1, error: lbV.bound ? '已封鎖官方帳號' : 'LINE 無法送達' };
          } else delete xV.it.ret.reason;
          subV.data.supplements = db.supplements[String(req.receiptId)].map(supplementPublic);
          saveDb();
          return ok({ request: supplementPublic(xV.r), pushed: pushedV });
        }
        case 'list_meta': {
          var mAcc = db.index.map(function (r) { return r.receiptId + ':' + r.fileCount + ':' + r.status; }).join('|');
          var mP = Object.keys(db.progress).map(function (k) { var p = db.progress[k]; return [p.account, p.status, p.sectionId, p.receiptId].join(':'); }).join('|');
          return ok({ total: db.index.length, latest: db.index.reduce(function (m, r) { return String(r.submittedAt) > m ? String(r.submittedAt) : m; }, ''), sig: mAcc, psig: mP });
        }
        case 'report_list': {
          var cfgRL = automationLoad(db), dry = runAutomation(db, { dry: true, forceDigest: true }), since = tpeStamp(new Date(Date.now() - 60 * 86400000)), accRL = quotaMonth(db).byKind;
          var rowsRL = (db.reports || []).filter(function (r) { return r.at >= since; }).slice().reverse();
          return ok({ today: { date: tpeDate(new Date()).date, text: dry.digest ? dry.digest.text : '' }, rows: rowsRL, reportMode: automationPublic(cfgRL).reportMode, used: { digest: accRL.digest || 0, auto: accRL.auto || 0, total: (accRL.digest || 0) + (accRL.auto || 0) }, recipients: cfgRL.adminRecipients.map(function (r) { return r.name || ''; }), keepDays: 60 });
        }
        case 'chat_log': {
          var hCh = String(req.key || '').toLowerCase(); if (!/^[0-9a-f]{16}$/.test(hCh)) return fail('學姐鍵格式不正確', 'ERR_VALIDATION');
          return ok(chatLog(db, hCh));
        }
        case 'progress_remove': {
          var accR = Array.isArray(req.accounts) ? req.accounts : [];
          if (!accR.length || accR.length > 50) return fail('一次可移除 1–50 筆', 'ERR_VALIDATION');
          var keysR = {}; accR.forEach(function (a) { var k = progressKeyOf(String(a || '')); if (k) keysR[k] = 1; });
          var remR = [], progR = [];
          Object.keys(db.progress).forEach(function (k) { var p = db.progress[k], kk = p.key || progressKeyOf(p.account); if (!keysR[kk] || p.status === '已移除') return; progR.push({ k: k, status: p.status }); p.status = '已移除'; remR.push({ account: p.account, name: p.name }); });
          if (!remR.length) return fail('找不到該筆填寫進度', 'ERR_NOT_FOUND');
          var uR = undoCreate(db, 'progress', { prog: progR }, '填寫進度 ' + remR.map(function (x) { return x.name; }).slice(0, 3).join('、'));
          saveDb();
          return ok({ removed: remR, undoToken: uR.token, undoExpiresAt: uR.expiresAt });
        }
        case 'progress_list':
          return ok(progressView(Object.keys(db.progress).map(function (k) { return db.progress[k]; }).filter(function (p) { return p.status !== '已移除'; }), Date.now(), !!req.includeSubmitted));
        case 'delete_submission': {
          var ids = req.receiptIds;
          if (!Array.isArray(ids) || !ids.length || ids.length > s.REMOVAL.maxBatch) return fail('一次可刪除 1–' + s.REMOVAL.maxBatch + ' 份', 'ERR_VALIDATION');
          var deleted = [], failed = [], seenD = {}, progD = [];
          ids.forEach(function (rid) {
            rid = typeof rid === 'string' ? rid : '';
            if (!/^CP\d{8}-[A-Z0-9]{5}$/.test(rid)) { failed.push({ receiptId: String(rid).slice(0, 40), reason: '回執編號格式不正確' }); return; }
            if (seenD[rid]) return; seenD[rid] = 1;
            var sb = db.submissions[rid];
            if (!sb) { failed.push({ receiptId: rid, reason: '索引中無此作業' }); return; }
            db.trash = db.trash || {};
            db.trash[rid] = { sub: sb, trashedAt: Date.now(), supp: (db.supplements || {})[rid] || null };   // 示意：移至垃圾桶（30 天內可復原；undo 10 分鐘）
            delete db.submissions[rid];
            if (db.supplements) delete db.supplements[rid];   // 補件需求一併清除（同 Code.gs）
            db.index = db.index.filter(function (ix) { return ix.receiptId !== rid; });
            var kD = progressKeyOf(sb.index.account);
            Object.keys(db.progress).forEach(function (k) { var pD = db.progress[k]; if (pD.status === '已移除') return; if (pD.receiptId === rid || (!pD.receiptId && (pD.key || progressKeyOf(pD.account)) === kD)) { progD.push({ k: k, status: pD.status }); pD.status = '已移除'; } });   // 3.1.3 同一人未綁回執的進度一併標記
            deleted.push({ receiptId: rid, name: sb.index.name });
          });
          var uD = deleted.length ? undoCreate(db, 'submission', { receiptIds: deleted.map(function (x) { return x.receiptId; }), prog: progD }, '作業 ' + deleted.map(function (x) { return x.name; }).join('、')) : null;
          saveDb();
          return ok({ deleted: deleted, failed: failed, undoToken: uD ? uD.token : '', undoExpiresAt: uD ? uD.expiresAt : '' });
        }
        case 'list': {
          // 舊資料無缺口數欄時回 null（與 GAS 一致），後台改以背景讀取補上
          var rows = db.index.map(function (r) { return Object.assign({ gapCount: null, startedAt: '', durationMin: null, batchId: '', onTime: null }, r, { folderUrl: mockFolderUrl(r.folderId) }); });
          if (req.status) rows = rows.filter(function (r) { return r.status === req.status; });
          var q = String(req.q || '').toLowerCase();
          if (q) rows = rows.filter(function (r) { return [r.name, r.account, r.brand, r.receiptId, r.industry].join(' ').toLowerCase().indexOf(q) >= 0; });
          rows.sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; });
          return ok({ rows: rows, total: rows.length });
        }
        case 'get': {
          var sub = db.submissions[req.receiptId];
          if (!sub) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          var fu = mockFolderUrl(sub.index.folderId);
          return ok({ index: Object.assign({}, sub.index, { folderUrl: fu }), data: sub.data, files: sub.files, gaps: sub.data.gaps, folderUrl: fu, pdf: sub.files.some(function (f) { return f.label === '作業內容 PDF'; }) ? 'ready' : 'pending',
            legacy: !!(sub.data.legacy || (sub.data.raw && !isV3(sub.data.raw))), supplements: ((db.supplements || {})[req.receiptId] || []).map(supplementPublic) });
        }
        case 'set_status': {
          var sb = db.submissions[req.receiptId];
          if (!sb) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          if (!s.STATUSES.some(function (x) { return x.label === req.status; })) return fail('狀態值不正確', 'ERR_VALIDATION');
          sb.index.status = req.status; saveDb();
          return ok({ receiptId: req.receiptId, status: req.status });
        }
        case 'download_file':
          return getFile(req.fileId).then(function (rec) {
            if (!rec) return { ok: false, error: '找不到檔案', code: 'ERR_NOT_FOUND' };
            return { ok: true, data: { name: rec.name, mime: rec.mime, size: b64Bytes(rec.base64), base64: rec.base64 } };
          });
        case 'download_zip': {
          var sz = db.submissions[req.receiptId];
          if (!sz) return fail('找不到該份作業', 'ERR_NOT_FOUND');
          // 離線模式無壓縮函式庫：一律回傳逐檔清單（與 GAS 超量時的回應相同形狀）
          return ok({ zipped: false, name: (sz.folderName || sz.index.receiptId) + '.zip', reason: '離線模擬不產生 zip，改為逐檔下載', files: sz.files.map(function (f) { return { fileId: f.fileId, name: f.name, size: f.size }; }) });
        }
        case 'export_xlsx': {
          // 離線模式以 CSV（UTF-8 BOM）代替 xlsx：各工作表依序輸出，工作表之間以「【工作表名稱】」列分隔；
          // tabs 另附與連線版相同的工作表結構（[{ id, name, rows }]）。mime 與副檔名由此處決定
          var tabs = exportTabs(db);
          var lines = [];
          tabs.forEach(function (t, i) { if (i) lines.push([]); lines.push(['【' + t.name + '】']); t.rows.forEach(function (r) { lines.push(r); }); });
          var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
          var stamp = tpeDate(new Date());
          return ok({ name: '諮詢前置作業_全部回答_' + stamp.date + '_' + stamp.time.slice(0, 5).replace(':', '') + '.csv', mime: 'text/csv;charset=utf-8', base64: toB64(csv), count: db.index.length, tabs: tabs, mock: true });
        }
        default: return fail('不支援的動作：' + req.action, 'ERR_BAD_ACTION');
      }
    }).catch(function (e) { return { ok: false, error: e.message, code: e.code || 'ERR_INTERNAL' }; }).then(function (res) {
      res = post32(req, res);
      if (!res.ok) { var e = new Error(res.error); e.code = res.code; e.name = 'ApiError'; if (res.detail) e.detail = res.detail; throw e; }
      return res.data;
    });
  }

  function reset() {
    mem.db = null; mem.files = {}; mem.rl = { fails: {}, locks: {}, minute: {} }; mem.lookupTokens = {}; mem.bindCodes = {}; mem.seeding = null;
    if (hasLS()) { try { root.localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } }
    if (root.indexedDB) { try { root.indexedDB.deleteDatabase(DB_NAME); } catch (e) { /* ignore */ } }
  }

  /**
   * LINE 對應書籤回傳模擬（離線示範）：names=[{ key, name }] → results=[{ key, candidates:[{ userId, nickname, name, friend }] }]
   * 範例美琪、示範詩涵、範例哲宇、範例美好 → 自動對應；範例冠宇（同名兩位，對話帳號比對其中一位相符）→ 自動對應（依對話帳號確認）；
   * 範例晴禾（管理者名稱不含全名，對話帳號未相符）→ 需要選擇；示範晴禾（非好友）、其他 → 找不到。
   */
  function lineMapSimulate(names) {
    var uid = function (seed) { return 'U' + keyHash(seed) + keyHash(seed + '.x'); };
    var T = {
      '範例美琪': [['範例美琪｜@mei.nails', 'Mei 🌸', true]],
      '示範詩涵': [['示範詩涵@hsh_nail', '詩涵 Hannah', true]],
      '範例哲宇': [['', '範例哲宇', true]],
      '範例美好': [['範例美好｜@meihao', 'meihao', true]],
      '範例冠宇': [['範例冠宇｜@kevin.chen', 'Kevin', true, true], ['冠宇（工程）', '範例冠宇', true, false]],
      '範例晴禾': [['晴禾｜@sunny', 'Sunny', true, false]],
      '示範晴禾': [['示範晴禾', 'QingHe', false]]
    };
    return (names || []).map(function (n) {
      // 第 4 欄：對話帳號比對結果（書籤讀取候選對話後標示；true 相符、false 已讀取未相符）
      var c = (T[n.name] || []).map(function (x, i) { var o = { userId: uid(n.name + '.' + i), nickname: x[0], name: x[1], friend: x[2] }; if (x.length > 3) { o.verified = x[3]; if (x[3]) o.evidence = '對話帳號'; } return o; });
      return { key: n.key, candidates: c };
    });
  }

  return { handle: handle, lineMapSimulate: lineMapSimulate, reset: reset, _progressView: progressView, _internalSubmit: internalSubmit, _buildLabeled: buildLabeled, _computeGaps: computeGaps, _exportTabs: exportTabs, _db: loadDb, _recomputeGapCounts: recomputeGapCounts, _keyHash: keyHash, _bindCodes: function () { return mem.bindCodes; },
    _driveSimulatePut: driveSimulatePut, _suppToken: suppToken, _runAutomation: function (o) { var db = loadDb(); var r = runAutomation(db, o); saveDb(); return r; }, _watchAll: function () { return watchAll(loadDb()); }, _lineQuotaStatus: function () { return lineQuotaStatusData(loadDb()); } };
});
