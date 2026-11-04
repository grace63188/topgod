/* ==========================================================================
 * 作業追蹤・票券版（獨立模組；後台 admin 由 build.py 的 TT_JS 標記注入）
 *   畫面稿：track-ticket/index.html（校長確認版）
 *   renderTrackTickets(container, rows, handlers)
 *     rows      後台 trRows()／trFiltered() 的資料列：{ key, rk, name, call, w, l, p, st, sent, rid, deadline, submittedAt, pct, unread, tt, mf, inPrep }
 *               st：none 未開始／filling 進行中／overdue 逾時未交／ontime・sent 準時完成／late 逾時送出／supp 待補件
 *               p＝諮詢準備列（含 tooltest、material）；tt＝工具測試列（p 沒有時補上）；mf＝交付教材最新流程（material_list）；inPrep＝在諮詢準備清單內
 *     handlers  { remind, editDeadline, remindSupp, view, open, onFilter, now, filter, suppItems, go }
 *               動作函式皆為 function (row, button)；未提供的動作按鈕不顯示；suppItems(row) → [補件項目]；go(href, row) 跳轉（未提供＝改 location.hash）
 *   3.3.5 狀態分頁、作業類型標記（WORKS；目前只有前置作業）
 *   3.3.6 依整條流程分類（stageOf）：待繳交、補件中、待製作、測試中、下單中、待交付、已完成、逾時、全部
 *     每位學姐只在一個流程分頁；逾時是作業屬性：逾時完成者同時列在「逾時」，逾期未交者歸「逾時」；放棄領取者只在「全部」（標已放棄）
 *     各狀態卡片：左側色條＋線條圖示＋主資訊；共通：作業小標、「目前在哪一步」（點擊跳到諮詢準備／交付教材對應分頁與卡片）、查看作業
 *   按鈕：未開始／進行中＝提醒繳交＋修改截止；逾時未交＋待補件＝提醒補交；已送出＝查看作業
 *   TrackTicket.kind(row)／stageOf(row)／flowStep(row)／tabOf(row)／tabCounts(rows)／isLate(row)／actions(row) 供測試與整合使用
 * 全部 class 以 ttk- 為前綴；色彩沿用後台 :root token。日期一律 yyyy.mm.dd（台北時間）。
 * ========================================================================== */
/* 開頭分號：注入後台 IIFE 內時避免與前一行串接 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.TrackTicket = api; root.renderTrackTickets = api.render; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = '1.2.1';   // 3.3.7 已送出者可下載 ZIP
  var TZ = 8 * 3600e3;   // 台北時間
  var WK = '日一二三四五六';
  /** 作業狀態（作業小標）：tag class、標籤 */
  var KINDS = {
    none: ['t-none', '未開始'],
    fill: ['t-fill', '進行中'],
    over: ['t-over', '逾時未交'],
    ok: ['t-ok', '準時完成'],
    late: ['t-late', '逾時送出'],
    supp: ['t-supp', '待補件']
  };
  /** 摘要歸類（舊介面相容） */
  var FILTERS = [['all', '已通知', 'all'], ['ok', '準時完成', 'ok'], ['late', '逾時送出', 'late'], ['over', '逾時未交', 'over'], ['fill', '進行中', 'fill'], ['none', '未開始', 'none']];
  /**
   * 3.3.6 流程狀態（卡片樣式）：id、名稱、圖示
   *   pending 待繳交｜supp 補件中｜make 待製作｜test 測試中｜order 下單中｜ready 待交付｜done 已完成｜over 逾期未交｜abandon 已放棄
   */
  var STAGES = {
    pending: ['待繳交', 'envelope'],
    supp: ['補件中', 'clip'],
    make: ['待製作', 'ribbon'],
    test: ['測試中', 'beaker'],
    order: ['下單中', 'stub'],
    ready: ['待交付', 'halfbow'],
    done: ['已完成', 'bow'],
    over: ['逾期未交', 'hourglass'],
    abandon: ['已放棄', '']
  };
  /** 分頁：id、名稱、小字、所含流程狀態（late＝逾時屬性，另行判定；all＝全部） */
  var TABS = [
    ['pending', '待繳交', '作業未交', ['pending']],
    ['supp', '補件中', '補件', ['supp']],
    ['make', '待製作', '校長', ['make']],
    ['test', '測試中', '助教', ['test']],
    ['order', '下單中', '金額・下單', ['order']],
    ['ready', '待交付', '已下單', ['ready']],
    ['done', '已完成', '已交付', ['done']],
    ['late', '逾時', '作業屬性', null],
    ['all', '全部', '含已放棄', null]
  ];
  /** 流程分頁（每位學姐只在其中一個；逾期未交歸「逾時」、已放棄只在「全部」） */
  var FLOW_TABS = ['pending', 'supp', 'make', 'test', 'order', 'ready', 'done'];
  /**
   * 3.3.6 預設分頁維持「待繳交」：作業追蹤是助教確認繳交、提醒截止的頁面，固定起點不會因人數變動而跳頁；
   * 諮詢準備「前往作業追蹤」與網址 ?tab= 仍可指定分頁
   */
  var TAB_DEFAULT = 'pending';
  /** 逾時分頁內小標 */
  var LATE_GROUPS = [['late', '逾時完成'], ['over', '逾期未交']];
  /** 3.3.5 作業類型（輪次標記；之後新增第二種作業時在此加一筆，資料列以 work 欄指定，未指定＝前置作業） */
  var WORKS = { prep: '前置作業' };
  var WORK_DEFAULT = 'prep';
  var FLAGS = { late: '逾時送出・不列入諮詢準備', over: '仍可補交・補交後不列入諮詢準備' };
  var ACTS = {
    remind: '提醒繳交',
    editDeadline: '修改截止',
    remindSupp: '提醒補交',
    view: '查看作業',
    zip: '下載 ZIP'
  };
  /** 流程步驟（細）→ 目前在哪一步：標籤、跳轉（諮詢準備 #/prep/{分頁}／交付教材 #/material/{分頁}） */
  var STEPS = {
    hwNone: ['作業・尚未開始', ''],
    hwFill: ['作業・填寫中', ''],
    hwSupp: ['作業・補件中', ''],
    hwOver: ['作業・逾期未交', ''],
    make: ['製作工具・尚未開始', 'prep/make'],
    started: ['製作工具・已開始製作', 'prep/make'],
    test: ['測試工具・助教測試中', 'prep/test'],
    fix: ['測試工具・待校長修改', 'prep/make'],
    price: ['確認金額・校長', 'prep/price'],
    order: ['確認下單・助教', 'prep/order'],
    wait: ['等待學姐下單', 'material/wait'],
    ready: ['交付教材・待交付', 'material/ready'],
    done: ['交付紀錄・已交付', 'material/log'],
    abandon: ['交付紀錄・已放棄', 'material/log']
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ms(v) {
    if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null;
    var x = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v));   // 時區未標示＝台北時間（資料中心 tpeStamp）
    if (x) return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +(x[6] || 0)) - TZ;
    var t = Date.parse(v); return isFinite(t) ? t : null;
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function tp(t) { var d = new Date(t + TZ); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; }
  function day(t) { var x = tp(t); return x.y + '.' + p2(x.m) + '.' + p2(x.d) + '（' + WK[x.w] + '）'; }
  function full(t) { var x = tp(t); return day(t) + p2(x.h) + ':' + p2(x.mi); }
  function span(d) {
    var m = Math.round(Math.abs(d) / 60000), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return dd ? dd + ' 天' + (h ? ' ' + h + ' 小時' : '') : h ? h + ' 小時' + (mm ? ' ' + mm + ' 分' : '') : Math.max(1, mm) + ' 分鐘';
  }
  function money(n) { n = Math.round(Number(n) || 0); return n > 0 ? 'NT$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; }
  function icon(id) {
    var P = {
      cal: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
      alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17v.01"/>',
      chev: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>'
    };
    return '<svg class="ttk-i" viewBox="0 0 24 24" aria-hidden="true">' + (P[id] || '') + '</svg>';
  }
  /** 狀態圖示（細線條；金屬亮帶以第二道細線表現） */
  var ART = {
    envelope: '<rect x="4" y="7" width="24" height="17" rx="1.6"/><path d="M4.6 7.8 16 17l11.4-9.2"/><path class="hl" d="M4.6 23.4l8.6-7.6M27.4 23.4l-8.6-7.6"/><circle class="dot" cx="16" cy="17" r="1.3"/>',
    clip: '<path d="M20.5 9.5 12 18a2.6 2.6 0 0 0 3.7 3.7l9.2-9.2a4.6 4.6 0 0 0-6.5-6.5L8.6 15.8a6.4 6.4 0 0 0 9 9l7.2-7.2"/><path class="hl" d="M7 26.5h6"/>',
    ribbon: '<path d="M4 11c3.2-3.4 6.6 3.4 9.8 0s6.6 3.4 9.8 0 3.6-1.6 4.4-.6"/><path d="M5 18.5c3.2-3.2 6.4 3.2 9.6 0s6.4 3.2 9.6 0"/><path class="hl" d="M7 25.5c2.6-2 5.2 2 7.8 0s5.2 2 7.8 0"/><circle class="dot" cx="26.5" cy="18.5" r="1"/>',
    beaker: '<path d="M12.5 4.5h7M13.5 4.5v7.2L7.2 23.6A2.6 2.6 0 0 0 9.5 27.5h13a2.6 2.6 0 0 0 2.3-3.9L18.5 11.7V4.5"/><path class="hl" d="M10 19.5h12"/><circle class="dot" cx="14.5" cy="23" r="1"/><circle class="dot" cx="18.5" cy="21.6" r=".8"/>',
    stub: '<path d="M4.5 9.5h23v4a2.5 2.5 0 0 0 0 5v4h-23v-4a2.5 2.5 0 0 0 0-5z"/><path class="hl" d="M20.5 10.5v1.6M20.5 14.6v1.6M20.5 18.7v1.6"/><path d="M8.5 14h8M8.5 18h5"/>',
    halfbow: '<path d="M16 15.5C12.6 10.8 6.5 8.6 5.2 11.6c-1.3 3 4.9 5.5 10.8 3.9"/><path d="M16 15.5c2.2-1.9 6-3.9 8.7-3.5"/><path class="hl" d="M15.4 16.4 11.5 26M16.6 16.4l5.2 8.8"/><circle class="dot" cx="16" cy="15.6" r="1.6"/>',
    bow: '<path d="M16 15.5C12.6 10.8 6.5 8.6 5.2 11.6c-1.3 3 4.9 5.5 10.8 3.9"/><path d="M16 15.5c3.4-4.7 9.5-6.9 10.8-3.9 1.3 3-4.9 5.5-10.8 3.9"/><path class="hl" d="M15.2 16.6 11 26.5M16.8 16.6l4.2 9.9"/><circle class="dot" cx="16" cy="15.6" r="1.8"/>',
    hourglass: '<path d="M8.5 4.5h15M8.5 27.5h15"/><path d="M10 4.5c0 6 6 7.5 6 11.5s-6 5.5-6 11.5M22 4.5c0 6-6 7.5-6 11.5s6 5.5 6 11.5"/><path class="hl" d="M12.6 24.8c1.4-1.6 5.4-1.6 6.8 0M13.2 9.6h5.6"/><circle class="dot" cx="16" cy="18.6" r=".8"/>'
  };
  function art(id) { return ART[id] ? '<span class="ttk-art" aria-hidden="true"><svg viewBox="0 0 32 32">' + ART[id] + '</svg></span>' : ''; }

  /** 送出是否準時（待補件列用；w.onTime 優先，其次 l.onTime；未知視為準時） */
  function sentOnTime(r) {
    var v = r.w && r.w.onTime != null ? r.w.onTime : (r.l && r.l.onTime != null ? r.l.onTime : null);
    return v !== false;
  }
  /** 後台 st → 作業狀態 */
  function kind(r) {
    var st = r && r.st;
    if (st === 'supp') return 'supp';
    if (st === 'late') return 'late';
    if (st === 'ontime' || st === 'sent') return 'ok';
    if (st === 'overdue') return 'over';
    if (st === 'filling') return 'fill';
    return 'none';
  }
  /** 摘要歸類：待補件依送出時間歸入準時完成／逾時送出 */
  function bucket(r) { var k = kind(r); return k === 'supp' ? (sentOnTime(r) ? 'ok' : 'late') : k; }
  function counts(rows) {
    var c = { all: 0, ok: 0, late: 0, over: 0, fill: 0, none: 0 };
    (rows || []).forEach(function (r) { c.all++; c[bucket(r)]++; });
    return c;
  }

  /* ---------------- 3.3.6 流程判定 ---------------- */
  function toolOf(r) { var p = (r && r.p) || {}; return p.tooltest || (r && r.tt) || (r && r.mf && r.mf.tool) || null; }
  /** 本次教材流程：交付教材最新流程（未關閉）優先，其次諮詢準備列的 material */
  function matOf(r) { var mf = r && r.mf; if (mf && !(mf.closedAt || mf.closed)) return mf; var p = (r && r.p) || {}; return p.material || null; }
  function tState(t) { var s = t && t.state; return s === 'test' || s === 'fix' || s === 'pass' ? s : 'make'; }
  function toolStarted(t) { return !!(t && (t.started || t.startedAt || t.toolUrl || Number(t.priceInitial) > 0 || tState(t) !== 'make')); }
  /**
   * 流程步驟（同 ToolTestUI.stageKey，另判放棄領取與開始製作）：
   *   make 未開始製作｜started 已開始未上傳｜test 助教測試中｜fix 待校長修改｜price 確認金額｜order 確認下單｜wait 等待學姐下單｜ready 待交付｜done 已交付｜abandon 已放棄
   */
  function flowStep(r) {
    var t = toolOf(r), m = matOf(r), s = tState(t);
    if (s === 'make') return toolStarted(t) ? 'started' : 'make';
    if (s !== 'pass') return s;
    var cyc = String(t.cycle || ''), cur = m && m.state ? (m.cycle ? String(m.cycle) === cyc : (m.state !== 'delivered' || !t.createdAt || String(m.deliveredAt || '') >= String(t.createdAt))) : false;
    if (cur) {
      if (m.abandonedAt || m.abandoned) return 'abandon';
      if (m.state === 'delivered') return 'done';
      if (m.state === 'ordered') return 'ready';
      if (m.state === 'notified') return 'wait';
    }
    return Number(t.priceConfirmed) > 0 ? 'order' : 'price';
  }
  var STEP_STAGE = { make: 'make', started: 'make', test: 'test', fix: 'test', price: 'order', order: 'order', wait: 'order', ready: 'ready', done: 'done', abandon: 'abandon' };
  /** 工具已上傳（含之後各步）：流程以工具／教材為準；之前以作業為準 */
  function flowAdvanced(step) { return step !== 'make' && step !== 'started'; }
  /**
   * 3.3.6 依整條流程判定流程狀態（每位學姐一個）：
   *   已放棄 → abandon；工具已上傳之後 → 依工具／教材；作業未交 → pending；補件中 → supp；逾期未交 → over；作業完成 → make（含已開始製作）
   */
  function stageOf(r) {
    var step = flowStep(r), k = kind(r);
    if (step === 'abandon') return 'abandon';
    if (flowAdvanced(step)) return STEP_STAGE[step];
    if (k === 'none' || k === 'fill') return 'pending';
    if (k === 'supp') return 'supp';
    if (k === 'over') return 'over';
    return 'make';
  }
  /** 細步驟（目前在哪一步） */
  function stepOf(r) {
    var step = flowStep(r), sg = stageOf(r), k = kind(r);
    if (sg === 'pending') return k === 'fill' ? 'hwFill' : 'hwNone';
    if (sg === 'supp') return 'hwSupp';
    if (sg === 'over') return 'hwOver';
    return step;
  }
  /** 逾時屬性：late 逾時完成（逾時送出，含逾時送出後補件中）｜over 逾期未交｜''；已放棄者不列 */
  function lateOf(r) {
    if (stageOf(r) === 'abandon') return '';
    var k = kind(r);
    if (k === 'over') return 'over';
    if (k === 'late' || (k === 'supp' && !sentOnTime(r))) return 'late';
    return '';
  }
  function isLate(r) { return !!lateOf(r); }
  /** 流程分頁（主要分頁）：逾期未交＝late、已放棄＝all */
  function tabOf(r) {
    var sg = stageOf(r);
    if (sg === 'over') return 'late';
    if (sg === 'abandon') return 'all';
    return sg;
  }
  function tabById(id) { return TABS.filter(function (t) { return t[0] === id; })[0] || null; }
  /** 各分頁人數；flowSum＝流程分頁加總、over＝逾期未交、abandon＝已放棄（flowSum＋over＋abandon＝all） */
  function tabCounts(rows) {
    var c = { flowSum: 0, over: 0, abandon: 0 }; TABS.forEach(function (t) { c[t[0]] = 0; });
    (rows || []).forEach(function (r) {
      var sg = stageOf(r); c.all++;
      if (FLOW_TABS.indexOf(sg) >= 0) { c[sg]++; c.flowSum++; }
      else if (sg === 'over') c.over++;
      else if (sg === 'abandon') c.abandon++;
      if (lateOf(r)) c.late++;
    });
    return c;
  }
  function inTab(r, id) { if (id === 'all') return true; if (id === 'late') return isLate(r); return stageOf(r) === id; }
  function workOf(r) { var w = r && r.work; return WORKS[w] ? w : WORK_DEFAULT; }
  function inFilter(r, f) { return !f || f === 'all' || bucket(r) === f; }
  /** 票根按鈕（動作鍵） */
  function actions(r) {
    var k = kind(r);
    if (k === 'none' || k === 'fill') return ['remind', 'editDeadline'];
    if (k === 'over' || k === 'supp') return ['remindSupp'];
    return hasDrive(r) ? ['view', 'zip'] : ['view'];   // 3.3.7 已送出且已登錄雲端：下載全部資料 ZIP（與諮詢準備卡片、學員詳情一致）
  }
  /** 學姐已登錄雲端資料夾（諮詢準備列或追蹤名單列帶 drive.registered） */
  function hasDrive(r) { if (!r || !r.rk) return false; var d = (r.p && r.p.drive) || (r.w && r.w.drive) || r.drive; return !!((d && d.registered) || (r.l && r.l.driveUrl)); }
  /** 目前在哪一步：{ label, href }（諮詢準備外的學姐不跳轉） */
  function stepInfo(r) {
    var s = stepOf(r), d = STEPS[s] || ['', ''], key = r && (r.rk || (r.p && r.p.key));
    var can = d[1] && key && /^[0-9a-f]{16}$/.test(String(key)) && (d[1].indexOf('prep/') !== 0 || r.inPrep !== false);
    return { id: s, label: d[0], href: can ? '#/' + d[1] + '/' + key : '' };
  }

  /* ---------------- 卡片主資訊 ---------------- */
  function dueOf(r) { return ms(r.deadline != null && r.deadline !== '' ? r.deadline : (r.w && r.w.deadline)); }
  function dueHtml(r, k, now) {
    var due = dueOf(r), sub = ms(r.submittedAt), rel, cls;
    if (due == null) return '<div class="ttk-due"><p class="ttk-rel c-calm">未設定截止</p></div>';
    var sentK = k === 'ok' || k === 'late' || k === 'supp';
    if (sentK && sub != null) {
      if (sub <= due) { rel = '截止前 ' + span(due - sub) + '送出'; cls = 'c-ok'; }
      else { rel = '逾時 ' + span(sub - due) + '送出'; cls = 'c-late'; }
    } else if (sentK) { rel = '已送出'; cls = 'c-ok'; }
    else {
      var d = due - now;
      if (d < 0) { rel = '已逾時 ' + span(d); cls = 'c-hot'; }
      else { rel = '剩 ' + span(d); cls = d < 864e5 ? 'c-hot' : d < 3 * 864e5 ? 'c-warm' : 'c-calm'; }
    }
    return '<div class="ttk-due"><p class="ttk-rel ' + cls + '">' + esc(rel) + '</p><span class="ttk-abs"><span class="k">截止</span><time class="ttk-num">' + full(due) + '</time></span></div>';
  }
  function pctOf(r, k) {
    if (k === 'ok' || k === 'late' || k === 'supp') return 100;
    var n = Number(r.pct != null && r.pct !== 0 ? r.pct : (r.w && r.w.percent)) || 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  function progHtml(pct) { return '<div class="ttk-prog" role="img" aria-label="完成度 ' + pct + '%"><span class="ttk-bar"><i style="width:' + pct + '%"></i></span><span class="ttk-pct ttk-num">' + pct + '%</span></div>'; }
  /** 明細框：[[標籤, 值 html]] */
  function facts(L, title) {
    return '<dl class="ttk-facts">' + (title ? '<p class="ttk-fh">' + esc(title) + '</p>' : '') + L.filter(Boolean).map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>';
  }
  function tm(v) { var t = ms(v); return t == null ? '<span class="muted">—</span>' : '<time class="ttk-num">' + full(t) + '</time>'; }
  function verOf(t) { return Number(t && t.versionNo) || Number(String((t && t.version) || '').replace(/\D/g, '')) || 0; }
  /** 3.3.8 學姐回傳的補件檔：h.suppFiles(row) → [{ title, name, dl, review }]；下載為 dl.html 簽章連結（Drive 直接下載） */
  function suppFilesHtml(r, h) {
    var fs = typeof h.suppFiles === 'function' ? (h.suppFiles(r) || []).filter(function (x) { return x && x.dl; }) : [];
    if (!fs.length) return '';
    var lab = { pending: '待審核', pass: '已通過', reject: '已退回' };
    return '<div class="ttk-sfx"><p class="ttk-sfh">補件回傳</p><ul>' + fs.slice(0, 3).map(function (x) {
      return '<li><span class="n">' + esc(x.title || x.name) + (lab[x.review] ? '<span class="ttk-pill' + (x.review === 'pending' ? ' p-hot' : x.review === 'pass' ? ' p-ok' : '') + '">' + lab[x.review] + '</span>' : '') + '</span>' +
        '<a class="ttk-sfdl" href="' + esc(x.dl) + '" target="_blank" rel="noopener noreferrer" data-ttk-sfdl aria-label="下載學姐回傳檔：' + esc(x.name) + '">下載</a></li>';
    }).join('') + '</ul></div>';
  }
  function mainHtml(r, sg, k, h, now) { return mainHtml0(r, sg, k, h, now) + suppFilesHtml(r, h); }
  function mainHtml0(r, sg, k, h, now) {
    var t = toolOf(r) || {}, m = matOf(r) || {}, step = flowStep(r), sub = ms(r.submittedAt);
    if (sg === 'pending' || sg === 'over') return dueHtml(r, k, now) + progHtml(pctOf(r, k));
    if (sg === 'supp') {
      var it = typeof h.suppItems === 'function' ? (h.suppItems(r) || []) : [];
      return '<div class="ttk-main"><p class="ttk-lead">補件項目' + (it.length ? '<span class="ttk-num">' + it.length + ' 項</span>' : '') + '</p>' +
        (it.length ? '<ul class="ttk-items">' + it.slice(0, 4).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + (it.length > 4 ? '<li class="more">另 ' + (it.length - 4) + ' 項</li>' : '') + '</ul>' : '<p class="ttk-sub muted">補件項目讀取中或未列明</p>') + '</div>';
    }
    if (sg === 'make') {
      var wait = sub != null ? Math.max(0, Math.floor((now - sub) / 864e5)) : null;
      return '<div class="ttk-main"><p class="ttk-big"><span class="ttk-num">' + (wait == null ? '—' : wait) + '</span><small>天</small><span class="ttk-bl">' + (step === 'started' ? '已開始製作・尚未上傳工具' : '等待校長開始製作') + '</span></p>' +
        facts([['作業送出', tm(r.submittedAt)], step === 'started' && t.startedAt ? ['開始製作', tm(t.startedAt)] : null]) + '</div>';
    }
    if (sg === 'test') {
      var v = verOf(t), fx = step === 'fix', fb = fx && t.feedback && t.feedback[0];
      return '<div class="ttk-main"><p class="ttk-big"><small>第</small><span class="ttk-num">' + (v || 1) + '</span><small>版</small><span class="ttk-bl">' + (fx ? '測試退回' : '助教測試中') + '</span>' + (fx ? '<span class="ttk-pill p-fix">待校長修改</span>' : '') + '</p>' +
        facts([['送測時間', tm(t.sentAt || t.uploadedAt)], fx ? ['退回時間', tm((fb && fb.at) || t.resultAt)] : null]) + '</div>';
    }
    if (sg === 'order') {
      var sub2 = step === 'price' ? '確認金額' : step === 'order' ? '確認下單' : '等學姐下單', dl = ms(m.deadlineMs != null && m.deadlineMs !== '' ? m.deadlineMs : m.deadline);
      var amt = money(t.priceConfirmed || m.amount || t.priceCurrent || t.priceInitial);
      var dlv = step === 'wait' ? (dl != null ? tm(dl) + (dl < now ? '<span class="ttk-pill p-hot">已過期</span>' : '<span class="ttk-pill">剩 ' + esc(span(dl - now)) + '</span>') : '<span class="muted">未設定</span>') : '<span class="muted">發送下單通知時設定</span>';
      return '<div class="ttk-main"><div class="ttk-seg3" role="list" aria-label="下單進度：' + sub2 + '">' + [['price', '確認金額'], ['order', '確認下單'], ['wait', '等學姐下單']].map(function (x, i, A) {
        var at = A.map(function (y) { return y[0]; }).indexOf(step);
        return '<span role="listitem" class="' + (i < at ? 'done' : i === at ? 'cur' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '>' + x[1] + '</span>';
      }).join('') + '</div>' + facts([['下單期限', dlv], amt ? ['金額', '<span class="ttk-num">' + esc(amt) + '</span>'] : null]) + '</div>';
    }
    if (sg === 'ready') {
      var oat = m.matchedAt || m.claimAt || m.replyOrderedAt, man = m.matchBy === 'manual' || m.matchBy === 'mark';
      return '<div class="ttk-main">' + facts([['下單時間', tm(oat)], ['確認方式', esc(man ? '手動標記' : m.matchedAt ? '比對成功' : '學姐回報已下單')]]) + '</div>';
    }
    if (sg === 'done' || sg === 'abandon') {
      if (sg === 'abandon') return '<div class="ttk-main">' + facts([['放棄時間', tm(m.abandonedAt)], m.abandonReason ? ['原因', esc(m.abandonReason)] : null]) + '</div>';
      var pick = m.dlClickAt ? '<span class="ttk-pill p-ok">已領取</span>' + tm(m.dlClickAt) : '<span class="ttk-pill">未領取</span>';
      return '<div class="ttk-main">' + facts([['交付時間', tm(m.deliveredAt)], ['領取狀態', pick]]) + '</div>';
    }
    return '';
  }

  function ticket(r, h, now) {
    var k = kind(r), t = KINDS[k], sg = stageOf(r), S = STAGES[sg], sentK = k === 'ok' || k === 'late' || k === 'supp', lt = lateOf(r);
    var nc = r.p && r.p.nextCounsel ? ms(r.p.nextCounsel.at) : null, sub = ms(r.submittedAt), si = stepInfo(r);
    var flagK = sg === 'pending' || sg === 'over' || sg === 'supp' ? (k === 'supp' ? (sentOnTime(r) ? '' : 'late') : k) : '';
    var flag = FLAGS[flagK] ? '<p class="ttk-flag f-' + flagK + '">' + icon('alert') + FLAGS[flagK] + '</p>' : '';
    var acts = actions(r).filter(function (a) { return typeof h[a] === 'function'; }).map(function (a) {
      return '<button class="ttk-tb' + (a === 'editDeadline' ? ' is-sub' : '') + '" type="button" data-tt-act="' + a + '" aria-label="' + esc(ACTS[a] + '：' + (r.name || '')) + '">' + ACTS[a] + '</button>';
    }).join('');
    var rc = sentK && r.rid ? '<span class="ttk-id ttk-num">' + esc(r.rid) + '</span><span class="ttk-sd">送出 <time class="ttk-num">' + (sub != null ? day(sub) : '—') + '</time></span>'
      : '<span class="ttk-id is-none">回執未開立</span><span class="ttk-sd">尚未送出</span>';
    var who = '<h3>' + (r.unread ? '<span class="ttk-unr" role="img" aria-label="未讀"></span>' : '') + esc(r.name || '') + '</h3><span class="ttk-cn">' + esc(r.call || '') + '</span>' + (typeof h.logo === 'function' ? h.logo(r) || '' : '');   // 3.2.5 品牌標誌
    /* 作業小標：作業狀態（準時完成／逾時送出…）；逾時屬性另標 */
    var hwTag = '<span class="ttk-tag ' + t[0] + '"><i></i>' + t[1] + '</span>';
    var step = si.label ? (si.href ? '<a class="ttk-step" href="' + esc(si.href) + '" data-tt-act="go" data-step="' + si.id + '" aria-label="' + esc('目前在：' + si.label + '（前往）') + '"><span class="k">目前</span>' + esc(si.label) + icon('chev') + '</a>'
      : '<span class="ttk-step is-static" data-step="' + si.id + '"><span class="k">目前</span>' + esc(si.label) + '</span>') : '';
    return '<li data-tt-key="' + esc(r.key) + '" data-tt-kind="' + k + '" data-tt-stage="' + sg + '"' + (lt ? ' data-tt-late="' + lt + '"' : '') + '><article class="ttk-tk s-' + k + ' g-' + sg + '" aria-label="' + esc((r.name || '') + '（' + S[0] + '・' + t[1] + '）') + '">' +
      '<div class="ttk-body">' +
        '<div class="ttk-st">' + art(S[1]) + '<span class="ttk-stn">' + esc(S[0]) + '</span>' + (lt === 'late' ? '<span class="ttk-lt">逾時完成</span>' : '') + '</div>' +
        '<header class="ttk-hd">' + (typeof h.open === 'function' ? '<button type="button" class="ttk-who" data-tt-act="open" aria-label="' + esc('開啟 ' + (r.name || '') + ' 的學員詳情') + '">' + who + '</button>' : '<div class="ttk-who">' + who + '</div>') +
          '<span class="ttk-tags"><span class="ttk-work" data-work="' + workOf(r) + '">' + esc(WORKS[workOf(r)]) + '</span>' + hwTag + '</span></header>' +
        mainHtml(r, sg, k, h, now) +
        (typeof h.ack === 'function' && (sg === 'pending' || sg === 'supp' || sg === 'over') ? h.ack(r) || '' : '') +   // 3.2.5 自動回覆偵測狀態（作業階段才顯示）
        '<p class="ttk-cs">' + icon('cal') + '<span class="k">諮詢</span>' + (nc != null ? '<time class="ttk-num">' + full(nc) + '</time>' : '<span class="muted">尚無預約</span>') + '</p>' + flag +
        step +
      '</div>' +
      '<div class="ttk-stub"><div class="ttk-rc">' + rc + '</div><div class="ttk-acts">' + acts + '</div></div>' +
    '</article></li>';
  }

  function tabsHtml(s, c) {
    return '<div class="tk-tabs ttk-tabs" role="tablist" aria-label="作業與流程狀態">' + TABS.map(function (t) {
      var on = s.f === t[0], n = c[t[0]];
      return '<button type="button" role="tab" class="tk-tab ttk-tab tb-' + t[0] + (on ? ' on' : '') + '" id="ttk-tab-' + t[0] + '" data-tt-f="' + t[0] + '" aria-selected="' + on + '" aria-controls="ttk-panel" tabindex="' + (on ? '0' : '-1') + '">' +
        '<span class="tk-tab-tx"><span class="tk-tab-t">' + esc(t[1]) + '</span><span class="tk-tab-o">' + esc(t[2]) + '</span></span><span class="tk-tab-n' + (n ? ' lit' : '') + '" aria-label="' + n + ' 位">' + n + '</span></button>';
    }).join('') + '</div>';
  }
  /** 人數核對：流程分頁加總＋逾期未交＋已放棄＝全部 */
  function sumHtml(c) {
    return '<p class="ttk-sumline" data-tt-sum="' + c.flowSum + '+' + c.over + '+' + c.abandon + '=' + c.all + '">流程分頁 <b class="ttk-num">' + c.flowSum + '</b> 位' + (c.over ? '＋逾期未交 <b class="ttk-num">' + c.over + '</b> 位' : '') + (c.abandon ? '＋已放棄 <b class="ttk-num">' + c.abandon + '</b> 位' : '') + '＝全部 <b class="ttk-num">' + c.all + '</b> 位</p>';
  }
  function gridHtml(L, h, now) { return '<ul class="ttk-grid" aria-label="學姐作業票券">' + L.map(function (r) { return ticket(r, h, now); }).join('') + '</ul>'; }
  var ORDER = ['pending', 'over', 'supp', 'make', 'test', 'order', 'ready', 'done', 'abandon'];
  function paint(container) {
    var s = container.__tt, rows = s.rows, h = s.h, now = ms(h.now) != null ? ms(h.now) : Date.now(), c = tabCounts(rows), tb = tabById(s.f) || tabById(TAB_DEFAULT);
    var L = rows.filter(function (r) { return inTab(r, s.f); }), body;
    if (s.f === 'all') L = L.map(function (r, i) { return [r, i]; }).sort(function (a, b) { return (ORDER.indexOf(stageOf(a[0])) - ORDER.indexOf(stageOf(b[0]))) || (a[1] - b[1]); }).map(function (x) { return x[0]; });
    if (!rows.length) body = '<div class="ttk-empty"><p>尚未指派作業</p></div>';
    else if (!L.length) body = '<div class="ttk-empty"><p>「' + esc(tb[1]) + '」目前沒有學姐</p></div>';
    else if (s.f === 'late') body = LATE_GROUPS.map(function (g) {
      var G = L.filter(function (r) { return lateOf(r) === g[0]; });
      return G.length ? '<section class="ttk-grp" data-tt-grp="' + g[0] + '"><h3 class="ttk-gh">' + esc(g[1]) + '<span class="ttk-num">' + G.length + ' 位</span></h3>' + gridHtml(G, h, now) + '</section>' : '';
    }).join('');
    else body = gridHtml(L, h, now);
    container.innerHTML = '<div class="ttk">' + tabsHtml(s, c) + sumHtml(c) + '<section class="ttk-panel" id="ttk-panel" role="tabpanel" aria-labelledby="ttk-tab-' + esc(s.f) + '" data-tt-tab="' + esc(s.f) + '">' + body + '</section><p class="ttk-note">逾時送出的作業照常收件，但不列入諮詢準備與教材；逾時完成者依流程分頁，同時列在「逾時」。</p></div>';
  }
  function onKey(ev) {
    var t = ev.target.closest && ev.target.closest('.ttk-tab'); if (!t || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(ev.key) < 0) return;
    var ids = TABS.map(function (x) { return x[0]; }), i = ids.indexOf(t.dataset.ttF), n = ev.key === 'Home' ? 0 : ev.key === 'End' ? ids.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    ev.preventDefault(); var b = this.querySelector('[data-tt-f="' + ids[n] + '"]'); if (b) b.click();
  }

  function onClick(ev) {
    var container = this, s = container.__tt; if (!s) return;
    var f = ev.target.closest('[data-tt-f]');
    if (f && container.contains(f)) { s.f = f.dataset.ttF; paint(container); if (typeof s.h.onFilter === 'function') s.h.onFilter(s.f); var nb = container.querySelector('[data-tt-f="' + s.f + '"].ttk-tab'); if (nb) nb.focus(); return; }
    var b = ev.target.closest('[data-tt-act]'); if (!b || !container.contains(b) || b.disabled) return;
    var li = b.closest('[data-tt-key]'), key = li && li.getAttribute('data-tt-key'), a = b.dataset.ttAct;
    var row = s.rows.filter(function (r) { return String(r.key) === key; })[0];
    if (a === 'go') { if (typeof s.h.go === 'function') { ev.preventDefault(); s.h.go(b.getAttribute('href'), row, b); } return; }   // 未提供 go：沿用連結預設行為（改 hash）
    if (row && typeof s.h[a] === 'function') s.h[a](row, b);
  }

  /** 渲染（可重複呼叫；篩選狀態保留在 container 上） */
  function render(container, rows, handlers) {
    if (!container) return null;
    var h = handlers || {}, prev = container.__tt;
    var f = prev ? prev.f : (h.filter || TAB_DEFAULT);
    if (!tabById(f)) f = TAB_DEFAULT;
    container.__tt = { rows: Array.isArray(rows) ? rows : [], h: h, f: f };
    if (!prev) { container.addEventListener('click', onClick); container.addEventListener('keydown', onKey); }
    paint(container);
    return { filter: function (nf) { if (nf != null && tabById(nf)) { container.__tt.f = nf; paint(container); } return container.__tt.f; }, counts: tabCounts(container.__tt.rows) };
  }

  return { VERSION: VERSION, render: render, kind: kind, bucket: bucket, counts: counts, TABS: TABS, FLOW_TABS: FLOW_TABS, TAB_DEFAULT: TAB_DEFAULT, LATE_GROUPS: LATE_GROUPS, STAGES: STAGES, STEPS: STEPS,
    flowStep: flowStep, stageOf: stageOf, stepOf: stepOf, stepInfo: stepInfo, lateOf: lateOf, isLate: isLate, tabOf: tabOf, tabCounts: tabCounts, inTab: inTab, inFilter: inFilter,
    WORKS: WORKS, workOf: workOf, actions: actions, FILTERS: FILTERS, KINDS: KINDS, ACTS: ACTS, FLAGS: FLAGS, _fmt: { day: day, full: full, span: span, ms: ms } };
});
