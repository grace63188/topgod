/* ==========================================================================
 * 工具測試流程 UI 模組（獨立模組；後台 admin 由 build.py 依 TT_JS 標記注入；全域 window.ToolTestUI）
 *   畫面稿：mockups-flow/prep-principal、prep-assistant、material-lock（校長已確認）
 *   ToolTestUI.trackHTML(state)                 流程軌（製作中→待測試→測試結果→可交付）
 *   ToolTestUI.chipHTML(state)                  狀態標記（形狀＋文字＋顏色）
 *   ToolTestUI.footHTML(row, role)              諮詢準備卡片底部（說明＋按鈕；role：'principal'｜'assistant'）
 *   ToolTestUI.cardHTML(row, role)              完整卡片（整合者也可只取 track／foot 嵌入既有卡片）
 *   ToolTestUI.filterBarHTML(counts, active)    狀態篩選列（助教預設「待測試」：defaultFilter('assistant')）
 *   ToolTestUI.flowBarHTML(counts)              狀態比例條
 *   ToolTestUI.filterRows(rows, filter)、countsOf(rows)、merge(prepRows, ttRows)
 *   ToolTestUI.isMaterialSendAllowed(student)   諮詢教材發送判斷：工具已通過才可發送
 *   ToolTestUI.materialSendHTML(student, sentAt) 發送欄（未通過＝鎖定「待助教測試」）
 *   ToolTestUI.bind(root, { call, onChange, onError, role })  按鈕事件委派；call(action, payload) 回 Promise
 * 狀態值：make 製作中、test 待測試、fix 等待校長修改、pass 已通過（＝可交付）
 * 3.2.10 上傳即送測：校長只有「上傳工具／上傳新版」（上傳後直接待測試）；助教「回報問題」（data-tk="report"，由整合者開回饋面板）
 *   諮詢準備依流程三區塊（sectionsHTML）：製作工具｜校長、測試工具｜助教、交付教材｜校長或助教；登入者負責的區塊置頂並展開
 *   每張卡片「目前輪到」＋只有該階段負責人看到主要按鈕（非負責人看到狀態說明）；測試／交付卡片以工具為主，學姐資料收合
 * 3.2.11 三區塊改為頂部三分頁（tabsHTML／panelHTML／defaultTab）：製作工具、測試工具、交付教材；一次只顯示一個分頁的卡片；網址 #/prep/{make|test|deliver}[/{學姐鍵}]
 *   feedbackHTML(fb, I) 回饋內容（類型、說明、截圖連結、時間）；FB_TYPES 問題類型
 * 3.3.0 四分頁：製作工具｜校長、測試工具｜助教、確認金額｜校長、確認下單｜助教（stageKey(row)：工具狀態＋確認金額＋本次教材流程）
 *   六段流程軌 segTrackHTML(stageKey)：製作工具、測試工具、確認金額、確認下單、等待下單、交付教材；已發下單通知者移到「交付教材」頁
 *   卡片按鈕 data-tk：upload、report、price（校長確認金額面板）、order（助教確認下單面板）、reopen（退回確認金額）
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.ToolTestUI = api; if (typeof root.isMaterialSendAllowed !== 'function') root.isMaterialSendAllowed = api.isMaterialSendAllowed; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = '2.0.0';   // 3.3.0 四分頁＋六段流程軌
  var STATES = ['make', 'test', 'fix', 'pass'];
  var LABELS = { make: '製作中', test: '待測試', fix: '等待校長修改', pass: '已通過' };
  var FILTERS = [['all', '全部'], ['make', '製作中'], ['test', '待測試'], ['fix', '等待校長修改'], ['pass', '可交付']];
  var ACTIONS = { mark_done: 'tooltest_mark_done', pass: 'tooltest_pass', needfix: 'tooltest_needfix', undo: 'tooltest_undo' };
  var FB_TYPES = [['needfix', '需要修改'], ['broken', '功能異常'], ['ux', '使用不流暢'], ['other', '其他']];
  var ICON = {
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    external: '<path d="M13.5 4.5h6v6M19.5 4.5 11 13M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10"/>',
    pen: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
    undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    send: '<path d="M20 4 3.5 10.5l7 2.5 2.5 7z"/><path d="m10.5 13 4-4"/>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(n) { return '<svg class="tt-i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON[n] || '') + '</svg>'; }
  function norm(s) { return STATES.indexOf(s) >= 0 ? s : 'make'; }
  /** 學姐物件 → 工具測試狀態（接受 row.tooltest.state／row.toolTest.state／row.tooltestState／row.state） */
  function stateOf(x) {
    if (x == null) return 'make';
    if (typeof x === 'string') return norm(x);
    var t = x.tooltest || x.toolTest;
    if (t && typeof t === 'object') return norm(t.state);
    if (x.tooltestState) return norm(x.tooltestState);
    return norm(x.state);
  }
  function infoOf(x) { var t = x && (x.tooltest || x.toolTest); return t && typeof t === 'object' ? t : (x || {}); }

  /** 諮詢教材發送判斷：工具測試已通過才可發送 */
  function isMaterialSendAllowed(student) { return stateOf(student) === 'pass'; }

  function chipHTML(state, label) {
    var k = norm(state);
    return '<span class="tt-chip ' + k + '"><span class="tt-mk ' + k + '"></span>' + esc(label || LABELS[k]) + '</span>';
  }
  function trackHTML(state) {
    var k = norm(state), cur = { make: 0, test: 1, fix: 2, pass: 3 }[k];
    var labels = ['製作中', '待測試', k === 'fix' ? '等待修改' : '測試結果', '可交付'];
    var lis = labels.map(function (l, i) {
      if (i < cur) return '<li class="done"><span class="nd">' + ic('check') + '</span>' + esc(i === 2 && k === 'pass' ? '已通過' : l) + '</li>';
      if (i === cur) {
        var inner = k === 'fix' ? '<b>!</b>' : k === 'pass' ? ic('check') : '';
        return '<li class="cur ' + k + '" aria-current="step"><span class="nd">' + inner + '</span>' + esc(l) + '</li>';
      }
      return '<li><span class="nd"></span>' + esc(l) + '</li>';
    }).join('');
    return '<ol class="tt-track" aria-label="工具測試流程">' + lis + '</ol>';
  }
  function btn(act, cls, icon, text, key) { return '<button type="button" class="btn ' + cls + ' has-icon tt-btn" data-tt-act="' + act + '" data-tt-key="' + esc(key) + '">' + ic(icon) + esc(text) + '</button>'; }
  /* 3.3.0 開啟工具：HTML → 資料中心可操作網址；網址工具 → 原網址；ZIP → Drive 下載＋解壓縮說明 */
  var ZIP_NOTE = '請下載後解壓縮，開啟 index.html，並使用展示模式測試';
  function openHref(t) { return (t && (t.toolOpenUrl || t.toolUrl)) || ''; }
  function isZip(t) { return !!(t && t.toolOpenKind === 'zip'); }
  function openNote(t) {
    if (isZip(t)) return '<p class="tk-open-note zip" role="note">' + esc(t.toolOpenNote || ZIP_NOTE) + '</p>';
    if (t && t.toolOpenKind === 'html' && t.toolRelRefs && t.toolRelRefs.length) return '<p class="tk-open-note warn" role="note">偵測到相對路徑資源（' + esc(t.toolRelRefs.join('、')) + '），請改為單一 HTML 或打包為 zip</p>';
    return '';
  }
  function openBtn(t) { return openHref(t) ? '<a class="btn btn-secondary has-icon tt-btn" href="' + esc(openHref(t)) + '" target="_blank" rel="noopener">' + ic('external') + (isZip(t) ? '下載工具' : '開啟工具') + '</a>' : ''; }

  /** 卡片底部：說明＋按鈕 */
  function footHTML(row, role) {
    var k = stateOf(row), t = infoOf(row), key = (row && row.key) || t.key || '';
    var sent = t.sentAt ? '<time class="tt-num">' + esc(t.sentAt.slice(0, 16)) + '</time>' : '';
    var res = t.resultAt ? '<time class="tt-num">' + esc(t.resultAt.slice(0, 16)) + '</time>' : '';
    var note, acts;
    var upBtn = function (txt) { return '<button type="button" class="btn btn-primary has-icon tt-btn" data-tk="upload" data-key="' + esc(key) + '">' + ic('send') + esc(txt) + '</button>'; };
    if (role === 'assistant') {
      if (k === 'test') return '<div class="tt-foot"><div class="tt-acts as3">' + openBtn(t) + '<button type="button" class="btn btn-secondary has-icon tt-btn tt-fix" data-tk="report" data-key="' + esc(key) + '">' + ic('pen') + '回報問題</button>' + btn('pass', 'tt-pass', 'check', '通過', key) + '</div></div>';
      if (k === 'pass') return '<div class="tt-foot"><p class="tt-done">' + ic('check') + '已通過，教材可發送</p><div class="tt-acts">' + btn('undo', 'btn-ghost', 'undo', '復原', key) + '</div></div>';
      note = k === 'fix' ? '<b>等待校長修改</b><br>修改完成後回到待測試' : '<b>校長製作中</b><br>完成後送測試';
      return '<div class="tt-foot"><p class="tt-note">' + note + '</p><div class="tt-acts">' + openBtn(t) + '</div></div>';
    }
    if (k === 'make') { note = '上傳後直接送助教測試'; acts = openBtn(t) + upBtn(t.toolUrl ? '上傳新版' : '上傳工具'); }
    else if (k === 'test') { note = '<b>助教測試中</b>' + (sent ? '<br>送測 ' + sent : ''); acts = openBtn(t); }
    else if (k === 'fix') { note = '<b>助教回報問題</b><br>上傳新版後直接回到待測試'; acts = openBtn(t) + upBtn('上傳新版'); }
    else { note = '<b>已通過測試</b><br>' + (res ? res + '　' : '') + '教材可發送'; acts = openBtn(t); }
    return '<div class="tt-foot"><p class="tt-note">' + note + '</p><div class="tt-acts">' + acts + '</div></div>';
  }
  /** 完整卡片（無 Logo 時以留白方塊代替） */
  function cardHTML(row, role) {
    var k = stateOf(row), t = infoOf(row);
    var cls = 'tt-card' + (role === 'assistant' && k === 'test' ? ' focus' : '') + (k === 'fix' ? ' fixing' : '');
    var chip = k === 'pass' && role === 'assistant' ? chipHTML('pass', '已通過') : chipHTML(k, k === 'pass' ? '可交付' : '');
    var facts = '<dl class="tt-facts"><div><dt>諮詢時間</dt><dd><time class="tt-num">' + esc(row.counselText || row.cycleText || '—') + '</time></dd></div>'
      + '<div><dt>專屬工具</dt><dd>' + esc(t.tool || '—') + '</dd></div><div><dt>工具版本</dt><dd><span class="tt-num">' + esc(t.version || '—') + '</span></dd></div></dl>';
    return '<article class="' + cls + '" data-tt-card="' + esc(row.key || '') + '"><div class="tt-top"><div class="tt-id"><h3>' + esc(row.callName || row.name || '') + '</h3>'
      + (row.brand ? '<p class="tt-brand">' + esc(row.brand) + '</p>' : '') + '</div>' + chip + '</div>' + facts + trackHTML(k) + footHTML(row, role) + '</article>';
  }

  function countsOf(rows) {
    var c = { all: 0, make: 0, test: 0, fix: 0, pass: 0 };
    (rows || []).forEach(function (r) { c.all++; c[stateOf(r)]++; });
    return c;
  }
  function defaultFilter(role) { return role === 'assistant' ? 'test' : 'all'; }
  function filterRows(rows, filter) { var f = STATES.indexOf(filter) >= 0 ? filter : 'all'; return (rows || []).filter(function (r) { return f === 'all' || stateOf(r) === f; }); }
  function filterBarHTML(counts, active) {
    counts = counts || {};
    return '<div class="tt-fbar" role="group" aria-label="工具測試狀態篩選">' + FILTERS.map(function (f) {
      var mk = f[0] === 'all' ? '' : '<span class="tt-mk ' + f[0] + '"></span>';
      return '<button type="button" class="tt-fchip" data-tt-filter="' + f[0] + '" aria-pressed="' + (f[0] === (active || 'all')) + '">' + mk + esc(f[1]) + '<span class="n">' + (Number(counts[f[0]]) || 0) + '</span></button>';
    }).join('') + '</div>';
  }
  function flowBarHTML(counts) {
    counts = counts || {};
    var seg = STATES.filter(function (k) { return counts[k] > 0; }).map(function (k) { return '<i class="' + k + '" style="flex:' + counts[k] + '"></i>'; }).join('');
    return '<div class="tt-flowbar" aria-hidden="true">' + seg + '</div>';
  }
  /** 諮詢準備列（prep_board rows）＋tooltest_list rows → 每列帶 tooltest */
  function merge(prepRows, ttRows) {
    var by = {}; (ttRows || []).forEach(function (t) { if (t && t.key) by[t.key] = t; });
    return (prepRows || []).map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.tooltest = by[r.key] || { key: r.key, state: 'make' }; return o; });
  }
  /** 諮詢教材發送欄 */
  function materialSendHTML(student, sentAt) {
    if (sentAt) return '<div class="tt-send"><span class="tt-sent">' + ic('check') + '已發送 <time>' + esc(String(sentAt).slice(0, 10)) + '</time></span></div>';
    if (!isMaterialSendAllowed(student)) return '<div class="tt-send"><button type="button" class="btn tt-locked has-icon" disabled aria-disabled="true">' + ic('lock') + '待助教測試</button><small>工具通過測試後可發送</small></div>';
    return '<div class="tt-send"><button type="button" class="btn btn-primary has-icon" data-tt-send="' + esc((student && student.key) || '') + '">' + ic('send') + '發送教材</button></div>';
  }

  /** 事件委派：按鈕 → call(action, { rosterKey, by, cycle? })；成功 onChange(row, act)；失敗 onError(err, act) */
  function bind(rootEl, opts) {
    opts = opts || {};
    var busy = false;
    function onClick(ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-tt-act]') : null;
      if (!b || busy || !rootEl.contains(b)) return;
      var act = b.getAttribute('data-tt-act'), key = b.getAttribute('data-tt-key'), action = ACTIONS[act];
      if (!action || typeof opts.call !== 'function') return;
      ev.preventDefault();
      busy = true; b.disabled = true; b.setAttribute('aria-busy', 'true');
      var rl = typeof opts.role === 'function' ? opts.role() : opts.role;
      var payload = { rosterKey: key, by: rl === 'assistant' ? 'assistant' : 'principal' };
      if (b.getAttribute('data-tt-proxy') === '1') { payload.by = 'assistant'; payload.proxy = true; }   // 3.3.3 校長代助教操作
      if (typeof opts.extra === 'function') { var x = opts.extra(act, key) || {}; Object.keys(x).forEach(function (k) { payload[k] = x[k]; }); }
      Promise.resolve(opts.call(action, payload)).then(function (res) {
        if (typeof opts.onChange === 'function') opts.onChange(res && res.row ? res.row : res, act);
      }, function (err) { if (typeof opts.onError === 'function') opts.onError(err, act); }).then(function () { busy = false; b.disabled = false; b.removeAttribute('aria-busy'); });
    }
    rootEl.addEventListener('click', onClick);
    return { destroy: function () { rootEl.removeEventListener('click', onClick); } };
  }

  /* ==================================================================== */
  /* 3.2.8 諮詢準備票券卡片（電腦兩欄、手機一欄同一套）；畫面稿 prep-v2（校長已確認）                  */
  /*   select(rows, range, filter, now)：範圍＋狀態篩選＋排序（摘要計數與清單共用）                    */
  /*   view(rows, { range, filter, now }) → { list, counts, ranges, scoped }                             */
  /*   prepCardHTML(row, { role, now, leadHours, icon(id,cls), logoHTML(row) })                          */
  /* ==================================================================== */
  var TPE = 8 * 3600000, WD = ['日', '一', '二', '三', '四', '五', '六'];
  var SUM = [['make', '製作中'], ['test', '待測試'], ['fix', '等待校長修改'], ['pass', '可交付']];
  var RANGES = [['this', '本週'], ['next', '下週'], ['all', '全部']];
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function msOf(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; var m = Date.parse(v); if (!isNaN(m)) return m; var x = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})/.exec(String(v)); return x ? Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5]) - TPE : null; }
  /** 台北時間 yyyy.mm.dd（週）HH:mm */
  function fmtAt(ms) { var t = new Date(ms + TPE); return t.getUTCFullYear() + '.' + p2(t.getUTCMonth() + 1) + '.' + p2(t.getUTCDate()) + '（' + WD[t.getUTCDay()] + '）' + p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()); }
  function fmtDay(s) { var ms = msOf(s); if (ms == null) return String(s || '').slice(0, 10); var t = new Date(ms + TPE); return t.getUTCFullYear() + '.' + p2(t.getUTCMonth() + 1) + '.' + p2(t.getUTCDate()); }
  function span(ms) { var m = Math.round(Math.abs(ms) / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? d + ' 天 ' + h + ' 小時' : h ? h + ' 小時 ' + mm + ' 分' : mm + ' 分'; }
  function weekStart(now) { var t = new Date(now + TPE), wd = (t.getUTCDay() + 6) % 7; return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - TPE - wd * 864e5; }
  function counselMs(r) { return r && r.nextCounsel ? msOf(r.nextCounsel.at) : null; }
  function dueMs(r) { var d = r && r.dueAt ? msOf(r.dueAt) : null; return d; }
  function inRange(r, range, now) {
    if (range !== 'this' && range !== 'next') return true;
    var ms = counselMs(r); if (ms == null) return false;
    var w0 = weekStart(now == null ? Date.now() : now) + (range === 'next' ? 7 * 864e5 : 0);
    return ms >= w0 && ms < w0 + 7 * 864e5;
  }
  /** 範圍＋狀態篩選＋依諮詢時間排序（無預約排最後）；摘要計數與清單共用 */
  function select(rows, range, filter, now) {
    var f = STATES.indexOf(filter) >= 0 ? filter : 'all';
    return (rows || []).filter(function (r) { return inRange(r, range, now) && (f === 'all' || stateOf(r) === f); })
      .sort(function (a, b) { var x = counselMs(a), y = counselMs(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return x - y; });
  }
  function view(rows, o) {
    o = o || {}; var counts = {}, ranges = {};
    SUM.forEach(function (s) { counts[s[0]] = select(rows, o.range, s[0], o.now).length; });
    RANGES.forEach(function (x) { ranges[x[0]] = select(rows, x[0], 'all', o.now).length; });
    var scoped = select(rows, o.range, 'all', o.now);
    counts.all = scoped.length;
    return { list: select(rows, o.range, o.filter, o.now), counts: counts, ranges: ranges, scoped: scoped };
  }
  function hasTool(t) { return !!(t && t.toolUrl); }
  /** 3.3.3 是否已開始製作（舊資料：有工具、定價或已離開製作中者視為已開始） */
  function started(row) { var t = infoOf(row), k = stateOf(row); return !!(t.started || t.startedAt || hasTool(t) || Number(t.priceInitial) > 0 || (k && k !== 'make')); }
  /** 3.3.3 代助教操作標示 */
  function proxyTag() { return '<span class="tk-proxy">代助教操作</span>'; }
  /** 3.3.3 拖放區（製作工具；校長）：拖入檔案或點擊選檔、Ctrl／Cmd＋V 貼上 https 網址 → 上傳面板 */
  function dropHTML(t, key, I) {
    var has = hasTool(t);
    return '<div class="tk-drop2" role="button" tabindex="0" data-tk-drop="' + key + '" aria-label="' + (has ? '拖入新檔即上傳新版（第 ' + verNo(t) + ' 版）' : '上傳工具：拖入檔案、點擊選檔或貼上網址') + '">' + I('upload', 'sm') +
      '<span class="t1">' + (has ? '目前第 ' + verNo(t) + ' 版・拖入新檔即上傳新版' : '尚未上傳工具') + '</span><span class="t2">拖入檔案、點擊選檔，或按 Ctrl／⌘＋V 貼上 https 工具網址</span><span class="t3" aria-hidden="true">放開即可上傳</span></div>';
  }
  function pvTrack(k) {
    var cur = { make: 0, test: 1, fix: 2, pass: 3 }[k], labels = ['製作中', '待測試', k === 'fix' ? '等待校長修改' : '已通過', '可交付'];
    return '<ol class="tk-track" aria-label="流程：' + esc(LABELS[k] === '已通過' ? '可交付' : LABELS[k]) + '">' + labels.map(function (l, i) {
      var c = i < cur ? 'done' : i === cur ? 'cur' + (k === 'fix' ? ' rv' : k === 'pass' ? ' ok' : '') : '';
      return '<li class="' + c + '"' + (i === cur ? ' aria-current="step"' : '') + '><span class="dot"></span>' + esc(l) + '</li>';
    }).join('') + '</ol>';
  }
  function toolRef(t) {
    if (t.toolKind === 'file' && t.toolFileName) return t.toolFileName;
    return String(t.toolUrl || '').replace(/^https:\/\//, '');
  }
  /* 3.3.0 流程四分頁：製作工具｜校長 → 測試工具｜助教 → 確認金額｜校長 → 確認下單｜助教（之後到「交付教材」頁） */
  var STAGES = [
    { id: 'make', title: '製作工具', owner: '校長', roles: ['principal'], states: ['make', 'fix'], desc: '上傳工具並填教材定價，送出後直接送助教測試；助教回報問題時，修改後上傳新版', turn: '校長製作', empty: '目前沒有需要製作的工具', emptyHint: '新學姐與等待校長修改的工具會出現在這裡' },
    { id: 'test', title: '測試工具', owner: '助教', roles: ['assistant'], states: ['test'], desc: '開啟工具實際操作，沒問題按通過，有問題按回報問題', turn: '助教測試', empty: '目前沒有待測試的工具', emptyHint: '校長上傳工具後會出現在這裡' },
    { id: 'price', title: '確認金額', owner: '校長', roles: ['principal'], states: [], desc: '助教測試通過後，天使助教發卡片給校長：確認金額 → 通知助教確認下單', turn: '校長確認金額', empty: '目前沒有待確認的金額', emptyHint: '助教測試通過後會出現在這裡' },
    { id: 'order', title: '確認下單', owner: '助教', roles: ['assistant'], states: [], desc: '校長已確認金額：填下單網址與期限 → 預覽下單通知 → 發送給學姐', turn: '助教確認下單', empty: '目前沒有待發送的下單通知', emptyHint: '校長確認金額後會出現在這裡' }
  ];
  var SEGS = ['製作工具', '測試工具', '確認金額', '確認下單', '等待下單', '交付教材'], SEG_AT = { make: 0, test: 1, price: 2, order: 3, wait: 4, ready: 5, log: 6 };
  /** 學姐所在階段（同 schema.orderStageOf）：make、test、price、order、wait、ready、log */
  function stageKey(row) {
    var t = infoOf(row), s = stateOf(row), m = row && row.material;
    var S = schemaRef();
    if (S) return S.orderStageOf({ state: s, cycle: t.cycle, createdAt: t.createdAt, priceConfirmed: Number(t.priceConfirmed) || 0 }, m);
    if (s === 'make' || s === 'fix') return 'make';
    if (s === 'test') return 'test';
    var cyc = String(t.cycle || ''), cur = m && m.state ? (m.cycle ? String(m.cycle) === cyc : (m.state !== 'delivered' || !t.createdAt || String(m.deliveredAt || '') >= String(t.createdAt))) : false;
    if (cur && m.state === 'delivered') return 'log';
    if (cur && m.state === 'ordered') return 'ready';
    if (cur && m.state === 'notified') return 'wait';
    return Number(t.priceConfirmed) > 0 ? 'order' : 'price';
  }
  /** 3.5.1 共用判定（schema.orderStageOf）：瀏覽器取 CONSULT_SCHEMA、Node 測試 require；取不到時沿用本地判定 */
  function schemaRef() {
    var g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
    if (g && g.CONSULT_SCHEMA && typeof g.CONSULT_SCHEMA.orderStageOf === 'function') return g.CONSULT_SCHEMA;
    if (typeof require === 'function') { try { return require('./schema.js'); } catch (e) { return null; } }
    return null;
  }
  /** 3.3.2 已發送下單通知（本次諮詢流程為等待下單／待交付／已交付）且已確認金額 → 金額鎖定，不可改價 */
  function priceLocked(row) {
    var t = infoOf(row), m = row && row.material;
    if (!(Number(t.priceConfirmed) > 0) || !m || !m.state || m.closedAt || m.state === 'unnotified') return false;
    var cyc = String(t.cycle || '');
    return m.cycle ? String(m.cycle) === cyc : (m.state !== 'delivered' || !t.createdAt || String(m.deliveredAt || '') >= String(t.createdAt));
  }
  function stageOf(x) {
    if (x && typeof x === 'object') return stageById(stageKey(x)) || null;
    var k = norm(x); return k === 'pass' ? STAGES[2] : STAGES.filter(function (st) { return st.states.indexOf(k) >= 0; })[0];
  }
  /** 六段流程軌（tk-f6：done 已完成、cur 目前） */
  function segTrackHTML(key) {
    var at = SEG_AT[key] != null ? SEG_AT[key] : 0;
    return '<div class="tk-f6s" role="list" aria-label="流程：' + esc(SEGS[Math.min(at, 5)]) + (at >= 6 ? '（已完成）' : '') + '">' + SEGS.map(function (l, i) {
      var c = i < at ? ' done' : i === at ? ' cur' : '';
      return '<div class="tk-f6' + c + '" role="listitem"' + (i === at ? ' aria-current="step"' : '') + '><i></i><span>' + esc(l) + '</span></div>';
    }).join('') + '</div>';
  }
  function money(n) { n = Math.round(Number(n) || 0); return n > 0 ? 'NT$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '未定價'; }
  function isOwner(stage, role) { return stage.roles.indexOf(role === 'assistant' ? 'assistant' : 'principal') >= 0; }
  /** 區塊順序：登入者負責的區塊置頂，其餘依流程 */
  function stageOrder(role) { var r = role === 'assistant' ? 'assistant' : 'principal'; return STAGES.filter(function (x) { return x.roles.length === 1 && x.roles[0] === r; }).concat(STAGES.filter(function (x) { return !(x.roles.length === 1 && x.roles[0] === r); })); }
  /** 目前輪到 */
  function turnHTML(k, row) { var st = row ? stageOf(row) : stageOf(k); return '<div class="tk-turn ' + st.id + '"><span class="k">目前輪到</span><b>' + esc(st.turn) + '</b>' + (k === 'fix' ? '<span class="s">助教回報問題，等待校長修改</span>' : '') + '</div>'; }
  /** 主要動作：只有該階段負責人看到主要按鈕；非負責人看到狀態說明。data-tt-act 交給 bind，data-tk 由整合者處理（upload 上傳面板、report 回報問題面板） */
  function pvActs(row, role, I) {
    var k = stateOf(row), t = infoOf(row), key = esc(row.key || ''), has = hasTool(t), st = stageOf(row), own = isOwner(st, role);
    var open = function (cls) { return has ? '<a class="btn ' + cls + '" href="' + esc(openHref(t)) + '" target="_blank" rel="noopener" data-tk="open"' + (isZip(t) ? ' download' : '') + '>' + I('ext', 'sm') + (isZip(t) ? '下載工具' : '開啟工具') + '</a>' : '<button type="button" class="btn ' + cls + '" disabled>' + I('ext', 'sm') + '開啟工具</button>'; };
    var go = '<a class="btn btn-primary tk-lg tk-go" href="#/material/' + encodeURIComponent(row.key || '') + '" data-tk="deliver">' + I('send', 'sm') + '前往諮詢教材發送</a>';
    var up = function (txt) { return '<button type="button" class="btn btn-primary tk-lg" data-tk="upload" data-key="' + key + '">' + I('upload', 'sm') + txt + '</button>'; };
    var up2 = function (txt) { return role === 'assistant' || !has ? '' : '<button type="button" class="btn btn-secondary tk-lg tk-up2" data-tk="upload" data-key="' + key + '">' + I('upload', 'sm') + txt + '</button>'; };   // 3.3.0 交付前任何階段可上傳新版（校長）
    var px = role !== 'assistant';   // 3.3.3 校長可代按助教步驟
    var tt = function (act, cls, ic, txt, proxy) { return '<button type="button" class="btn ' + cls + ' tk-lg" data-tt-act="' + act + '" data-tt-key="' + key + '"' + (proxy ? ' data-tt-proxy="1"' : '') + '>' + I(ic, 'sm') + txt + '</button>'; };
    var info = function (ic, txt) { return '<div class="tk-info">' + I(ic, 'sm') + txt + '</div>'; };
    var hint = function (txt) { return '<p class="tk-hint ok">' + I('send', 'sm') + txt + '</p>'; };
    if (st.id === 'test') {
      if (own) return '<div class="tk-acts as">' + open('btn-primary tk-xl tk-full') + tt('pass', 'btn-secondary', 'check', '通過') + '<button type="button" class="btn btn-secondary tk-lg tk-rep" data-tk="report" data-key="' + key + '">' + I('edit', 'sm') + '回報問題</button></div>' + openNote(t);
      return '<div class="tk-acts as">' + open('btn-primary tk-xl tk-full') + tt('pass', 'btn-secondary', 'check', '通過', true) + '<button type="button" class="btn btn-secondary tk-lg tk-rep" data-tk="report" data-key="' + key + '" data-proxy="1">' + I('edit', 'sm') + '回報問題</button>' + proxyTag() + up2('上傳新版') + '</div>' + openNote(t);   // 3.3.3 校長代按
    }
    if (st.id === 'price') {
      if (own) return '<div class="tk-acts"><button type="button" class="btn btn-primary tk-lg" data-tk="price" data-key="' + key + '">' + I('check', 'sm') + '確認金額</button>' + up2('上傳新版') + '</div>' + hint('確認後天使助教通知助教「金額已確認」');
      return '<div class="tk-acts">' + info('hourglass', '等待校長確認金額') + tt('undo', 'btn-secondary tk-undo', 'refresh', '復原') + '</div>';
    }
    if (st.id === 'order') {
      if (own) return '<div class="tk-acts"><button type="button" class="btn btn-primary tk-lg" data-tk="order" data-key="' + key + '">' + I('send', 'sm') + '編輯下單資訊</button><button type="button" class="btn btn-secondary tk-lg" data-tk="reopen" data-key="' + key + '">' + I('refresh', 'sm') + '退回確認金額</button></div>';
      return '<div class="tk-acts"><button type="button" class="btn btn-primary tk-lg" data-tk="order" data-key="' + key + '" data-proxy="1">' + I('send', 'sm') + '編輯下單資訊</button>' + proxyTag() + up2('上傳新版') + '</div>';   // 3.3.3 校長代按
    }
    if (st.id !== 'make') return '<div class="tk-acts">' + info('check', '已發送下單通知・請到「交付教材」') + (stageKey(row) !== 'log' ? up2('上傳新版') : '') + '</div>';
    void go; void px;
    if (!started(row)) return own ? '<div class="tk-acts"><button type="button" class="btn btn-primary tk-lg" data-tk="start" data-key="' + key + '">' + I('edit', 'sm') + '開始製作</button></div>' + '<p class="tk-hint">開始製作後才可設定定價與上傳工具（不通知）</p>' : '<div class="tk-acts">' + info('hourglass', '等待校長開始製作') + '</div>';   // 3.3.3 開始製作
    if (!own) return '<div class="tk-acts">' + info('edit', k === 'fix' ? '等待校長修改' : '校長製作中') + '</div>';
    if (k === 'fix') return '<div class="tk-acts">' + up('上傳新版並送助教測試') + (has ? open('btn-secondary tk-lg tk-sm') : '') + '</div>' + openNote(t) + hint('新版直接取代舊版，回到測試工具並通知助教');
    return '<div class="tk-acts">' + up(has ? '上傳新版並送助教測試' : '上傳並送助教測試') + '</div>' + hint('上傳後直接送助教測試');
  }
  /* 3.3.2 只呈現最新版：不顯示版本紀錄與舊版開啟入口（舊版檔案保留在 Drive） */
  function versionsHTML() { return ''; }
  /* 3.3.0 定價欄位（任何階段；校長可填寫／修改，助教只看）：寫入原定價，確認金額仍為最終金額 */
  function priceFieldHTML(t, role, key, locked) {
    var pi = Number(t && t.priceInitial) || 0, pc = Number(t && t.priceConfirmed) || 0;
    var after = pc ? '<span class="tk-pf-note">確認金額 ' + esc(money(pc)) + (role !== 'assistant' && !locked ? '・改價需重新確認金額' : '') + '</span>' : '';
    if (role !== 'assistant' && locked) return '<div class="tk-price tk-pf-lock"><span class="k">定價</span><b>' + (pi ? esc(money(pi)) : '未定價') + '</b><span class="tk-pf-note">確認金額 ' + esc(money(pc)) + '・已發送下單通知，金額已鎖定，不可改價</span></div>';   // 3.3.2
    if (role === 'assistant') return '<div class="tk-price"><span class="k">定價</span><b>' + (pi ? esc(money(pi)) : '未定價') + '</b>' + after + '</div>';
    return '<div class="tk-pf" data-tk-pf="' + esc(key || '') + '"><label class="k" for="tk-pf-' + esc(key || '') + '">定價</label><span class="pre">NT$</span><input id="tk-pf-' + esc(key || '') + '" class="mono" inputmode="numeric" autocomplete="off" placeholder="未定價" value="' + (pi ? esc(String(pi)) : '') + '" data-tk-pf-in="' + esc(key || '') + '" aria-label="定價（新台幣）"><button type="button" class="btn btn-secondary btn-sm" data-tk="price-save" data-key="' + esc(key || '') + '">儲存</button><span class="tk-pf-st" data-tk-pf-st="' + esc(key || '') + '" role="status" aria-live="polite"></span>' + after + '</div>';
  }
  /**
   * 3.3.5 定價儲存回饋（卡片定價欄位旁的狀態文字）：
   *   phase＝saving「儲存中…」／ok「已儲存 NT$ x」／same「金額未變更」／err「儲存失敗：原因」→ { text, cls }
   *   priceUnchanged(t, n)：輸入金額與目前定價（priceInitial）相同
   */
  function priceUnchanged(t, n) { var pi = Number(t && t.priceInitial) || 0; return pi > 0 && Number(n) === pi; }
  function priceSaveStatus(phase, n, msg) {
    if (phase === 'saving') return { text: '儲存中…', cls: 'busy' };
    if (phase === 'ok') return { text: '已儲存 ' + money(n), cls: 'ok' };
    if (phase === 'same') return { text: '金額未變更', cls: 'same' };
    if (phase === 'err') return { text: '儲存失敗：' + (msg || '資料中心回應異常'), cls: 'err' };
    return { text: '', cls: '' };
  }
  /** 上傳新版後需重新測試（已確認金額保留） */
  function retestHTML(t) { return t && t.retestNeeded ? '<p class="tk-open-note warn tk-retest" role="note">' + esc(t.retestNote || '工具已更新，需重新測試') + (t.priceConfirmed ? '・已確認金額 ' + esc(money(t.priceConfirmed)) + ' 保留' : '') + '</p>' : ''; }
  function fmtShort(v) { var ms = msOf(v); if (ms == null) return String(v || '').slice(0, 16); var x = new Date(ms + TPE); return x.getUTCFullYear() + '.' + p2(x.getUTCMonth() + 1) + '.' + p2(x.getUTCDate()) + ' ' + p2(x.getUTCHours()) + ':' + p2(x.getUTCMinutes()); }
  function verNo(t) { return Number(t.versionNo) || Number(String(t.version || '').replace(/\D/g, '')) || 1; }
  /** 3.2.10 回饋內容（類型、說明、截圖連結、時間）；fb＝tooltest row.feedback[i] */
  function feedbackHTML(fb, I, o) {
    if (!fb) return '';
    I = typeof I === 'function' ? I : function () { return ''; }; o = o || {};
    var labels = fb.typeLabels && fb.typeLabels.length ? fb.typeLabels : (fb.types || []).map(function (x) { var f = FB_TYPES.filter(function (y) { return y[0] === x; })[0]; return f ? f[1] : ''; }).filter(Boolean);
    var ms = msOf(fb.at), when = ms == null ? esc(fb.at || '') : fmtAt(ms);
    var shots = (fb.shots || []).filter(function (x) { return x && /^https:\/\//.test(String(x.url || '')); });
    return '<section class="tk-fb' + (o.compact ? ' cp' : '') + '" aria-label="助教回饋"><div class="tk-fb-hd"><span class="t">' + I('alert', 'sm') + (o.title || '助教回饋') + '</span><span class="m">' + (fb.version ? '第 ' + esc(fb.version) + ' 版・' : '') + '<time>' + when + '</time></span></div>' +
      (labels.length ? '<div class="tk-fb-ty">' + labels.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>' : '') +
      '<p class="tk-fb-tx">' + esc(fb.text || '') + '</p>' +
      (shots.length ? '<div class="tk-fb-sh">' + shots.map(function (x, i) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" data-tk="shot">' + I('image', 'sm') + '截圖 ' + (i + 1) + '</a>'; }).join('') + '</div>' : '') + '</section>';
  }
  function hwLine(r) {
    var hw = r.hw || {};
    if (hw.state === 'submitted' && hw.supp) return '<span class="tk-hw late">作業已送出・待補件</span>';   // 3.3.5
    if (hw.state === 'submitted') return hw.onTime === false ? '<span class="tk-hw late">作業已送出・逾時（已列入）</span>' : '<span class="tk-hw ok">作業已送出' + (hw.onTime === true ? '・準時' : '') + '</span>';
    if (hw.state === 'filling') return '<span class="tk-hw">作業填寫中・' + Math.max(1, Math.min(99, Number(hw.percent) || 1)) + '%</span>';
    return '<span class="tk-hw">作業尚未開始</span>';
  }
  /** 諮詢準備票券卡片（依階段：製作工具＝完整資料＋下載區；測試工具／交付教材＝以工具為主，學姐資料收合在「學姐資料」展開列） */
  function prepCardHTML(row, o) {
    o = o || {};
    var I = typeof o.icon === 'function' ? o.icon : function () { return ''; }, role = o.role === 'assistant' ? 'assistant' : 'principal';
    var k = stateOf(row), t = infoOf(row), now = o.now == null ? Date.now() : o.now, lead = Number(o.leadHours) || 48, sk = stageKey(row), st = stageOf(row) || STAGES[0];
    var cm = counselMs(row), dm = dueMs(row); if (dm == null && cm != null) dm = cm - lead * 3600e3;
    var done = k === 'pass', toDue = dm == null ? null : dm - now;
    var urgent = !done && toDue != null && toDue < 24 * 3600e3;
    var dueCls = done ? 'done' : toDue == null ? 'calm' : toDue < 24 * 3600e3 ? 'hot' : toDue < 72 * 3600e3 ? 'warm' : 'calm';
    var dueTxt = done ? '已備妥' : toDue == null ? '—' : toDue < 0 ? '逾期 ' + span(toDue) : '剩 ' + span(toDue);
    var call = row.callName && row.callName !== row.name ? '<small>' + esc(row.callName) + '</small>' : '';
    var badge = '<span class="tk-badge ' + (sk === 'price' ? 'price' : sk === 'order' ? 'pass' : !started(row) ? 'idle' : k) + '"><span class="d"></span>' + esc(sk === 'price' ? '待確認金額' : sk === 'order' ? '金額已確認' : k === 'pass' ? '已發下單通知' : !started(row) ? '未開始' : k === 'make' ? '製作中' : LABELS[k]) + '</span>';   // 3.3.3 未開始
    var times = '<div class="tk-times"><div class="tk-tm"><div class="k">諮詢時間</div>' + (cm == null ? '<time>尚無預約</time><div class="left calm">—</div>' : '<time>' + fmtAt(cm) + '</time><div class="left calm">' + (cm >= now ? '距今 ' : '已過 ') + span(cm - now) + '</div>') + '</div>' +
      '<div class="tk-tm"><div class="k">準備期限（前 ' + lead + ' 小時）</div>' + (dm == null ? '<time>—</time>' : '<time>' + fmtAt(dm) + '</time>') + '<div class="left ' + dueCls + '">' + dueTxt + '</div></div></div>';
    var tool = hasTool(t) ? '<div class="tk-tool"><span class="ic">' + I(t.toolKind === 'file' ? 'file' : 'link', 'sm') + '</span><div class="tx"><div class="t1">' + esc(t.tool || '未命名工具') + '</div><div class="t2">' + esc(toolRef(t)) + '</div></div><span class="ver">第 ' + verNo(t) + ' 版' + (t.uploadedAt ? '・<time>' + esc(fmtShort(t.uploadedAt)) + '</time>' : '') + '</span></div>' + versionsHTML(t, role, row.key) + retestHTML(t)
      : (role !== 'assistant' && sk === 'make' && started(row) ? '' : '<div class="tk-tool empty"><span class="ic">' + I('upload', 'sm') + '</span><div class="tx"><div class="t1">尚未上傳工具</div><div class="t2">' + (started(row) ? '校長製作中' : '尚未開始製作') + '</div></div></div>');
    if (role !== 'assistant' && sk === 'make' && started(row)) tool = tool + dropHTML(t, esc(row.key || ''), I);   // 3.3.3 真正的拖放區
    var key = esc(row.key || ''), nm = esc(row.name || ''), rid = row.hw && row.hw.state === 'submitted' ? row.hw.receiptId : '', drive = !!(row.drive && row.drive.registered);
    /* 3.2.9 資料下載（外框按鈕＋圖示，固定位置；與操作按鈕分開）：學姐尚未送出時灰色並寫「尚未送出」；學員詳情、諮詢詳情為小字連結排在最後 */
    var off = function (ic, txt, why) { return '<button type="button" class="tk-dlb" disabled title="' + esc(why) + '">' + I(ic, 'sm') + '<span class="zl">' + txt + '</span><small>' + esc(why) + '</small></button>'; };
    var noDrive = rid ? '尚未登錄雲端' : '尚未送出';
    var dl = '<div class="tk-dl" role="group" aria-label="資料下載"><div class="tk-dlh">' + I('download', 'sm') + '資料下載</div><div class="tk-dlg">' +
      (rid ? '<button type="button" class="tk-dlb" data-act="row-pdf" data-rid="' + esc(rid) + '" aria-label="下載 ' + nm + ' 的作業 PDF">' + I('file', 'sm') + '<span class="zl">作業 PDF</span></button>' : off('file', '作業 PDF', '尚未送出')) +
      (rid ? '<button type="button" class="tk-dlb" data-act="row-xlsx" data-rid="' + esc(rid) + '" aria-label="下載 ' + nm + ' 的作業 Excel">' + I('table', 'sm') + '<span class="zl">Excel</span></button>' : off('table', 'Excel', '尚未送出')) +
      (drive ? '<button type="button" class="tk-dlb" data-cloud="open" data-key="' + key + '" data-name="' + nm + '" data-root="' + esc((row.drive && row.drive.rootUrl) || '') + '" aria-label="開啟 ' + nm + ' 的雲端資料夾">' + I('folder', 'sm') + '<span class="zl">雲端資料夾</span></button>' : off('folder', '雲端資料夾', noDrive)) +
      (drive ? '<button type="button" class="tk-dlb" data-prep-zip="' + key + '" data-v="pv" aria-label="下載 ' + nm + ' 全部資料 ZIP">' + I('archive', 'sm') + '<span class="zl">ZIP</span></button>' : off('archive', 'ZIP', noDrive)) +
      '</div></div><div class="tk-links"><button type="button" class="tk-lk" data-sdopen="' + key + '" data-name="' + nm + '">學員詳情</button><span aria-hidden="true">・</span><button type="button" class="tk-lk" data-tk="counsel" data-key="' + key + '">諮詢詳情</button></div>';
    var logo = typeof o.logoHTML === 'function' ? o.logoHTML(row) : '';
    var pend = row.hwPending ? '<span class="tk-hwpend">作業未完成</span>' : '';   // 3.3.5 流程已開始但作業變成未完成：保留卡片並標示
    var hd = '<div class="tk-hd">' + logo + '<div class="tk-nmw"><h3 class="tk-nm">' + esc(row.name || '') + call + pend + '</h3>' + hwLine(row) + '</div>' + badge + '</div>' + turnHTML(k, row);
    var body, stub;
    if (st.id === 'make') {
      body = hd + times + segTrackHTML(sk) + (started(row) ? tool + priceFieldHTML(t, role, row.key, priceLocked(row)) : '<p class="tk-next">' + I('info', 'sm') + '作業資料已齊，開始製作後才可設定定價與上傳工具</p>') + (k === 'fix' && t.feedback && t.feedback[0] ? feedbackHTML(t.feedback[0], I) : '');
      stub = pvActs(row, role, I) + dl;
    } else {
      var upAt = msOf(t.uploadedAt || t.sentAt);
      var facts = '<div class="tk-facts2"><div><span class="k">上傳時間</span><time>' + (upAt == null ? '—' : fmtAt(upAt)) + '</time></div>' +
        (st.id === 'test' ? '<div><span class="k">準備期限</span><time>' + (dm == null ? '—' : fmtAt(dm)) + '</time><span class="left ' + dueCls + '">' + dueTxt + '</span></div>' : '<div><span class="k">諮詢時間</span><time>' + (cm == null ? '尚無預約' : fmtAt(cm)) + '</time></div>') + '</div>';
      var pf = '';
      if (sk === 'price' || sk === 'order') {
        var chg = sk === 'order' && t.priceInitial && Number(t.priceConfirmed) !== Number(t.priceInitial);
        pf = '<div class="tk-price"><span class="k">' + (sk === 'order' ? '校長確認金額' : '校長定價') + '</span><b>' + money(sk === 'order' ? t.priceConfirmed : (t.priceCurrent || t.priceInitial)) + '</b>' + (chg ? '<s>' + money(t.priceInitial) + '</s>' : '') + '</div>' +
          '<p class="tk-next">' + I('check', 'sm') + (sk === 'order' ? '校長 ' + esc(fmtShort(t.priceConfirmedAt)) + ' 確認金額' + (chg && t.priceReason ? '・' + esc(t.priceReason) : '') : '助教 ' + esc(fmtShort(t.resultAt || t.passAt)) + ' 測試通過') + '</p>';
      }
      body = hd + segTrackHTML(sk) + tool + priceFieldHTML(t, role, row.key, priceLocked(row)) + pf + facts;
      stub = pvActs(row, role, I) + '<details class="tk-more"><summary>' + I('chev', 'sm') + '學姐資料<span>作業 PDF・Excel・雲端資料夾・ZIP</span></summary>' + dl + '</details>';
    }
    return '<article class="tk-card tk-st-' + st.id + (urgent ? ' tk-hot' : '') + '" data-key="' + key + '" data-state="' + k + '" data-stage="' + st.id + '"><div class="tk-body">' + body + '</div><div class="tk-stub">' + stub + '</div></article>';
  }
  function stageById(id) { return STAGES.filter(function (x) { return x.id === id; })[0] || null; }
  /* 3.3.5 諮詢準備只列作業已完成的學姐（沿用作業追蹤的完成狀態：已送出且沒有待處理的補件） */
  function hwDone(row) { var hw = (row && row.hw) || {}; return hw.state === 'submitted' && !hw.supp; }
  /** 3.3.5 本次流程已開始（已按開始製作、已上傳工具、已定價、已離開製作中、已發下單通知或工具已完成） */
  function flowStarted(row) { var sk = stageKey(row); return started(row) || sk === 'wait' || sk === 'ready' || sk === 'log' || !!(row && row.toolDone); }
  /**
   * 3.3.5 諮詢準備納入規則（prep_board＋tooltest 合併後）：作業已完成者列入；作業未完成但流程已開始者保留並標 hwPending；
   * 其餘移到 others 並標 hwGated（只在作業追蹤出現）。重複套用結果相同。
   */
  function gate(d) {
    if (!d || !Array.isArray(d.rows)) return d;
    var keep = [], out = [];
    d.rows.forEach(function (r) {
      var ok = hwDone(r);
      if (ok) { delete r.hwPending; keep.push(r); }
      else if (flowStarted(r)) { r.hwPending = true; keep.push(r); }
      else { delete r.hwPending; r.hwGated = true; out.push(r); }
    });
    var oth = (d.others || []).filter(function (r) { return !r.hwGated || !keep.some(function (k) { return k.key === r.key; }); });
    d.rows = keep; d.others = oth.filter(function (r) { return !out.some(function (x) { return x.key === r.key; }); }).concat(out);
    return d;
  }
  /** 3.3.5 不在此列的作業未完成人數（已發作業通知者） */
  function gatedCount(d) { return ((d && d.others) || []).filter(function (r) { return r.hwGated; }).length; }
  function stageRows(rows, st) { return (rows || []).filter(function (r) { return stageKey(r) === st.id; }); }
  function tabCounts(rows) { var c = {}; STAGES.forEach(function (st) { c[st.id] = stageRows(rows, st).length; }); return c; }
  /** 3.2.11 預設分頁：校長→製作工具、助教→測試工具；負責分頁 0 筆而交付教材有筆數時停在交付教材 */
  function defaultTab(rows, role) {
    var mine = role === 'assistant' ? ['test', 'order'] : ['make', 'price'], c = tabCounts(rows);
    return mine.filter(function (id) { return c[id]; })[0] || mine[0];
  }
  /** 3.2.11 頂部三分頁（tablist）：名稱＋負責人小字＋數量徽章（有待辦亮色、0 淡化）；o = { active, role } */
  function tabsHTML(rows, o) {
    o = o || {}; var act = stageById(o.active) ? o.active : 'make', c = tabCounts(rows), role = o.role === 'assistant' ? 'assistant' : 'principal';
    return '<div class="tk-tabs" role="tablist" aria-label="諮詢準備流程">' + STAGES.map(function (st) {
      var on = st.id === act, n = c[st.id], own = st.roles.length === 1 && isOwner(st, role);
      return '<button type="button" role="tab" class="tk-tab ' + st.id + (on ? ' on' : '') + (own ? ' mine' : '') + '" id="tk-tab-' + st.id + '" data-tk-tab="' + st.id + '" aria-selected="' + on + '" aria-controls="tk-panel" tabindex="' + (on ? '0' : '-1') + '">' +
        '<span class="tk-tab-tx"><span class="tk-tab-t">' + esc(st.title) + '</span><span class="tk-tab-o">' + esc(st.owner) + '</span></span>' +
        '<span class="tk-tab-n' + (n ? ' lit' : '') + '" aria-label="' + n + ' 位">' + n + '</span></button>';
    }).join('') + '</div>';
  }
  /** 3.2.11 分頁內容：只顯示該分頁卡片；空分頁顯示說明；o = { active, card(row), scopeNote? 範圍說明（非全部時） } */
  function panelHTML(rows, o) {
    o = o || {}; var st = stageById(o.active) || STAGES[0], list = stageRows(rows, st);
    return '<section class="tk-panel ' + st.id + '" id="tk-panel" role="tabpanel" aria-labelledby="tk-tab-' + st.id + '" data-stage="' + st.id + '" tabindex="-1">' +
      '<p class="tk-panel-d">' + esc(st.desc) + '</p>' +
      (list.length ? '<div class="tk-grid">' + list.map(o.card || function () { return ''; }).join('') + '</div>' : '<div class="tk-empty" role="status"><b>' + esc(st.empty) + '</b><span>' + esc(o.scopeNote || st.emptyHint || '') + '</span></div>') + '</section>';
  }
  /** 助教置頂：待你測試 N 位（範圍內）＋最早準備期限 */
  function pinHTML(rows, o) {
    var L = select(rows, (o || {}).range, 'test', (o || {}).now); if (!L.length) return '';
    var ds = L.map(dueMs).filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    return '<div class="tk-pin" role="status"><div class="big">待你測試<b>' + L.length + '</b>位</div>' + (ds.length ? '<div class="sub">最早準備期限 <time>' + fmtAt(ds[0]) + '</time></div>' : '') + '</div>';
  }
  function summaryHTML(counts, active) {
    return '<div class="tk-sum" role="group" aria-label="狀態篩選">' + SUM.map(function (s) {
      return '<button type="button" class="tk-sf" data-tk-sum="' + s[0] + '" aria-pressed="' + (active === s[0]) + '"><span class="d ' + s[0] + '"></span><b>' + (Number(counts[s[0]]) || 0) + '</b>' + esc(s[1]) + '</button>';
    }).join('') + '</div>';
  }
  function rangeHTML(ranges, active) {
    return '<div class="tk-scope" role="group" aria-label="範圍">' + RANGES.map(function (x) { return '<button type="button" data-prep-range="' + x[0] + '" aria-pressed="' + (active === x[0]) + '">' + x[1] + '<span class="n">' + (Number(ranges[x[0]]) || 0) + '</span></button>'; }).join('') + '</div>';
  }

  return {
    version: VERSION, stageKey: stageKey, hwDone: hwDone, flowStarted: flowStarted, gate: gate, gatedCount: gatedCount, priceLocked: priceLocked, priceUnchanged: priceUnchanged, priceSaveStatus: priceSaveStatus, started: started, segTrackHTML: segTrackHTML, SEGS: SEGS, money: money, fmtShort: fmtShort, FB_TYPES: FB_TYPES, feedbackHTML: feedbackHTML, STAGES: STAGES, stageOf: stageOf, stageOrder: stageOrder, stageById: stageById, tabCounts: tabCounts, defaultTab: defaultTab, tabsHTML: tabsHTML, panelHTML: panelHTML, turnHTML: turnHTML, select: select, view: view, prepCardHTML: prepCardHTML, pinHTML: pinHTML, summaryHTML: summaryHTML, rangeHTML: rangeHTML, fmtAt: fmtAt, fmtDay: fmtDay, SUM: SUM, RANGES: RANGES, STATES: STATES, LABELS: LABELS, FILTERS: FILTERS, ACTIONS: ACTIONS,
    stateOf: stateOf, isMaterialSendAllowed: isMaterialSendAllowed, chipHTML: chipHTML, trackHTML: trackHTML, footHTML: footHTML, cardHTML: cardHTML,
    countsOf: countsOf, defaultFilter: defaultFilter, filterRows: filterRows, filterBarHTML: filterBarHTML, flowBarHTML: flowBarHTML, merge: merge,
    materialSendHTML: materialSendHTML, bind: bind, _util: { esc: esc }
  };
});
