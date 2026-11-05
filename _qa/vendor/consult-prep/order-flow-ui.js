/* ==========================================================================
 * 3.3.0 諮詢流程 UI 模組（後台由 build.py 依 OF 標記注入；全域 window.OrderFlowUI）
 *   畫面稿：order-flow（校長已確認）
 *   諮詢準備：確認金額面板（校長）、確認下單面板＋下單通知預覽（助教）、退回確認金額（助教）
 *   交付教材頁（#/material/{wait|ready|log}[/{學姐鍵}]）：等待下單（時間軸、同步學院下單、提醒下單、手動標記）、待交付（交付來源、預覽、發送）、交付紀錄（完整時間軸）
 *   同步學院下單（#/order-sync）：書籤「同步學院下單」開啟本頁 → 回傳等待下單中的名冊鍵 → 收到購買紀錄 → order_sync
 *   OrderFlowUI.init(ctx)：ctx = { call(action, payload) → Promise, icon(id, cls), toast(msg, kind), onError(e), role() → 'principal'|'assistant',
 *     prepFind(key), afterPrep(row?), materialUpload(flowId, file, onProgress), renderFlex(container, messages), orderBookmarklet, siteOrigins:[...], setNavCount(n) }
 * ========================================================================== */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrderFlowUI = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var TABS = [['wait', '等待下單', '系統比對'], ['ready', '待交付', '校長或助教'], ['log', '交付紀錄', '已完成']];
  var TPE = 8 * 3600000, WD = ['日', '一', '二', '三', '四', '五', '六'];
  var SITE_ADMIN = 'https://www.graceschool.com.tw/admin/';
  var SITE_POINTS = 'https://www.graceschool.com.tw/admin/point/history';   // 3.3.4 學院後台「點數使用紀錄」（查學姐扣點紀錄；該頁無法帶查詢條件，進頁後以本名篩選）
  var C = null;   // ctx
  var st = { tab: '', focus: '', flows: null, status: null, loading: null, sheet: null, open: {}, busy: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(id, cls) { return C && C.icon ? C.icon(id, cls) : ''; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function msOf(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; var x = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})/.exec(String(v)); if (x && !/[+\-]\d{2}:?\d{2}$|Z$/.test(String(v))) return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5]) - TPE; var m = Date.parse(v); return isNaN(m) ? null : m; }
  function fmt(v) { var ms = msOf(v); if (ms == null) return ''; var t = new Date(ms + TPE); return t.getUTCFullYear() + '.' + p2(t.getUTCMonth() + 1) + '.' + p2(t.getUTCDate()) + ' ' + p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()); }
  function fmtDay(v) { return fmt(v).slice(0, 10); }
  function fmtW(v) { var ms = msOf(v); if (ms == null) return ''; var t = new Date(ms + TPE); return fmtDay(ms) + '（' + WD[t.getUTCDay()] + '）' + fmt(ms).slice(11); }
  function money(n) { n = Math.round(Number(n) || 0); return n > 0 ? 'NT$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '未定價'; }
  function span(ms) { var m = Math.round(Math.abs(ms) / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? d + ' 天 ' + h + ' 小時' : h ? h + ' 小時 ' + mm + ' 分' : mm + ' 分'; }
  function toast(m, k) { if (C && C.toast) C.toast(m, k); }
  function fail(e, fallback) { if (e && e.code === 'ERR_AUTH' && C && C.onError) return C.onError(e); toast((e && e.message) || fallback || '操作失敗', 'err'); }
  function call(a, p) { return C.call(a, p); }
  function role() { return C && C.role ? C.role() : 'principal'; }
  function tt(row) { return (row && row.tooltest) || {}; }
  function nowTPE() { var t = new Date(Date.now() + TPE); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  function isoOf(dateStr, timeStr) { var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || ''), b = /^(\d{1,2}):(\d{2})$/.exec(timeStr || ''); if (!a || !b) return ''; return a[1] + '-' + a[2] + '-' + a[3] + 'T' + p2(+b[1]) + ':' + b[2] + ':00+08:00'; }
  function addDays(dateStr, days) { var a = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || ''); if (!a) return ''; var t = new Date(Date.UTC(+a[1], +a[2] - 1, +a[3] + days)); return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()); }   // 3.3.4
  function partsOf(v) { var ms = msOf(v); if (ms == null) return null; var t = new Date(ms + TPE); return { date: t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()), time: p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()) }; }   // 3.3.4 ISO → 台北日期／時間
  function dtIso(v) { var m = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2})/.exec(v || ''); return m ? isoOf(m[1], m[2]) : ''; }   // 3.3.4 datetime-local（台北）→ ISO
  function dlDefault(dt) { return addDays(dt, 7) ? addDays(dt, 7) + 'T23:59' : ''; }   // 3.3.4 下載截止預設＝下單截止＋7 天 23:59
  function quickDate(days) { var n = nowTPE(), t = new Date(Date.UTC(n.y, n.m, n.d + days)); return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()); }
  function sizeText(n) { n = Number(n) || 0; return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (Math.round(n / 104857.6) / 10) + ' MB'; }
  function initial(name) { var s = String(name || '').trim(); return s.length > 1 ? s.charAt(1) : s.charAt(0) || '學'; }
  function segs(key) { return root && root.ToolTestUI ? root.ToolTestUI.segTrackHTML(key) : ''; }

  /* ================================================================== */
  /* 面板（諮詢準備：確認金額、確認下單、退回確认金額；交付：發送教材預覽）       */
  /* ================================================================== */
  function host() { var h = document.getElementById('tk-root'); if (!h) { h = document.createElement('div'); h.id = 'tk-root'; document.body.appendChild(h); } return h; }
  function closeSheet(force) {
    if (!st.sheet || (st.sheet.busy && !force)) return;
    var o = st.sheet.opener; st.sheet = null;
    var h = document.getElementById('tk-root'); if (h) h.innerHTML = ''; document.documentElement.style.overflow = '';
    if (o && document.contains(o)) o.focus();
  }
  function sheetHTML(o) {
    return '<div class="tk-scrim" data-of="close"></div><section class="tk-sheet of-sheet" role="dialog" aria-modal="true" aria-labelledby="of-sh-t"' + (o.busy ? ' aria-busy="true"' : '') + '>' +
      '<div class="tk-sh-hd"><div><h2 id="of-sh-t">' + esc(o.title) + '</h2><div class="sub">' + o.sub + '</div></div>' + (o.steps ? '<div class="of-steps">' + o.steps + '</div>' : '') + '<button type="button" class="tk-x" data-of="close" aria-label="關閉">' + I('close') + '</button></div>' +
      '<div class="tk-sh-bd">' + o.body + '<p class="tk-err" id="of-err" role="alert"></p></div><div class="tk-sh-ft">' + (o.note ? '<span class="of-note">' + o.note + '</span>' : '') + o.foot + '</div></section>';
  }
  function paintSheet() { var s = st.sheet; if (!s) return; host().innerHTML = sheetHTML(s.view()); document.documentElement.style.overflow = 'hidden'; if (s.after) s.after(); }
  function err(m) { var e = document.getElementById('of-err'); if (e) e.textContent = m || ''; }
  function stepsHTML(labels, at) { return labels.map(function (l, i) { return '<span class="' + (i < at ? 'done' : i === at ? 'on' : '') + '">' + (i < at ? '✓ ' : '') + esc(l) + '</span>'; }).join(''); }
  function who(row) { return esc(row.name || '') + (row.callName && row.callName !== row.name ? '・' + esc(row.callName) + '學姐' : '學姐'); }

  /* ---- 確認金額（校長） ---- */
  function openPrice(key, opener) {
    var row = C.prepFind(key); if (!row) return;
    var t = tt(row), init = Number(t.priceInitial) || 0;
    st.sheet = { kind: 'price', key: key, opener: opener, busy: false, amount: String(Number(t.priceCurrent) || init || ''), reason: '' };
    st.sheet.view = function () {
      var s = st.sheet, a = Number(String(s.amount).replace(/[,\s]/g, '')) || 0, changed = init > 0 && a > 0 && a !== init;
      var log = (t.priceLog || []).slice().reverse();
      var initAt = (log.filter(function (x) { return x.ev === 'init'; })[0] || {}).at;
      var body = '<div class="tk-field"><span class="tk-lbl">原定價</span><div class="of-ro"><span class="pre">NT$</span><b class="mono">' + (init ? esc(money(init).slice(4)) : '未定價') + '</b><span class="hint">' + (initAt ? esc(fmt(initAt)) + ' 上傳時填入' : init ? '' : '舊資料未填定價，請直接輸入確認金額') + '</span></div></div>' +
        '<div class="tk-field"><label class="tk-lbl" for="of-amt">確認金額<span class="of-req">必填</span></label><div class="of-in' + (changed ? ' warn' : '') + '"><span class="pre">NT$</span><input id="of-amt" class="mono big" inputmode="numeric" autocomplete="off" value="' + esc(s.amount) + '" aria-describedby="of-amt-h">' + (changed ? '<span class="of-chip warn">已改價</span>' : '') + '</div>' +
        '<input id="of-reason" class="of-text" maxlength="60" placeholder="改價原因（例：皇家至尊會員九折）" value="' + esc(s.reason) + '" aria-label="改價原因"' + (changed ? ' aria-required="true"' : '') + '><div class="help" id="of-amt-h">改價原因（改價時必填），會寫入修改紀錄並顯示給助教。</div></div>' +
        (log.length ? '<div class="tk-field"><span class="tk-lbl">修改紀錄</span><div class="of-log">' + log.map(function (x) { return '<div><span class="mono">' + esc(fmt(x.at)) + '</span><b>' + esc(logText(x)) + '</b></div>'; }).join('') + '</div></div>' : '');
      return { title: '確認金額', sub: who(row), steps: stepsHTML(['校長確認', '通知助教'], 0), busy: s.busy, body: body, note: '確認後：天使助教通知助教・卡片移到「確認下單」',
        foot: '<button type="button" class="btn btn-secondary" data-of="restore"' + (init ? '' : ' disabled') + '>還原原定價</button><button type="button" class="btn btn-primary has-icon" data-of="price-ok"' + (s.busy ? ' disabled aria-busy="true"' : '') + '>' + I('check', 'sm') + (s.busy ? '確認中…' : '確認金額') + '</button>' };
    };
    st.sheet.after = function () { var a = document.getElementById('of-amt'); if (a) a.addEventListener('input', function () { st.sheet.amount = a.value; var r = document.getElementById('of-reason'); st.sheet.reason = r ? r.value : ''; var pos = a.selectionStart; paintSheet(); var b = document.getElementById('of-amt'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } } }); };
    paintSheet(); var f = document.getElementById('of-amt'); if (f) f.focus();
  }
  function logText(x) {
    var to = money(x.to);
    if (x.ev === 'init') return '校長定價 ' + to + (x.rs === '卡片定價' ? '（卡片）' : '（上傳工具）');
    if (x.ev === 'set') return '校長修改定價為 ' + to + '（卡片）';
    if (x.ev === 'upload') return '上傳新版時調整為 ' + to;
    if (x.ev === 'change') return '校長改為 ' + to + (x.rs ? '・' + x.rs : '');
    if (x.ev === 'restore') return '還原原定價 ' + to;
    if (x.ev === 'confirm') return '校長確認 ' + to;
    if (x.ev === 'reopen') return '退回確認金額' + (x.rs ? '・' + x.rs : '');
    return to;
  }
  function submitPrice() {
    var s = st.sheet, row = C.prepFind(s.key); if (!row || s.busy) return;
    var a = document.getElementById('of-amt'), r = document.getElementById('of-reason');
    s.amount = a ? a.value : s.amount; s.reason = r ? r.value.trim() : '';
    var n = Math.round(Number(String(s.amount).replace(/[,\s]/g, ''))), init = Number(tt(row).priceInitial) || 0;
    if (!(n > 0)) { err('請填確認金額（新台幣，整數）'); if (a) { a.setAttribute('aria-invalid', 'true'); a.focus(); } return; }
    if (init && n !== init && !s.reason) { err('金額與原定價不同，請填改價原因'); if (r) { r.setAttribute('aria-invalid', 'true'); r.focus(); } return; }
    s.busy = true; paintSheet();
    call('order_price_confirm', { rosterKey: s.key, amount: n, reason: s.reason, by: 'principal' }).then(function (res) {
      s.busy = false; closeSheet(true);
      toast('已確認金額 ' + money(n) + (res.notified ? '，已通知助教' : '（助教通知未送出，請到 LINE 設定確認）'), res.notified ? 'ok' : 'info');
      C.afterPrep(res.row);
    }, function (e) { s.busy = false; paintSheet(); err((e && e.message) || '確認失敗'); if (e && e.code === 'ERR_AUTH') { closeSheet(true); fail(e); } });
  }

  /* ---- 確認下單（助教）：填寫 → 預覽 → 發送 ---- */
  function openOrder(key, opener, o) {
    var row = C.prepFind(key); if (!row) return;
    var t = tt(row);
    st.sheet = { kind: 'order', key: key, opener: opener, proxy: !!(o && o.proxy) || role() !== 'assistant', busy: false, step: 0, url: '', dt: quickDate(5) + 'T23:59', dlDt: dlDefault(quickDate(5)), dlTouched: false, quick: 5, material: t.tool || '', preview: null };   // 3.3.4 下單／下載截止（datetime-local）
    st.sheet.view = function () {
      var s = st.sheet, chg = t.priceInitial && Number(t.priceConfirmed) !== Number(t.priceInitial);
      if (s.step === 1 && s.preview) {
        var p = s.preview, ok = p.recipient && p.recipient.ok;
        var body = '<div class="of-pv" id="of-pv"></div>' + (p.text ? '<div class="of-alt">通知預覽：' + esc(p.text) + '</div>' : '') +
          '<dl class="of-sum"><dt>收件人</dt><dd>' + esc(p.recipient.name) + '（' + esc(p.recipient.callName || '') + '學姐）</dd><dt>金額</dt><dd class="mono">' + esc(money(p.flow.amount)) + '（校長確認）</dd><dt>下單網址</dt><dd>' + esc(p.flow.orderUrl) + '</dd><dt>下單截止</dt><dd class="mono">' + esc(fmt(p.flow.deadline)) + '</dd><dt>下載截止</dt><dd class="mono">' + esc(fmt(p.flow.downloadDeadline) || '交付後依預設天數') + '</dd></dl>' +
          (ok ? '<div class="of-notice info">' + I('refresh', 'sm') + '<span>發送後學姐移到「交付教材 › 等待下單」，同步學院下單後自動比對</span></div>' : '<div class="of-notice">' + I('alert', 'sm') + '<span>無法發送：' + esc(p.recipient.reason || '') + '（請先到「學員名冊 › LINE 對應」完成對應）</span></div>');
        return { title: '預覽下單通知', sub: esc(row.callName || row.name) + '學姐將在 LINE 收到這張卡片', steps: stepsHTML(['填寫資料', '預覽通知'], 1), busy: s.busy, body: body, note: '',
          foot: '<button type="button" class="btn btn-secondary has-icon" data-of="back"' + (s.busy ? ' disabled' : '') + '>' + I('back', 'sm') + '返回修改</button><button type="button" class="btn btn-primary has-icon" data-of="send"' + (ok && !s.busy ? '' : ' disabled') + (s.busy ? ' aria-busy="true"' : '') + '>' + I('send', 'sm') + (s.busy ? '發送中…' : '發送給學姐') + '</button>' + (s.proxy ? '<span class="tk-proxy">代助教操作</span>' : '') };
      }
      var urlOk = /^https:\/\/[^\s"'<>]+$/.test(s.url.trim());
      var body2 = '<div class="tk-field"><span class="tk-lbl">教材金額</span><div class="of-price"><div class="orig"><span>校長確認 ' + esc(fmt(t.priceConfirmedAt)) + '</span>' + (chg ? '<span>原定價 <s class="mono">' + esc(money(t.priceInitial)) + '</s></span>' : '') + '</div>' +
          '<div class="of-ro"><span class="pre">NT$</span><b class="mono big">' + esc(money(t.priceConfirmed).slice(4)) + '</b><span class="of-chip ok">已確認</span></div>' + (chg && t.priceReason ? '<div class="help">改價原因：' + esc(t.priceReason) + '</div>' : '') + '<div class="help">金額由校長確認，需調整請退回「確認金額」。</div></div></div>' +
        '<div class="tk-field"><label class="tk-lbl" for="of-mat">教材名稱</label><input id="of-mat" class="of-text" maxlength="60" value="' + esc(s.material) + '"><div class="help">顯示在下單通知卡片</div></div>' +
        '<div class="tk-field"><label class="tk-lbl" for="of-url">官網下單網址<span class="of-req">必填</span></label><div class="of-in">' + I('link', 'sm') + '<input id="of-url" type="url" inputmode="url" autocomplete="off" placeholder="https://www.graceschool.com.tw/product/show/…" value="' + esc(s.url) + '">' + (urlOk ? '<span class="of-ok">' + I('check', 'sm') + 'https</span>' : '') + '</div><div class="help">該學姐的商品頁；卡片「前往下單」先記錄點擊時間再開啟這個網址。</div></div>' +
        '<div class="tk-field"><label class="tk-lbl" for="of-dt">下單截止<span class="of-req">必填</span></label><input id="of-dt" class="of-text mono" type="datetime-local" value="' + esc(s.dt) + '">' +
        '<div class="of-q" role="group" aria-label="快選">' + [3, 5, 7].map(function (d) { return '<button type="button" data-of-q="' + d + '" aria-pressed="' + (s.quick === d) + '">+' + d + ' 天</button>'; }).join('') + '</div><div class="help">台北時間；快選帶入日期，時間預設 23:59</div></div>' +
        '<div class="tk-field"><label class="tk-lbl" for="of-dldt">下載截止<span class="of-req">必填</span></label><input id="of-dldt" class="of-text mono" type="datetime-local" value="' + esc(s.dlDt) + '"><div class="help">需晚於下單截止；預設下單截止＋7 天 23:59，交付後到期即撤銷下載連結</div></div>';
      return { title: '確認下單', sub: who(row), steps: stepsHTML(['填寫資料', '預覽通知'], 0), busy: s.busy, body: body2, note: '',
        foot: '<button type="button" class="btn btn-secondary" data-of="reopen-from-order"' + (s.busy ? ' disabled' : '') + '>退回確認金額</button><button type="button" class="btn btn-primary has-icon" data-of="preview"' + (s.busy ? ' disabled aria-busy="true"' : '') + '>' + I('eye', 'sm') + (s.busy ? '產生預覽…' : '預覽下單通知') + '</button>' };
    };
    st.sheet.after = function () {
      var s = st.sheet; if (!s) return;
      if (s.step === 1 && s.preview && s.preview.card) { var pv = document.getElementById('of-pv'); if (pv && C.renderFlex) C.renderFlex(pv, s.preview.card); }
      var dt = document.getElementById('of-dt'); if (dt) dt.addEventListener('change', function () { orderSync(); s.quick = 0; if (!s.dlTouched) { s.dlDt = dlDefault(s.dt); var d2 = document.getElementById('of-dldt'); if (d2) d2.value = s.dlDt; } });   // 3.3.4 下載截止跟著下單截止（未手動改過時）
      var dd = document.getElementById('of-dldt'); if (dd) dd.addEventListener('change', function () { orderSync(); s.dlTouched = true; dd.removeAttribute('aria-invalid'); });
      var u = document.getElementById('of-url'); if (u) u.addEventListener('input', function () { s.url = u.value; var ok = /^https:\/\/[^\s"'<>]+$/.test(u.value.trim()), box = u.parentNode, m = box.querySelector('.of-ok'); if (ok && !m) box.insertAdjacentHTML('beforeend', '<span class="of-ok">' + I('check', 'sm') + 'https</span>'); else if (!ok && m) m.remove(); });
    };
    paintSheet(); var f = document.getElementById('of-url'); if (f) f.focus();
  }
  function orderSync() { var s = st.sheet; var u = document.getElementById('of-url'), a = document.getElementById('of-dt'), b = document.getElementById('of-dldt'), m = document.getElementById('of-mat'); if (u) s.url = u.value; if (a) s.dt = a.value; if (b) s.dlDt = b.value; if (m) s.material = m.value; }
  function orderPayload(s) { return { rosterKey: s.key, orderUrl: s.url.trim(), deadline: dtIso(s.dt), downloadDeadline: dtIso(s.dlDt), material: s.material.trim(), by: 'assistant', proxy: !!s.proxy }; }   // 3.3.3 校長代按
  function previewOrder() {
    var s = st.sheet; if (!s || s.busy) return; orderSync();
    if (!/^https:\/\/[^\s"'<>]+$/.test(s.url.trim())) { err('下單網址需為 https 開頭'); var u = document.getElementById('of-url'); if (u) { u.setAttribute('aria-invalid', 'true'); u.focus(); } return; }
    var iso = dtIso(s.dt); if (!iso) { err('請選擇下單截止日期與時間'); return; }
    if (msOf(iso) < Date.now()) { err('下單截止已過，請重新選擇'); return; }
    var dlIso = dtIso(s.dlDt), di = document.getElementById('of-dldt');   // 3.3.4 下載截止需晚於下單截止
    if (!dlIso) { err('請選擇下載截止日期與時間'); if (di) di.focus(); return; }
    if (msOf(dlIso) <= msOf(iso)) { err('下載截止需晚於下單截止'); if (di) { di.setAttribute('aria-invalid', 'true'); di.focus(); } return; }
    s.busy = true; paintSheet();
    var p = orderPayload(s); p.preview = true;
    call('order_notify', p).then(function (res) { s.busy = false; s.preview = res; s.step = 1; paintSheet(); }, function (e) { s.busy = false; paintSheet(); err((e && e.message) || '預覽失敗'); if (e && e.code === 'ERR_AUTH') { closeSheet(true); fail(e); } });
  }
  function sendOrder() {
    var s = st.sheet; if (!s || s.busy) return;
    s.busy = true; paintSheet();
    call('order_notify', orderPayload(s)).then(function (res) {
      s.busy = false; closeSheet(true);
      toast('已發送下單通知給' + (res.flow && res.flow.callName ? res.flow.callName + '學姐' : '學姐') + '，移到「交付教材 › 等待下單」', 'ok');
      st.flows = null; C.afterPrep(null);
    }, function (e) { s.busy = false; paintSheet(); err((e && e.message) || '發送失敗'); if (e && e.code === 'ERR_AUTH') { closeSheet(true); fail(e); } });
  }
  /* ---- 退回確認金額（助教） ---- */
  function openReopen(key, opener) {
    var row = C.prepFind(key); if (!row) return;
    st.sheet = { kind: 'reopen', key: key, opener: opener, busy: false };
    st.sheet.view = function () {
      return { title: '退回確認金額', sub: who(row) + '・目前確認金額 ' + esc(money(tt(row).priceConfirmed)), busy: st.sheet.busy,
        body: '<div class="tk-field"><label class="tk-lbl" for="of-rr">退回原因（選填）</label><input id="of-rr" class="of-text" maxlength="60" placeholder="例：學姐改選其他方案"></div><p class="help">退回後卡片回到「確認金額」，天使助教再請校長確認一次。</p>',
        note: '', foot: '<button type="button" class="btn btn-secondary" data-of="close">取消</button><button type="button" class="btn btn-primary" data-of="reopen-ok"' + (st.sheet.busy ? ' disabled aria-busy="true"' : '') + '>退回確認金額</button>' };
    };
    paintSheet();
  }
  function submitReopen() {
    var s = st.sheet; if (!s || s.busy) return;
    var r = document.getElementById('of-rr'), reason = r ? r.value.trim() : '';
    s.busy = true; paintSheet();
    call('order_price_reopen', { rosterKey: s.key, reason: reason, by: 'assistant' }).then(function (res) { s.busy = false; closeSheet(true); toast('已退回確認金額，已通知校長', 'ok'); C.afterPrep(res.row); }, function (e) { s.busy = false; paintSheet(); err((e && e.message) || '退回失敗'); });
  }

  /* ================================================================== */
  /* 交付教材頁                                                            */
  /* ================================================================== */
  function tabOf(f) { if (f.closedAt || f.closed) return ''; if (f.abandonedAt) return 'log'; return f.state === 'notified' ? 'wait' : f.state === 'ordered' ? 'ready' : f.state === 'delivered' ? 'log' : ''; }
  function flowsBy(tab) {
    var L = (st.flows || []).filter(function (f) { return tabOf(f) === tab; });
    if (tab === 'wait') L.sort(function (a, b) { return (a.deadlineMs || 9e15) - (b.deadlineMs || 9e15); });
    else if (tab === 'ready') L.sort(function (a, b) { return String(a.matchedAt) < String(b.matchedAt) ? -1 : 1; });
    else L.sort(function (a, b) { return String(a.deliveredAt || a.abandonedAt) < String(b.deliveredAt || b.abandonedAt) ? 1 : -1; });
    return L;
  }
  function counts() { var c = {}; TABS.forEach(function (t) { c[t[0]] = flowsBy(t[0]).length; }); return c; }
  function load(force) {
    if (st.loading) return st.loading;
    if (st.flows && !force) return Promise.resolve();
    st.loading = Promise.all([call('material_list', {}), call('order_status', {}).catch(function () { return null; })]).then(function (r) {
      st.flows = (r[0] && r[0].rows) || []; st.status = r[1]; st.loading = null;
      if (C.setNavCount) C.setNavCount(counts().wait + counts().ready);
    }, function (e) { st.loading = null; throw e; });
    return st.loading;
  }
  function show(rootEl, tab, focus) {
    st.root = rootEl; if (tab) st.tab = tab; if (focus) st.focus = focus;
    if (!rootEl.dataset.ofBuilt) {
      rootEl.dataset.ofBuilt = '1';
      rootEl.innerHTML = '<header class="tk-head of-head"><div><h1>交付教材</h1><p class="tk-asof" id="of-asof"></p></div><div class="of-hsync" id="of-hsync"></div></header><div id="of-guidebox"></div><div class="tk-tabbar" id="of-tabs"></div><div id="of-body"></div>';   // 3.3.3 頁首固定「同步學院下單」
      rootEl.addEventListener('click', onClick);
      rootEl.addEventListener('change', onChange);
    }
    if (st.flows) paint(); else document.getElementById('of-body').innerHTML = '<div class="card loading-card" aria-busy="true"><p class="loading-t">讀取交付教材…</p><div class="sk-line"></div><div class="sk-line short"></div></div>';
    load(true).then(paint, function (e) { if (e && e.code === 'ERR_AUTH') return fail(e); var b = document.getElementById('of-body'); if (b) b.innerHTML = '<div class="card"><div class="empty" role="alert">' + I('alert') + '<h2>交付教材讀取失敗</h2><p>' + esc((e && e.message) || '') + '</p><button class="btn btn-secondary has-icon" type="button" data-of="retry">' + I('refresh') + '重新讀取資料</button></div></div>'; });
  }
  function defaultTab() { var c = counts(); return c.wait ? 'wait' : c.ready ? 'ready' : 'wait'; }
  function paint() {
    var rootEl = st.root; if (!rootEl || !document.getElementById('of-body')) return;
    if (st.focus) { var ff = (st.flows || []).filter(function (f) { return f.rosterKey === st.focus; }).pop(); if (ff && tabOf(ff)) st.tab = tabOf(ff); }
    if (!st.tab || TABS.every(function (t) { return t[0] !== st.tab; })) st.tab = defaultTab();
    var c = counts(), orderBy = st.tab === 'wait' ? '依下單期限排序' : st.tab === 'ready' ? '依比對時間排序' : '依交付時間排序';
    document.getElementById('of-asof').innerHTML = '更新於 <span class="mono">' + esc(fmtW(Date.now())) + '</span>・' + orderBy;
    document.getElementById('of-tabs').innerHTML = '<div class="tk-tabs of-tabs" role="tablist" aria-label="交付教材">' + TABS.map(function (t) {
      var on = t[0] === st.tab, n = c[t[0]];
      return '<button type="button" role="tab" class="tk-tab ' + t[0] + (on ? ' on' : '') + '" id="of-tab-' + t[0] + '" data-of-tab="' + t[0] + '" aria-selected="' + on + '" aria-controls="of-panel" tabindex="' + (on ? '0' : '-1') + '"><span class="tk-tab-tx"><span class="tk-tab-t">' + esc(t[1]) + '</span><span class="tk-tab-o">' + esc(t[2]) + '</span></span><span class="tk-tab-n' + (n && t[0] !== 'log' ? ' lit' : '') + '">' + n + '</span></button>';
    }).join('') + '</div>';
    var hs = document.getElementById('of-hsync'), gb = document.getElementById('of-guidebox');
    if (hs) hs.innerHTML = '<span class="of-last">上次同步 <b class="mono">' + esc(st.status && st.status.syncAt ? fmt(st.status.syncAt) : '尚未同步') + '</b></span><button type="button" class="btn btn-primary has-icon" data-of="guide" aria-expanded="' + !!st.open.guide + '" aria-controls="of-guide">' + I('refresh', 'sm') + '同步學院下單</button>';
    if (gb) gb.innerHTML = guideHTML();
    var L = flowsBy(st.tab), h = '<section class="tk-panel of-panel" id="of-panel" role="tabpanel" aria-labelledby="of-tab-' + st.tab + '">';
    if (st.tab === 'wait') h += '<p class="tk-panel-d">已發送下單通知、尚未比對到下單的學姐；比對成功後自動移到待交付</p>';
    if (st.tab === 'ready' || st.tab === 'log') h += dlSetHTML();   // 3.3.0 預設下載期限
    if (st.tab === 'ready') h += '<p class="tk-panel-d">比對到下單或手動標記後即自動交付最後測試通過的工具版本；留在這裡的卡片表示自動交付未完成，校長或助教可按「發送教材」</p>';
    if (st.tab === 'log') h += '<p class="tk-panel-d">交付完成或放棄領取時自動寫入；已放棄可恢復回等待下單</p>';
    if (!L.length) h += '<div class="tk-empty" role="status"><b>' + esc(st.tab === 'wait' ? '目前沒有等待下單的學姐' : st.tab === 'ready' ? '目前沒有待交付的教材' : '尚無交付紀錄') + '</b><span>' + esc(st.tab === 'wait' ? '助教在「確認下單」發送下單通知後會出現在這裡' : st.tab === 'ready' ? '比對到訂單且尚未交付的學姐會出現在這裡' : '交付後保留完整時間軸') + '</span></div>';
    else if (st.tab === 'log') h += logHTML(L);
    else h += '<div class="tk-grid of-grid">' + L.map(st.tab === 'wait' ? waitCard : readyCard).join('') + '</div>';
    h += '</section>';
    document.getElementById('of-body').innerHTML = h;
    hash();
    if (st.focus) { var el = rootEl.querySelector('[data-of-card="' + st.focus + '"]'); st.focusHi = st.focus; st.focus = ''; if (el) setTimeout(function () { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 30); }
    if (st.focusHi) { var e2 = rootEl.querySelector('[data-of-card="' + st.focusHi + '"]'); if (e2) e2.classList.add('tk-focus'); }
  }
  function hash() { if (!/^#\/material(\/|$)/.test(location.hash)) return; var hh = '#/material/' + st.tab; if (location.hash !== hh && !/^#\/material\/(wait|ready|log)\/[0-9a-f]{16}$/.test(location.hash)) history.replaceState(null, '', hh); }
  /** 3.3.3 頁首同步說明（不論有無等待者都可開啟） */
  function guideHTML() {
    var n = flowsBy('wait').filter(function (f) { return !expiredOf(f); }).length, bm = C.orderBookmarklet || '';
    return bmSlot() + '<div class="of-guide" id="of-guide"' + (st.open.guide ? '' : ' hidden') + '><ol>' +
      '<li><b>開啟學院後台</b><span>請用這個按鈕開啟學院後台並登入；書籤會把結果直接送回這個分頁，不需要允許彈出視窗</span><a class="btn btn-secondary has-icon" href="' + SITE_ADMIN + '" target="_blank" rel="opener">' + I('ext', 'sm') + '開啟學院後台</a></li>' +
      '<li><b>點書籤「同步學院下單」</b><span>在已登入的學院後台分頁點書籤列上的「同步學院下單」。尚未安裝：把右側按鈕拖到書籤列，或複製後新增書籤貼到網址欄</span><span class="of-bm">' + (bm ? '<a class="btn btn-secondary" href="' + esc(bm) + '" data-of="bm" title="拖曳到書籤列">同步學院下單</a>' : '') + '<button type="button" class="btn btn-secondary has-icon" data-of="copy-bm"' + (bm ? '' : ' disabled') + '>' + I('copy', 'sm') + '一鍵複製書籤</button></span></li>' +
      '<li><b>自動比對</b><span>目前等待下單 ' + n + ' 位；核對本人、下單通知後購買、商品名稱含「諮詢教材」或「AI指令」、金額相符 → 待交付並自動交付</span></li></ol></div>';
  }
  /** 3.3.7 書籤版本：舊版「同步學院下單」書籤時顯示重新安裝提示（內容由後台 bmNotice 提供，回報後即時更新） */
  function bmSlot() { return '<div data-bmv-slot="orders">' + (typeof C.bmNotice === 'function' ? C.bmNotice('orders') : '') + '</div>'; }
  function syncBar() {
    var s = st.status || {}, n = flowsBy('wait').filter(function (f) { return !expiredOf(f); }).length, at = s.syncAt;   // 3.3.2 逾下單期限者不列入同步
    var open = !!st.open.guide;
    var bm = C.orderBookmarklet || '';
    return '<div class="of-sync"><span class="dot' + (at ? '' : ' off') + '"></span><span>學院下單同步 <b class="mono">' + (at ? esc(fmt(at)) : '尚未同步') + '</b>・只同步等待下單中的 <b>' + n + '</b> 位學姐・規則：本人、下單通知後購買、商品名稱含「諮詢教材」或「AI指令」、金額相符</span><span class="sp"></span>' +
      '<button type="button" class="btn btn-primary has-icon" data-of="guide" aria-expanded="' + open + '" aria-controls="of-guide"' + (n ? '' : ' disabled') + '>' + I('refresh', 'sm') + '同步學院下單</button></div>' + bmSlot() +
      '<div class="of-guide" id="of-guide"' + (open ? '' : ' hidden') + '><ol>' +
      '<li><b>開啟學院後台</b><span>請用這個按鈕開啟學院後台並登入；書籤會把結果直接送回這個分頁，不需要允許彈出視窗</span><a class="btn btn-secondary has-icon" href="' + SITE_ADMIN + '" target="_blank" rel="opener">' + I('ext', 'sm') + '開啟學院後台</a></li>' +
      '<li><b>點書籤「同步學院下單」</b><span>在學院後台分頁點書籤列上的「同步學院下單」。尚未安裝：把右側按鈕拖到書籤列，或複製後新增書籤貼到網址欄</span><span class="of-bm">' + (bm ? '<a class="btn btn-secondary" href="' + esc(bm) + '" data-of="bm" title="拖曳到書籤列">同步學院下單</a>' : '') + '<button type="button" class="btn btn-secondary has-icon" data-of="copy-bm"' + (bm ? '' : ' disabled') + '>' + I('copy', 'sm') + '一鍵複製書籤</button></span></li>' +
      '<li><b>自動比對</b><span>書籤會把這 ' + n + ' 位學姐的購買紀錄送回這個分頁比對；比對成功且工具通過測試者自動交付</span></li></ol></div>';
  }
  function head(f, chip, chipCls) {
    var cm = msOf(f.counselAt);
    return '<div class="of-chead"><div class="of-av">' + esc(initial(f.name)) + '</div><div class="of-cname"><b>' + esc(f.name || '') + '</b>' + (f.callName && f.callName !== f.name ? '<span>' + esc(f.callName) + '</span>' : '') + '<small>諮詢 <span class="mono">' + (cm != null ? esc(fmtDay(cm)) : '—') + '</span></small></div><span class="of-chip ' + chipCls + '">' + esc(chip) + '</span></div>';
  }
  function turn(whoTxt, cls, what) { return '<div class="of-turn"><span>目前輪到</span><span class="who ' + cls + '">' + esc(whoTxt) + '</span><b>' + esc(what) + '</b></div>'; }
  function timeline(f) { return '<ol class="of-tl" aria-label="時間軸">' + (f.timeline || []).map(function (x) { return '<li class="' + (x.at ? 'on' : '') + '"><span class="k">' + esc(x.label) + '</span><span class="mono">' + (x.at ? esc(x.at) : '—') + '</span></li>'; }).join('') + '</ol>'; }
  /** 3.3.2 下單期限已過（等待下單）：停止列入同步與自動交付 */
  function expiredOf(f) { if (f.orderExpired != null && f.orderExpired !== '') return !!f.orderExpired; return f.state === 'notified' && f.deadlineMs != null && Date.now() > f.deadlineMs; }
  var KIND_LABEL = { html: 'HTML 檔', zip: 'ZIP', file: '工具檔' };   // 3.3.4 一律以原始檔下載交付
  function toolKindLabel(f) { var k = f.tool && (f.tool.openKind === 'html' || f.tool.openKind === 'zip') ? f.tool.openKind : 'file'; return KIND_LABEL[k]; }
  function srcLine(f) {
    var tool = f.tool && f.tool.url && f.tool.reusable !== false, k = esc(f.flowId);   // 3.3.2 網址型工具不可沿用
    var cur = f.deliverSource === 'tool' ? '沿用工具檔（' + toolKindLabel(f) + '）・' + esc((f.tool && (f.tool.fileName || f.tool.name)) || '') : f.fileName ? '教材 ZIP・' + esc(f.fileName) + (f.fileSize ? '・' + sizeText(f.fileSize) : '') : '';
    return '<div class="of-src' + (cur ? ' ok' : '') + '"><div class="t">' + I(cur ? 'check' : 'upload', 'sm') + '<span>' + (cur ? '交付檔案：' + cur : '交付檔案：尚未設定（比對成功後需人工上傳才可交付）') + '</span></div><div class="a">' +
      '<label class="btn btn-secondary has-icon of-up"><input type="file" accept=".zip,application/zip" data-of-zip="' + k + '" hidden>' + I('upload', 'sm') + (f.fileName ? '重新上傳 ZIP' : '上傳教材 ZIP') + '</label>' +
      (tool ? '<button type="button" class="btn btn-secondary" data-of="use-tool" data-flow="' + k + '"' + (f.deliverSource === 'tool' ? ' aria-pressed="true"' : '') + '>沿用工具檔（' + toolKindLabel(f) + '）</button>' : f.tool && f.tool.url ? '<span class="of-note">網址型工具不可沿用，請上傳教材 ZIP</span>' : '') + '</div>' +
      (st.busy['up_' + f.flowId] ? '<div class="tk-prog"><i style="width:' + st.busy['up_' + f.flowId] + '%"></i></div>' : '') + '</div>';
  }
  function waitCard(f) {
    var now = Date.now(), dl = f.deadlineMs, left = dl == null ? null : dl - now;
    var exp = expiredOf(f);
    var chip = exp ? '已逾下單期限' : f.matchIssue ? (f.matchIssue === 'recipient' ? '收件人待確認' : '金額不符') : f.claimAt ? '回報已下單' : left != null && left < 0 ? '已逾期' : left != null && left < 24 * 3600e3 ? '即將逾期' : '等待下單';
    var cls = exp || f.matchIssue ? 'err' : f.claimAt ? 'ok' : left != null && left < 24 * 3600e3 ? 'warn' : 'info', k = esc(f.flowId);
    var mk = st.open['mk_' + f.flowId];
    return '<article class="of-card tk-card' + (f.matchIssue ? ' of-issue' : '') + '" data-of-card="' + esc(f.rosterKey) + '">' + head(f, chip, cls) + (exp ? turn('校長或助教', '', '期限後購買需人工確認') : turn('學姐', 'sys', f.claimAt ? '學姐回報已下單・待同步確認' : '官網下單・系統比對中')) + segs('wait') +
      retestLine(f) + (exp ? '<div class="of-warn" role="note">' + I('alert', 'sm') + '<span><b>已逾下單期限：</b>不再列入同步學院下單與自動交付；期限後購買請人工確認訂單後，用下方「手動標記已下單」移到待交付</span></div>' : '') + '<div class="of-wait">已發送 <span class="mono">' + esc(fmt(f.notifiedAt)) + '</span>・金額 <span class="mono">' + esc(money(f.amount)) + '</span><br>下單期限 <span class="mono">' + esc(fmt(f.deadline)) + '</span>' + (left != null ? '・' + (left < 0 ? '<em>已逾期 ' + esc(span(left)) + '</em>' : '剩 <em>' + esc(span(left)) + '</em>') : '') + '</div>' +
      (f.matchIssue ? '<div class="of-warn" role="alert">' + I('alert', 'sm') + '<span><b>' + esc(f.matchIssueText || '請確認') + '</b>' + (f.matchNote ? '・' + esc(f.matchNote) : '') + (f.deliverHold ? '・' + esc(f.deliverHold) : '') + '<br>確認無誤後可用下方「手動標記已下單」移到待交付</span></div>' : '') +
      verLine(f) + timeline(f) +
      '<div class="of-acts"><button type="button" class="btn btn-secondary has-icon of-abandon" data-of="ab" data-flow="' + k + '" aria-expanded="' + !!st.open['ab_' + f.flowId] + '">' + I('minus', 'sm') + '放棄領取</button>' +
      '<a class="btn btn-secondary has-icon" href="' + SITE_POINTS + '" target="_blank" rel="noopener" title="開啟學院後台「點數使用紀錄」，以本名篩選這位學姐的扣點紀錄">' + I('ext', 'sm') + '查看點數紀錄</a><span class="of-note">比對成功後自動移至待交付</span></div>' +
      (st.open['ab_' + f.flowId] ? '<div class="of-abf" role="group" aria-label="確認放棄領取"><b>確認放棄領取？</b><p>流程標為已放棄，停止同步比對與自動交付，移至交付紀錄；不會通知學姐。可於交付紀錄恢復。</p><label class="tk-lbl" for="of-ab-' + k + '">原因（選填）</label><input id="of-ab-' + k + '" class="of-text" maxlength="60" placeholder="例：點數餘額不足，暫不下單"><div class="of-acts"><button type="button" class="btn btn-primary" data-of="ab-ok" data-flow="' + k + '">確認放棄</button><button type="button" class="btn btn-secondary" data-of="ab" data-flow="' + k + '">取消</button></div></div>' : '') +
      '<div class="of-mk"><button type="button" class="of-link" data-of="mk" data-flow="' + k + '" aria-expanded="' + !!mk + '">手動標記已下單</button>' +
      (mk ? '<div class="of-mkf"><label class="tk-lbl" for="of-mk-' + k + '">原因（必填，寫入操作紀錄）</label><input id="of-mk-' + k + '" class="of-text" maxlength="80" placeholder="例：學院後台同步失敗，已人工核對訂單"><div class="of-acts"><button type="button" class="btn btn-secondary" data-of="mk" data-flow="' + k + '">取消</button><button type="button" class="btn btn-primary" data-of="mk-ok" data-flow="' + k + '">標記已下單</button></div></div>' : '') + '</div></article>';
  }
  /* 3.3.0 上傳新版後待重新測試：不撤回下單通知，交付（含自動交付）等重新測試通過 */
  function retestOf(f) { return !!(f && f.tool && (f.tool.retestNeeded || (f.tool.state && f.tool.state !== 'pass'))); }
  function retestLine(f) { return retestOf(f) ? '<div class="of-warn" role="note">' + I('alert', 'sm') + '<span><b>工具已更新，需重新測試：</b>助教重新測試通過後才可交付' + (f.matchBy === 'sync' ? '（屆時自動交付）' : '') + '</span></div>' : ''; }
  /** 3.3.3 交付版本：最後通過測試的工具第 N 版 */
  function verOf(f) { return Number(f.deliverVersion) || (f.tool && Number(f.tool.version)) || 0; }
  function verLine(f) { var v = verOf(f); return v ? '<div class="of-ver"><span>交付版本：第 <b class="mono">' + v + '</b> 版</span>' + (f.tool && f.tool.openKind ? '<span>' + esc(KIND_LABEL[f.tool.openKind] || (f.tool.kind === 'url' ? '網址工具' : '工具檔')) + '</span>' : '') + '</div>' : ''; }
  function readyCard(f) {
    var k = esc(f.flowId), manual = f.matchBy === 'manual', ret = retestOf(f), url = f.tool && f.tool.url && f.tool.reusable === false && !f.driveFileId;
    var why = f.deliverHold || (ret ? '工具已更新，需重新測試通過才可交付' : url ? '網址型工具無法交付，請在諮詢準備上傳檔案型工具（HTML 或 ZIP）' : !f.deliverReady ? '交付檔案尚未備妥' : '');
    var failed = !!why && !ret;
    return '<article class="of-card tk-card' + (failed ? ' of-issue' : '') + '" data-of-card="' + esc(f.rosterKey) + '">' + head(f, failed ? '自動交付失敗' : ret ? '等待重新測試' : '待交付', failed ? 'err' : ret ? 'warn' : 'info') + segs('ready') +
      '<div class="of-match' + (manual ? ' manual' : '') + '"><b>✓ ' + esc(fmt(f.matchedAt)) + ' ' + (manual ? '手動標記已下單' : '學院下單比對成功') + '</b><span>' + esc(f.matchNote || '') + (f.matchAmount ? '・' + esc(money(f.matchAmount)) + (Number(f.matchAmount) === Number(f.amount) ? ' 相符' : '') : '') + '</span></div>' + verLine(f) +
      (why ? '<div class="of-warn" role="alert">' + I('alert', 'sm') + '<span><b>' + (ret ? '' : '未自動交付：') + '</b>' + esc(why) + '</span>' + (ret ? '' : '<button type="button" class="btn btn-primary has-icon" data-of="deliver" data-flow="' + k + '"' + (f.deliverReady && !url ? '' : ' disabled') + '>' + I('send', 'sm') + '發送教材</button>') + '</div>'
        : '<p class="of-auto">' + I('alert', 'sm') + '自動交付未完成（' + (manual ? '手動標記' : '比對成功') + '時未送出），請按「發送教材」交付最後測試通過的版本</p><div class="of-acts"><button type="button" class="btn btn-primary has-icon" data-of="deliver" data-flow="' + k + '">' + I('send', 'sm') + '發送教材</button></div>') +
      timeline(f) + '</article>';
  }
  function dlCell(f) {
    if (!f.dlDeadline) return '<span class="muted">未設定</span>';
    var st0 = f.dlRevokedAt ? '<span class="of-chip err">已過期・已撤銷</span>' : f.dlExpired ? '<span class="of-chip err">已過期</span>' : '<span class="of-chip ok">期限內</span>';
    return esc(fmt(f.dlDeadline)) + ' ' + st0 + '<br><small>' + (f.dlClickAt ? '首次下載 ' + esc(fmt(f.dlClickAt)) + (f.dlClickN > 1 ? '・共 ' + f.dlClickN + ' 次' : '') : '尚未點擊下載') + '</small>';
  }
  /** 預設下載期限（自動交付使用；校長可改） */
  function dlSetHTML() {
    return '<div class="of-dlset"><label for="of-dldays">自動交付的下載期限</label><span>交付後</span><input id="of-dldays" class="mono" inputmode="numeric" value="' + dlDays() + '" aria-label="預設下載期限天數"><span>天（當天 23:59）</span><button type="button" class="btn btn-secondary btn-sm" data-of="dl-save">儲存</button><small>人工交付時另行選擇；期限後下載連結自動失效</small></div>';
  }
  /** 3.3.3 交付紀錄：交付時間、學姐、交付版本、交付方式、領取狀態（已放棄可恢復） */
  function pickCell(f) {
    if (f.abandonedAt) return '<span class="of-chip err">已放棄</span>' + (f.abandonReason ? '・' + esc(f.abandonReason) : '') + '・<span class="mono">' + esc(fmt(f.abandonedAt)) + '</span> <button type="button" class="btn btn-secondary btn-sm" data-of="restore" data-flow="' + esc(f.flowId) + '">恢復</button>';
    return (f.dlClickAt ? '<span class="of-chip ok">已領取</span> <span class="mono">' + esc(fmt(f.dlClickAt)) + '</span>' : '<span class="of-chip">未領取</span>') + '<br><small>下載期限 ' + dlCell(f) + '</small>';
  }
  function logHTML(L) {
    var how = function (f) { return f.abandonedAt ? '—' : f.deliverAuto ? '系統自動' : '手動發送'; };
    var rows = L.map(function (f) {
      var k = esc(f.flowId), op = !!st.open['tl_' + f.flowId], v = verOf(f);
      return '<tr' + (f.abandonedAt ? ' class="ab"' : '') + '><td class="mono">' + esc(fmt(f.deliveredAt || f.abandonedAt)) + '</td><td><b>' + esc(f.name || '') + '</b><small>' + esc(f.callName || '') + '學姐</small></td><td class="mono">' + (v ? '第 ' + v + ' 版' : '—') + '</td><td>' + how(f) + '</td><td>' + pickCell(f) + '</td>' +
        '<td><button type="button" class="of-link" data-of="tl" data-flow="' + k + '" aria-expanded="' + op + '">時間軸</button></td></tr>' + (op ? '<tr class="of-tlrow"><td colspan="6">' + timeline(f) + '</td></tr>' : '');
    }).join('');
    var cards = L.map(function (f) { var v = verOf(f); return '<article class="of-card tk-card mini">' + head(f, f.abandonedAt ? '已放棄' : f.deliverAuto ? '系統自動' : '手動發送', f.abandonedAt ? 'err' : 'ok') + '<p class="of-sub"><span class="mono">' + esc(fmt(f.deliveredAt || f.abandonedAt)) + '</span>・' + (v ? '第 ' + v + ' 版' : '—') + '</p><p class="of-sub">' + pickCell(f) + '</p>' + timeline(f) + '</article>'; }).join('');
    return '<div class="of-logwrap"><table class="of-logt"><thead><tr><th>交付時間</th><th>學姐</th><th>交付版本</th><th>交付方式</th><th>領取狀態</th><th>紀錄</th></tr></thead><tbody>' + rows + '</tbody></table><div class="of-logm">' + cards + '</div></div>';
  }
  function findFlow(id) { return (st.flows || []).filter(function (f) { return f.flowId === id; })[0]; }
  function replaceFlow(f) { if (!f) return; var i = (st.flows || []).map(function (x) { return x.flowId; }).indexOf(f.flowId); if (i >= 0) st.flows[i] = f; else (st.flows = st.flows || []).push(f); if (C.setNavCount) C.setNavCount(counts().wait + counts().ready); }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(new Error('copy')); } catch (e) { rej(e); } ta.remove(); });
  }
  function onChange(ev) {
    var inp = ev.target; if (!inp || !inp.dataset || !inp.dataset.ofZip || !inp.files || !inp.files[0]) return;
    var id = inp.dataset.ofZip, file = inp.files[0];
    if (file.size > 50 * 1024 * 1024) { toast('教材檔超過 50 MB', 'err'); return; }
    st.busy['up_' + id] = 1; paint();
    C.materialUpload(id, file, function (p) { st.busy['up_' + id] = Math.max(1, Math.round(p.sent / Math.max(1, p.total) * 100)); var b = document.querySelector('[data-of-zip="' + id + '"]'); if (b) { var bar = b.closest('.of-src').querySelector('.tk-prog i'); if (bar) bar.style.width = st.busy['up_' + id] + '%'; } })
      .then(function (r) { delete st.busy['up_' + id]; replaceFlow(r.flow); toast('已上傳教材 ZIP（' + file.name + '）', 'ok'); paint(); }, function (e) { delete st.busy['up_' + id]; paint(); fail(e, '上傳失敗'); });
  }
  function onClick(ev) {
    var b = ev.target.closest('[data-of],[data-of-tab]'); if (!b || !st.root || !st.root.contains(b)) return;
    if (b.dataset.of === 'dl-save') { var di = document.getElementById('of-dldays'), dv = Math.floor(Number(di && di.value)); if (!(dv >= 1 && dv <= 60)) { toast('預設下載期限需為 1–60 天', 'err'); return; } b.disabled = true; call('order_dl_settings_save', { days: dv }).then(function (r) { b.disabled = false; st.status = st.status || {}; st.status.dl = r; toast('已儲存：自動交付的下載期限為交付後 ' + r.days + ' 天', 'ok'); }, function (e) { b.disabled = false; fail(e, '儲存失敗'); }); return; }
    if (b.dataset.ofTab) { st.tab = b.dataset.ofTab; st.focusHi = ''; history.replaceState(null, '', '#/material/' + st.tab); paint(); return; }
    var a = b.dataset.of, id = b.dataset.flow, f = id ? findFlow(id) : null;
    if (a === 'bm') { ev.preventDefault(); toast('請把這個按鈕拖曳到書籤列；在學院後台點書籤才會執行', 'info'); return; }
    if (a === 'retry') { show(st.root); return; }
    if (a === 'guide') { st.open.guide = !st.open.guide; paint(); return; }
    if (a === 'copy-bm') { copyText(C.orderBookmarklet || '').then(function () { toast('已複製書籤：新增書籤，名稱填「同步學院下單」，網址貼上即可', 'ok'); }, function () { toast('複製失敗，請改用拖曳到書籤列', 'err'); }); return; }
    if (a === 'tl') { st.open['tl_' + id] = !st.open['tl_' + id]; paint(); return; }
    if (a === 'ab') { st.open['ab_' + id] = !st.open['ab_' + id]; paint(); if (st.open['ab_' + id]) { var y = document.getElementById('of-ab-' + id); if (y) y.focus(); } return; }
    if (a === 'mk') { st.open['mk_' + id] = !st.open['mk_' + id]; paint(); if (st.open['mk_' + id]) { var x = document.getElementById('of-mk-' + id); if (x) x.focus(); } return; }
    if (!f) return;
    if (a === 'mk-ok') {
      var inp = document.getElementById('of-mk-' + id), reason = inp ? inp.value.trim() : '';
      if (reason.length < 2) { toast('請填寫手動標記的原因', 'err'); if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } return; }
      b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = '標記中…';   // 3.3.4 標記＋自動交付需數秒，顯示忙碌
      call('order_mark_ordered', { flowId: id, reason: reason }).then(function (r) {
        st.open['mk_' + id] = false; replaceFlow(r.flow);
        var d = r.deliver || {};
        toast(d.delivered ? '已標記已下單，教材已自動交付給學姐' : d.already ? '已標記已下單（教材先前已交付）' : '已標記已下單，移到「待交付」' + (d.reason ? '：' + d.reason + '，請按「發送教材」' : ''), d.delivered ? 'ok' : 'info');
        st.tab = d.delivered ? 'log' : 'ready'; paint();
      }, function (e) { b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = '標記已下單'; fail(e, '標記失敗'); });
    } else if (a === 'ab-ok') {   // 3.3.3 放棄領取
      var ai = document.getElementById('of-ab-' + id); b.disabled = true;
      call('order_abandon', { flowId: id, reason: ai ? ai.value.trim() : '', by: role() }).then(function (r) { st.open['ab_' + id] = false; replaceFlow(r.flow); toast('已放棄領取，移到交付紀錄（未通知學姐）', 'ok'); paint(); }, function (e) { b.disabled = false; fail(e, '放棄領取失敗'); });
    } else if (a === 'restore') {
      b.disabled = true;
      call('order_restore', { flowId: id }).then(function (r) { replaceFlow(r.flow); toast('已恢復，回到等待下單', 'ok'); paint(); }, function (e) { b.disabled = false; fail(e, '恢復失敗'); });
    } else if (a === 'use-tool') {
      call('order_deliver_source', { flowId: id, source: 'tool' }).then(function (r) { replaceFlow(r.flow); toast('交付檔案：沿用工具檔', 'ok'); paint(); }, function (e) { fail(e); });
    } else if (a === 'deliver') openDeliver(f, b);
  }
  /* ---- 待交付：預覽交付卡片 → 發送 ---- */
  function openDeliver(f, opener) {
    var dd = dlDays(), pre = f.downloadDeadline && msOf(f.downloadDeadline) > Date.now() ? partsOf(f.downloadDeadline) : null;   // 3.3.4 預設帶入下單時設定的下載截止
    st.sheet = { kind: 'deliver', flowId: f.flowId, opener: opener, busy: true, preview: null, date: pre ? pre.date : quickDate(dd), time: pre ? pre.time : '23:59', quick: pre ? 0 : [3, 5, 7].indexOf(dd) >= 0 ? dd : 0 };
    st.sheet.view = function () {
      var s = st.sheet, p = s.preview, ok = p && p.recipient && p.recipient.ok;
      var dlBox = '<div class="tk-field"><span class="tk-lbl" id="of-dl-l">下載截止<span class="of-req">必填</span></span><div class="of-two"><input id="of-date" type="date" aria-labelledby="of-dl-l" value="' + esc(s.date) + '"><input id="of-time" type="time" aria-label="下載截止時間" value="' + esc(s.time) + '"></div>' +
        '<div class="of-q" role="group" aria-label="快選">' + [3, 5, 7].map(function (d) { return '<button type="button" data-of-q="' + d + '" aria-pressed="' + (s.quick === d) + '">+' + d + ' 天</button>'; }).join('') + '</div><div class="help">期限後下載連結失效（Drive 取消知道連結可檢視），學姐點按鈕會看到「下載期限已過」</div></div>';
      var body = !p ? '<div class="card loading-card" aria-busy="true"><p class="loading-t">產生交付卡片…</p><div class="sk-line"></div></div>'
        : dlBox + '<div class="of-pv" id="of-pv"></div><dl class="of-sum"><dt>收件人</dt><dd>' + esc(p.recipient.name) + '（LINE 已核對' + (ok ? '' : '：未通過') + '）</dd><dt>交付檔案</dt><dd>' + esc(p.source.kind === 'tool' ? '沿用工具檔（' + (p.source.kindLabel || '工具檔') + '）・' : '教材 ZIP・') + esc(p.source.name) + '</dd><dt>交付方式</dt><dd>' + (p.source.kind === 'tool' ? '複製一份到「諮詢教材交付／本名」（檔名同上傳原檔），學姐按「領取教材」直接下載原始檔；期限後連結失效' : '學姐按「領取教材」直接下載原始檔；期限後連結失效') + '</dd></dl>' +
          (ok ? '' : '<div class="of-notice">' + I('alert', 'sm') + '<span>無法發送：' + esc(p.recipient.reason) + '</span></div>');
      return { title: '交付教材', sub: esc(f.name || '') + '・' + esc(f.callName || '') + '學姐', steps: stepsHTML(['選擇檔案', '預覽卡片'], 1), busy: s.busy, body: body, note: '發送後移到「交付紀錄」',
        foot: '<button type="button" class="btn btn-secondary" data-of="close"' + (s.busy && p ? ' disabled' : '') + '>取消</button><button type="button" class="btn btn-primary has-icon" data-of="deliver-ok"' + (ok && !s.busy ? '' : ' disabled') + '>' + I('send', 'sm') + (s.busy && p ? '發送中…' : '發送教材') + '</button>' };
    };
    st.sheet.after = function () {
      var s = st.sheet; if (s && s.preview && s.preview.card && C.renderFlex) { var pv = document.getElementById('of-pv'); if (pv) C.renderFlex(pv, s.preview.card); }
      ['of-date', 'of-time'].forEach(function (id) { var e = document.getElementById(id); if (e) e.addEventListener('change', function () { dlSync(); if (st.sheet) { st.sheet.quick = 0; deliverPreview(); } }); });
    };
    paintSheet();
    deliverPreview(f);
    return;
    call('order_deliver', { flowId: f.flowId, preview: true }).then(function (r) { if (!st.sheet || st.sheet.flowId !== f.flowId) return; st.sheet.busy = false; st.sheet.preview = r; paintSheet(); }, function (e) { st.sheet.busy = false; closeSheet(true); fail(e, '無法產生交付卡片'); });
  }
  /* 3.3.0 下載期限 */
  function dlDays() { var d = st.status && st.status.dl && Number(st.status.dl.days); return d >= 1 ? d : 7; }
  function dlSync() { var s = st.sheet; if (!s) return; ['date', 'time'].forEach(function (k) { var e = document.getElementById('of-' + k); if (e) s[k] = e.value; }); }
  function deliverPreview(f) {
    var s = st.sheet; if (!s) return; s.busy = true; paintSheet();
    call('order_deliver', { flowId: s.flowId, preview: true, dlDeadline: isoOf(s.date, s.time) }).then(function (r) { if (!st.sheet || st.sheet.flowId !== s.flowId) return; st.sheet.busy = false; st.sheet.preview = r; paintSheet(); }, function (e) { if (!st.sheet) return; st.sheet.busy = false; if (st.sheet.preview) { paintSheet(); fail(e, '預覽失敗'); } else { closeSheet(true); fail(e, '預覽失敗'); } });
  }
  function sendDeliver() {
    var s = st.sheet; if (!s || s.busy) return; dlSync();
    var dms = Date.parse(isoOf(s.date, s.time)); if (!s.date || !s.time || isNaN(dms)) { err('請填下載期限（日期與時間）'); return; } if (dms < Date.now()) { err('下載期限已過，請重新選擇'); return; }
    s.busy = true; paintSheet();
    call('order_deliver', { flowId: s.flowId, dlDeadline: isoOf(s.date, s.time) }).then(function (r) { s.busy = false; closeSheet(true); replaceFlow(r.flow); toast(r.already ? '這份教材已交付過，不重複發送' : '已發送教材', 'ok'); paint(); }, function (e) { s.busy = false; paintSheet(); err((e && e.message) || '發送失敗'); load(true).then(paint); });
  }

  /* ================================================================== */
  /* 同步學院下單（#/order-sync）：書籤開啟本頁                               */
  /* ================================================================== */
  var sy = { bound: false, src: null, origin: '', targets: null, state: 'wait', result: null };
  function syncBind() { if (!sy.bound && typeof window !== 'undefined') { sy.bound = true; window.addEventListener('message', onSyncMsg); } }
  function syncPage(rootEl) {
    st.syncRoot = rootEl;
    syncBind();
    syncPaint();
    syncTargets();
  }
  /** 3.3.4 讀取等待下單名單（只發一次請求；書籤每 0.5 秒 hello 不重複讀） */
  function syncTargets() {
    if (sy.targets || sy.loading) return;
    sy.loading = call('order_targets', {}).then(function (t) { sy.loading = null; sy.targets = t; syncPaint(); if (sy.src) syncReady(); }, function (e) { sy.loading = null; sy.state = 'error'; sy.error = (e && e.message) || '讀取等待下單名單失敗'; syncPaint(); if (e && e.code === 'ERR_AUTH') fail(e); });
  }
  function siteOk(o) { return (C.siteOrigins || []).indexOf(o) >= 0; }
  function syncReady() {
    if (!sy.src || !sy.targets || sy.state !== 'wait') return;
    sy.state = 'reading';
    try { sy.src.postMessage({ type: 'grace-orders-ready', version: 1, keys: sy.targets.keys, terms: sy.targets.terms, productIds: sy.targets.productIds, since: sy.targets.since }, sy.origin); } catch (e) { /* ignore */ }
    syncPaint();
  }
  function onSyncMsg(ev) {
    if (!siteOk(ev.origin) || !ev.data || typeof ev.data !== 'object') return;
    var d = ev.data;
    if ((d.type === 'grace-orders-hello' || d.type === 'grace-orders') && typeof C.bmSeen === 'function') C.bmSeen('orders', d.bmVersion);   // 3.3.7 書籤版本（舊版書籤無 bmVersion）
    if (d.type === 'grace-orders-hello') {   // 3.3.4 書籤可從 opener（本分頁開啟的學院後台）傳來：切到同步頁、重新開始一輪
      if (sy.src !== ev.source || sy.state === 'done' || sy.state === 'error') { sy.state = 'wait'; sy.result = null; sy.error = ''; sy.targets = null; }
      sy.src = ev.source; sy.origin = ev.origin;
      if (!/^#\/order-sync/.test(location.hash)) { if (st.sheet) closeSheet(true); location.hash = '#/order-sync'; return; }   // 路由進入 syncPage 後讀名單並回覆 ready
      if (!sy.targets) { syncTargets(); return; }
      syncReady(); return;
    }
    if (d.type !== 'grace-orders' || sy.state !== 'reading') return;
    if (d.error) { sy.state = 'error'; sy.error = '學院後台讀取失敗：' + d.error; syncPaint(); return; }
    sy.state = 'saving'; syncPaint();
    call('order_sync', { purchases: Array.isArray(d.purchases) ? d.purchases.slice(0, 3000) : [], keys: sy.targets.keys, source: String(d.source || '').slice(0, 120) }).then(function (r) {
      sy.state = 'done'; sy.result = r; sy.found = d.found; syncPaint(); st.flows = null;
      try { ev.source.postMessage({ type: 'grace-orders-ack', ok: true, matched: r.matched.length, delivered: r.delivered, issues: r.issues.length }, ev.origin); } catch (e) { /* ignore */ }
    }, function (e) {
      sy.state = 'error'; sy.error = (e && e.message) || '比對失敗'; syncPaint();
      try { ev.source.postMessage({ type: 'grace-orders-ack', ok: false, error: sy.error }, ev.origin); } catch (x) { /* ignore */ }
    });
  }
  function syncPaint() {
    var el = st.syncRoot; if (!el) return;
    var t = sy.targets, r = sy.result, h = '<header class="tk-head"><div><h1>同步學院下單</h1><p class="tk-asof">只比對等待下單中的學姐・對象僅限該學姐本人</p></div></header>' + bmSlot() + '<div class="card of-syncpg" aria-live="polite">';
    if (sy.state === 'error') h += '<div class="empty" role="alert">' + I('alert') + '<h2>同步未完成</h2><p>' + esc(sy.error || '') + '</p><a class="btn btn-secondary" href="#/material/wait">回到等待下單</a></div>';
    else if (sy.state === 'done' && r) {
      h += '<h2>' + I('check') + ' 比對完成</h2><p class="muted">學院後台 ' + (sy.found || 0) + ' 位學姐・購買紀錄 ' + r.checked + ' 筆・' + esc(fmt(r.syncAt)) + '</p><ul class="of-res">' +
        r.matched.map(function (x) { return '<li class="ok"><b>' + esc(x.name) + '</b><span>' + (x.delivered ? '比對成功・已自動交付' : x.hold ? '比對成功・未交付：' + esc(x.hold) : x.pending ? '比對成功・移到待交付（尚未上傳教材）' : x.already ? '已交付過' : '比對成功') + '</span></li>'; }).join('') +
        r.issues.map(function (x) { return '<li class="warn"><b>' + esc(x.name) + '</b><span>' + esc(x.text) + '・' + esc(x.note || '') + '</span></li>'; }).join('') +
        (!r.matched.length && !r.issues.length ? '<li><b>沒有新的訂單</b><span>等待下單的學姐尚未在官網下單</span></li>' : '') + '</ul><a class="btn btn-primary" href="#/material/' + (r.matched.some(function (x) { return x.pending || x.hold; }) ? 'ready' : r.matched.length ? 'log' : 'wait') + '">回到交付教材</a>';
    } else {
      var msg = !t ? '讀取等待下單名單…' : !t.keys.length ? '目前沒有等待下單中的學姐，不需同步。' : sy.state === 'wait' ? '等待學院後台書籤連線…（請從交付教材頁的「開啟學院後台」開啟學院後台，再點書籤「同步學院下單」）' : sy.state === 'reading' ? '學院後台正在讀取 ' + t.keys.length + ' 位學姐的購買紀錄…' : '比對訂單中…';
      h += '<div class="loading-t">' + esc(msg) + '</div>' + (t ? '<p class="muted">等待下單 ' + t.keys.length + ' 位・上次同步 ' + (t.syncAt ? esc(fmt(t.syncAt)) : '尚未同步') + '</p>' : '');
    }
    el.innerHTML = h + '</div>';
  }

  /* ---- 面板事件（document 層） ---- */
  function onDocClick(ev) {
    var h = document.getElementById('tk-root'); if (!st.sheet || !h || !h.contains(ev.target)) return;
    var q = ev.target.closest('[data-of-q]'); if (q) { if (st.sheet.kind === 'deliver') dlSync(); else orderSync(); st.sheet.quick = Number(q.dataset.ofQ);
      if (st.sheet.kind === 'order') { var tm = /T(\d{2}:\d{2})/.exec(st.sheet.dt || ''); st.sheet.dt = quickDate(st.sheet.quick) + 'T' + (tm ? tm[1] : '23:59'); if (!st.sheet.dlTouched) st.sheet.dlDt = dlDefault(st.sheet.dt); paintSheet(); return; }   // 3.3.4 快選只帶入日期
      st.sheet.date = quickDate(st.sheet.quick); st.sheet.time = '23:59'; deliverPreview(); return; }
    var b = ev.target.closest('[data-of]'); if (!b) return;
    var a = b.dataset.of;
    if (a === 'close') closeSheet();
    else if (a === 'restore') { var row = C.prepFind(st.sheet.key); st.sheet.amount = String(tt(row).priceInitial || ''); st.sheet.reason = ''; paintSheet(); }
    else if (a === 'price-ok') submitPrice();
    else if (a === 'preview') previewOrder();
    else if (a === 'back') { st.sheet.step = 0; paintSheet(); }
    else if (a === 'send') sendOrder();
    else if (a === 'reopen-from-order') { var k = st.sheet.key, o = st.sheet.opener; closeSheet(true); openReopen(k, o); }
    else if (a === 'reopen-ok') submitReopen();
    else if (a === 'deliver-ok') sendDeliver();
  }
  function onDocKey(ev) { if (st.sheet && ev.key === 'Escape') { ev.preventDefault(); closeSheet(); } }

  function init(ctx) {
    C = ctx || {};
    if (typeof document !== 'undefined' && !init.bound) { init.bound = true; document.addEventListener('click', onDocClick); document.addEventListener('keydown', onDocKey); window.addEventListener('hashchange', function () { if (st.sheet && !st.sheet.busy) closeSheet(); }); syncBind(); }   // 3.3.4 同步訊息全域監聽
    return api;
  }
  function invalidate() { st.flows = null; }
  function isOpen() { return !!st.sheet; }

  var api = { VERSION: '1.1.0', TABS: TABS, init: init, openPrice: openPrice, openOrder: openOrder, openReopen: openReopen, show: show, syncPage: syncPage, invalidate: invalidate, isOpen: isOpen, closeSheet: closeSheet,
    _util: { isoOf: isoOf, quickDate: quickDate, addDays: addDays, partsOf: partsOf, dtIso: dtIso, dlDefault: dlDefault, fmt: fmt, money: money, logText: logText } };
  return api;
});
