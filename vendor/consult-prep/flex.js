/*
 * G.R.A.C.E Academy《諮詢教材·專屬訂製》LINE Flex Message 卡片（純函式）
 *
 * 用途：輸入通知資料物件 → 回傳 Flex Message（{ type:'flex', altText, contents:bubble }）；
 *   所有 LINE 通知改用卡片，不另發文字；校長填寫「補充說明」時以 messages(card, note) 在卡片後附一則文字（同一次 push）。
 * 輸出：window.CONSULT_FLEX／module.exports／Apps Script 全域 CONSULT_FLEX（build.py 產出 dist/gas/flex.gs，請勿手改 .gs）。
 * 不依賴其他檔案（不讀 CONSULT_SCHEMA），台北時間自行換算；ES5 語法（Apps Script 與瀏覽器共用）。
 *
 * 卡片類型（build(type, data) 或直接呼叫同名函式）：
 *   assignment       作業通知（學姐）            remind          提醒截止（學姐，校長範本排版）
 *   supplement       通知補件（學姐）            thanks          確認收到致謝（學姐）
 *   autoRemind       48／24 小時自動提醒（學姐）  overdue         逾期通知（學姐／管理收件人）
 *   materialOrder    教材下單通知（學姐）        materialDeliver 教材交付＋解壓縮教學（學姐）
 *   report           管理匯報（校長版／助教版）  toolTest        工具待測試（助教）
 *   toolResult       工具已通過／等待校長修改（校長）
 *   submitted        學姐送出／補件完成（管理收件人）
 *   suppResult       補充結果：同意新增／不需要（學姐；3.2.7 補充請求）
 *   suppReject       3.3.8 退回重填：補件回傳檔需修改（學姐）；supplement 帶 file 時加「補件附檔」區與杏仁白拼圖「下載附檔」（puzzle-suppfile.png）
 *   orderPrice       3.3.0 請確認金額（校長）／金額已確認（助教）  orderClaim 學姐回報已下單（校長、助教）
 *   3.3.0 materialOrder／materialDeliver：puzzle:true 時以杏仁白拼圖圖片按鈕（assets/flex/puzzle-order.png、puzzle-claim.png）；
 *         claimData 時加「我已下單」postback 按鈕；unit:'NT$' 金額以新台幣顯示；remind:true 標「提醒下單」
 *   adminRemind      內部提醒：彙整／逾時再提醒（校長、助教；3.2.12 天使助教）
 *
 * 共用資料欄位：callName（稱呼）、name（本名）、suffix（預設「學姐」）、deadline（ISO／毫秒／yyyy.mm.dd HH:mm）、
 *   now（毫秒；altText 的「今晚／明天」判斷，測試用）、frontUrl／adminUrl／assetBase（覆寫預設網址）。
 * Flex 規格限制（validate 檢查）：bubble JSON < 30KB、altText 1–400 字、uri ≤ 1000 字、按鈕文字 ≤ 20 字、text 不得為空、
 *   只使用 Flex 支援的屬性（WHITELIST）、顏色 #RRGGBB／#RRGGBBAA、圖片 https。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CONSULT_FLEX = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var NAME = '諮詢教材·專屬訂製';
  var CONFIG = {
    assetBase: 'https://grace63188.github.io/consult-prep/assets/flex/',
    frontUrl: 'https://grace63188.github.io/consult-prep/?openExternalBrowser=1',
    adminUrl: 'https://grace63188.github.io/consult-prep/admin/?openExternalBrowser=1',
    orderUrl: 'https://www.graceschool.com.tw/product/show/805?kind=65',
    oaMessageBase: 'https://line.me/R/oaMessage/@52grace/?',
    ackText: '確認',
    materialKeyword: '領取諮詢教材',
    claimLabel: '我已下單',
    puzzleRatio: '4:1',
    productDefault: '諮詢教材',
    heroRatio: '8:3',          // 頂圖 1024×384
    bubbleSize: 'mega'
  };
  var LIMITS = { bubbleBytes: 30000, altText: 400, uri: 1000, label: 20, text: 5000, maxItems: 8, maxNames: 30 };

  /* 色票（admin/index.html、admin/notice-card.html 的 token；透明度改 #RRGGBBAA） */
  var C = {
    ink0: '#0C0A0B', ink1: '#110E0F', ink2: '#191516', ink3: '#211C1D', ink5: '#352E2F',
    t1: '#F6EFEA', t2: '#CDC2BC', t3: '#A0948F',
    rose: '#FF2E8B', rose300: '#FF77B2', roseInk: '#1A0911', roseHi: '#FF3E95', roseLo: '#F5287F',
    roseTint: '#FF2E8B24', roseLine: '#FF2E8B52',
    gold: '#D9B877', goldLine: '#D9B8776B', goldSoft: '#D9B87729',
    line1: '#F6EFEA14', line2: '#F6EFEA24',
    ok: '#5CCFA3', okTint: '#5CCFA31F', warn: '#E8B85C', err: '#FF7A5C', errTint: '#FF7A5C1F'
  };

  /* 卡片類型 → 頂圖、編號、英文標 */
  var TYPES = {
    assignment: { hero: 'hero-assign.png', no: '01', title: '作業通知' },
    remind: { hero: 'hero-remind.png', no: '02', title: '提醒截止' },
    supplement: { hero: 'hero-supplement.png', no: '03', title: '通知補件' },
    thanks: { hero: 'hero-thanks.png', no: '04', title: '確認收到' },
    autoRemind48: { hero: 'hero-remind48.png', no: '05', title: '截止前 48 小時' },
    autoRemind24: { hero: 'hero-remind24.png', no: '05', title: '截止前 24 小時' },
    overdue: { hero: 'hero-overdue.png', no: '06', title: '逾期通知' },
    materialOrder: { hero: 'hero-matorder.png', no: '07', title: '教材下單' },
    materialDeliver: { hero: 'hero-matdeliver.png', no: '08', title: '教材交付' },
    reportPrincipal: { hero: 'hero-report-principal.png', no: 'R1', title: '校長匯報' },
    reportAssistant: { hero: 'hero-report-assistant.png', no: 'R2', title: '助教匯報' },
    toolTest: { hero: 'hero-tooltest.png', no: 'T1', title: '工具待測試' },
    toolPassed: { hero: 'hero-toolpass.png', no: 'T2', title: '工具已通過' },
    toolRevise: { hero: 'hero-toolrevise.png', no: 'T3', title: '等待校長修改' },
    submitted: { hero: 'hero-submitted.png', no: 'A1', title: '作業送出' },
    supplementDone: { hero: 'hero-suppdone.png', no: 'A2', title: '補件完成' },
    suppResult: { hero: 'hero-supprequest.png', no: '09', title: '補充結果' },
    suppReject: { hero: 'hero-supplement.png', no: '03', title: '退回重填' },          // 3.3.8 沿用補件頂圖
    priceAsk: { hero: 'hero-toolpass.png', no: 'T4', title: '請確認金額' },          // 3.3.0
    priceDone: { hero: 'hero-toolpass.png', no: 'T5', title: '金額已確認' },
    orderClaim: { hero: 'hero-matorder.png', no: 'T6', title: '回報已下單' },
    adminRemindTool: { hero: 'hero-tooltest.png', no: 'N1', title: '待測試工具' },       // 3.2.12 內部提醒（沿用既有頂圖）
    adminRemindWork: { hero: 'hero-submitted.png', no: 'N2', title: '待看作業' },
    adminRemindIssue: { hero: 'hero-toolrevise.png', no: 'N3', title: '工具問題待修改' },
    adminRemindDeliver: { hero: 'hero-matdeliver.png', no: 'N4', title: '已下單待交付' }
  };

  /* 匯報項目（依勾選項目顯示；count 為 0 者不顯示） */
  var REPORT_ITEMS = {
    principal: [
      ['consultToday', '今日諮詢'], ['consultSoon', '48 小時內諮詢'], ['toolTodo', '待製作工具'], ['toolRevise', '待校長修改'],
      ['toolTesting', '助教測試中'], ['toolPassed', '工具已通過'], ['matOrder', '教材待下單'], ['matDeliver', '教材待交付'], ['submittedToday', '今日送出']
    ],
    assistant: [
      ['submitted', '已繳交'], ['filling', '填寫中'], ['notStarted', '未開始'], ['overdue', '逾期未送出'], ['needRemind', '需提醒'],
      ['unreachable', '無法送達'], ['toolTest', '工具待測試'], ['supplementOpen', '補件未完成'], ['noAck', '未回覆確認']
    ],
    urgent: { overdue: 1, needRemind: 1, unreachable: 1, toolRevise: 1, consultToday: 1, toolTest: 1 }
  };

  /* 解壓縮教學（admin/notice-card.html unzip 圖卡同內容） */
  var UNZIP = [
    { k: 'WIN', t: 'Windows', steps: ['在 ZIP 檔按右鍵', '選「全部解壓縮」', '選擇保存位置 → 按「解壓縮」', '打開資料夾，雙擊 index.html'], tip: '無法解壓縮：安裝 7-Zip → 右鍵 → 7-Zip → 解壓縮到「檔名」' },
    { k: 'MAC', t: 'Mac', steps: ['雙擊 ZIP 檔', '同位置會出現同名資料夾', '在 index 按右鍵 → 打開檔案的應用程式 → Chrome'], tip: '資料夾內的檔案不要移動或刪除' },
    { k: '注意', t: '手機', steps: ['工具需在電腦上開啟使用', '手機可先下載保存，再傳到電腦', '不要在 ZIP 裡直接點開，先完整解壓縮'], tip: '卡住了：截圖目前畫面回傳官方 LINE', warn: true }
  ];

  /* ------------------------------------------------------------------ */
  /* 時間（台北）                                                         */
  /* ------------------------------------------------------------------ */
  var TZ_MS = 8 * 3600000;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** ISO（含時區）／毫秒／'yyyy.mm.dd HH:mm[:ss]'／'yyyy-mm-dd HH:mm'／'yyyy/mm/dd'（台北）→ 毫秒；無法解析回 null */
  function parseTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) return isFinite(v.getTime()) ? v.getTime() : null;
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && /(?:Z|[+\-]\d{2}:?\d{2})$/.test(s)) { var ms = Date.parse(s); return isFinite(ms) ? ms : null; }
    var m = /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s*(?:（週.）|\(週.\))?\s*[ T]?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    var h = m[4] != null ? +m[4] : 23, mi = m[5] != null ? +m[5] : 59;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], h, mi, m[6] ? +m[6] : 0) - TZ_MS;
  }
  function tpe(ms) { return new Date(ms + TZ_MS); }
  function weekOf(t) { return '日一二三四五六'.charAt(t.getUTCDay()); }
  /** yyyy.mm.dd */
  function fmtDate(ms) { var t = tpe(ms); return t.getUTCFullYear() + '.' + pad(t.getUTCMonth() + 1) + '.' + pad(t.getUTCDate()); }
  /** yyyy.mm.dd（週X） */
  function fmtDateW(ms) { return fmtDate(ms) + '（週' + weekOf(tpe(ms)) + '）'; }
  /** HH:mm */
  function fmtHM(ms) { var t = tpe(ms); return pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()); }
  /** yyyy.mm.dd（週X）HH:mm；無法解析回 '' */
  function formatDeadline(v) { var ms = parseTime(v); return ms == null ? '' : fmtDateW(ms) + fmtHM(ms); }
  /** altText 用的相對說法：今晚 20:00／今天 12:00／明天 20:00／yyyy.mm.dd（週X）HH:mm */
  function relDeadline(ms, nowMs) {
    if (ms == null) return '';
    var day = Math.floor((ms + TZ_MS) / 86400000), today = Math.floor((nowMs + TZ_MS) / 86400000);
    var h = tpe(ms).getUTCHours();
    if (day === today) return (h >= 17 ? '今晚 ' : '今天 ') + fmtHM(ms);
    if (day === today + 1) return '明天 ' + fmtHM(ms);
    return fmtDateW(ms) + fmtHM(ms);
  }
  /** 剩餘時間：剩 5 小時／剩 2 天／已截止 */
  function remainText(ms, nowMs) {
    var d = ms - nowMs;
    if (d <= 0) return '已截止';
    var h = Math.ceil(d / 3600000);
    return h <= 24 ? '剩 ' + h + ' 小時' : '剩 ' + Math.floor(d / 86400000) + ' 天';
  }
  function overText(ms, nowMs) {
    var d = nowMs - ms;
    if (d <= 0) return '';
    var h = Math.floor(d / 3600000);
    return h < 24 ? '逾期 ' + Math.max(1, h) + ' 小時' : '逾期 ' + Math.floor(d / 86400000) + ' 天';
  }

  /* ------------------------------------------------------------------ */
  /* 元件                                                                 */
  /* ------------------------------------------------------------------ */
  function str(v) { return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); }
  function clip(s, n) { s = str(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function assign(o, x) { if (x) for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k) && x[k] !== undefined) o[k] = x[k]; return o; }
  function txt(text, o) { return assign({ type: 'text', text: str(text) || ' ' }, o); }
  function span(text, o) { var t = text == null ? '' : String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); return assign({ type: 'span', text: t || ' ' }, o); }
  /** 含 span 的文字；parts：['一般', { em:'強調' }, …] */
  function rich(parts, o, emColor) {
    var spans = [], plain = '';
    parts.forEach(function (p) {
      if (p == null || p === '') return;
      if (typeof p === 'string') { spans.push(span(p)); plain += p; }
      else if (p.em) { spans.push(span(p.em, { color: p.color || emColor || C.t1, weight: 'bold' })); plain += p.em; }
    });
    return assign({ type: 'text', text: plain || ' ', contents: spans, wrap: true }, o);
  }
  function box(layout, contents, o) { return assign({ type: 'box', layout: layout, contents: contents || [] }, o); }
  function vbox(contents, o) { return box('vertical', contents, o); }
  function hbox(contents, o) { return box('horizontal', contents, o); }
  function bar(w, h, color, o) { return vbox([], assign({ width: w, height: h, backgroundColor: color }, o)); }
  function sep(color, margin) { return { type: 'separator', color: color || C.line1, margin: margin || 'md' }; }
  function uri(label, u) { return { type: 'uri', label: clip(label, LIMITS.label), uri: u }; }
  function msgAct(label, text) { return { type: 'message', label: clip(label, LIMITS.label), text: text }; }

  /** 標籤膠囊（桃紅淡底／金色淡底） */
  function pill(text, tone) {
    var bg = tone === 'gold' ? C.goldSoft : tone === 'ok' ? C.okTint : tone === 'err' ? C.errTint : C.roseTint;
    var fg = tone === 'gold' ? C.gold : tone === 'ok' ? C.ok : tone === 'err' ? C.err : C.rose300;
    return hbox([txt(text, { size: 'xxs', weight: 'bold', color: fg, flex: 0 })], { backgroundColor: bg, cornerRadius: '10px', paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px', flex: 0 });
  }
  /** 票根打孔線（Flex 無虛線：以小圓點橫列代替） */
  function perforation(n, color) {
    var dots = [];
    for (var i = 0; i < n; i++) dots.push(vbox([], { width: '4px', height: '4px', cornerRadius: '2px', backgroundColor: color || C.ink0, flex: 0 }));
    return hbox(dots, { justifyContent: 'space-between', alignItems: 'center', height: '4px' });
  }
  /** 主要按鈕：桃紅漸層底＋深色字（Flex 主要按鈕只能白字，改以 box＋action 呈現 design guide 的 rose-ink 字） */
  function primaryBtn(label, action) {
    return vbox([txt(label, { size: 'md', weight: 'bold', color: C.roseInk, align: 'center' })], {
      background: { type: 'linearGradient', angle: '90deg', startColor: C.roseHi, endColor: C.roseLo },
      backgroundColor: C.rose, cornerRadius: '10px', height: '46px', justifyContent: 'center', action: action
    });
  }
  /** 次要按鈕：透明底＋細描邊 */
  function secondaryBtn(label, action) {
    return vbox([txt(label, { size: 'sm', weight: 'bold', color: C.t1, align: 'center' })], {
      borderWidth: '1px', borderColor: C.line2, cornerRadius: '10px', height: '40px', justifyContent: 'center', action: action
    });
  }
  /** 3.3.0 杏仁白拼圖圖片按鈕（圖片元件＋網址動作；1040×260） */
  function puzzleBtn(file, label, action, d) {
    return vbox([{ type: 'image', url: urls(d || {}).asset + file, size: 'full', aspectRatio: CONFIG.puzzleRatio, aspectMode: 'fit', action: action }], { action: action });
  }
  function postbackAct(label, data) { return { type: 'postback', label: clip(label, LIMITS.label), data: String(data).slice(0, 300), displayText: clip(label, 300) }; }
  /** 明細列：左標籤、右值 */
  function kvRow(label, value, o) {
    var v = typeof value === 'string' ? txt(value, assign({ size: 'sm', weight: 'bold', color: C.t1, align: 'end', wrap: true, flex: 5 }, o)) : assign(value, { flex: 5 });
    return hbox([txt(label, { size: 'xs', color: C.t3, flex: 3, gravity: 'center' }), v], { paddingTop: '9px', paddingBottom: '9px', spacing: 'md' });
  }
  /** 金色雙線明細框（外框米白細線＋內框金線） */
  function slip(title, rows, tone, right) {
    var lineColor = tone === 'rose' ? C.roseLine : C.goldLine, head = tone === 'rose' ? C.rose300 : C.gold;
    var inner = [hbox([txt(title, { size: 'xs', weight: 'bold', color: head, flex: 1 })].concat(right ? [txt(right, { size: 'xxs', color: C.t3, align: 'end', flex: 0, gravity: 'center' })] : []), { paddingBottom: '4px' })];
    rows.forEach(function (r, i) { if (i > 0) inner.push(sep(C.line1, 'none')); inner.push(r); });
    return vbox([vbox(inner, { borderWidth: '1px', borderColor: lineColor, cornerRadius: '10px', paddingAll: '12px', paddingBottom: '6px', backgroundColor: C.ink0 + 'E0' })],
      { borderWidth: '1px', borderColor: C.line2, cornerRadius: '13px', paddingAll: '3px', margin: 'lg' });
  }
  /** 截止時間區塊（日期＋大時間＋剩餘膠囊） */
  function deadlineBlock(label, ms, chip, chipTone, plain) {
    var parts = [txt(label, { size: 'xxs', color: C.t3 })];
    if (ms == null) parts.push(txt('未設定', { size: 'md', weight: 'bold', color: C.t1, margin: 'sm' }));
    else {
      parts.push(txt(plain ? fmtDate(ms) : fmtDateW(ms), { size: 'sm', weight: 'bold', color: C.t1, margin: 'sm' }));   // 3.3.4 plain：yyyy.mm.dd（教材下單卡）
      parts.push(hbox([txt(fmtHM(ms), { size: '3xl', weight: 'bold', color: C.rose300, flex: 0 })].concat(chip ? [vbox([pill(chip, chipTone || 'gold')], { justifyContent: 'center', margin: 'lg', flex: 0 }), vbox([], { flex: 1 })] : []), { alignItems: 'center' }));
    }
    return vbox(parts, { margin: 'lg', paddingAll: '14px', cornerRadius: '12px', backgroundColor: C.ink2, borderWidth: '1px', borderColor: C.line1 });
  }
  /** 完成度條 */
  function progressBlock(pct, label) {
    pct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    var track = vbox(pct > 0 ? [bar(pct + '%', '6px', C.rose, { cornerRadius: '3px', background: { type: 'linearGradient', angle: '90deg', startColor: '#E8247E', endColor: C.rose300 } })] : [],
      { height: '6px', backgroundColor: C.ink0, cornerRadius: '3px', margin: 'md' });
    return vbox([
      hbox([txt(label || '目前完成度', { size: 'xs', color: C.t3, flex: 1, gravity: 'bottom' }),
        txt(pct + '%', { size: 'xl', weight: 'bold', color: pct >= 100 ? C.ok : C.t1, flex: 0, align: 'end' })], { alignItems: 'flex-end' }),
      track
    ], { margin: 'lg' });
  }
  /** 稱呼列：霓安＋學姐 */
  function whoLine(cn, suffix) {
    return rich([{ em: cn || '學姐', color: C.t1 }, cn ? (suffix == null ? '學姐' : suffix) : ''], { size: 'xl', color: C.t2, margin: 'md', wrap: false });
  }
  function leadRule() { return bar('36px', '2px', C.rose, { cornerRadius: '1px', margin: 'md' }); }
  function para(parts, o) { return rich(parts, assign({ size: 'sm', color: C.t2, margin: 'md', lineSpacing: '5px' }, o)); }

  function urls(d) {
    var base = str(d.assetBase) || CONFIG.assetBase;
    return { asset: /\/$/.test(base) ? base : base + '/', front: str(d.frontUrl) || CONFIG.frontUrl, admin: str(d.adminUrl) || CONFIG.adminUrl };
  }
  function adminView(d, hash) { var a = urls(d).admin; return a.split('#')[0] + '#/' + hash.replace(/^#?\/?/, ''); }
  function nowOf(d) { var n = parseTime(d && d.now); return n == null ? Date.now() : n; }
  function stampNo(ms) { return ms == null ? '' : 'No. ' + fmtDate(ms).replace(/\./g, ''); }

  /**
   * 卡片骨架：hero 品牌頂圖（含襯線標題、印章、防偽紋）＋ body 內容 ＋ footer 票根（打孔線、ADMIT 列、按鈕、校名）
   * spec = { type, d, tag, body:[], buttons:[], action, admit?:[左, 右], altText }
   */
  function bubble(spec) {
    var T = TYPES[spec.type], u = urls(spec.d || {});
    var head = hbox([pill(spec.tag || NAME, spec.tagTone), vbox([], { flex: 1 }), txt('No. ' + T.no, { size: 'xxs', color: C.t3, flex: 0, gravity: 'center' })], { alignItems: 'center' });
    var footer = [perforation(26, C.ink0)];
    if (spec.admit) footer.push(vbox([sep(C.goldLine, 'none'), hbox([txt(spec.admit[0], { size: 'xxs', color: C.gold, flex: 1 }), txt(spec.admit[1] || ' ', { size: 'xxs', color: C.gold, align: 'end', flex: 1 })], { paddingTop: '7px', paddingBottom: '7px' }), sep(C.goldLine, 'none')], { margin: 'lg' }));
    footer.push(vbox(spec.buttons, { spacing: 'sm', margin: 'lg' }));
    footer.push(txt('G.R.A.C.E ACADEMY', { size: 'xxs', color: C.t3, align: 'center', margin: 'md' }));
    var b = {
      type: 'bubble', size: CONFIG.bubbleSize,
      hero: { type: 'image', url: u.asset + T.hero, size: 'full', aspectRatio: CONFIG.heroRatio, aspectMode: 'cover', backgroundColor: C.ink0 },
      body: vbox([head].concat(spec.body), { paddingAll: '20px', paddingTop: '16px', paddingBottom: '18px', backgroundColor: C.ink1 }),
      footer: vbox(footer, { paddingAll: '16px', paddingTop: '0px', paddingBottom: '12px', backgroundColor: C.ink2 }),
      styles: { hero: { backgroundColor: C.ink0 }, body: { backgroundColor: C.ink1 }, footer: { backgroundColor: C.ink2, separator: false } }
    };
    if (spec.action) { b.action = spec.action; b.hero.action = spec.action; }
    return { type: 'flex', altText: clip(spec.altText, LIMITS.altText), contents: b };
  }
  function callOf(d) { return clip(d.callName || d.name, 20); }
  function who(d) { var cn = callOf(d); return cn ? cn + (d.suffix == null ? '學姐' : d.suffix) : '學姐'; }

  /* ------------------------------------------------------------------ */
  /* 學姐端                                                               */
  /* ------------------------------------------------------------------ */
  /** 作業通知 { callName, deadline, batchTitle?, hint?, link? } */
  function assignment(d) {
    d = d || {};
    var u = urls(d), dl = parseTime(d.deadline), link = str(d.link) || u.front, now = nowOf(d);
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para([NAME + '作業已開放填寫，請於', { em: '截止時間前' }, '完成並送出。']),
      deadlineBlock('截止時間', dl, dl != null && dl - now <= 72 * 3600000 ? remainText(dl, now) : '', 'gold')];
    var rows = [];
    if (str(d.batchTitle)) rows.push(kvRow('作業批次', clip(d.batchTitle, 40)));
    if (str(d.hint)) rows.push(kvRow('提醒', clip(d.hint, 80)));
    rows.push(kvRow('收到通知', txt('請回覆「' + CONFIG.ackText + '」', { size: 'sm', weight: 'bold', color: C.rose300, align: 'end' })));
    body.push(slip('作業資訊', rows, 'gold'));
    return bubble({ type: 'assignment', d: d, body: body, action: uri('前往填寫', link), admit: ['ADMIT ONE', stampNo(dl)],
      buttons: [primaryBtn('前往填寫', uri('前往填寫', link)), secondaryBtn('回覆確認', msgAct('回覆確認', CONFIG.ackText))],
      altText: who(d) + '：' + NAME + '作業已開放' + (dl != null ? '，' + relDeadline(dl, now) + ' 截止' : '') });
  }

  /**
   * 提醒截止（校長範本：「{稱呼}學姐，提醒諮詢教材·專屬訂製作業只到 {截止}，學姐目前完成度：{完成度}%，請學姐一定記得準時繳交，逾時會影響到諮詢的資格跟權益喔🥹🤍」）
   * { callName, deadline, percent, link?, lead?, closing? }（lead／closing 覆寫範本的前後句）
   */
  function remind(d) {
    d = d || {};
    var u = urls(d), dl = parseTime(d.deadline), link = str(d.link) || u.front, now = nowOf(d);
    var pct = Math.max(0, Math.min(100, Math.round(Number(d.percent) || 0)));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para([str(d.lead) || '提醒' + NAME + '作業只到']),
      deadlineBlock('截止時間', dl, dl != null ? remainText(dl, now) : '', 'gold'),
      progressBlock(pct, '學姐目前完成度'),
      vbox([para(str(d.closing) ? [str(d.closing)] : ['請學姐一定記得', { em: '準時繳交', color: C.rose300 }, '，逾時會影響到諮詢的資格跟權益喔🥹🤍'], { margin: 'none' })],
        { margin: 'lg', paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.roseTint })];
    return bubble({ type: 'remind', d: d, body: body, action: uri('繼續填寫', link), admit: ['DEADLINE', stampNo(dl)],
      buttons: [primaryBtn('繼續填寫', uri('繼續填寫', link))],
      altText: who(d) + '：專屬訂製作業' + (dl != null ? relDeadline(dl, now) + ' 截止' : '即將截止') + '，目前完成 ' + pct + '%' });
  }

  function isDriveUrl(s) { return /(?:drive|docs)\.google\.com/i.test(String(s || '')); }
  /** 補件頁連結（同 schema3.supplementLink：作業網址＋r／s／k）；只接受補件頁，不使用雲端資料夾連結 */
  function supplementUrl(d, u) {
    var l = str(d.link);
    if (l && /^https:\/\//.test(l) && !isDriveUrl(l)) return l;
    if (str(d.receiptId) && str(d.requestId)) {
      var b = u.front;
      return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'r=' + encodeURIComponent(str(d.receiptId)) + '&s=' + encodeURIComponent(str(d.requestId)) + (str(d.token) ? '&k=' + encodeURIComponent(str(d.token)) : '');
    }
    return u.front;
  }
  /** 通知補件 { callName, items:[{ title, note?, due?, type? }], deadline?（整體期限；未給＝最早項目期限）, link|receiptId+requestId+token } */
  function supplement(d) {
    d = d || {};
    var u = urls(d), link = supplementUrl(d, u), now = nowOf(d);
    var items = (Array.isArray(d.items) ? d.items : []).map(function (it) { return typeof it === 'string' ? { title: it } : (it || {}); }).filter(function (it) { return str(it.title); });
    var dues = items.map(function (it) { return parseTime(it.due); }).filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    var dl = parseTime(d.deadline); if (dl == null && dues.length) dl = dues[0];
    var shown = items.slice(0, LIMITS.maxItems), rows = [];
    shown.forEach(function (it, i) {
      var due = parseTime(it.due), col = [txt(clip((str(it.type) ? str(it.type) + '｜' : '') + it.title, 60), { size: 'sm', weight: 'bold', color: C.t1, wrap: true })];
      if (str(it.note)) col.push(txt(clip(it.note, 120), { size: 'xs', color: C.t3, wrap: true, margin: 'xs' }));
      col.push(txt('期限 ' + (due != null ? fmtDateW(due) + fmtHM(due) : dl != null ? fmtDateW(dl) + fmtHM(dl) : '未設定'), { size: 'xxs', color: C.rose300, margin: 'xs' }));
      rows.push(hbox([txt(pad(i + 1), { size: 'xs', color: C.gold, flex: 0, weight: 'bold' }), vbox(col, { flex: 1 })], { spacing: 'md', paddingTop: '10px', paddingBottom: '10px' }));
    });
    if (items.length > shown.length) rows.push(txt('另有 ' + (items.length - shown.length) + ' 項，請到補件頁查看', { size: 'xs', color: C.rose300, weight: 'bold', margin: 'sm' }));
    if (!rows.length) rows.push(txt('補件項目請到補件頁查看', { size: 'sm', color: C.t2, margin: 'sm' }));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(['作業已收到，請補充以下', { em: items.length + ' 項' }, '資料，補齊後即完成收件。']),
      slip('補件項目', rows, 'rose', pad(items.length) + ' 項'),
      fileSlip(d.file),
      deadlineBlock('補件期限', dl, dl != null ? remainText(dl, now) : '', 'gold')].filter(Boolean);
    var hasFile = !!(d.file && str(d.file.name) && /^https:\/\//.test(str(d.file.url))), ret = hasFile && !!d.file.ret;
    return bubble({ type: 'supplement', d: d, body: body, action: uri(ret ? '回傳檔案' : '前往補件', link), admit: ['RESUBMIT', stampNo(dl)],
      buttons: hasFile ? [puzzleBtn('puzzle-suppfile.png', '下載附檔', uri('下載附檔', d.file.url), d), primaryBtn(ret ? '回傳檔案' : '前往補件', uri(ret ? '回傳檔案' : '前往補件', link))] : [primaryBtn('前往補件', uri('前往補件', link))],   // 3.3.8 補件附檔：杏仁白拼圖「下載附檔」＋「回傳檔案」（取代前往補件，同一補件頁）
      altText: who(d) + '：需補件 ' + items.length + ' 項' + (dl != null ? '，期限 ' + relDeadline(dl, now) : '') + '（' + shown.slice(0, 3).map(function (x) { return clip(x.title, 12); }).join('、') + (items.length > 3 ? '…' : '') + '）' });
  }

  /** 3.3.8 補件附檔區：{ name, ret, deadline?（回傳截止）, url } → 金框明細（附檔、回傳、回傳截止）；無附檔回 null */
  function fileSlip(f) {
    if (!f || !str(f.name)) return null;
    var dl = parseTime(f.deadline), rows = [kvRow('附檔', clip(f.name, 40)), kvRow('回傳', f.ret ? '填好後回傳這份檔案' : '下載參考即可')];
    if (f.ret && dl != null) rows.push(kvRow('回傳截止', txt(fmtDateW(dl) + fmtHM(dl), { size: 'sm', weight: 'bold', color: C.rose300, align: 'end', wrap: true })));
    return slip('補件附檔', rows, 'gold');
  }
  /**
   * 3.3.8 退回重填（學姐）{ callName, title（補件項目）, fileName?, reason, deadline?（回傳截止）, link（補件頁） }
   * 校長審核學姐回傳的補件檔後退回：附原因與補件頁連結；按鈕「重新回傳」開啟同一補件頁。
   */
  function suppReject(d) {
    d = d || {};
    var u = urls(d), link = supplementUrl(d, u), now = nowOf(d), dl = parseTime(d.deadline);
    var rows = [kvRow('補件項目', clip(d.title || '補件檔案', 40))];
    if (str(d.fileName)) rows.push(kvRow('回傳檔案', clip(d.fileName, 40)));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(['學姐回傳的補件檔案需要', { em: '修改後重新回傳', color: C.rose300 }, '，請依下方原因調整後再上傳一次。']),
      slip('補件項目', rows, 'gold'),
      vbox([txt('退回原因', { size: 'xxs', color: C.err, weight: 'bold' }), txt(clip(d.reason || '請依校長說明修改後重新回傳', 200), { size: 'sm', color: C.t1, wrap: true, margin: 'sm' })],
        { margin: 'lg', paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.errTint, borderWidth: '1px', borderColor: C.err + '66' })];
    if (dl != null) body.push(deadlineBlock('回傳截止', dl, remainText(dl, now), 'gold'));
    return bubble({ type: 'suppReject', d: d, body: body, action: uri('重新回傳', link), admit: ['RESUBMIT', stampNo(dl != null ? dl : now)],
      buttons: [primaryBtn('重新回傳', uri('重新回傳', link))],
      altText: who(d) + '：補件檔案「' + clip(d.title || '', 20) + '」需修改後重新回傳' });
  }

  /** 確認收到致謝 { callName, receiptId?, submittedAt?, onTime?（true／false／null）, link? } */
  function thanks(d) {
    d = d || {};
    var u = urls(d), at = parseTime(d.submittedAt), link = str(d.link) || u.front;
    var rows = [];
    if (str(d.receiptId)) rows.push(kvRow('回執編號', clip(d.receiptId, 30)));
    if (at != null) rows.push(kvRow('送出時間', fmtDateW(at) + fmtHM(at)));
    if (d.onTime === true || d.onTime === false) rows.push(kvRow('繳交狀態', hbox([vbox([], { flex: 1 }), pill(d.onTime ? '準時繳交' : '逾時繳交', d.onTime ? 'ok' : 'err')])));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(['已收到作業，', { em: '謝謝學姐♡' }]),
      para(['校長會依作業內容準備諮詢，若需補充資料會再另行通知。'], { size: 'xs', color: C.t3 })];
    if (rows.length) body.push(slip('收件回執', rows, 'gold'));
    return bubble({ type: 'thanks', d: d, body: body, action: uri('查看作業', link), admit: ['RECEIVED', at != null ? stampNo(at) : ''],
      buttons: [primaryBtn('查看作業', uri('查看作業', link))],
      altText: who(d) + '：已收到' + NAME + '作業，謝謝學姐♡' });
  }

  /** 48／24 小時自動提醒 { hours:48|24, callName, deadline, percent?, link? } */
  function autoRemind(d) {
    d = d || {};
    var h = Number(d.hours) === 24 ? 24 : 48, type = h === 24 ? 'autoRemind24' : 'autoRemind48';
    var u = urls(d), dl = parseTime(d.deadline), link = str(d.link) || u.front, now = nowOf(d);
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para([NAME + '作業', { em: h === 24 ? '剩不到 24 小時' : '將在 48 小時內' }, '截止，目前尚未送出。']),
      deadlineBlock('截止時間', dl, dl != null ? remainText(dl, now) : '', h === 24 ? 'rose' : 'gold')];
    if (d.percent != null && d.percent !== '') body.push(progressBlock(d.percent, '目前完成度'));
    body.push(para([h === 24 ? '請把握時間完成並送出。' : '越早完成，諮詢時段可優先安排。'], { size: 'xs', color: C.t3, margin: 'lg' }));
    return bubble({ type: type, d: d, body: body, action: uri('繼續填寫', link), admit: [h + 'H LEFT', stampNo(dl)],
      buttons: [primaryBtn('繼續填寫', uri('繼續填寫', link))],
      altText: who(d) + '：專屬訂製作業' + (dl != null ? relDeadline(dl, now) + ' 截止' : '即將截止') + '（剩不到 ' + h + ' 小時）' + (d.percent != null && d.percent !== '' ? '，目前完成 ' + Math.round(Number(d.percent) || 0) + '%' : '') });
  }

  /**
   * 逾期通知
   *   學姐版 { callName, deadline, link? }
   *   管理版 { audience:'admin', students:[{ name, deadline? }|名字], count? }（打開作業追蹤）
   */
  function overdue(d) {
    d = d || {};
    var u = urls(d), now = nowOf(d);
    if (d.audience === 'admin' || Array.isArray(d.students)) {
      var list = (d.students || []).map(function (s) { return typeof s === 'string' ? { name: s } : (s || {}); }).filter(function (s) { return str(s.name); });
      var n = Number(d.count) || list.length, track = adminView(d, 'track');
      var rows = list.slice(0, LIMITS.maxItems).map(function (s, i) {
        var dl = parseTime(s.deadline);
        return hbox([txt(pad(i + 1), { size: 'xs', color: C.gold, flex: 0, weight: 'bold' }), txt(clip(s.name, 20), { size: 'sm', weight: 'bold', color: C.t1, flex: 1 }),
          txt(dl != null ? overText(dl, now) || fmtDate(dl) : ' ', { size: 'xxs', color: C.rose300, flex: 0, align: 'end', gravity: 'center' })], { spacing: 'md', paddingTop: '8px', paddingBottom: '8px' });
      });
      if (list.length > LIMITS.maxItems) rows.push(txt('另有 ' + (list.length - LIMITS.maxItems) + ' 位，請到作業追蹤查看', { size: 'xs', color: C.rose300, margin: 'sm' }));
      if (!rows.length) rows.push(txt('目前沒有逾期學姐', { size: 'sm', color: C.t2 }));
      var bodyA = [rich([{ em: String(n), color: C.rose300 }, ' 位學姐'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
        para(['以下學姐已超過截止時間，', { em: '仍未送出' }, '。']), slip('逾期名單', rows, 'rose', fmtDate(now))];
      return bubble({ type: 'overdue', d: d, tag: '管理通知', tagTone: 'gold', body: bodyA, action: uri('打開作業追蹤', track), admit: ['OVERDUE', stampNo(now)],
        buttons: [primaryBtn('打開作業追蹤', uri('打開作業追蹤', track))],
        altText: '逾期名單：' + n + ' 位學姐超過截止時間仍未送出（' + list.slice(0, 5).map(function (s) { return clip(s.name, 8); }).join('、') + (list.length > 5 ? '…' : '') + '）' });
    }
    var dl = parseTime(d.deadline), link = str(d.link) || u.front, ov = dl != null ? overText(dl, now) : '';
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para([NAME + '作業已超過截止時間，目前', { em: '尚未送出', color: C.rose300 }, '。']),
      deadlineBlock('原截止時間', dl, ov, 'err'),
      para(['請學姐盡快完成送出；逾時會影響諮詢的資格跟權益，如有狀況請回覆官方 LINE 說明。'], { size: 'xs', color: C.t3, margin: 'lg' })];
    return bubble({ type: 'overdue', d: d, body: body, action: uri('前往填寫', link), admit: ['OVERDUE', stampNo(dl)],
      buttons: [primaryBtn('前往填寫', uri('前往填寫', link))],
      altText: who(d) + '：專屬訂製作業已超過截止時間' + (dl != null ? '（' + fmtDateW(dl) + fmtHM(dl) + '）' : '') + '，請盡快送出' });
  }

  function amountText(v) { var n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) && n > 0 ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; }
  /**
   * 教材下單通知 { callName, material, product?（設定的商品名稱，預設「諮詢教材」）, amount?, deadline, orderUrl? }
   *   3.3.0：orderUrl＝點擊紀錄連結（前台 go.html）；puzzle:true＝杏仁白拼圖「前往下單」；claimData＝「我已下單」postback；unit:'NT$'；remind:true＝提醒下單
   */
  /** 3.3.4 下單步驟：前往下單 → 回報完成（我已下單） */
  function orderSteps() {
    var step = function (n, k, v) {
      return hbox([vbox([txt(String(n), { size: 'xxs', color: C.gold, align: 'center' })], { width: '18px', height: '18px', cornerRadius: '9px', borderWidth: '1px', borderColor: C.gold, justifyContent: 'center', flex: 0 }),
        rich([{ em: k, color: C.t1 }, '：' + v], { size: 'sm', color: C.t2, wrap: true, flex: 1 })], { spacing: 'md', margin: n === 1 ? 'md' : 'sm' });
    };
    return vbox([txt('下單步驟', { size: 'xs', weight: 'bold', color: C.gold }), step(1, '前往下單', '點下方「前往下單」完成購買'), step(2, '回報完成', '購買完成後，請回到此卡片按「' + CONFIG.claimLabel + '」')],
      { margin: 'lg', paddingAll: '12px', cornerRadius: '12px', backgroundColor: C.ink2, borderWidth: '1px', borderColor: C.line1 });
  }
  function materialOrder(d) {
    d = d || {};
    var dl = parseTime(d.deadline), now = nowOf(d), order = str(d.orderUrl) || CONFIG.orderUrl, nt = str(d.unit) === 'NT$', claim = str(d.claimData);
    var product = clip(d.product, 40) || CONFIG.productDefault, amt = amountText(d.amount);
    var rows = [kvRow('教材', '《' + clip(d.material || product, 40) + '》')];
    if (!nt) rows.push(kvRow('下單項目', '《' + product + '》'));
    if (amt) rows.push(kvRow('金額', nt ? rich(['NT$ ', { em: amt, color: C.rose300 }], { size: 'md', color: C.t3, align: 'end', wrap: false }) : rich([{ em: amt, color: C.rose300 }, ' 課費'], { size: 'md', color: C.t3, align: 'end', wrap: false })));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(d.remind ? ['專屬諮詢教材', { em: '尚未完成下單' }, '，請在期限前到官網下單，官方確認後即交付檔案。'] : ['校長根據學姐的諮詢內容準備了專屬諮詢教材，請先到官網', { em: '完成下單' }, '，官方確認後即交付檔案。']),
      slip('下單明細', rows, 'gold', 'ORDER'),
      deadlineBlock('下單期限', dl, dl != null ? remainText(dl, now) : '', 'gold', true),
      claim ? orderSteps() : para(['完成下單或確定領取，請回覆「' + CONFIG.materialKeyword + '」'], { size: 'xs', color: C.t3, margin: 'lg' })];   // 3.3.4 下單步驟引導
    var go = uri('前往下單', order), claimAct = claim ? postbackAct(CONFIG.claimLabel, claim) : null;
    var buttons = [d.puzzle ? puzzleBtn('puzzle-order.png', '前往下單', go, d) : primaryBtn('前往下單', go)].concat(claim
      ? [txt('已完成購買了嗎？請按下方按鈕通知學院', { size: 'xs', color: C.t3, align: 'center', wrap: true, margin: 'md' }),
        d.puzzle ? puzzleBtn('puzzle-claimed.png', CONFIG.claimLabel, claimAct, d) : secondaryBtn(CONFIG.claimLabel, claimAct),
        txt('學院核對後會以 LINE 傳送領取教材連結', { size: 'xxs', color: C.t3, align: 'center', wrap: true, margin: 'md' })]
      : [secondaryBtn('回覆領取', msgAct('回覆領取', CONFIG.materialKeyword))]);
    return bubble({ type: 'materialOrder', d: d, tag: d.remind ? '提醒下單' : '諮詢教材', body: body, action: go, admit: ['MATERIAL ORDER', stampNo(dl)], buttons: buttons,
      altText: (d.remind ? '提醒下單｜' : '') + who(d) + '：專屬諮詢教材《' + clip(d.material || product, 20) + '》' + (d.remind ? '尚未完成下單' : '已準備好') + (dl != null ? '，請於 ' + fmtDate(dl) + ' ' + fmtHM(dl) + ' 前完成下單' : '，請完成下單') });   // 3.3.4 yyyy.mm.dd HH:mm
  }

  /** 教材交付（含解壓縮教學）{ callName, material, fileName?, fileMeta?（例：ZIP・12.4 MB）, deliveredAt?, url?（整張卡連結；未給＝不設）, dlDeadline?（3.3.0 下載期限） } */
  function materialDeliver(d) {
    d = d || {};
    var at = parseTime(d.deliveredAt), kind = str(d.kind) === 'html' || str(d.kind) === 'file' ? str(d.kind) : 'zip';   // 3.3.2 交付類型（zip、html、file）
    var badge = kind === 'html' ? 'HTML' : kind === 'file' ? 'FILE' : 'ZIP';
    var fileRows = [hbox([
      vbox([txt(badge, { size: 'xxs', weight: 'bold', color: C.rose300, align: 'center' })], { width: '40px', height: '48px', cornerRadius: '6px', backgroundColor: C.ink3, borderWidth: '1px', borderColor: C.line2, justifyContent: 'flex-end', paddingBottom: '6px', flex: 0 }),
      vbox([txt(clip(d.fileName || (d.material ? d.material + (kind === 'zip' ? '.zip' : '') : '諮詢教材' + (kind === 'zip' ? '.zip' : '')), 60), { size: 'sm', weight: 'bold', color: C.t1, wrap: true }),
        txt(clip(d.fileMeta, 40) || (kind === 'html' ? '點「領取教材」直接開啟操作' : '請用電腦下載'), { size: 'xxs', color: C.t3, margin: 'xs' })], { flex: 1, justifyContent: 'center' })
    ], { spacing: 'md', paddingTop: '8px', paddingBottom: '10px' })];
    (kind === 'html' ? ['點「領取教材」直接開啟操作', '期限內可重複開啟', '一次性交付，期限後不補發'] : kind === 'file' ? ['先下載到電腦再開啟', '同步備份到自己的雲端', '一次性交付，遺失不補發'] : ['先下載到電腦，再解壓縮開啟', '同步備份到自己的雲端', '一次性交付，遺失不補發']).forEach(function (s, i) {
      fileRows.push(hbox([vbox([], { width: '10px', height: '10px', cornerRadius: '5px', borderWidth: '1px', borderColor: i === 2 ? C.rose : C.gold, backgroundColor: i === 2 ? C.roseTint : C.goldSoft, flex: 0 }),
        txt(s, { size: 'xs', color: i === 2 ? C.rose300 : C.t2, flex: 1 })], { spacing: 'md', alignItems: 'center', paddingTop: '6px', paddingBottom: '6px' }));
    });
    var steps = UNZIP.map(function (os) {
      var lis = os.steps.map(function (s, i) {
        return hbox([vbox([txt(os.warn ? '!' : String(i + 1), { size: 'xxs', color: os.warn ? C.rose300 : C.gold, align: 'center' })], { width: '18px', height: '18px', cornerRadius: '9px', borderWidth: '1px', borderColor: os.warn ? C.rose : C.gold, justifyContent: 'center', flex: 0 }),
          txt(s, { size: 'xs', color: C.t2, wrap: true, flex: 1 })], { spacing: 'sm', margin: 'sm' });
      });
      return vbox([hbox([vbox([txt(os.k, { size: 'xxs', color: os.warn ? C.rose300 : C.gold, align: 'center' })], { borderWidth: '1px', borderColor: os.warn ? C.roseLine : C.goldLine, cornerRadius: '4px', paddingStart: '6px', paddingEnd: '6px', paddingTop: '1px', paddingBottom: '1px', flex: 0 }),
        txt(os.t, { size: 'sm', weight: 'bold', color: C.t1, flex: 1, gravity: 'center' })], { spacing: 'sm', alignItems: 'center' })].concat(lis)
        .concat([sep(C.line2, 'md'), txt(os.tip, { size: 'xxs', color: C.t3, wrap: true, margin: 'sm' })]),
      { paddingAll: '12px', cornerRadius: '12px', backgroundColor: os.warn ? C.roseTint : C.ink2, borderWidth: '1px', borderColor: os.warn ? C.roseLine : C.line2, margin: 'md' });
    });
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(['已確認學姐完成下單，專屬諮詢教材《' + clip(d.material || CONFIG.productDefault, 30) + '》正式交付，請', { em: kind === 'html' ? '於下載期限內開啟使用' : '用電腦下載' }, kind === 'html' ? '。' : '並妥善保存。']),
      slip('交付檔案', [vbox(fileRows)], 'rose', at != null ? fmtDate(at) : 'FILE')].concat(kind === 'zip' ? [txt('解壓縮教學', { size: 'sm', weight: 'bold', color: C.gold, margin: 'xl' })].concat(steps) : []);
    var link = str(d.url) && /^https:\/\//.test(str(d.url)) ? str(d.url) : '', claimGo = d.puzzle && link ? uri('領取教材', link) : null;   // 3.3.0 拼圖「領取教材」→ 下載連結
    var action = claimGo || (link ? uri('開啟教學', link) : null);
    var report = secondaryBtn('回報開啟問題', uri('回報開啟問題', CONFIG.oaMessageBase + encodeURIComponent('教材開啟問題：')));
    var dlMs = parseTime(d.dlDeadline);   // 3.3.0 下載期限：醒目提醒放在「領取教材」正上方
    var keep = vbox([txt(kind === 'html' ? '請於期限內開啟使用，教材不會補發' : '請下載後自行妥善保管，教材不會補發', { size: 'sm', weight: 'bold', color: C.rose300, wrap: true, align: 'center' })]
      .concat(dlMs != null ? [txt('請於 ' + fmtDate(dlMs) + ' ' + fmtHM(dlMs) + ' 前下載', { size: 'sm', weight: 'bold', color: C.t1, wrap: true, align: 'center', margin: 'sm' }), txt('期限後下載連結失效', { size: 'xxs', color: C.t3, align: 'center', margin: 'xs' })] : []),
      { paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.roseTint, borderWidth: '2px', borderColor: C.rose });
    var dlTxt = dlMs != null ? '，請於 ' + fmtDate(dlMs) + ' ' + fmtHM(dlMs) + ' 前下載' : '';
    return bubble({ type: 'materialDeliver', d: d, tag: '諮詢教材', body: body, action: action, admit: ['MATERIAL DELIVERY', at != null ? stampNo(at) : ''],
      buttons: claimGo ? [keep, puzzleBtn('puzzle-claim.png', '領取教材', claimGo, d), report] : [primaryBtn('確認領取', msgAct('確認領取', CONFIG.materialKeyword)), report],
      altText: who(d) + '：專屬諮詢教材《' + clip(d.material || CONFIG.productDefault, 20) + '》已交付' + (dlTxt || (kind === 'html' ? '，點「領取教材」直接開啟' : kind === 'file' ? '，請用電腦下載後開啟' : '，請用電腦下載 ZIP、解壓縮後開啟')) });
  }

  /* ------------------------------------------------------------------ */
  /* 管理端                                                               */
  /* ------------------------------------------------------------------ */
  /**
   * 管理匯報 { role:'principal'|'assistant', date?, items:[{ key, label?, count, names?:[] }] 或 { key: count|{count,names} }, enabled?:[key]（勾選項目）, quota?（3.6.0 起忽略）, paused? }
   *   沒有事項（count 0）的項目不顯示；按鈕：打開作業追蹤、打開諮詢準備
   */
  function report(d) {
    d = d || {};
    var role = d.role === 'assistant' ? 'assistant' : 'principal', type = role === 'assistant' ? 'reportAssistant' : 'reportPrincipal';
    var cat = REPORT_ITEMS[role], labels = {}, all = REPORT_ITEMS.principal.concat(REPORT_ITEMS.assistant);
    all.forEach(function (x) { labels[x[0]] = x[1]; });
    var raw = d.items || [], items = [];
    if (Array.isArray(raw)) items = raw.map(function (x) { return x || {}; });
    else Object.keys(raw).forEach(function (k) { var v = raw[k]; items.push(typeof v === 'object' && v ? assign({ key: k }, v) : { key: k, count: v }); });
    var enabled = Array.isArray(d.enabled) ? d.enabled : null;
    var order = cat.map(function (x) { return x[0]; });
    items = items.filter(function (x) { return (Number(x.count) || 0) > 0 && (!enabled || enabled.indexOf(x.key) >= 0); })
      .sort(function (a, b) { var ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    var now = nowOf(d), day = parseTime(d.date); if (day == null) day = now;
    var track = adminView(d, 'track'), prep = adminView(d, 'prep');
    var body = [rich([{ em: role === 'assistant' ? '確認繳交' : '準備工具', color: C.t1 }, '　' + fmtDateW(day)], { size: 'lg', color: C.t3, margin: 'md', wrap: false }), leadRule()];
    if (!items.length) body.push(vbox([txt('目前沒有待處理事項', { size: 'sm', color: C.t2, align: 'center' })], { margin: 'lg', paddingAll: '16px', cornerRadius: '12px', backgroundColor: C.ink2 }));
    else {
      var rowsG = [];
      for (var i = 0; i < items.length; i += 3) {
        var cells = items.slice(i, i + 3).map(function (x) {
          var urgent = !!REPORT_ITEMS.urgent[x.key];
          return vbox([txt(String(Math.round(Number(x.count))), { size: 'xxl', weight: 'bold', color: urgent ? C.rose300 : C.t1 }),
            txt(clip(x.label || labels[x.key] || x.key, 12), { size: 'xxs', color: C.t3, margin: 'xs', wrap: true })],
          { flex: 1, paddingAll: '10px', cornerRadius: '10px', backgroundColor: urgent ? C.roseTint : C.ink2, borderWidth: '1px', borderColor: urgent ? C.roseLine : C.line1 });
        });
        while (cells.length < 3) cells.push(vbox([], { flex: 1 }));
        rowsG.push(hbox(cells, { spacing: 'sm', margin: i ? 'sm' : 'lg' }));
      }
      body = body.concat(rowsG);
      var lists = items.filter(function (x) { return Array.isArray(x.names) && x.names.length; });
      if (lists.length) {
        var lr = lists.map(function (x) {
          var names = x.names.map(function (s) { return clip(s, 12); }).filter(Boolean), more = names.length > LIMITS.maxNames ? '　等 ' + names.length + ' 位' : '';
          return vbox([txt((x.label || labels[x.key] || x.key) + '｜' + names.length, { size: 'xxs', weight: 'bold', color: REPORT_ITEMS.urgent[x.key] ? C.rose300 : C.gold }),
            txt(names.slice(0, LIMITS.maxNames).join('、') + more, { size: 'xs', color: C.t2, wrap: true, margin: 'xs' })], { paddingTop: '8px', paddingBottom: '8px' });
        });
        body.push(slip('名單', lr, 'gold'));
      }
    }
    /* 3.6.0：匯報卡不顯示 LINE 額度（額度改看學院管理後台工作台儀表）；d.quota 傳入也忽略 */
    var mainUrl = role === 'assistant' ? track : prep;
    var total = items.reduce(function (s, x) { return s + (Number(x.count) || 0); }, 0);
    return bubble({ type: type, d: d, tag: role === 'assistant' ? '助教匯報' : '校長匯報', tagTone: 'gold', body: body, action: uri('打開', mainUrl), admit: [role === 'assistant' ? 'ASSISTANT REPORT' : 'PRINCIPAL REPORT', stampNo(day)],
      buttons: role === 'assistant'
        ? [primaryBtn('打開作業追蹤', uri('打開作業追蹤', track)), secondaryBtn('打開諮詢準備', uri('打開諮詢準備', prep))]
        : [primaryBtn('打開諮詢準備', uri('打開諮詢準備', prep)), secondaryBtn('打開作業追蹤', uri('打開作業追蹤', track))],
      altText: (role === 'assistant' ? '助教匯報' : '校長匯報') + ' ' + fmtDate(day) + '：' + (items.length ? items.slice(0, 6).map(function (x) { return (x.label || labels[x.key] || x.key) + ' ' + Math.round(Number(x.count)); }).join('・') : '目前沒有待處理事項') + (total && items.length > 6 ? '…' : '') });
  }

  /** 3.2.11 後台諮詢準備分頁連結：#/prep/{make|test|deliver}[/{學姐鍵 16 碼}] */
  function prepTabView(d, tab) { var key = /^[0-9a-f]{16}$/.test(str(d && d.key)) ? str(d.key) : ''; return adminView(d, 'prep/' + tab + (key ? '/' + key : '')); }
  /** 工具待測試（給助教）{ studentName, toolName, round?, due?, note?, link?, key?, openUrl?, openKind?（html｜zip｜url｜file） }；3.2.11 按鈕開到「測試工具」分頁（有 key 時捲到該學姐卡片）
   *   3.3.0「開啟工具」：HTML → 資料中心可操作網址、網址工具 → 原網址、ZIP → Drive 下載（另附解壓縮說明） */
  function toolTest(d) {
    d = d || {};
    var prep = str(d.link) || prepTabView(d, 'test'), dl = parseTime(d.due), now = nowOf(d);
    var rows = [kvRow('學姐', clip(d.studentName, 20) || '—'), kvRow('工具', clip(d.toolName, 40) || '專屬工具')];
    if (str(d.round)) rows.push(kvRow('版本', clip(d.round, 20)));
    if (str(d.note)) rows.push(kvRow('校長備註', txt(clip(d.note, 160), { size: 'xs', color: C.t2, wrap: true, align: 'end' })));
    var body = [rich([{ em: clip(d.studentName, 20) || '學姐', color: C.t1 }, ' 的專屬工具'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
      para(['校長已完成工具，請助教', { em: '測試並回報' }, '結果。']), slip('測試項目', rows, 'gold', 'TEST')];
    if (dl != null) body.push(deadlineBlock('測試期限', dl, remainText(dl, now), 'gold'));
    var openUrl = /^https:\/\/[^\s"'<>]+$/.test(str(d.openUrl)) && str(d.openUrl).length <= LIMITS.uri ? str(d.openUrl) : '', zip = str(d.openKind) === 'zip';
    if (openUrl && zip) body.push(vbox([txt('ZIP 工具', { size: 'xs', weight: 'bold', color: C.gold }), txt('請下載後解壓縮，開啟 index.html，並使用展示模式測試', { size: 'xs', color: C.t2, wrap: true, margin: 'sm' })], { margin: 'lg', paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.goldSoft }));
    var openLabel = zip ? '下載工具' : '開啟工具';
    return bubble({ type: 'toolTest', d: d, tag: '助教通知', tagTone: 'gold', body: body, action: uri(openUrl ? openLabel : '打開諮詢準備', openUrl || prep), admit: ['TOOL TESTING', stampNo(dl != null ? dl : now)],
      buttons: openUrl ? [primaryBtn(openLabel, uri(openLabel, openUrl)), secondaryBtn('打開諮詢準備', uri('打開諮詢準備', prep))] : [primaryBtn('打開諮詢準備', uri('打開諮詢準備', prep))],
      altText: '工具待測試：' + (clip(d.studentName, 20) || '學姐') + '《' + (clip(d.toolName, 20) || '專屬工具') + '》' + (dl != null ? '，請於 ' + relDeadline(dl, now) + ' 前完成測試' : '，請完成測試') });
  }

  /**
   * 工具已通過／等待校長修改（給校長）{ status:'passed'|'revise', studentName, toolName, version?, tester?, testedAt?, issues?:[文字], link?, key? }
   *   3.2.10 回報問題（revise）：feedback { types:[文字], text, shots?:數量 }；key（學姐鍵 16 碼）→ 按鈕開啟後台該卡片
   *   3.2.11 通過→「交付教材」分頁、等待校長修改→「製作工具」分頁（#/prep/{deliver|make}[/{key}]）
   */
  function toolResult(d) {
    d = d || {};
    var passed = d.status === 'passed', key = /^[0-9a-f]{16}$/.test(str(d.key)) ? str(d.key) : '';
    var prep = str(d.link) || prepTabView(d, passed ? 'deliver' : 'make'), at = parseTime(d.testedAt), fb = !passed && d.feedback && typeof d.feedback === 'object' ? d.feedback : null;
    var rows = [kvRow('學姐', clip(d.studentName, 20) || '—'), kvRow('工具', clip(d.toolName, 40) || '專屬工具')];
    if (str(d.version)) rows.push(kvRow('版本', clip(d.version, 20)));
    if (str(d.tester)) rows.push(kvRow('測試人', clip(d.tester, 20)));
    if (at != null) rows.push(kvRow('測試時間', fmtDateW(at) + fmtHM(at)));
    rows.push(kvRow('結果', hbox([vbox([], { flex: 1 }), pill(passed ? '已通過' : '等待校長修改', passed ? 'ok' : 'err')])));
    var body = [rich([{ em: clip(d.studentName, 20) || '學姐', color: C.t1 }, ' 的專屬工具'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
      para(passed ? ['助教已測試', { em: '通過', color: C.ok }, '，可安排交付。'] : ['助教測試回報', { em: '需要修改', color: C.rose300 }, '，等待校長修改。']),
      slip('測試結果', rows, passed ? 'gold' : 'rose')];
    var issues = (Array.isArray(d.issues) ? d.issues : []).map(str).filter(Boolean);
    if (!passed && issues.length) {
      body.push(vbox([txt('修改項目', { size: 'xs', weight: 'bold', color: C.rose300 })].concat(issues.slice(0, LIMITS.maxItems).map(function (s, i) {
        return hbox([txt(pad(i + 1), { size: 'xxs', color: C.gold, flex: 0 }), txt(clip(s, 120), { size: 'xs', color: C.t2, wrap: true, flex: 1 })], { spacing: 'md', margin: 'sm' });
      })).concat(issues.length > LIMITS.maxItems ? [txt('另有 ' + (issues.length - LIMITS.maxItems) + ' 項', { size: 'xxs', color: C.rose300, margin: 'sm' })] : []),
      { margin: 'lg', paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.roseTint }));
    }
    var fbTypes = fb ? (Array.isArray(fb.types) ? fb.types : []).map(str).filter(Boolean).slice(0, 4) : [], fbText = fb ? str(fb.text).replace(/\s+/g, ' ') : '', fbShots = fb ? Math.max(0, Math.floor(Number(fb.shots) || 0)) : 0;
    if (fb && (fbTypes.length || fbText)) {
      var fr = [];
      if (fbTypes.length) fr.push(kvRow('問題類型', txt(fbTypes.join('、'), { size: 'xs', weight: 'bold', color: C.rose300, align: 'end', wrap: true })));
      if (fbShots) fr.push(kvRow('截圖', fbShots + ' 張'));
      body.push(vbox([txt('助教回饋', { size: 'xs', weight: 'bold', color: C.rose300 })].concat(fbText ? [txt(fbText.length > 120 ? fbText.slice(0, 119) + '…' : fbText, { size: 'xs', color: C.t2, wrap: true, margin: 'sm', lineSpacing: '5px' })] : []).concat(fr.length ? [vbox(fr, { margin: 'sm' })] : []),
        { margin: 'lg', paddingAll: '12px', cornerRadius: '10px', backgroundColor: C.roseTint }));
    }
    var btnLabel = !passed && key ? '開啟後台卡片' : '打開諮詢準備';
    return bubble({ type: passed ? 'toolPassed' : 'toolRevise', d: d, tag: '校長通知', tagTone: 'gold', body: body, action: uri(btnLabel, prep), admit: [passed ? 'TOOL APPROVED' : 'REVISION', stampNo(at != null ? at : nowOf(d))],
      buttons: [primaryBtn(btnLabel, uri(btnLabel, prep))],
      altText: (passed ? '工具已通過：' : '等待校長修改：') + (clip(d.studentName, 20) || '學姐') + '《' + (clip(d.toolName, 20) || '專屬工具') + '》' + (str(d.version) ? clip(d.version, 10) : '') + (passed ? '助教測試通過' : fbTypes.length ? '助教回報：' + fbTypes.join('、') : '助教回報 ' + (issues.length || '') + (issues.length ? ' 項' : '') + '需修改') });
  }

  /**
   * 3.3.0 確認金額（給校長，mode:'ask'）／金額已確認（給助教，mode:'done'）
   *   { mode, studentName, callName?, toolName, amount, initial?（原定價）, reason?（改價原因）, key?, at?, link? }
   *   按鈕：ask＝確認金額、修改金額（皆開後台「確認金額」該學姐卡片）；done＝開啟確認下單
   */
  function orderPrice(d) {
    d = d || {};
    var done = d.mode === 'done', nm = clip(d.studentName || d.name, 20) || '學姐', cn = clip(d.callName, 10), link = str(d.link) || prepTabView(d, done ? 'order' : 'price');
    var amt = amountText(d.amount), ini = amountText(d.initial), at = parseTime(d.at), tool = clip(d.toolName, 40) || '專屬工具';
    var rows = [kvRow('學姐', nm + (cn && cn !== nm ? '（' + cn + '）' : '')), kvRow('工具', tool),
      kvRow(done ? '確認金額' : '目前定價', amt ? rich(['NT$ ', { em: amt, color: C.rose300 }], { size: 'md', color: C.t3, align: 'end', wrap: false }) : txt('未定價', { size: 'sm', weight: 'bold', color: C.warn, align: 'end' }))];
    if (done && ini && ini !== amt) rows.push(kvRow('原定價', txt('NT$ ' + ini, { size: 'xs', color: C.t3, align: 'end', decoration: 'line-through' })));
    if (done && str(d.reason)) rows.push(kvRow('改價原因', txt(clip(d.reason, 60), { size: 'xs', color: C.t2, align: 'end', wrap: true })));
    var body = [rich([{ em: nm, color: C.t1 }, ' 的專屬教材'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
      para(done ? ['校長已', { em: '確認金額', color: C.ok }, '，請至「確認下單」按「編輯下單資訊」填寫並發送。'] : [(cn || nm) + '學姐的工具已通過測試，', { em: '確認金額' }, '後助教即可發送下單通知。']),
      slip(done ? '金額已確認' : '請確認金額', rows, 'gold', 'PRICE')];
    return bubble({ type: done ? 'priceDone' : 'priceAsk', d: d, tag: done ? '助教通知' : '校長通知', tagTone: 'gold', body: body, action: uri(done ? '開啟確認下單' : '確認金額', link), admit: [done ? 'PRICE CONFIRMED' : 'PRICE CHECK', stampNo(at != null ? at : nowOf(d))],
      buttons: done ? [primaryBtn('開啟確認下單', uri('開啟確認下單', link))] : [primaryBtn('確認金額', uri('確認金額', link)), secondaryBtn('修改金額', uri('修改金額', link))],
      altText: (done ? '金額已確認：' : '請確認金額：') + nm + '《' + clip(tool, 20) + '》' + (amt ? (done ? 'NT$ ' : '目前定價 NT$ ') + amt : '尚未定價') });
  }
  /** 3.3.0 學姐回報已下單（給校長與助教）{ studentName, callName?, material, amount, claimAt, key?, link? }；按鈕開後台「等待下單」 */
  function orderClaim(d) {
    d = d || {};
    var nm = clip(d.studentName || d.name, 20) || '學姐', key = /^[0-9a-f]{16}$/.test(str(d.key)) ? str(d.key) : '', link = str(d.link) || adminView(d, 'material/wait' + (key ? '/' + key : ''));
    var at = parseTime(d.claimAt), amt = amountText(d.amount);
    var rows = [kvRow('學姐', nm), kvRow('教材', '《' + (clip(d.material, 40) || CONFIG.productDefault) + '》')];
    if (amt) rows.push(kvRow('金額', rich(['NT$ ', { em: amt, color: C.rose300 }], { size: 'md', color: C.t3, align: 'end', wrap: false })));
    rows.push(kvRow('回報時間', at != null ? fmtDateW(at) + fmtHM(at) : '—'));
    var body = [rich([{ em: nm, color: C.t1 }, ' 學姐'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
      para(['學姐回報', { em: '已下單' }, '，請同步學院下單確認訂單；確認前不會交付教材。']), slip('下單回報', rows, 'gold', 'CLAIM')];
    return bubble({ type: 'orderClaim', d: d, tag: '管理通知', tagTone: 'gold', body: body, action: uri('同步確認', link), admit: ['ORDER CLAIMED', stampNo(at != null ? at : nowOf(d))],
      buttons: [primaryBtn('同步確認', uri('同步確認', link))],
      altText: nm + ' 學姐回報已下單，請同步確認' + (amt ? '（NT$ ' + amt + '）' : '') });
  }

  /** 學姐送出／補件完成（給管理收件人）{ kind:'submit'|'supplement', name, receiptId?, at?, onTime?, deadline?, items?:[補件項目名稱] } */
  function submitted(d) {
    d = d || {};
    var supp = d.kind === 'supplement', at = parseTime(d.at), dl = parseTime(d.deadline);
    var link = /^https:\/\//.test(str(d.link)) ? str(d.link) : str(d.receiptId) ? adminView(d, 'r/' + encodeURIComponent(str(d.receiptId))) : adminView(d, 'track');   // 3.2.6 link 可覆寫（測試卡片）
    var rows = [];
    if (str(d.receiptId)) rows.push(kvRow('回執編號', clip(d.receiptId, 30)));
    rows.push(kvRow(supp ? '補件時間' : '送出時間', at != null ? fmtDateW(at) + fmtHM(at) : '—'));
    if (dl != null) rows.push(kvRow(supp ? '補件期限' : '截止時間', fmtDateW(dl) + fmtHM(dl)));
    if (d.onTime === true || d.onTime === false) rows.push(kvRow('狀態', hbox([vbox([], { flex: 1 }), pill(d.onTime ? '準時' : '逾時', d.onTime ? 'ok' : 'err')])));
    var items = (Array.isArray(d.items) ? d.items : []).map(function (x) { return str(typeof x === 'object' && x ? x.title : x); }).filter(Boolean);
    if (supp && items.length) rows.push(kvRow('補件項目', txt(items.slice(0, LIMITS.maxItems).map(function (s) { return clip(s, 16); }).join('、') + (items.length > LIMITS.maxItems ? ' 等 ' + items.length + ' 項' : ''), { size: 'xs', color: C.t2, wrap: true, align: 'end' })));
    var nm = clip(d.name, 20) || '學姐';
    var body = [rich([{ em: nm, color: C.t1 }, ' 學姐'], { size: 'xl', color: C.t2, margin: 'md', wrap: false }), leadRule(),
      para(supp ? ['已完成', { em: '補件' }, '，請確認資料。'] : ['已送出《' + NAME + '》作業。']), slip(supp ? '補件回報' : '送出回報', rows, 'gold')];
    return bubble({ type: supp ? 'supplementDone' : 'submitted', d: d, tag: '管理通知', tagTone: 'gold', body: body, action: uri('打開作業追蹤', link), admit: [supp ? 'RESUBMISSION' : 'SUBMISSION', stampNo(at)],
      buttons: [primaryBtn('打開作業追蹤', uri('打開作業追蹤', link))],
      altText: (supp ? '補件完成：' : '送出通知：') + nm + ' 學姐' + (supp ? '已完成補件' + (items.length ? ' ' + items.length + ' 項' : '') : '已送出作業') + (at != null ? '（' + fmtDate(at) + ' ' + fmtHM(at) + (d.onTime === false ? '・逾時' : d.onTime === true ? '・準時' : '') + '）' : '') });
  }

  /** 3.2.7 補充結果（學姐；後台「補充請求」處理後 push）{ callName, ok:true（已新增）|false（不需要）, path, item, text（回覆文字）, at?, link? } */
  function suppResult(d) {
    d = d || {};
    var u = urls(d), ok = d.ok === true, link = /^https:\/\//.test(str(d.link)) ? str(d.link) : u.front, at = parseTime(d.at);
    var path = clip(d.path, 60), item = clip(d.item, 40), t = str(d.text).replace(/\r\n?/g, '\n');
    var rows = [];
    if (path) rows.push(kvRow('位置', txt(path, { size: 'xs', weight: 'bold', color: C.t1, align: 'end', wrap: true })));
    if (item) rows.push(kvRow('項目', item));
    rows.push(kvRow('結果', hbox([vbox([], { flex: 1 }), pill(ok ? '已新增' : '這次不新增', ok ? 'ok' : 'gold')])));
    var body = [whoLine(callOf(d), d.suffix), leadRule(),
      para(ok ? ['已幫學姐加入，', { em: '重新整理就看得到♡' }] : ['謝謝學姐的補充，', { em: '官方看過了♡' }])];
    if (t) body.push(txt(t.length > 300 ? t.slice(0, 299) + '…' : t, { size: 'xs', color: C.t3, wrap: true, margin: 'md', lineSpacing: '5px' }));
    body.push(slip('補充結果', rows, 'gold'));
    var label = ok ? '前往作業' : '查看作業';
    return bubble({ type: 'suppResult', d: d, body: body, action: uri(label, link), admit: [ok ? 'ADDED' : 'NOTED', stampNo(at != null ? at : nowOf(d))],
      buttons: [primaryBtn(label, uri(label, link))],
      altText: who(d) + '：' + (ok ? '已在〔' + path + '〕加入「' + item + '」' : '關於〔' + path + '〕的補充，官方已回覆') });
  }


  /**
   * 3.2.12 內部提醒（給校長／助教；天使助教）{ kind:'tool'|'work'|'issue'|'deliver', mode:'digest'|'due', slot?:'HH:MM', items:[{ name, extra?, note? }], key?, test?, now? }
   *   彙整＝固定時段合併清單；due＝時限後再提醒。按鈕：tool→#/prep/test、work→#/track、issue→#/prep/make[/key]、deliver→#/material/ready（3.3.1 學姐已下單待交付）
   */
  var AR_KIND = {
    tool: { type: 'adminRemindTool', unit: '份', btn: '開啟工具測試', tab: 'prep/test', who: '助教通知', lead: ['以下工具', { em: '尚未測試' }, '，請實際操作後回報結果。'] },
    work: { type: 'adminRemindWork', unit: '份', btn: '開啟作業追蹤', tab: 'track', who: '校長通知', lead: ['以下作業', { em: '尚未查看' }, '，請確認內容。'] },
    issue: { type: 'adminRemindIssue', unit: '件', btn: '查看回報內容', tab: 'prep/make', who: '校長通知', lead: ['助教回報的問題', { em: '仍在等待修改', color: C.rose300 }, '。'] },
    deliver: { type: 'adminRemindDeliver', unit: '份', btn: '前往交付教材', tab: 'material/ready', who: '校長通知', lead: ['以下學姐已下單，教材', { em: '尚未交付' }, '。'] }
  };
  function adminRemind(d) {
    d = d || {};
    var K = AR_KIND[d.kind] || AR_KIND.tool, T = TYPES[K.type], now = nowOf(d);
    var items = (Array.isArray(d.items) ? d.items : []).filter(function (x) { return x && str(x.name); });
    var n = items.length, digest = d.mode !== 'due', slot = /^\d{2}:\d{2}$/.test(str(d.slot)) ? str(d.slot) : '';
    var tag = digest ? (slot ? slot + ' 彙整' : '彙整') : '再提醒';
    var key = /^[0-9a-f]{16}$/.test(str(d.key)) ? str(d.key) : '';
    var link = str(d.link) || adminView(d, K.tab + (key && K.tab.indexOf('prep/') === 0 ? '/' + key : ''));
    var row = function (a, b, warn) { return hbox([txt(a, { size: 'sm', weight: 'bold', color: C.t1, flex: 5, wrap: true }), txt(b || '—', { size: 'xs', color: warn ? C.rose300 : C.t3, align: 'end', flex: 3, gravity: 'center', wrap: true })], { paddingTop: '9px', paddingBottom: '9px', spacing: 'md' }); };
    var shown = items.slice(0, LIMITS.maxItems), rows = shown.map(function (x) { return row(clip(x.name, 14) + (str(x.extra) ? '・' + clip(x.extra, 16) : ''), clip(x.note, 14), /逾時|未讀/.test(str(x.note))); });
    if (n > shown.length) rows.push(row('其他 ' + (n - shown.length) + ' ' + K.unit, ''));
    if (!rows.length) rows.push(row('目前沒有項目', ''));
    var body = [rich([{ em: T.title + ' ' + n + ' ' + K.unit, color: C.t1 }], { size: 'xl', color: C.t2, margin: 'md', wrap: true }), leadRule(),
      para(K.lead), slip(digest ? '清單' : '逾時項目', rows, d.kind === 'issue' ? 'rose' : 'gold', tag)];
    if (d.test) body.push(txt('此為測試卡片', { size: 'xxs', color: C.t3, margin: 'md' }));
    return bubble({ type: K.type, d: d, tag: K.who, tagTone: 'gold', body: body, action: uri(K.btn, link), admit: [digest ? 'DIGEST ' + (slot || '') : 'REMINDER', stampNo(now)],
      buttons: [primaryBtn(K.btn, uri(K.btn, link))],
      altText: (d.test ? '【測試】' : '') + T.title + ' ' + n + ' ' + K.unit + '（' + tag + '）' + (n ? '：' + items.slice(0, 5).map(function (x) { return clip(x.name, 12); }).join('、') + (n > 5 ? '…' : '') : '') });
  }

  /* ------------------------------------------------------------------ */
  /* 發送組合、驗證                                                       */
  /* ------------------------------------------------------------------ */
  var BUILDERS = { assignment: assignment, remind: remind, supplement: supplement, thanks: thanks, autoRemind: autoRemind, overdue: overdue,
    materialOrder: materialOrder, materialDeliver: materialDeliver, report: report, toolTest: toolTest, toolResult: toolResult, submitted: submitted, suppResult: suppResult, suppReject: suppReject, orderPrice: orderPrice, orderClaim: orderClaim, adminRemind: adminRemind };
  /** build('assignment', data) → Flex Message；未知類型丟出錯誤 */
  function build(type, data) {
    var f = BUILDERS[type];
    if (!f) throw new Error('未知的卡片類型：' + type);
    return f(data || {});
  }
  /**
   * 一次 push 的 messages 陣列：[卡片] 或 [卡片, 補充說明文字]（同一次 push，計 1 則）
   * note 為校長填寫的「補充說明」；空白時不附文字。
   */
  function messages(card, note) {
    var out = [card], t = String(note == null ? '' : note).replace(/\r\n?/g, '\n').trim();
    if (t) out.push({ type: 'text', text: t.slice(0, LIMITS.text) });
    return out;
  }

  function utf8Bytes(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; } else n += 3;
    }
    return n;
  }

  /* Flex 支援的屬性白名單（https://developers.line.biz/en/reference/messaging-api/#flex-message） */
  var OFFS = ['position', 'offsetTop', 'offsetBottom', 'offsetStart', 'offsetEnd'];
  var WL = {
    bubble: ['type', 'size', 'direction', 'header', 'hero', 'body', 'footer', 'styles', 'action'],
    box: ['type', 'layout', 'contents', 'backgroundColor', 'borderColor', 'borderWidth', 'cornerRadius', 'width', 'maxWidth', 'height', 'maxHeight', 'flex', 'spacing', 'margin',
      'paddingAll', 'paddingTop', 'paddingBottom', 'paddingStart', 'paddingEnd', 'action', 'justifyContent', 'alignItems', 'background'].concat(OFFS),
    text: ['type', 'text', 'contents', 'adjustMode', 'flex', 'margin', 'size', 'scaling', 'align', 'gravity', 'wrap', 'lineSpacing', 'maxLines', 'weight', 'color', 'action', 'style', 'decoration'].concat(OFFS),
    span: ['type', 'text', 'size', 'color', 'weight', 'style', 'decoration'],
    image: ['type', 'url', 'flex', 'margin', 'align', 'gravity', 'size', 'aspectRatio', 'aspectMode', 'backgroundColor', 'action', 'animated'].concat(OFFS),
    button: ['type', 'action', 'flex', 'margin', 'height', 'style', 'color', 'gravity', 'adjustMode', 'scaling'].concat(OFFS),
    separator: ['type', 'margin', 'color'],
    icon: ['type', 'url', 'margin', 'size', 'aspectRatio', 'scaling'].concat(OFFS),
    video: ['type', 'url', 'previewUrl', 'altContent', 'aspectRatio', 'action'],
    blockStyle: ['backgroundColor', 'separator', 'separatorColor'],
    background: ['type', 'angle', 'startColor', 'endColor', 'centerColor', 'centerPosition'],
    uri: ['type', 'label', 'uri', 'altUri'], message: ['type', 'label', 'text'], postback: ['type', 'label', 'data', 'displayText', 'inputOption', 'fillInText']
  };
  var KW_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
  var TEXT_SIZES = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'];
  var IMG_SIZES = TEXT_SIZES.concat(['full']);
  var COLOR_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, PX_RE = /^\d+(?:\.\d+)?px$/, PCT_RE = /^\d+(?:\.\d+)?%$/;
  var COLOR_KEYS = { backgroundColor: 1, borderColor: 1, color: 1, separatorColor: 1, startColor: 1, endColor: 1, centerColor: 1 };

  /**
   * 驗證 Flex Message（或 messages 陣列）→ { ok, errors:[], bytes:[每則 contents 位元組] }
   * 檢查：最多 5 則、altText 1–400、bubble < 30KB、屬性白名單、列舉值、顏色、uri、按鈕文字、text 非空、圖片 https
   */
  function validate(input) {
    var list = Array.isArray(input) ? input : [input], errors = [], bytes = [];
    function err(p, m) { errors.push(p + '：' + m); }
    if (list.length < 1 || list.length > 5) err('messages', '一次 push 須為 1–5 則');
    function space(p, k, v) { if (KW_SPACE.indexOf(v) < 0 && !PX_RE.test(v)) err(p, k + ' 值不支援：' + v); }
    function size(p, k, v) { if (!PX_RE.test(v) && !PCT_RE.test(v)) err(p, k + ' 須為 px 或 %：' + v); }
    function keys(p, o, wl) { Object.keys(o).forEach(function (k) { if (wl.indexOf(k) < 0) err(p, '不支援的屬性 ' + k); }); }
    function colors(p, o) { Object.keys(o).forEach(function (k) { if (COLOR_KEYS[k] && !COLOR_RE.test(String(o[k]))) err(p, k + ' 顏色格式錯誤：' + o[k]); }); }
    function action(p, a) {
      if (!a || typeof a !== 'object') { err(p, 'action 格式錯誤'); return; }
      var wl = WL[a.type]; if (!wl) { err(p, '不支援的 action 類型 ' + a.type); return; }
      keys(p, a, wl);
      if (a.label != null && (String(a.label).length < 1 || String(a.label).length > LIMITS.label)) err(p, 'action label 須 1–' + LIMITS.label + ' 字');
      if (a.type === 'uri') { var u = String(a.uri || ''); if (!/^(https?:|line:|tel:)/.test(u)) err(p, 'uri 須為 http(s)／line／tel'); if (u.length > LIMITS.uri) err(p, 'uri 超過 ' + LIMITS.uri + ' 字'); }
      if (a.type === 'message' && (!a.text || String(a.text).length > 300)) err(p, 'message 文字須 1–300 字');
    }
    function comp(p, c, inBox) {
      if (!c || typeof c !== 'object') { err(p, '元件格式錯誤'); return; }
      var wl = WL[c.type]; if (!wl || c.type === 'bubble') { err(p, '不支援的元件 ' + c.type); return; }
      keys(p, c, wl); colors(p, c);
      ['margin', 'spacing', 'paddingAll', 'paddingTop', 'paddingBottom', 'paddingStart', 'paddingEnd'].forEach(function (k) { if (c[k] != null) space(p, k, String(c[k])); });
      ['width', 'maxWidth', 'height', 'maxHeight'].forEach(function (k) { if (c[k] != null && c.type === 'box') size(p, k, String(c[k])); });
      ['offsetTop', 'offsetBottom', 'offsetStart', 'offsetEnd'].forEach(function (k) { if (c[k] != null && !PX_RE.test(String(c[k])) && !PCT_RE.test(String(c[k])) && KW_SPACE.indexOf(String(c[k])) < 0) err(p, k + ' 值不支援'); });
      if (c.cornerRadius != null && KW_SPACE.indexOf(String(c.cornerRadius)) < 0 && !PX_RE.test(String(c.cornerRadius))) err(p, 'cornerRadius 值不支援');
      if (c.borderWidth != null && ['none', 'light', 'normal', 'medium', 'semi-bold', 'bold'].indexOf(String(c.borderWidth)) < 0 && !PX_RE.test(String(c.borderWidth))) err(p, 'borderWidth 值不支援');
      if (c.flex != null && !(typeof c.flex === 'number' && c.flex >= 0 && Math.floor(c.flex) === c.flex)) err(p, 'flex 須為 0 以上整數');
      if (c.action) action(p, c.action);
      if (c.type === 'box') {
        if (['horizontal', 'vertical', 'baseline'].indexOf(c.layout) < 0) err(p, 'layout 錯誤');
        if (!Array.isArray(c.contents)) err(p, 'contents 須為陣列');
        else c.contents.forEach(function (x, i) { comp(p + '.' + i, x, true); });
        if (c.justifyContent != null && ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].indexOf(c.justifyContent) < 0) err(p, 'justifyContent 錯誤');
        if (c.alignItems != null && ['flex-start', 'center', 'flex-end'].indexOf(c.alignItems) < 0) err(p, 'alignItems 錯誤');
        if (c.background) { keys(p + '.background', c.background, WL.background); colors(p + '.background', c.background); if (c.background.type !== 'linearGradient' || !/^-?\d+(?:\.\d+)?deg$/.test(String(c.background.angle))) err(p, 'background 須為 linearGradient＋角度'); }
      } else if (c.type === 'text') {
        var hasSpans = Array.isArray(c.contents) && c.contents.length;
        if (!hasSpans && !(typeof c.text === 'string' && c.text.length)) err(p, 'text 不得為空');
        if (hasSpans) c.contents.forEach(function (s, i) { if (!s || s.type !== 'span') { err(p + '.' + i, '只能放 span'); return; } keys(p + '.' + i, s, WL.span); colors(p + '.' + i, s); if (!s.text) err(p + '.' + i, 'span 文字不得為空'); if (s.size != null && TEXT_SIZES.indexOf(s.size) < 0 && !PX_RE.test(s.size)) err(p + '.' + i, 'span size 錯誤'); });
        if (c.size != null && TEXT_SIZES.indexOf(c.size) < 0 && !PX_RE.test(c.size)) err(p, 'text size 錯誤：' + c.size);
        if (c.weight != null && ['regular', 'bold'].indexOf(c.weight) < 0) err(p, 'weight 錯誤');
        if (c.align != null && ['start', 'end', 'center'].indexOf(c.align) < 0) err(p, 'align 錯誤');
        if (c.gravity != null && ['top', 'bottom', 'center'].indexOf(c.gravity) < 0) err(p, 'gravity 錯誤');
        if (c.lineSpacing != null && !PX_RE.test(c.lineSpacing)) err(p, 'lineSpacing 須為 px');
      } else if (c.type === 'image') {
        if (!/^https:\/\//.test(String(c.url || '')) || String(c.url).length > 2000) err(p, '圖片須為 https 且 ≤ 2000 字');
        if (c.size != null && IMG_SIZES.indexOf(c.size) < 0 && !PX_RE.test(c.size) && !PCT_RE.test(c.size)) err(p, 'image size 錯誤');
        if (c.aspectRatio != null) { var m = /^(\d+):(\d+)$/.exec(String(c.aspectRatio)); if (!m || +m[2] > 3 * +m[1]) err(p, 'aspectRatio 錯誤'); }
        if (c.aspectMode != null && ['cover', 'fit'].indexOf(c.aspectMode) < 0) err(p, 'aspectMode 錯誤');
      } else if (c.type === 'button') {
        if (!c.action) err(p, 'button 須有 action');
        if (c.style != null && ['primary', 'secondary', 'link'].indexOf(c.style) < 0) err(p, 'button style 錯誤');
        if (c.height != null && ['sm', 'md'].indexOf(c.height) < 0) err(p, 'button height 錯誤');
      }
      if (!inBox) err(p, '元件須放在 box 內');
    }
    list.forEach(function (m, mi) {
      var p = 'messages[' + mi + ']';
      if (!m || typeof m !== 'object') { err(p, '格式錯誤'); return; }
      if (m.type === 'text') { if (!m.text || String(m.text).length > LIMITS.text) err(p, '文字須 1–' + LIMITS.text + ' 字'); return; }
      if (m.type !== 'flex') { err(p, '不支援的訊息類型 ' + m.type); return; }
      keys(p, m, ['type', 'altText', 'contents', 'quickReply', 'sender']);
      var alt = String(m.altText || '');
      if (!alt.trim() || alt.length > LIMITS.altText) err(p, 'altText 須 1–' + LIMITS.altText + ' 字');
      var b = m.contents;
      if (!b || b.type !== 'bubble') { err(p, 'contents 須為 bubble'); return; }
      var n = utf8Bytes(JSON.stringify(b)); bytes.push(n);
      if (n >= LIMITS.bubbleBytes) err(p, 'bubble JSON ' + n + ' bytes ≥ 30KB');
      keys(p + '.bubble', b, WL.bubble);
      if (b.size != null && ['nano', 'micro', 'deca', 'hecto', 'kilo', 'mega', 'giga'].indexOf(b.size) < 0) err(p, 'bubble size 錯誤');
      if (b.action) action(p + '.bubble', b.action);
      ['header', 'hero', 'body', 'footer'].forEach(function (k) {
        if (!b[k]) return;
        if (k === 'hero' && b[k].type === 'image') { var h = b[k]; keys(p + '.hero', h, WL.image); colors(p + '.hero', h); if (!/^https:\/\//.test(String(h.url || ''))) err(p + '.hero', '圖片須為 https'); if (h.action) action(p + '.hero', h.action); return; }
        if (b[k].type !== 'box') { err(p + '.' + k, '須為 box'); return; }
        comp(p + '.' + k, b[k], true);
      });
      if (b.styles) Object.keys(b.styles).forEach(function (k) {
        if (['header', 'hero', 'body', 'footer'].indexOf(k) < 0) err(p + '.styles', '不支援的區塊 ' + k);
        else { keys(p + '.styles.' + k, b.styles[k], WL.blockStyle); colors(p + '.styles.' + k, b.styles[k]); }
      });
    });
    return { ok: !errors.length, errors: errors, bytes: bytes };
  }

  /** 需上傳到 GitHub Pages（assets/flex/）的頂圖檔名 */
  function heroFiles() { var s = {}; Object.keys(TYPES).forEach(function (k) { s[TYPES[k].hero] = 1; }); return Object.keys(s); }

  return {
    VERSION: VERSION, NAME: NAME, CONFIG: CONFIG, LIMITS: LIMITS, COLORS: C, TYPES: TYPES, REPORT_ITEMS: REPORT_ITEMS, UNZIP: UNZIP,
    assignment: assignment, remind: remind, supplement: supplement, thanks: thanks, autoRemind: autoRemind, overdue: overdue,
    materialOrder: materialOrder, materialDeliver: materialDeliver, report: report, toolTest: toolTest, toolResult: toolResult, submitted: submitted, suppResult: suppResult, suppReject: suppReject, orderPrice: orderPrice, orderClaim: orderClaim, adminRemind: adminRemind,
    build: build, messages: messages, validate: validate, heroFiles: heroFiles,
    formatDeadline: formatDeadline, parseTime: parseTime, relDeadline: relDeadline, supplementUrl: function (d) { return supplementUrl(d || {}, urls(d || {})); }, utf8Bytes: utf8Bytes
  };
});
