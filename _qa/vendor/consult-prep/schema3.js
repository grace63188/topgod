/*
 * G.R.A.C.E Academy《諮詢前置作業》3.0 工作組成架構（函式層）
 * 依賴：src/schema.js（CONSULT_SCHEMA，共用工具、2.x 相容）與 src/model3.js（CONSULT_MODEL3，行業與資料清單）。
 * 載入順序：schema.js → model3.js → schema3.js；兩個依賴皆於呼叫時才讀取（Apps Script 檔案載入順序不固定）。
 *
 * 輸出：window.CONSULT_SCHEMA3／module.exports／Apps Script 全域 CONSULT_SCHEMA3；同時掛為 CONSULT_SCHEMA.V3。
 *
 * 3.0 答案形狀（answers）：
 *   { schema:3, student:{account,name},
 *     mainWork:{ name, industry, industryOther, weeklyHours, otherWorks:[{ name, weeklyHours }] },
 *     income:{ sources:[收入來源 id…], other:'', main:'收入最多的一項 id' },
 *     quiz:{ clients, team, superior, superiorType, superiorOther, brand, performance, performanceType },   // yes／no；追問為 id
 *     profile:{ brand, company, title, business, serviceMode:[], scale, headcount },
 *     modules:[…]（normalize 時由 quiz 推導，不由學姐填），
 *     flows:{ [flowKey]:{ mode:'full'|'quick', source, target?, selfDecide?, needApproval?, systems?, systemsOther?, stages:[…], note } },
 *     dataChecklist:{ [itemId]:'yes'|'no'|'' },
 *     drive:{ mode:'oauth'|'link'|'', rootFolderId, rootUrl, folders:{ [itemId]:folderId }, ownerEmail, linkUrl },
 *     dialog:{ faq:[5], privacyAck }, timeSavers:{ tasks:[] } }
 *   flowKey：'income.<收入來源 id>'｜'teamFlow'｜'collabFlow'｜'performFlow'
 *   舊版（2.x 身分制）答案：normalizeAnswers 保留原區塊並加 legacyRole（後台與 PDF 以 2.x 流程顯示）。
 */
(function (root, factory) {
  var s3 = factory(root);
  root.CONSULT_SCHEMA3 = s3;
  if (root.CONSULT_SCHEMA) root.CONSULT_SCHEMA.V3 = s3;
  if (typeof module === 'object' && module && module.exports) module.exports = s3;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function S() {
    var s = root.CONSULT_SCHEMA || (typeof require === 'function' ? require('./schema.js') : null);
    if (!s) throw new Error('schema3 需要 CONSULT_SCHEMA');
    return s;
  }
  function M() {
    var m = root.CONSULT_MODEL3 || (typeof require === 'function' ? require('./model3.js') : null);
    if (!m) throw new Error('schema3 需要 CONSULT_MODEL3');
    return m;
  }

  var VERSION = '3.0.0';   // 3.0 工作組成架構；3.1 作業結構見 VERSION31（同檔，isV31 分流）

  /* ------------------------------------------------------------------ */
  /* 常數                                                                */
  /* ------------------------------------------------------------------ */
  var FLOW_LIMITS = { maxPages: 3, maxStages: 30, maxStageNameLength: 40, maxNoteLength: 500 };
  var FLOW_MODES = [{ id: 'full', label: '完整版' }, { id: 'quick', label: '快速版' }];
  var QUIZ_FIELDS = ['clients', 'team', 'superior', 'brand', 'performance'];
  var QUIZ_MODULE = { clients: 'serve', team: 'lead', superior: 'report', brand: 'brand', performance: 'perform' };
  var MODULE_QUIZ = { serve: 'clients', lead: 'team', report: 'superior', brand: 'brand', perform: 'performance' };
  /** 帶領團隊、配合上級兩組只帶最重要的 2 項；其餘由補件需求要求 */
  var MODULE_ITEM_CAP = { lead: ['roles', 'shifts'], report: ['policy', 'workSop'] };
  var INDUSTRY_NO_PERFORM_FLOW = ['media', 'perform'];   // 行業本身承接訓練與表現（不另列訓練與表現流程頁）
  var MAX_OTHER_WORKS = 5;
  var MAX_INCOME_OTHER = 20;

  /** 雲端資料夾（學姐本人的 Google 雲端硬碟；drive.file 範圍） */
  var DRIVE = {
    scope: 'https://www.googleapis.com/auth/drive.file',
    shareEmail: 'grace63188@gmail.com',
    rootSuffix: '_諮詢資料',
    dialogDir: '對話紀錄',
    statusCacheSec: 60,
    shortcutMime: 'application/vnd.google-apps.shortcut',
    folderMime: 'application/vnd.google-apps.folder',
    modes: [{ id: 'oauth', label: '以 Google 帳號建立分類資料夾' }, { id: 'link', label: '貼上自己共用的資料夾連結' }],
    idRe: /^[\w-]{10,128}$/
  };

  /** 補件需求（後台建立、前台逐項完成） */
  var SUPPLEMENT = {
    maxItems: 10,
    maxTitleLength: 60,
    maxNoteLength: 80,
    maxTextLength: 1000,
    maxRequestsPerReceipt: 20,
    types: [{ id: 'section', label: '補填區塊' }, { id: 'data', label: '補資料' }, { id: 'custom', label: '其他資料' }],
    statuses: { open: '未開始', partial: '部分完成', done: '已完成' },
    itemStatuses: { open: '未完成', done: '已完成' },
    contentKinds: ['drive', 'link', 'text', 'section'],   // 雲端捷徑或已放入資料夾、連結、文字、區塊已補填
    vars: ['稱呼', '項目清單', '補件連結', '補件期限', '雲端資料夾'],
    defaultNotice: [
      '📋《一對一諮詢｜補件需求》',
      '',
      '親愛的{稱呼}學姐好♡',
      '',
      '校長閱讀學姐的《諮詢前置作業》後，希望再補充以下內容，讓諮詢更貼近實際狀況：',
      '',
      '{項目清單}',
      '',
      '➥ 補件入口',
      '{補件連結}',
      '',
      '✦ 補件期限：{補件期限}',
      '',
      '學姐的雲端資料夾：{雲端資料夾}',
      '',
      '進入後以學員帳號查詢，頂部會出現「補件需求」卡，逐項完成後按「送出補件」即可，不需重填整份作業。'
    ].join('\n')
  };

  /** 索引狀態追加（2.x STATUSES：未讀、已讀、需補件） */
  var STATUS_SUPPLEMENT = { open: '待補件', done: '已補件' };

  /** 3.0 固定區塊（流程頁為動態 flow1…flow3） */
  var SECTIONS3 = [
    { id: 'student', label: '學員資料', icon: 'idcard', kind: 'fields' },
    { id: 'mainWork', label: '本業選擇', icon: 'briefcase', kind: 'fields', desc: '以花最多時間的工作為主；其他工作只列名稱與時數' },
    { id: 'quiz', label: '本業問答', icon: 'help', kind: 'quiz', desc: '5 題是非題，依答案自動組成作業' },
    { id: 'profile', label: '基本輪廓', icon: 'storefront', kind: 'fields', desc: '本業的品牌、公司與營運樣貌' },
    { id: 'dataShare', label: '資料提供', icon: 'folder', kind: 'dataShare', desc: '勾選手上有的資料，在本人的 Google 雲端硬碟建立分類資料夾，再把檔案放進對應分類' },
    { id: 'flow', label: '流程', icon: 'route', kind: 'flow', dynamic: true },
    { id: 'dialog', label: '對話紀錄', icon: 'message', kind: 'dialog', desc: '兩類對話截圖放入雲端「對話紀錄」資料夾；常見提問 5 題於頁面填寫' },
    { id: 'timeSavers', label: '最想省下的時間', icon: 'clock', kind: 'fields', desc: '日常最耗時、最希望交出去的工作' },
    { id: 'review', label: '送出檢查', icon: 'check', kind: 'review' }
  ];

  var MAIN_WORK_FIELDS = [
    { id: 'name', label: '工作名稱', type: 'text', placeholder: '例：美甲接案、門市店長、保險業務', required: true, maxLength: 40 },
    { id: 'industry', label: '行業類別', type: 'select', options: 'industries', required: true, notice: '選定後帶入該行業的流程範本與資料清單舉例' },
    { id: 'industryOther', label: '其他行業', type: 'text', maxLength: 20, showIf: { field: 'mainWork.industry', equals: 'other' } },
    { id: 'weeklyHours', label: '每週投入時數', type: 'number', unit: '小時', placeholder: '例：40', required: true, min: 1, max: 168 },
    { id: 'otherWorks', label: '其他工作', type: 'table', max: MAX_OTHER_WORKS, columns: [{ id: 'name', label: '名稱', maxLength: 40 }, { id: 'weeklyHours', label: '每週時數', type: 'number', unit: '小時' }], placeholder: '只列名稱與時數，不展開區塊' }
  ];
  var INCOME_FIELDS = [
    { id: 'sources', label: '本業的收入來源', type: 'multiselect', options: 'incomeSourcesFor(industry)', required: true, min: 1, otherField: 'other', hint: '可複選；依行業列出 3–7 個選項' },
    { id: 'other', label: '其他收入來源', type: 'text', maxLength: MAX_INCOME_OTHER },
    { id: 'main', label: '收入最多的一項', type: 'radio', options: 'income.sources', required: true, autoWhenSingle: true, notice: '收入最多的一項帶入完整版流程；其他收入來源帶入快速版流程' }
  ];

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */
  function cleanStr(v, max) { var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim(); return max ? s.slice(0, max) : s; }
  function listOf(v) { return S().listOf(v); }
  function getPath(o, p) { return S().getPath(o, p); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function yesNo(v) { return v === 'yes' || v === 'no' ? v : ''; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  /* ------------------------------------------------------------------ */
  /* 行業、收入來源、模組                                                 */
  /* ------------------------------------------------------------------ */
  function industryList() {
    return M().industries.map(function (i) { return { id: i.id, label: i.label, covers: i.covers || '', tools: i.tools || [], pain: i.pain || '' }; });
  }
  function industryById(id) { return byId(M().industries, id); }
  function industryLabel(answers) {
    if (isV31(answers)) return industry31Label(answers);
    var id = getPath(answers, 'mainWork.industry'), ind = industryById(id);
    if (!ind) return '';
    var other = cleanStr(getPath(answers, 'mainWork.industryOther'), 20);
    return ind.id === 'other' && other ? '其他：' + other : ind.label;
  }
  /** 行業的收入來源選項：[{ id, label, desc, kind, quizHint }] */
  function incomeSourcesFor(industryId) {
    var ind = industryById(industryId);
    if (!ind) return [];
    return ind.incomes.map(function (x) { return { id: x.id, label: x.label, desc: x.desc || '', kind: x.kind || 'serve', quizHint: x.quizHint || null, employ: x.kind === 'employ', perform: x.kind === 'perform' }; });
  }
  function incomeById(industryId, incomeId) {
    var ind = industryById(industryId);
    return ind ? byId(ind.incomes, incomeId) : null;
  }
  function selectedIncomes(answers) {
    var ind = industryById(getPath(answers, 'mainWork.industry'));
    if (!ind) return [];
    var src = Array.isArray(getPath(answers, 'income.sources')) ? getPath(answers, 'income.sources') : [];
    return ind.incomes.filter(function (x) { return src.indexOf(x.id) >= 0; });   // 依選項順序
  }
  function mainIncome(answers) {
    var list = selectedIncomes(answers), main = getPath(answers, 'income.main');
    for (var i = 0; i < list.length; i++) if (list[i].id === main) return list[i];
    return null;
  }
  function moduleById(id) { return byId(M().modules, id); }
  function superiorById(id) { return byId(M().superiors, id); }
  function performTypeById(id) { return byId(M().performTypes, id); }

  /**
   * 依收入來源與行業預設本業問答：{ clients, team, superior, superiorType, performance, performanceType, brand, hinted:{欄位:true} }
   * 收入來源 quizHint（例：加盟店經營＝配合上級「品牌總部」）與行業 impliedModules（自媒體＝經營品牌、個人表現〔創作〕）。
   */
  function quizPrefill(industryId, incomeIds) {
    var ind = industryById(industryId);
    var out = { clients: '', team: '', superior: '', superiorType: '', performance: '', performanceType: '', brand: '', hinted: {} };
    if (!ind) return out;
    var set = function (f, v) { if (v && out[f] !== 'yes') { out[f] = v; out.hinted[f] = true; } };
    (ind.impliedModules || []).forEach(function (m) {
      var f = MODULE_QUIZ[m];
      if (f) { set(f, 'yes'); if (m === 'perform' && ind.id === 'media') set('performanceType', 'create'); if (m === 'perform' && ind.id === 'perform') { /* 類型由學姐選 */ } }
    });
    var list = ind.incomes.filter(function (x) { return (incomeIds || []).indexOf(x.id) >= 0; });
    var anyServe = false, anyEmploy = false;
    list.forEach(function (x) {
      if (x.kind !== 'employ') anyServe = true; else anyEmploy = true;
      var h = x.quizHint || {};
      Object.keys(h).forEach(function (k) {
        if (k === 'superior') { set('superiorType', h[k]); return; }
        var f = MODULE_QUIZ[k];
        if (!f) return;
        if (h[k] === 'yes') set(f, 'yes');
        else if (h[k] === 'no' && !out[f]) set(f, 'no');
      });
      if (x.kind === 'perform') set('performance', 'yes');
    });
    if (anyServe && !out.clients) set('clients', 'yes');
    if (out.superior === 'yes' && !out.superiorType && anyEmploy) set('superiorType', 'boss');
    return out;
  }

  /** 模組推導：本業問答答「是」的題目對應模組（依 MODULES 順序） */
  function deriveModules(answers) {
    var q = (answers && answers.quiz) || {};
    return M().modules.filter(function (m) { return q[MODULE_QUIZ[m.id]] === 'yes'; }).map(function (m) { return m.id; });
  }
  function hasModule(answers, id) { return deriveModules(answers).indexOf(id) >= 0; }

  /** 上級稱呼：{ id, label, term（稱呼）, orgTerm（組織） }；無上級時為主管／公司 */
  function superiorTerm(answers) {
    var q = (answers && answers.quiz) || {};
    var sp = q.superior === 'yes' ? superiorById(q.superiorType) : null;
    if (!sp) return { id: '', label: '', term: '主管', orgTerm: '公司' };
    var other = cleanStr(q.superiorOther, 10);
    return { id: sp.id, label: sp.id === 'other' && other ? other : sp.label, term: sp.id === 'other' && other ? other : sp.term, orgTerm: sp.id === 'other' && other ? other : sp.orgTerm };
  }
  function termReplace(text, answers) {
    var t = superiorTerm(answers);
    return String(text == null ? '' : text).replace(/\{組織\}/g, t.orgTerm).replace(/\{上級\}/g, t.term);
  }

  /* ------------------------------------------------------------------ */
  /* 資料清單                                                            */
  /* ------------------------------------------------------------------ */
  function itemDef(id, answers) {
    var m = M();
    var c = byId(m.checklist, id);
    if (c) {
      var ind = industryById(getPath(answers, 'mainWork.industry'));
      var label = c.label;
      if (c.industryLabel && ind && ind.checklistLabels && ind.checklistLabels[c.id]) label = ind.checklistLabels[c.id];
      if (c.performLabel) { var pt = getPath(answers, 'quiz.performanceType'); if (c.performLabel[pt]) label = c.performLabel[pt]; }
      return { id: c.id, label: label, baseLabel: c.label, def: termReplace(c.def, answers), example: c.example || '', module: c.module, primary: !!c.primary, kind: 'common' };
    }
    var it = m.incomeItems[id];
    if (it) return { id: id, label: it.label, baseLabel: it.label, def: it.def || '', example: it.example || '', module: '', primary: false, kind: 'income' };
    return null;
  }

  /**
   * 資料清單（依行業×收入來源×模組組成；同 id 只出現一次）：
   *   主要收入來源全部項目 → 有快速版流程的收入來源前 3 項（未展開者不帶）→ 模組共用項目（行業替換名稱；hideServe／hidePerform 隱藏；
   *   帶領團隊、配合上級各只帶 2 項；行業 dedupe：收入來源項目成立時隱藏對應共用項目）。
   * 回傳 { items:[{ id, label, def, example, group, groupLabel, module, incomeId, primary, order }], groups:[{ id, label, items }] }
   */
  function checklistFor(answers) {
    if (isV31(answers)) {
      var items31 = resourceDataItems(answers).map(function (it, i) { return { id: it.id, label: it.label, def: it.def, example: it.example, group: it.groupId, groupLabel: it.groupLabel, module: '', incomeId: '', primary: false, order: i + 1, custom: it.custom }; });
      var groups31 = [];
      items31.forEach(function (it) { var g = byId(groups31, it.group); if (!g) { g = { id: it.group, label: it.groupLabel, items: [] }; groups31.push(g); } g.items.push(it); });
      return { items: items31, groups: groups31 };
    }
    var m = M();
    var ind = industryById(getPath(answers, 'mainWork.industry'));
    var mods = deriveModules(answers);
    var plan = planFlows(answers);
    var items = [], seen = {}, groups = [];
    var group = function (id, label) { var g = byId(groups, id); if (!g) { g = { id: id, label: label, items: [] }; groups.push(g); } return g; };
    var push = function (id, gid, glabel, extra) {
      if (seen[id]) return;
      var d = itemDef(id, answers);
      if (!d) return;
      seen[id] = 1;
      var g = group(gid, glabel);
      var it = { id: d.id, label: d.label, def: d.def, example: d.example, group: g.id, groupLabel: g.label, module: d.module, incomeId: (extra && extra.incomeId) || '', primary: d.primary, order: items.length + 1 };
      items.push(it); g.items.push(it);
    };
    var main = mainIncome(answers);
    if (ind && main) main.items.forEach(function (id) { push(id, 'main', '主要收入：' + main.label, { incomeId: main.id }); });
    var quickIncomeIds = plan.pages.filter(function (p) { return p.mode === 'quick' && p.incomeId; }).map(function (p) { return p.incomeId; });
    if (ind) quickIncomeIds.forEach(function (iid) {
      var inc = byId(ind.incomes, iid);
      if (inc) inc.items.slice(0, 3).forEach(function (id) { push(id, 'other', '其他收入', { incomeId: iid }); });
    });
    var dedupeHide = {};
    if (ind && ind.dedupe) Object.keys(ind.dedupe).forEach(function (k) { if (seen[k]) dedupeHide[ind.dedupe[k]] = 1; });
    var hide = {};
    ((ind && ind.hideServe) || []).forEach(function (id) { hide[id] = 1; });
    ((ind && ind.hidePerform) || []).forEach(function (id) { hide[id] = 1; });
    var groupOf = { serve: ['serve', '客人與服務'], brand: ['brand', '品牌'], lead: ['lead', '團隊'], report: ['report', '上級規範'], perform: ['perform', '個人表現'] };
    m.modules.forEach(function (mod) {
      if (mods.indexOf(mod.id) < 0) return;
      var ids = m.checklist.filter(function (c) { return c.module === mod.id; }).map(function (c) { return c.id; });
      if (MODULE_ITEM_CAP[mod.id]) ids = ids.filter(function (id) { return MODULE_ITEM_CAP[mod.id].indexOf(id) >= 0; });
      ids = ids.filter(function (id) { return !hide[id] && !dedupeHide[id]; });
      ids.forEach(function (id) { push(id, groupOf[mod.id][0], groupOf[mod.id][1]); });
    });
    return { items: items, groups: groups };
  }
  function checklistItem(answers, id) { var it = checklistFor(answers).items.filter(function (x) { return x.id === id; })[0]; return it || itemDef(id, answers); }

  /** 對話紀錄兩類（未勾服務客人時為任務交辦／問題回報） */
  function dialogItems(answers) {
    var serve = hasModule(answers, 'serve');
    return M().dialogItems.map(function (d) { return { id: d.id, label: serve ? d.label : d.altLabel, def: d.def, example: d.example }; });
  }

  /* ------------------------------------------------------------------ */
  /* 雲端資料夾規劃                                                      */
  /* ------------------------------------------------------------------ */
  function rootFolderName(name) { return S().archiveSafe(name) + DRIVE.rootSuffix; }
  function folderSafe(label) { return S().archiveSafe(label, 40).replace(/\s+/g, ''); }
  /**
   * 子資料夾規劃：序號依整份清單順序（勾「沒有」者保留號碼、不建立），名稱「<兩位序號>_<項目名稱>」；
   * 另固定「對話紀錄」與其下「完成預約」「詢問後未回覆」。
   * 回傳 [{ itemId, name, label, parent:''|'dialog', create:boolean, status }]
   */
  function folderPlan(answers) {
    if (isV31(answers)) return folderPlan31(answers);
    var cl = checklistFor(answers).items;
    var dc = (answers && answers.dataChecklist) || {};
    var out = cl.map(function (it, i) {
      var st = yesNo(dc[it.id]);
      return { itemId: it.id, name: pad2(i + 1) + '_' + folderSafe(it.label), label: it.label, parent: '', create: st === 'yes', status: st };
    });
    out.push({ itemId: 'dialog', name: DRIVE.dialogDir, label: DRIVE.dialogDir, parent: '', create: true, status: 'yes' });
    dialogItems(answers).forEach(function (d) { out.push({ itemId: d.id, name: folderSafe(d.label), label: d.label, parent: 'dialog', create: true, status: 'yes' }); });
    return out;
  }
  /** 尚未建立的子資料夾（勾「有」或對話紀錄而 drive.folders 無 id 者）：前台授權時補建 */
  function missingFolders(answers) {
    var f = (answers && answers.drive && answers.drive.folders) || {};
    return folderPlan(answers).filter(function (p) { return p.create && !f[p.itemId]; });
  }
  /** 雲端連結或資料夾 ID → ID（drive.google.com/drive/folders/<id>、/file/d/<id>、?id=、單獨 id） */
  function driveIdFromUrl(url) {
    var s = cleanStr(url, 2000);
    if (!s) return '';
    if (DRIVE.idRe.test(s) && s.indexOf('/') < 0 && s.indexOf('.') < 0) return s;
    var m = /\/(?:folders|d)\/([\w-]{10,128})/.exec(s) || /[?&]id=([\w-]{10,128})/.exec(s);
    return m ? m[1] : '';
  }

  /* ------------------------------------------------------------------ */
  /* 流程頁規劃                                                          */
  /* ------------------------------------------------------------------ */
  function stageOf(id, label, desc) { return { id: id, label: label, icon: 'dot', desc: desc || '', hint: desc || '' }; }
  function legacyStages(flowId) {
    var sec = S().sectionById(flowId);
    return sec && sec.stages ? sec.stages : [];
  }
  /** 收入來源流程範本步驟（id p01…） */
  function incomeStages(inc) {
    return (inc.flow || []).map(function (name, i) { return stageOf('p' + pad2(i + 1), name, ''); });
  }
  function teamStages(answers) {
    var t = M().flowTemplates.teamFlow, rep = superiorTerm(answers).id === 'upline' ? t.termReplace.upline : null;
    var base = legacyStages('teamFlow');
    return t.stages.map(function (name, i) {
      var b = base[i] || { id: 'team' + pad2(i + 1), desc: '' };
      var label = rep && rep[name] ? rep[name] : name;
      var desc = rep ? String(b.desc || '').replace(/員工/g, rep['員工'] || '員工') : (b.desc || '');
      return stageOf(b.id, label, desc);
    });
  }
  function collabStages(answers) {
    var t = M().flowTemplates.collabFlow, base = legacyStages('collabFlow'), sp = superiorTerm(answers);
    var out = t.stages.map(function (name, i) { var b = base[i] || { id: 'collab' + pad2(i + 1), desc: '' }; return stageOf(b.id, name, termReplace(String(b.desc || '').replace(/主管/g, '{上級}'), answers)); });
    ((t.superiorExtra && t.superiorExtra[sp.id]) || []).forEach(function (name, i) { out.push(stageOf('x' + pad2(i + 1), name, '')); });
    return out;
  }
  function performStages(answers) {
    var t = M().flowTemplates.performFlow, pt = getPath(answers, 'quiz.performanceType');
    var names = t.stages[pt] || t.stages.create;
    return names.map(function (name, i) { return stageOf('f' + pad2(i + 1), name, ''); });
  }
  var COLLAB_HEAD_FIELDS = function () {
    return M().flowTemplates.collabFlow.headFields.map(function (f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = f[k]; }); return o; });
  };
  var FLOW_HEAD_TARGET = { id: 'target', label: '服務對象', type: 'radio', options: [{ id: 'external', label: '外部客人' }, { id: 'internal', label: '內部需求方（主管、其他部門）' }, { id: 'both', label: '兩者皆有' }], required: false };

  /**
   * 流程範本：{ key, label, icon, source:'income:<id>'|'module:<id>', incomeId, moduleId, stages:[{id,label,desc}], headFields:[], headGroupLabel, withCollab, withPerform }
   */
  function flowTemplateFor(answers, key) {
    var k = String(key || '');
    if (k.indexOf('income.') === 0) {
      var inc = incomeById(getPath(answers, 'mainWork.industry'), k.slice(7));
      if (!inc) return null;
      var isMain = getPath(answers, 'income.main') === inc.id;
      var t = { key: k, label: inc.label, icon: 'route', source: 'income:' + inc.id, incomeId: inc.id, moduleId: '', kind: inc.kind || 'serve', desc: inc.desc || '', stages: incomeStages(inc), headFields: [FLOW_HEAD_TARGET], headGroupLabel: '', withCollab: false, withPerform: false };
      if (isMain && inc.kind === 'employ') { t.withCollab = true; t.headFields = [FLOW_HEAD_TARGET].concat(COLLAB_HEAD_FIELDS()); t.headGroupLabel = M().flowTemplates.collabFlow.headGroupLabel; }
      if (isMain && inc.kind === 'perform') t.withPerform = true;
      return t;
    }
    if (k === 'teamFlow') return { key: k, label: '團隊流程', icon: 'team', source: 'module:lead', incomeId: '', moduleId: 'lead', kind: 'module', desc: '從招募到薪資計算的實際做法', stages: teamStages(answers), headFields: [], headGroupLabel: '', withCollab: false, withPerform: false };
    if (k === 'collabFlow') return { key: k, label: '協作流程', icon: 'handshake', source: 'module:report', incomeId: '', moduleId: 'report', kind: 'module', desc: '從接收任務到考核的實際做法', stages: collabStages(answers), headFields: COLLAB_HEAD_FIELDS(), headGroupLabel: M().flowTemplates.collabFlow.headGroupLabel, withCollab: false, withPerform: false };
    if (k === 'performFlow') return { key: k, label: '訓練與表現流程', icon: 'trophy', source: 'module:perform', incomeId: '', moduleId: 'perform', kind: 'module', desc: '訓練、演出或創作到檢討的實際做法', stages: performStages(answers), headFields: [], headGroupLabel: '', withCollab: false, withPerform: false };
    return null;
  }

  /**
   * 流程頁規劃（≤ 3 頁）：第 1 頁＝主要收入來源完整版；第 2、3 頁快速版候選依序：
   *   ① 第二項收入來源（依選項順序）② 團隊流程（帶領團隊）③ 協作流程（配合上級；主要收入為受僱類時不另列）
   *   ④ 訓練與表現流程（個人表現；行業為自媒體、運動與表演時不另列）⑤ 其餘收入來源（依選項順序）
   * 回傳 { pages:[{ ...template, mode, page }], overflow:[{ key, label, source }] }
   */
  function planFlows(answers) {
    var list = selectedIncomes(answers), main = mainIncome(answers);
    var mods = deriveModules(answers), industry = getPath(answers, 'mainWork.industry');
    var keys = [];
    if (main) keys.push('income.' + main.id);
    var others = list.filter(function (x) { return !main || x.id !== main.id; }).map(function (x) { return 'income.' + x.id; });
    if (others.length) keys.push(others[0]);
    if (mods.indexOf('lead') >= 0) keys.push('teamFlow');
    if (mods.indexOf('report') >= 0 && !(main && main.kind === 'employ')) keys.push('collabFlow');
    if (mods.indexOf('perform') >= 0 && INDUSTRY_NO_PERFORM_FLOW.indexOf(industry) < 0 && !(main && main.kind === 'perform')) keys.push('performFlow');
    others.slice(1).forEach(function (k) { keys.push(k); });
    var pages = [], overflow = [];
    keys.forEach(function (k, i) {
      var t = flowTemplateFor(answers, k);
      if (!t) return;
      // 第 1 頁完整版、其餘快速版；補件改完整版後（flows[key].mode 為 full）維持完整版
      if (pages.length < FLOW_LIMITS.maxPages) { t.mode = i === 0 || (storedFlow(answers, k) || {}).mode === 'full' ? 'full' : 'quick'; t.page = pages.length + 1; t.sectionId = 'flow' + t.page; pages.push(t); }
      else overflow.push({ key: t.key, label: t.label, source: t.source });
    });
    return { pages: pages, overflow: overflow };
  }
  /** 已填的流程答案（flows 或 flowsExtra）；無則 null */
  function storedFlow(answers, key) {
    var f = answers && answers.flows && answers.flows[key];
    if (!f && answers && answers.flowsExtra) f = answers.flowsExtra[key];
    return f && typeof f === 'object' ? f : null;
  }
  /** 流程是否已有內容：完整版或任一步驟已點選狀態 */
  function flowFilled(f) {
    return !!f && (f.mode === 'full' || (Array.isArray(f.stages) && f.stages.some(function (st) { return st && (st.status === 'doing' || st.status === 'none' || st.status === 'na'); })));
  }
  /**
   * 流程頁全集（正規化、驗證、後台與 PDF 用）：planFlows 的 ≤ 3 頁，加上「未展開流程」中已由補件補填者（接在後面，page 4…、supplement:true）；
   * overflow 只剩尚未補填者。前台導覽仍用 planFlows（學姐只填 3 頁）。
   */
  function flowPagesAll(answers) {
    var plan = planFlows(answers), pages = plan.pages.slice(), overflow = [];
    plan.overflow.forEach(function (o) {
      var f = storedFlow(answers, o.key);
      if (!flowFilled(f)) { overflow.push(o); return; }
      var t = flowTemplateFor(answers, o.key);
      if (!t) { overflow.push(o); return; }
      t.mode = f.mode === 'full' ? 'full' : 'quick'; t.page = pages.length + 1; t.sectionId = 'flow' + t.page; t.supplement = true;
      pages.push(t);
    });
    return { pages: pages, overflow: overflow };
  }

  /* ---- 流程答案 ---- */
  function blankStage3(t) {
    return { id: t.id, template: true, templateName: t.label, name: t.label, status: '', handling: '', steps: [], tools: [], toolsOther: '' };
  }
  function defaultStages3(template) { return (template.stages || []).map(blankStage3); }
  function emptyFlow3(template) {
    var f = { mode: template.mode || 'quick', source: template.source, note: '' };
    (template.headFields || []).forEach(function (h) { f[h.id] = h.type === 'multiselect' || h.type === 'list' ? [] : ''; });
    f.stages = defaultStages3(template);
    return f;
  }
  /**
   * 流程正規化（與 2.x normalizeFlow 同規則，範本改由 planFlows 提供）：有序陣列、補齊模板步驟、去重、模板名稱還原、
   * status 非 doing 清除 handling；快速版只保留 status 與 handling（steps、tools 清空）。
   */
  function normalizeFlow3(template, flow) {
    var Sx = S();
    var src = flow && typeof flow === 'object' ? flow : {};
    var out = { mode: template.mode || (src.mode === 'full' ? 'full' : 'quick'), source: template.source, note: cleanStr(src.note, FLOW_LIMITS.maxNoteLength) };
    (template.headFields || []).forEach(function (h) {
      var v = src[h.id];
      if (h.type === 'multiselect' || h.type === 'list') out[h.id] = listOf(v).slice(0, 20);
      else out[h.id] = v == null ? '' : cleanStr(v, 200);
      if (h.otherField) out[h.otherField] = cleanStr(src[h.otherField], 100);
    });
    var tpl = {}; (template.stages || []).forEach(function (t) { tpl[t.id] = t; });
    var quick = out.mode === 'quick';
    var raw = src.stages, list = [];
    if (Array.isArray(raw)) {
      list = raw.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
        var id = cleanStr(x.id), t = tpl[id];
        var tl = Sx.stageTools(x);
        var st = { id: id, template: !!t, templateName: t ? t.label : '', name: cleanStr(x.name), status: x.status == null ? '' : x.status, handling: x.handling == null ? '' : x.handling,
          steps: quick ? [] : listOf(x.steps), tools: quick ? [] : tl.tools, toolsOther: quick ? '' : tl.toolsOther };
        if (t && !st.name) st.name = t.label;
        if (st.status !== 'doing') st.handling = '';
        return st;
      });
    }
    var seen = {};
    list = list.filter(function (st) { if (seen['k' + st.id]) return false; seen['k' + st.id] = 1; return true; });
    (template.stages || []).forEach(function (t, ti) {
      if (seen['k' + t.id]) return;
      var pos = 0;
      for (var j = ti - 1; j >= 0; j--) {
        var prevId = template.stages[j].id, at = -1;
        for (var k = 0; k < list.length; k++) if (list[k].id === prevId) { at = k; break; }
        if (at >= 0) { pos = at + 1; break; }
      }
      list.splice(pos, 0, blankStage3(t));
      seen['k' + t.id] = 1;
    });
    out.stages = list;
    return out;
  }
  function flowSummary3(stages) {
    var sum = { total: stages.length, template: 0, custom: 0, status: { doing: 0, none: 0, na: 0, unanswered: 0 }, handling: { manual: 0, partial: 0, auto: 0, unset: 0 } };
    stages.forEach(function (st) {
      if (st.template) sum.template++; else sum.custom++;
      if (st.status === 'doing' || st.status === 'none' || st.status === 'na') sum.status[st.status]++; else sum.status.unanswered++;
      if (st.status === 'doing') { if (st.handling === 'manual' || st.handling === 'partial' || st.handling === 'auto') sum.handling[st.handling]++; else sum.handling.unset++; }
    });
    return sum;
  }
  /** 流程驗證（answers 應先經 normalizeAnswers）：步驟數、id 格式與不重複、名稱長度、值域 */
  function checkFlows3(answers) {
    var Sx = S(), plan = flowPagesAll(answers);
    var okStatus = ['', 'doing', 'none', 'na'], okHandling = ['', 'manual', 'partial', 'auto'];
    for (var i = 0; i < plan.pages.length; i++) {
      var t = plan.pages[i], flow = answers.flows && answers.flows[t.key];
      if (flow == null) continue;
      var stages = flow.stages, path = 'flows.' + t.key;
      if (!Array.isArray(stages)) return issue3('FLOW_STAGE', t.label + '：步驗格式不正確'.replace('驗','驟'), path + '.stages');
      if (stages.length > FLOW_LIMITS.maxStages) return issue3('FLOW_STAGE', t.label + '：步驟超過上限 ' + FLOW_LIMITS.maxStages + ' 步', path + '.stages');
      var seen = {};
      for (var j = 0; j < stages.length; j++) {
        var st = stages[j], p = path + '.stages.' + j;
        if (!st || typeof st !== 'object') return issue3('FLOW_STAGE', t.label + '：第 ' + (j + 1) + ' 步格式不正確', p);
        if (typeof st.id !== 'string' || !Sx.STAGE_ID_RE.test(st.id)) return issue3('FLOW_STAGE', t.label + '：第 ' + (j + 1) + ' 步識別碼格式不正確', p);
        if (seen['k' + st.id]) return issue3('FLOW_STAGE', t.label + '：步驟識別碼重複', p);
        seen['k' + st.id] = 1;
        if (String(st.name == null ? '' : st.name).length > FLOW_LIMITS.maxStageNameLength) return issue3('FLOW_STAGE', t.label + '：步驟名稱超過 ' + FLOW_LIMITS.maxStageNameLength + ' 字', p + '.name');
        if (okStatus.indexOf(st.status == null ? '' : st.status) < 0) return issue3('FLOW_STAGE', t.label + '：' + (st.name || st.templateName) + ' 狀態值不正確', p + '.status');
        if (okHandling.indexOf(st.handling == null ? '' : st.handling) < 0) return issue3('FLOW_STAGE', t.label + '：' + (st.name || st.templateName) + ' 處理方式值不正確', p + '.handling');
      }
    }
    return null;
  }
  function issue3(code, message, path) {
    var Sx = S();
    var out = { code: code, errorCode: (Sx.ISSUE_CODES[code] || {}).errorCode || 'ERR_VALIDATION', message: message };
    if (path) out.path = path;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 答案：骨架、相容、正規化、驗證                                         */
  /* ------------------------------------------------------------------ */
  function emptyAnswers3() {
    return {
      schema: 3,
      student: { account: '', name: '' },
      mainWork: { name: '', industry: '', industryOther: '', weeklyHours: '', otherWorks: [] },
      income: { sources: [], other: '', main: '' },
      quiz: { clients: '', team: '', superior: '', superiorType: '', superiorOther: '', brand: '', performance: '', performanceType: '' },
      profile: { brand: '', company: '', title: '', business: '', serviceMode: [], scale: '', headcount: '' },
      modules: [],
      flows: {},
      dataChecklist: {},
      drive: { mode: '', rootFolderId: '', rootUrl: '', folders: {}, ownerEmail: '', linkUrl: '' },
      dialog: { faq: ['', '', '', '', ''], privacyAck: false },
      timeSavers: { tasks: [] }
    };
  }
  /** 舊版（2.x 身分制）判定：有 role.id 且無 mainWork */
  function isLegacy(answers) {
    if (!answers || typeof answers !== 'object') return false;
    if (answers.schema === 3 || answers.schema === 31 || answers.mainWork || answers.business) return false;
    return !!(answers.role && answers.role.id) || !!answers.uploads;
  }
  /** 舊身分 → 模組（legacyRoleMap；經銷合作有下線時含帶領團隊） */
  function legacyModules(answers) {
    var map = M().legacyRoleMap[getPath(answers, 'role.id')];
    if (!map) return { modules: [], superior: '' };
    var mods = map.modules.slice();
    if (map.leadIf === 'role.hasDownline=yes' && getPath(answers, 'role.hasDownline') === 'yes') mods.push('lead');
    return { modules: M().modules.map(function (m) { return m.id; }).filter(function (id) { return mods.indexOf(id) >= 0; }), superior: map.superior || '' };
  }
  /** 舊 11 類答案 → 清單有無（類別「有」→ 對應項目「有」、「無」→「沒有」） */
  function legacyChecklist(answers) {
    var map = M().legacyCategoryToChecklist, up = (answers && answers.uploads) || {}, out = {};
    Object.keys(map).forEach(function (cat) {
      var st = up[cat] && up[cat].status;
      if (st !== 'yes' && st !== 'no') return;
      map[cat].forEach(function (id) { if (!out[id] || st === 'yes') out[id] = st; });
    });
    return out;
  }

  /**
   * 答案正規化（資料中心、mock 與前台送出前共用）：回傳新物件。
   * 舊版答案：S.normalizeAnswers 後加 legacyRole、legacyModules（區塊原樣保留）。
   * 3.0：字串去空白與長度、收入來源只留合法 id、主要收入須在已選內、問答值域、modules 推導、flows 依規劃正規化（規劃外的流程保留於 flowsExtra）、
   *      dataChecklist 只留現行清單項目、drive 形狀、對話與最想省下的時間。
   */
  function normalizeAnswers3(answers) {
    var Sx = S();
    if (isV31(answers)) return normalizeAnswers31(answers);
    if (isLegacy(answers)) {
      var la = Sx.normalizeAnswers(answers);
      la.schema = 2;
      la.legacyRole = Sx.roleById(getPath(la, 'role.id')) ? getPath(la, 'role.id') : '';
      var lm = legacyModules(la);
      la.modules = lm.modules;
      return la;
    }
    var a0 = answers && typeof answers === 'object' ? JSON.parse(JSON.stringify(answers)) : {};
    var a = emptyAnswers3();
    a.student = { account: cleanStr(getPath(a0, 'student.account'), 120), name: cleanStr(getPath(a0, 'student.name'), 60) };
    var mw = a0.mainWork || {};
    var ind = industryById(mw.industry);
    a.mainWork = { name: cleanStr(mw.name, 40), industry: ind ? ind.id : '', industryOther: ind && ind.id === 'other' ? cleanStr(mw.industryOther, 20) : '', weeklyHours: numOrEmpty(mw.weeklyHours),
      otherWorks: (Array.isArray(mw.otherWorks) ? mw.otherWorks : []).filter(function (w) { return w && cleanStr(w.name); }).slice(0, MAX_OTHER_WORKS).map(function (w) { return { name: cleanStr(w.name, 40), weeklyHours: numOrEmpty(w.weeklyHours) }; }) };
    var inc0 = a0.income || {};
    var validIds = ind ? ind.incomes.map(function (x) { return x.id; }) : [];
    var srcIn = Array.isArray(inc0.sources) ? inc0.sources.map(String) : [];
    a.income.sources = validIds.filter(function (id) { return srcIn.indexOf(id) >= 0; });
    a.income.other = cleanStr(inc0.other, MAX_INCOME_OTHER);
    a.income.main = a.income.sources.indexOf(inc0.main) >= 0 ? inc0.main : (a.income.sources.length === 1 ? a.income.sources[0] : '');
    var q0 = a0.quiz || {};
    QUIZ_FIELDS.forEach(function (f) { a.quiz[f] = yesNo(q0[f]); });
    a.quiz.superiorType = a.quiz.superior === 'yes' && superiorById(q0.superiorType) ? q0.superiorType : '';
    a.quiz.superiorOther = a.quiz.superiorType === 'other' ? cleanStr(q0.superiorOther, 10) : '';
    a.quiz.performanceType = a.quiz.performance === 'yes' && performTypeById(q0.performanceType) ? q0.performanceType : '';
    var p0 = a0.profile || {};
    a.profile = { brand: cleanStr(p0.brand, 60), company: cleanStr(p0.company, 60), title: cleanStr(p0.title, 40), business: cleanStr(p0.business, 500),
      serviceMode: listOf(p0.serviceMode).filter(function (x) { return Sx.OPTIONS.serviceMode.indexOf(x) >= 0; }), scale: ['含助理', '團隊'].indexOf(p0.scale) >= 0 ? p0.scale : '', headcount: numOrEmpty(p0.headcount) };
    a.modules = deriveModules(a);
    var f0 = a0.flows && typeof a0.flows === 'object' ? a0.flows : {};
    var fx0 = a0.flowsExtra && typeof a0.flowsExtra === 'object' ? a0.flowsExtra : {};
    Object.keys(fx0).forEach(function (k) { if (!f0[k] && fx0[k] && typeof fx0[k] === 'object') f0[k] = fx0[k]; });
    var plan = flowPagesAll(Object.assign({}, a, { flows: f0 }));   // 規劃依已正規化的本業與問答；已填流程（含補件補填的未展開流程）決定模式與頁數
    a.flows = {};
    plan.pages.forEach(function (t) { a.flows[t.key] = normalizeFlow3(t, f0[t.key]); });
    var extra = {};
    Object.keys(f0).forEach(function (k) { if (!a.flows[k] && f0[k] && typeof f0[k] === 'object') extra[k] = f0[k]; });
    if (Object.keys(extra).length) a.flowsExtra = extra;
    var cl = checklistFor(a).items, dc0 = a0.dataChecklist && typeof a0.dataChecklist === 'object' ? a0.dataChecklist : {};
    a.dataChecklist = {};
    cl.forEach(function (it) { a.dataChecklist[it.id] = yesNo(dc0[it.id]); });
    var d0 = a0.drive && typeof a0.drive === 'object' ? a0.drive : {};
    a.drive = { mode: d0.mode === 'oauth' || d0.mode === 'link' ? d0.mode : '', rootFolderId: DRIVE.idRe.test(String(d0.rootFolderId || '')) ? String(d0.rootFolderId) : '', rootUrl: cleanStr(d0.rootUrl, 300), folders: {}, ownerEmail: cleanStr(d0.ownerEmail, 120).toLowerCase(), linkUrl: '' };
    var fo = d0.folders && typeof d0.folders === 'object' ? d0.folders : {};
    Object.keys(fo).forEach(function (k) { if (/^[A-Za-z0-9_]{1,40}$/.test(k) && DRIVE.idRe.test(String(fo[k] || ''))) a.drive.folders[k] = String(fo[k]); });
    if (a.drive.mode === 'link') a.drive.linkUrl = Sx.normalizeLink(d0.linkUrl);
    if (a.drive.mode === 'oauth' && a.drive.rootFolderId && !a.drive.rootUrl) a.drive.rootUrl = 'https://drive.google.com/drive/folders/' + a.drive.rootFolderId;
    var dg0 = a0.dialog || {}, faq = Array.isArray(dg0.faq) ? dg0.faq : [];
    a.dialog = { faq: [0, 1, 2, 3, 4].map(function (i) { return cleanStr(faq[i], 120); }), privacyAck: !!dg0.privacyAck };
    a.timeSavers = { tasks: listOf(getPath(a0, 'timeSavers.tasks')).slice(0, 20).map(function (x) { return x.slice(0, 120); }) };
    return a;
  }
  function numOrEmpty(v) { if (v === '' || v == null) return ''; var n = Number(v); return isFinite(n) && n >= 0 ? n : ''; }

  /** 必填檢查（3.0）：回傳 [{ path, label }]；舊版答案轉交 S.validate */
  function validate3(answers) {
    var Sx = S();
    if (isV31(answers)) return validate31(answers);
    if (isLegacy(answers)) return Sx.validate(answers);
    var errs = [];
    var need = function (path, label, ok) { if (!ok) errs.push({ path: path, label: label }); };
    var a = answers || {};
    need('student.account', '學員帳號', !!cleanStr(getPath(a, 'student.account')));
    need('student.name', '本名', !!cleanStr(getPath(a, 'student.name')));
    need('mainWork.name', '工作名稱', !!cleanStr(getPath(a, 'mainWork.name')));
    var ind = industryById(getPath(a, 'mainWork.industry'));
    need('mainWork.industry', '行業類別', !!ind);
    if (ind && ind.id === 'other') need('mainWork.industryOther', '其他行業', !!cleanStr(getPath(a, 'mainWork.industryOther')));
    var wh = Number(getPath(a, 'mainWork.weeklyHours'));
    need('mainWork.weeklyHours', '每週投入時數', getPath(a, 'mainWork.weeklyHours') !== '' && isFinite(wh) && wh > 0 && wh <= 168);
    var src = Array.isArray(getPath(a, 'income.sources')) ? getPath(a, 'income.sources') : [];
    need('income.sources', '本業的收入來源', src.length > 0);
    need('income.main', '收入最多的一項', !!mainIncome(a));
    var q = a.quiz || {};
    var qLabels = { clients: '本業問答第 1 題', team: '本業問答第 2 題', superior: '本業問答第 3 題', brand: '本業問答第 4 題', performance: '本業問答第 5 題' };
    QUIZ_FIELDS.forEach(function (f) { need('quiz.' + f, qLabels[f], yesNo(q[f]) !== ''); });
    if (q.superior === 'yes') {
      need('quiz.superiorType', '上級對象', !!superiorById(q.superiorType));
      if (q.superiorType === 'other') need('quiz.superiorOther', '上級稱呼', !!cleanStr(q.superiorOther));
    }
    if (q.performance === 'yes') need('quiz.performanceType', '表現類型', !!performTypeById(q.performanceType));
    var dr = a.drive || {};
    if (dr.mode === 'link') need('drive.linkUrl', '資料夾連結', !Sx.linkIssue(dr.linkUrl));
    return errs;
  }

  /** 送出前整體檢查（3.0）：必填、流程、附件（3.0 不經網站收檔，files 須為空）；舊版轉交 S.checkSubmission */
  function checkSubmission3(answers, files, driveStatus) {
    var Sx = S();
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return issue3('REQUIRED', '作業內容格式錯誤');
    if (isV31(answers)) return checkSubmission31(answers, files, driveStatus);
    if (isLegacy(answers)) return Sx.checkSubmission(answers, files);
    var errs = validate3(answers);
    if (errs.length) { var r = issue3('REQUIRED', '必填未完成：' + errs.map(function (x) { return x.label; }).join('、')); r.fields = errs; return r; }
    var fl = checkFlows3(answers);
    if (fl) return fl;
    if (Array.isArray(files) && files.length) return issue3('FILE_KEY', '3.0 作業不經網站上傳檔案，檔案請放入雲端分類資料夾');
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 缺口（後台用）、資料完成度                                             */
  /* ------------------------------------------------------------------ */
  /**
   * driveStatus：{ folders:{ [itemId]:{ count, shortcuts, files, updated } }, checkedAt }（drive_status 回傳；可省略）
   * 回傳 { notYet:[清單選「沒有」], emptyFolders:[勾「有」但資料夾仍為空或尚未建立], unanswered:[未勾選], placed:[已放入],
   *        noneStages, manualStages, naStages, unansweredStages, incompleteStages, flows:{ key:summary }, overflow:[未展開流程], gapCount }
   * gapCount＝流程「沒做」步驟數＋尚未放入分類數；尚未具備另計、不計入缺口。
   */
  function computeGaps3(answers, driveStatus) {
    var a = answers || {};
    if (isV31(a)) return computeGaps31(a, driveStatus);
    if (isLegacy(a)) {
      var lg = S().computeGaps(a, []);
      lg.legacy = true; lg.gapCount = S().gapCountOf(lg); lg.notYet = (lg.uploadsMissing || []).slice(); lg.emptyFolders = []; lg.unanswered = []; lg.placed = []; lg.overflow = [];
      return lg;
    }
    var cl = checklistFor(a).items, dc = a.dataChecklist || {}, fo = (driveStatus && driveStatus.folders) || {}, have = (a.drive && a.drive.folders) || {};
    var g = { notYet: [], emptyFolders: [], unanswered: [], placed: [], noneStages: [], manualStages: [], naStages: [], unansweredStages: [], incompleteStages: [], flows: {}, overflow: [], legacy: false };
    cl.forEach(function (it) {
      var st = yesNo(dc[it.id]);
      var row = { id: it.id, label: it.label, group: it.groupLabel, def: it.def };
      if (st === 'no') g.notYet.push(row);
      else if (st === 'yes') {
        var f = fo[it.id], n = f ? (Number(f.count) || 0) : 0;
        row.count = n; row.folderId = have[it.id] || '';
        if (n > 0) g.placed.push(row); else g.emptyFolders.push(row);
      } else g.unanswered.push(row);
    });
    var plan = flowPagesAll(a);
    plan.pages.forEach(function (t) {
      var flow = normalizeFlow3(t, a.flows && a.flows[t.key]);
      g.flows[t.key] = flowSummary3(flow.stages);
      g.flows[t.key].mode = flow.mode; g.flows[t.key].label = t.label;
      flow.stages.forEach(function (st, i) {
        var item = { flowId: t.key, flow: t.label, mode: flow.mode, stageId: st.id, stage: st.name || st.templateName, order: i + 1, template: !!st.template };
        if (st.status === 'none') g.noneStages.push(item);
        else if (st.status === 'na') g.naStages.push(item);
        else if (st.status === 'doing') { if (st.handling === 'manual') g.manualStages.push(item); else if (!st.handling) g.incompleteStages.push(item); }
        else g.unansweredStages.push(item);
      });
    });
    g.overflow = plan.overflow.slice();
    g.gapCount = g.noneStages.length + g.emptyFolders.length;
    return g;
  }
  function gapCount3(answers, driveStatus) { return computeGaps3(answers, driveStatus).gapCount; }
  /** 資料完成度：{ yes, placed, no, unanswered, total, text:'已放入／勾有' } */
  function dataCompleteness(answers, driveStatus) {
    if (isV31(answers)) return dataCompleteness31(answers, driveStatus);
    var g = computeGaps3(answers, driveStatus);
    if (g.legacy) { var up = (answers && answers.uploads) || {}, y = 0; Object.keys(up).forEach(function (k) { if (up[k] && up[k].status === 'yes') y++; }); return { yes: y, placed: y, no: g.notYet.length, unanswered: 0, total: y + g.notYet.length, text: y + '／' + y, legacy: true }; }
    var yes = g.placed.length + g.emptyFolders.length;
    return { yes: yes, placed: g.placed.length, no: g.notYet.length, unanswered: g.unanswered.length, total: yes + g.notYet.length + g.unanswered.length, text: g.placed.length + '／' + yes };
  }

  /* ------------------------------------------------------------------ */
  /* 顯示：作業資料 JSON（後台、PDF 共用）                                   */
  /* ------------------------------------------------------------------ */
  function profileFieldsFor(answers) {
    var mods = deriveModules(answers), sp = superiorTerm(answers);
    return M().profileFields.filter(function (f) {
      if (!f.modules || f.modules.indexOf('*') >= 0) return true;
      return f.modules.some(function (m) { return mods.indexOf(m) >= 0; });
    }).map(function (f) {
      var o = {}; Object.keys(f).forEach(function (k) { o[k] = f[k]; });
      if (f.id === 'company' && f.termLabel && f.termLabel[sp.id]) o.label = f.termLabel[sp.id];
      if (f.id === 'headcount') o.showIf = { field: 'profile.scale', equals: '團隊' };
      return o;
    }).filter(function (f) { return !(f.id === 'headcount' && getPath(answers, 'profile.scale') !== '團隊'); });
  }
  /** 本業摘要（索引、票券、後台列表共用） */
  function workSummary(answers) {
    var a = answers || {};
    if (isV31(a)) return workSummary31(a);
    if (isLegacy(a)) {
      var Sx = S(), role = Sx.roleById(getPath(a, 'role.id')) || { label: '' }, lm = legacyModules(a);
      return { legacy: true, name: Sx.brandText(a) || role.label, roleLabel: role.label, industryId: '', industryLabel: Sx.industryText(a), mainIncome: null, incomes: [], modules: lm.modules.map(function (id) { return { id: id, label: (moduleById(id) || {}).label }; }), superior: lm.superior ? { id: lm.superior, label: (superiorById(lm.superior) || {}).label || '' } : null, performType: null, weeklyHours: '', otherWorks: [] };
    }
    var main = mainIncome(a), sp = superiorTerm(a), pt = performTypeById(getPath(a, 'quiz.performanceType'));
    return { legacy: false, name: cleanStr(getPath(a, 'mainWork.name')), roleLabel: '', industryId: getPath(a, 'mainWork.industry') || '', industryLabel: industryLabel(a),
      mainIncome: main ? { id: main.id, label: main.label, kind: main.kind || 'serve' } : null,
      incomes: selectedIncomes(a).map(function (x) { return { id: x.id, label: x.label, kind: x.kind || 'serve' }; }), incomeOther: getPath(a, 'income.other') || '',
      modules: deriveModules(a).map(function (id) { return { id: id, label: moduleById(id).label }; }),
      superior: sp.id ? { id: sp.id, label: sp.label, term: sp.term, orgTerm: sp.orgTerm } : null,
      performType: pt ? { id: pt.id, label: pt.label } : null,
      weeklyHours: getPath(a, 'mainWork.weeklyHours'), otherWorks: getPath(a, 'mainWork.otherWorks') || [] };
  }
  /** 名單用「品牌名稱」欄：品牌 → 任職公司 */
  function brandText3(answers) {
    if (isV31(answers)) return '';
    if (isLegacy(answers)) return S().brandText(answers);
    var p = (answers && answers.profile) || {};
    return String(p.brand || p.company || '');
  }

  /**
   * 作業資料 JSON（3.0）：
   *   meta：{ receiptId, submittedAt, timezone }；driveStatus 同 computeGaps3
   * 舊版答案：S.buildLabeledData 結果加 legacy:true 與 work（身分、推導模組）。
   */
  function buildLabeledData3(answers, meta, driveStatus) {
    var Sx = S();
    meta = meta || {};
    if (isV31(answers)) return buildLabeledData31(answers, meta, driveStatus);
    if (isLegacy(answers)) {
      var old = Sx.buildLabeledData(answers, meta.attachments || [], meta);
      old.legacy = true; old.work = workSummary(answers);
      old.meta.schemaVersion = Sx.META.version; old.meta.answerSchema = 2;
      return old;
    }
    var a = answers;
    var out = {
      meta: { title: Sx.META.title, tag: Sx.META.tag, org: Sx.META.org, schemaVersion: VERSION, answerSchema: 3, receiptId: meta.receiptId || '', submittedAt: meta.submittedAt || '', timezone: meta.timezone || Sx.META.timezone, shareEmail: DRIVE.shareEmail },
      student: { account: getPath(a, 'student.account') || '', name: getPath(a, 'student.name') || '' },
      work: workSummary(a),
      sections: [],
      drive: driveSummary(a, driveStatus),
      gaps: computeGaps3(a, driveStatus),
      completeness: dataCompleteness(a, driveStatus),
      attachments: [],
      links: [],
      raw: a,
      legacy: false
    };
    var w = out.work;
    // 本業選擇
    out.sections.push({ id: 'mainWork', label: '本業選擇', kind: 'fields', icon: 'briefcase', fields: [
      { id: 'name', label: '工作名稱', value: w.name, display: w.name },
      { id: 'industry', label: '行業類別', value: w.industryId, display: w.industryLabel },
      { id: 'incomes', label: '本業的收入來源', value: w.incomes.map(function (x) { return x.id; }), display: w.incomes.map(function (x) { return x.label; }).concat(w.incomeOther ? ['其他：' + w.incomeOther] : []).join('、') },
      { id: 'main', label: '收入最多的一項', value: w.mainIncome ? w.mainIncome.id : '', display: w.mainIncome ? w.mainIncome.label : '' },
      { id: 'weeklyHours', label: '每週投入時數', value: w.weeklyHours, display: w.weeklyHours === '' ? '' : w.weeklyHours + ' 小時' },
      { id: 'otherWorks', label: '其他工作', value: w.otherWorks, display: w.otherWorks.map(function (x) { return x.name + (x.weeklyHours !== '' ? '（每週 ' + x.weeklyHours + ' 小時）' : ''); }).join('、') }
    ] });
    // 本業問答
    var q = a.quiz || {};
    out.sections.push({ id: 'quiz', label: '本業問答', kind: 'quiz', icon: 'help', modules: w.modules, fields: M().quiz.map(function (qq, i) {
      var f = MODULE_QUIZ[qq.module], v = q[f] || '';
      var extra = '';
      if (qq.module === 'report' && v === 'yes' && w.superior) extra = '上級：' + w.superior.label;
      if (qq.module === 'perform' && v === 'yes' && w.performType) extra = '類型：' + w.performType.label;
      return { id: f, label: '第 ' + (i + 1) + ' 題　' + qq.q, module: qq.module, moduleLabel: moduleById(qq.module).label, value: v, display: v === 'yes' ? '是' : v === 'no' ? '否' : '未答', extra: extra };
    }) });
    // 基本輪廓
    var p = a.profile || {};
    out.sections.push({ id: 'profile', label: '基本輪廓', kind: 'fields', icon: 'storefront', fields: profileFieldsFor(a).map(function (f) {
      var v = p[f.id];
      return { id: f.id, label: f.label, type: f.type, value: v == null ? '' : v, display: Array.isArray(v) ? v.join('、') : (v == null || v === '' ? '' : String(v) + (f.unit ? ' ' + f.unit : '')) };
    }) });
    // 資料提供
    var cl = checklistFor(a), dc = a.dataChecklist || {}, fo = (driveStatus && driveStatus.folders) || {}, plan = folderPlan(a);
    var planBy = {}; plan.forEach(function (x) { planBy[x.itemId] = x; });
    out.sections.push({ id: 'dataShare', label: '資料提供', kind: 'checklist', icon: 'folder', drive: out.drive, groups: cl.groups.map(function (g) {
      return { id: g.id, label: g.label, items: g.items.map(function (it) {
        var st = yesNo(dc[it.id]), f = fo[it.id] || null;
        return { id: it.id, label: it.label, def: it.def, example: it.example, primary: it.primary, status: st, statusLabel: st === 'yes' ? '有' : st === 'no' ? '沒有' : '未勾選',
          folderName: planBy[it.id] ? planBy[it.id].name : '', folderId: (a.drive && a.drive.folders && a.drive.folders[it.id]) || '',
          count: f ? Number(f.count) || 0 : null, shortcuts: f ? Number(f.shortcuts) || 0 : null, updated: f ? (f.updated || '') : '',
          placed: st === 'yes' && !!(f && Number(f.count) > 0) };
      }) };
    }), dialog: dialogItems(a).map(function (d) { var f = fo[d.id] || null; return { id: d.id, label: d.label, def: d.def, folderName: planBy[d.id] ? planBy[d.id].name : '', folderId: (a.drive && a.drive.folders && a.drive.folders[d.id]) || '', count: f ? Number(f.count) || 0 : null }; }) });
    // 流程頁
    var fp = flowPagesAll(a);
    fp.pages.forEach(function (t) {
      var flow = normalizeFlow3(t, a.flows && a.flows[t.key]);
      var block = { id: t.key, sectionId: t.sectionId, page: t.page, label: t.label, kind: 'flow', icon: t.icon, mode: flow.mode, modeLabel: flow.mode === 'full' ? '完整版' : '快速版', source: t.source, desc: t.desc, withCollab: t.withCollab, withPerform: t.withPerform, headGroupLabel: t.headGroupLabel, supplement: !!t.supplement,
        head: (t.headFields || []).map(function (h) { var v = flow[h.id]; var disp = Array.isArray(v) ? v.join('、') : (h.options ? Sx.optionLabel(h.options, v) : String(v == null ? '' : v)); if (h.otherField && flow[h.otherField]) disp += (disp ? '、' : '') + flow[h.otherField]; return { id: h.id, label: h.label, value: v == null ? '' : v, display: disp }; }),
        note: flow.note || '', summary: flowSummary3(flow.stages) };
      block.stages = flow.stages.map(function (st, i) {
        var doing = st.status === 'doing', tools = doing ? Sx.toolsText(st) : '';
        return { order: i + 1, id: st.id, template: !!st.template, custom: !st.template, name: st.name || st.templateName, label: st.name || st.templateName, templateName: st.templateName || '', renamed: !!st.template && (st.name || st.templateName) !== st.templateName,
          icon: 'dot', desc: '', status: st.status || '', statusLabel: Sx.stageStatusLabel(st.status), handling: doing ? (st.handling || '') : '', handlingLabel: doing ? Sx.stageHandlingLabel(st.handling) : '',
          incomplete: doing && !st.handling, na: st.status === 'na', filled: !!st.status, steps: doing ? st.steps : [], tools: tools, toolList: doing ? st.tools : [], toolsOther: doing ? st.toolsOther : '', files: [] };
      });
      block.diagram = block.stages;
      out.sections.push(block);
    });
    out.overflowFlows = fp.overflow;
    // 對話紀錄、最想省下的時間
    var dg = a.dialog || {};
    out.sections.push({ id: 'dialog', label: '對話紀錄', kind: 'dialog', icon: 'message', items: dialogItems(a).map(function (d) { var f = fo[d.id] || null; return { id: d.id, label: d.label, count: f ? Number(f.count) || 0 : null, folderId: (a.drive && a.drive.folders && a.drive.folders[d.id]) || '' }; }),
      fields: [{ id: 'faq', label: '常見提問', type: 'list', value: dg.faq || [], items: listOf(dg.faq), display: listOf(dg.faq).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') }, { id: 'privacyAck', label: '個資提示', type: 'boolean', value: !!dg.privacyAck, display: dg.privacyAck ? '已確認' : '' }] });
    var tasks = listOf(getPath(a, 'timeSavers.tasks'));
    out.sections.push({ id: 'timeSavers', label: '最想省下的時間', kind: 'fields', icon: 'clock', fields: [{ id: 'tasks', label: '最耗時的工作', type: 'list', value: tasks, items: tasks, display: tasks.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') }] });
    return out;
  }
  function driveSummary(answers, driveStatus) {
    var d = (answers && answers.drive) || {};
    var fo = (driveStatus && driveStatus.folders) || {};
    var total = 0, shortcuts = 0;
    Object.keys(fo).forEach(function (k) { total += Number(fo[k].count) || 0; shortcuts += Number(fo[k].shortcuts) || 0; });
    return { mode: d.mode || '', modeLabel: d.mode === 'oauth' ? '雲端分類資料夾' : d.mode === 'link' ? '自行共用的連結' : '尚未提供',
      rootFolderId: d.rootFolderId || '', rootUrl: d.rootUrl || (d.mode === 'link' ? d.linkUrl : ''), rootName: rootFolderName(getPath(answers, 'student.name')), ownerEmail: d.ownerEmail || '', linkUrl: d.linkUrl || '',
      folderCount: Object.keys(d.folders || {}).length, fileCount: total, shortcutCount: shortcuts, checkedAt: (driveStatus && driveStatus.checkedAt) || '', readable: driveStatus ? driveStatus.readable !== false : null };
  }

  /* ------------------------------------------------------------------ */
  /* 匯出                                                                */
  /* ------------------------------------------------------------------ */
  var EXPORT_TABS3 = [
    { id: 'index', name: '索引', headers: ['回執編號', '送出時間', '本名', '學員帳號', '工作名稱或身分', '行業', '品牌名稱', '檔案數', '缺口數', '狀態', '資料夾連結', '開始時間', '填寫耗時（分）', '批次', '準時', '資料夾', '資料完成度'] },
    { id: 'work', name: '本業', headers: ['回執編號', '本名', '工作名稱', '行業', '收入來源', '收入最多的一項', '每週投入時數', '其他工作', '模組', '上級', '表現類型', '品牌名稱', '任職公司或單位', '職稱', '主要業務', '服務形式', '營運規模', '團隊人數'] },
    { id: 'checklist', name: '資料清單', headers: ['回執編號', '本名', '分組', '項目', '有無', '資料夾', '檔案數', '捷徑數'] },
    { id: 'flows', name: '流程', headers: ['回執編號', '本名', '流程', '模式', '服務對象', '序號', '步驟名稱', '模板或自訂', '狀態', '處理方式', '做法', '工具', '其他工具', '截圖數'] },
    { id: 'dialog', name: '對話紀錄', headers: ['回執編號', '本名', '完成預約檔案數', '詢問後未回覆檔案數', '常見提問 1', '常見提問 2', '常見提問 3', '常見提問 4', '常見提問 5', '個資提示'] },
    { id: 'timeSavers', name: '最想省下的時間', headers: ['回執編號', '本名', '序號', '最耗時的工作'] },
    { id: 'supplements', name: '補件', headers: ['回執編號', '本名', '需求編號', '建立時間', '狀態', '項目', '類型', '說明', '期限', '完成時間'] }
  ];
  /** 全部工作表（3.0 索引與各表＋2.x 的基本輪廓、資料上傳、雲端連結保留給舊作業） */
  function exportTabsAll() {
    var Sx = S(), legacy = {};
    Sx.EXPORT_TABS.forEach(function (t) { legacy[t.id] = t; });
    var out = [EXPORT_TABS3[0]].concat(EXPORT_TABS31, [EXPORT_TABS3[1], legacy.profile, legacy.uploads, legacy.links], EXPORT_TABS3.slice(2));
    return out.filter(Boolean);
  }
  /**
   * 匯出列（除索引外）：labeled 為 buildLabeledData3 結果；ix：{ receiptId, name }；supplements 為補件需求清單（可省略）
   * 舊版作業：基本輪廓、資料上傳、雲端連結沿用 S.exportRows；本業（身分、推導模組）、流程（皆完整版）、對話紀錄、最想省下的時間折算至 3.0 表。
   */
  function exportRows3(labeled, ix, supplements) {
    var Sx = S();
    var rows = { work: [], profile: [], uploads: [], links: [], checklist: [], flows: [], dialog: [], timeSavers: [], supplements: [], business31: [], steps31: [], authority31: [], resources31: [], place31: [] };
    var id = ix.receiptId, nm = ix.name;
    var a = (labeled && labeled.raw) || {};
    var legacy = !!labeled && (labeled.legacy === true || !labeled.work || isLegacy(a));
    if (labeled && (labeled.v31 || isV31(a))) {
      var r31 = exportRows31(labeled, ix);
      Object.keys(r31).forEach(function (k) { rows[k] = r31[k]; });
    } else if (legacy) {
      var old = Sx.exportRows(labeled, ix), pr = old.profile[0] || [];
      var w = workSummary(a);
      rows.work.push([id, nm, '（身分制）' + (w.roleLabel || ''), pr[4] || '', '', '', '', '', w.modules.map(function (m) { return m.label; }).join('、'), w.superior ? w.superior.label : '', '', pr[5] || '', pr[6] || '', pr[7] || '', pr[8] || '', pr[9] || '', pr[10] || '', pr[11] || '']);
      rows.profile = old.profile; rows.uploads = old.uploads; rows.links = old.links;
      old.flows.forEach(function (r) { rows.flows.push([id, nm, r[2], '完整版', r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12]]); });
      rows.dialog = old.dialog; rows.timeSavers = old.timeSavers;
    } else if (labeled) {
      var w2 = labeled.work, p = a.profile || {};
      rows.work.push([id, nm, w2.name, w2.industryLabel, w2.incomes.map(function (x) { return x.label; }).join('、'), w2.mainIncome ? w2.mainIncome.label : '', w2.weeklyHours, w2.otherWorks.map(function (x) { return x.name + '（' + x.weeklyHours + '）'; }).join('、'),
        w2.modules.map(function (m) { return m.label; }).join('、'), w2.superior ? w2.superior.label : '', w2.performType ? w2.performType.label : '', p.brand || '', p.company || '', p.title || '', p.business || '', (p.serviceMode || []).join('、'), p.scale || '', p.headcount || '']);
      var ds = labeled.sections.filter(function (s) { return s.id === 'dataShare'; })[0];
      if (ds) ds.groups.forEach(function (g) { g.items.forEach(function (it) { rows.checklist.push([id, nm, g.label, it.label, it.statusLabel, it.folderName, it.count == null ? '' : it.count, it.shortcuts == null ? '' : it.shortcuts]); }); });
      labeled.sections.filter(function (s) { return s.kind === 'flow'; }).forEach(function (s) {
        var target = (s.head || []).filter(function (h) { return h.id === 'target'; })[0];
        s.stages.forEach(function (st) { rows.flows.push([id, nm, s.label, s.modeLabel, target ? target.display : '', st.order, st.name, st.template ? '模板' : '自訂', st.statusLabel, st.handlingLabel, (st.steps || []).join('\n'), (st.toolList || []).join('、'), st.toolsOther || '', 0]); });
      });
      var dg = labeled.sections.filter(function (s) { return s.id === 'dialog'; })[0], faq = listOf(getPath(a, 'dialog.faq'));
      var cnt = function (i) { return dg && dg.items[i] && dg.items[i].count != null ? dg.items[i].count : ''; };
      rows.dialog.push([id, nm, cnt(0), cnt(1), faq[0] || '', faq[1] || '', faq[2] || '', faq[3] || '', faq[4] || '', getPath(a, 'dialog.privacyAck') ? '已確認' : '']);
      listOf(getPath(a, 'timeSavers.tasks')).forEach(function (t, i) { rows.timeSavers.push([id, nm, i + 1, t]); });
    }
    (supplements || []).forEach(function (r) { (r.items || []).forEach(function (it) { rows.supplements.push([id, nm, r.id, r.createdAt || '', r.statusLabel || supplementStatusLabel(r), it.title, typeLabel(it.type), it.note || '', it.due || '', it.doneAt || '']); }); });
    return rows;
  }
  function typeLabel(t) { var x = byId(SUPPLEMENT.types, t); return x ? x.label : String(t || ''); }

  /* ------------------------------------------------------------------ */
  /* 補件需求                                                            */
  /* ------------------------------------------------------------------ */
  /**
   * 項目整理：items=[{ type:'section'|'data'|'custom', ref?, title?, note?, due? }] → { ok, items } 或 { ok:false, message }
   * section：ref 為區塊 id 或流程 key（流程含「改完整版」語意：補填後 mode 改 full）；data：ref 為資料清單項目 id（title 自清單帶入）；custom：title 必填。
   */
  function normalizeSupplementItems(items, answers) {
    if (!Array.isArray(items) || !items.length) return { ok: false, message: '請至少加入一個補件項目' };
    if (items.length > SUPPLEMENT.maxItems) return { ok: false, message: '補件項目最多 ' + SUPPLEMENT.maxItems + ' 項' };
    var out = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {}, type = byId(SUPPLEMENT.types, it.type) ? it.type : '';
      if (!type) return { ok: false, message: '第 ' + (i + 1) + ' 項類型不正確' };
      var ref = cleanStr(it.ref, 60), title = cleanStr(it.title, SUPPLEMENT.maxTitleLength), note = cleanStr(it.note, SUPPLEMENT.maxNoteLength + 1);
      if (note.length > SUPPLEMENT.maxNoteLength) return { ok: false, message: '第 ' + (i + 1) + ' 項說明不可超過 ' + SUPPLEMENT.maxNoteLength + ' 字' };
      var due = cleanStr(it.due, 20);
      if (due && !/^\d{4}\.\d{2}\.\d{2}$/.test(due)) return { ok: false, message: '第 ' + (i + 1) + ' 項期限格式須為 yyyy.mm.dd' };
      var o = { id: 'i' + pad2(i + 1), type: type, ref: ref, title: title, note: note, due: due, status: 'open', doneAt: '', content: null, needFolder: false, folderName: '' };
      if (type === 'data') {
        var d = answers ? checklistItem(answers, ref) : itemDef(ref, {});
        if (!d) return { ok: false, message: '第 ' + (i + 1) + ' 項的資料項目不存在：' + ref };
        o.title = o.title || d.label; o.needFolder = true;
        var plan = answers ? folderPlan(answers).filter(function (x) { return x.itemId === ref; })[0] : null;
        o.folderName = plan ? plan.name : folderSafe(d.label);
        o.folderId = (answers && answers.drive && answers.drive.folders && answers.drive.folders[ref]) || '';
      } else if (type === 'section') {
        if (!ref) return { ok: false, message: '第 ' + (i + 1) + ' 項須指定區塊' };
        var secLabel = sectionLabelFor(answers, ref);
        if (!secLabel) return { ok: false, message: '第 ' + (i + 1) + ' 項的區塊不存在：' + ref };
        o.title = o.title || secLabel;
        o.toFull = ref.indexOf('income.') === 0 || /Flow$/.test(ref);
      } else if (!title) return { ok: false, message: '第 ' + (i + 1) + ' 項請填寫項目名稱' };
      var key = type + ':' + (ref || o.title);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(o);
    }
    return { ok: true, items: out };
  }
  function sectionLabelFor(answers, ref) {
    if (answers && isV31(answers)) return pageLabel31(ref);
    var sec = byId(SECTIONS3, ref);
    if (sec && !sec.dynamic && sec.kind !== 'review') return sec.label;
    if (!answers) return ref.indexOf('income.') === 0 ? '收入來源流程' : ({ teamFlow: '團隊流程', collabFlow: '協作流程', performFlow: '訓練與表現流程' })[ref] || '';
    var t = flowTemplateFor(answers, ref);
    return t ? t.label + '流程' : '';
  }
  /** 需求狀態：未開始／部分完成／已完成 */
  function supplementStatus(items) {
    var done = (items || []).filter(function (x) { return x.status === 'done'; }).length;
    if (!items || !items.length || !done) return 'open';
    return done === items.length ? 'done' : 'partial';
  }
  function supplementStatusLabel(req) { return SUPPLEMENT.statuses[supplementStatus(req && req.items)] || SUPPLEMENT.statuses.open; }
  /** 通知文字：vars={ 稱呼, 項目清單(自動由 items 產生), 補件連結, 補件期限 } */
  function renderSupplementNotice(body, req, vars) {
    vars = vars || {};
    var items = (req && req.items) || [];
    var list = items.map(function (it, i) { return (i + 1) + '. ' + typeLabel(it.type) + '｜' + it.title + (it.note ? '（' + it.note + '）' : '') + (it.file ? '\n　附檔：' + it.file.name + (it.file.ret ? '（填好後回傳' + (suppFileDeadline(it.file) ? '，' + suppFileDeadline(it.file) + ' 前' : '') + '）' : '') : ''); }).join('\n');   // 3.3.8 附檔
    var due = vars['補件期限'] != null ? vars['補件期限'] : (items.map(function (x) { return x.due; }).filter(Boolean).sort()[0] || '');
    var v = { '稱呼': vars['稱呼'] || '', '項目清單': list, '補件連結': vars['補件連結'] || '', '補件期限': due, '雲端資料夾': vars['雲端資料夾'] || '' };
    return S().renderTemplate(body || SUPPLEMENT.defaultNotice, v).split('\n').filter(function (line) { return !(line.indexOf('補件期限') >= 0 && !due); }).join('\n');
  }
  /** 補件連結：作業網址加 r（回執）、s（需求 id）、k（憑證） */
  function supplementLink(receiptId, requestId, token) {
    var base = S().NOTIFY.workUrl;
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'r=' + encodeURIComponent(receiptId) + '&s=' + encodeURIComponent(requestId) + (token ? '&k=' + encodeURIComponent(token) : '');
  }
  /** 前台回報內容整理：{ kind:'drive'|'link'|'text'|'section', text?, url?, count? } → 整理後或 null */
  function normalizeSupplementContent(c) {
    if (!c || typeof c !== 'object') return null;
    var kind = SUPPLEMENT.contentKinds.indexOf(c.kind) >= 0 ? c.kind : '';
    if (!kind) return null;
    var out = { kind: kind };
    if (kind === 'text') { out.text = cleanStr(c.text, SUPPLEMENT.maxTextLength); if (!out.text) return null; }
    if (kind === 'link') { var Sx = S(); out.url = Sx.normalizeLink(c.url); if (Sx.linkIssue(out.url)) return null; out.note = cleanStr(c.note, 200); }
    if (kind === 'drive') { out.count = Math.max(0, Math.floor(Number(c.count) || 0)); out.folderId = DRIVE.idRe.test(String(c.folderId || '')) ? String(c.folderId) : ''; }
    if (kind === 'section') { out.answersPatch = c.answersPatch && typeof c.answersPatch === 'object' ? c.answersPatch : null; }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 3.3.8 補件附檔與回傳（gas/drive.gs 與 mock/mock-api.js 共用）          */
  /*   項目 it.file＝{ kind:'drive'|'url', id?, url?, name, size?, mime?, ret, retDue?, retTime?, at, dlAt?, dlN? }（只存 Drive id）  */
  /*   項目 it.ret＝{ id, name, size, mime, at, n, review:'pending'|'pass'|'reject', reason?, reviewAt?, late? }（學姐回傳檔）  */
  /* ------------------------------------------------------------------ */
  var SUPP_FILE = {
    exts: ['docx', 'xlsx', 'pdf', 'pptx', 'zip'],
    mimes: { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' },
    maxBytes: 50 * 1024 * 1024,
    chunkBytes: 4 * 1024 * 1024,
    maxNameLength: 120,
    maxReasonLength: 200,
    reviews: { pending: '待審核', pass: '已通過', reject: '已退回' },
    dlBase: 'https://grace63188.github.io/consult-prep/dl.html',
    tokenRe: /^(CP\d{8}-[A-Z0-9]{5})\.(s\d{8}-[A-Za-z0-9]{3,12})\.(i\d{2})\.([0-9a-f]{12})$/
  };
  function suppFileExt(name) { var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function suppFileOk(name) { return SUPP_FILE.exts.indexOf(suppFileExt(name)) >= 0; }
  function suppFileMime(name) { return SUPP_FILE.mimes[suppFileExt(name)] || 'application/octet-stream'; }
  function suppFileName(name) { return cleanStr(String(name || '').replace(/[\\\/:*?"<>|]/g, '＿'), SUPP_FILE.maxNameLength); }
  /**
   * 建立補件時的附檔：f＝{ id+name+size+mime | url+name?, item?（項目序，預設 0）, ret?, retDue?, retTime? } → { ok, file|null } 或 { ok:false, message }
   * 附檔只能一份；ret＝需要學姐回傳；回傳截止選填（yyyy.mm.dd＋HH:MM，未填時刻為 23:59）。
   */
  function normalizeSupplementFile(f, itemCount) {
    if (f == null || f === '' || f === false) return { ok: true, file: null };
    if (typeof f !== 'object') return { ok: false, message: '附檔格式錯誤' };
    var out = { kind: '', name: '', ret: !!f.ret, retDue: '', retTime: '', item: 0 };
    var n = Math.floor(Number(f.item) || 0);
    if (!(n >= 0 && n < Math.max(1, Number(itemCount) || 0))) return { ok: false, message: '附檔對應的補件項目不存在' };
    out.item = n;
    if (f.url) {
      var Sx = S(), u = Sx.normalizeLink(f.url), li = Sx.linkIssue(u);
      if (li || !/^https:\/\//.test(u)) return { ok: false, message: '附檔網址須為 https：' + (li ? li.message : '') };
      out.kind = 'url'; out.url = u.slice(0, 500); out.name = suppFileName(f.name) || u.replace(/^https:\/\//, '').slice(0, 60);
    } else {
      if (!DRIVE.idRe.test(String(f.id || ''))) return { ok: false, message: '附檔尚未上傳完成' };
      var nm = suppFileName(f.name);
      if (!nm || !suppFileOk(nm)) return { ok: false, message: '附檔格式須為 ' + SUPP_FILE.exts.join('、') };
      var sz = Math.floor(Number(f.size) || 0);
      if (!(sz > 0 && sz <= SUPP_FILE.maxBytes)) return { ok: false, message: '附檔大小須在 50 MB 內' };
      out.kind = 'drive'; out.id = String(f.id); out.name = nm; out.size = sz; out.mime = suppFileMime(nm);
    }
    if (out.ret) {
      var rd = cleanStr(f.retDue, 20);
      if (rd && !/^\d{4}\.\d{2}\.\d{2}$/.test(rd)) return { ok: false, message: '回傳截止日期格式須為 yyyy.mm.dd' };
      var rt = f.retTime ? S().normTimeInput(f.retTime) : '';
      if (f.retTime && !rt) return { ok: false, message: '回傳截止時刻格式不正確（例：21:00）' };
      out.retDue = rd; out.retTime = rd ? (rt || '23:59') : '';
    }
    return { ok: true, file: out };
  }
  /** 回傳截止：'yyyy.mm.dd HH:MM' 或 '' */
  function suppFileDeadline(file) { return file && file.ret && file.retDue ? file.retDue + ' ' + (file.retTime || '23:59') : ''; }
  /** 需求內是否有「已回傳、待審核」的項目（需求已完成時學姐仍可重新上傳覆蓋） */
  function supplementFileOpen(req) { return !!(req && (req.items || []).some(function (it) { return it.file && it.file.ret && it.ret && it.ret.review === 'pending'; })); }
  /** 簽章下載憑證：回執.需求.項目.簽章（12 碼十六進位） */
  function suppDlToken(rid, sid, iid, sig) { return rid + '.' + sid + '.' + iid + '.' + sig; }
  function suppDlParse(t) { var m = SUPP_FILE.tokenRe.exec(String(t || '')); return m ? { rid: m[1], sid: m[2], iid: m[3], sig: m[4] } : null; }
  /** kind：'sf'（學姐下載附檔，LINE 以外部瀏覽器開啟）｜'sr'（後台下載學姐回傳檔） */
  function suppDlUrl(kind, token) { return SUPP_FILE.dlBase + '?' + kind + '=' + encodeURIComponent(token) + (kind === 'sf' ? '&openExternalBrowser=1' : ''); }
  /** 補件項目的附檔與回傳（公開欄位）：links＝{ sf, sr } 簽章下載網址 */
  function supplementFilePublic(it, links) {
    links = links || {};
    var f = it && it.file, r = it && it.ret, o = {};
    if (f) o.file = { kind: f.kind, name: f.name || '', size: f.size || 0, mime: f.mime || '', url: f.kind === 'url' ? f.url || '' : '', ret: !!f.ret, retDue: f.retDue || '', retTime: f.retTime || '', deadline: suppFileDeadline(f), at: f.at || '', dlAt: f.dlAt || '', dlN: f.dlN || 0, dl: f.kind === 'url' ? f.url || '' : links.sf || '' };
    if (r) o.ret = { name: r.name || '', size: r.size || 0, mime: r.mime || '', at: r.at || '', n: r.n || 1, review: r.review || 'pending', reviewLabel: SUPP_FILE.reviews[r.review || 'pending'] || '', reason: r.reason || '', reviewAt: r.reviewAt || '', late: !!r.late, dl: links.sr || '' };
    return o;
  }

  /**
   * 補填區塊（section 類補件）併入作業答案：只接受該項目 ref 對應的鍵（流程 key → flows[key]；mainWork → mainWork＋income；
   * dataShare → dataChecklist；quiz／profile／dialog／timeSavers → 同名鍵），其餘鍵忽略；流程 toFull 時 mode 改 full。
   * 併入後 normalizeAnswers3 並以 checkSubmission3 驗證。回傳 { ok:true, answers, changed:[鍵] } 或 { ok:false, message }。
   * 2.x 作業或無 patch 時回 { ok:true, answers:原答案, changed:[] }。
   */
  function applySupplementPatch(raw, item, patch) {
    var ref = String((item && item.ref) || '');
    if (raw && isV31(raw)) return applySupplementPatch31(raw, item, patch);
    if (!raw || typeof raw !== 'object' || isLegacy(raw) || !patch || typeof patch !== 'object' || !ref) return { ok: true, answers: raw, changed: [] };
    var a = JSON.parse(JSON.stringify(raw)), changed = [];
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; };
    var isFlowRef = /^income\.[A-Za-z0-9_]+$/.test(ref) || /^(teamFlow|collabFlow|performFlow)$/.test(ref);
    if (isFlowRef) {
      var f = obj(patch.flows && patch.flows[ref]);
      if (f) { f = JSON.parse(JSON.stringify(f)); if (item.toFull) f.mode = 'full'; a.flows = obj(a.flows) || {}; a.flows[ref] = f; if (a.flowsExtra) delete a.flowsExtra[ref]; changed.push('flows.' + ref); }
    } else if (ref === 'mainWork') {
      if (obj(patch.mainWork)) { a.mainWork = patch.mainWork; changed.push('mainWork'); }
      if (obj(patch.income)) { a.income = patch.income; changed.push('income'); }
    } else if (ref === 'dataShare') {
      if (obj(patch.dataChecklist)) { a.dataChecklist = patch.dataChecklist; changed.push('dataChecklist'); }
    } else if (['quiz', 'profile', 'dialog', 'timeSavers'].indexOf(ref) >= 0) {
      if (obj(patch[ref])) { a[ref] = patch[ref]; changed.push(ref); }
    }
    if (!changed.length) return { ok: true, answers: raw, changed: [] };
    var norm = normalizeAnswers3(a);
    var problem = checkSubmission3(norm, []);
    if (problem) return { ok: false, message: problem.message, problem: problem };
    return { ok: true, answers: norm, changed: changed };
  }

  /* ================================================================== */
  /* 3.1 作業結構（2026.11.01）：身分資料 → 經營項目 → 職務內容 → 實際步驟 → 權限規則 → 資源清單 → 放入資料 */
  /* 答案形狀（answers，schema:31）：                                                                  */
  /*   student:{ account, name }                                                                       */
  /*   business:{ name, industryCode('A'–'T'｜'X' 其他), industrySub, industryOther, stage, incomes:[id], incomeOther, mainIncome, otherRoles } */
  /*   duties:{ items:[id], other:[文字], handover:[id 或 other:文字] ≤ 3 }                             */
  /*   steps:{ receive:{ none, sources:[], sourcesOther:[], channels:[], channelsOther:[], cycle, stages:[{ name, tools:[] }] }, */
  /*           lead:{ none, role, stages }, task:{ none, name, stages } }                              */
  /*   authority:{ items:[{ id, label, mode:'self'|'ask'|'none' }], askTargets:[], askOther }         */
  /*   resources:{ data:{ [itemId]:{ has:true, source:'self'|'company' } }, dataOther:[{ id:'c_xxx', label, source }], */
  /*               sites:[{ platform, platformOther, url, owner, uses:[] }], tools:{ [名稱]:{ source } }, toolsOther:[{ label, source }], companySystemName } */
  /*   drive:{ mode, rootFolderId, rootUrl, folders:{ [itemId]:folderId }, ownerEmail, linkUrl }      */
  /* 前面答案只帶到後面（主要收入、資料夾），不決定後面區塊出現。                                        */
  /* ================================================================== */
  var VERSION31 = '3.1.0';
  /** 任意值 → 陣列（物件元素保留；listOf 只給字串清單用） */
  function arrOf(v) { return Array.isArray(v) ? v.filter(function (x) { return x != null; }) : []; }
  function V31() { var v = M().v31; if (!v) throw new Error('model3 缺少 v31'); return v; }
  /** 3.1 判定：schema 31，或有 business 且無 mainWork */
  function isV31(answers) {
    if (!answers || typeof answers !== 'object') return false;
    if (answers.schema === 31) return true;
    return !!(answers.business && typeof answers.business === 'object' && !answers.mainWork);
  }
  var SECTIONS31 = [
    { id: 'identity', label: '身分資料', icon: 'idcard', kind: 'fields', desc: '輸入官網註冊的 Email，核對後本名自動帶入' },
    { id: 'business', label: '經營項目', icon: 'briefcase', kind: 'fields', desc: '本次諮詢希望優化或發展的工作項目' },
    { id: 'duties', label: '職務內容', icon: 'list', kind: 'duties', desc: '一週內實際負責的工作項目與優先移交項目' },
    { id: 'steps', label: '實際步驟', icon: 'route', kind: 'steps', desc: '以最近一次實際發生的經過，依順序排出步驟' },
    { id: 'authority', label: '權限規則', icon: 'shield', kind: 'authority', desc: '每個事項目前的決定方式' },
    { id: 'resources', label: '資源清單', icon: 'folder', kind: 'resources', desc: '手上已有的資料、網站帳號與工具系統' },
    { id: 'place', label: '放入資料', icon: 'upload', kind: 'place', desc: '在本人的 Google 雲端硬碟建立分類資料夾並放入檔案後送出' }
  ];
  function pageLabel31(id) { var s = byId(SECTIONS31, id); return s ? s.label : ''; }
  /** 自訂項目 id：前綴＋名稱雜湊（ASCII，與 drive_register 的 itemId 格式相容） */
  function customId(prefix, label) {
    var sv = cleanStr(label), h = 5381;
    for (var i = 0; i < sv.length; i++) h = ((h * 33) ^ sv.charCodeAt(i)) >>> 0;
    return prefix + '_' + ('00000000' + h.toString(16)).slice(-8);
  }

  function industry31List() { return V31().industries.map(function (x) { return { code: x.code, label: x.label, subs: x.subs.slice() }; }); }
  function industry31ByCode(code) { return byId31(V31().industries, 'code', code); }
  function byId31(list, key, val) { for (var i = 0; i < list.length; i++) if (list[i][key] === val) return list[i]; return null; }
  /** 行業顯示：「大類｜小類」或「其他：自填」 */
  function industry31Label(answers) {
    var b = (answers && answers.business) || {};
    if (b.industryCode === 'X' || (!b.industryCode && b.industryOther)) return b.industryOther ? '其他：' + b.industryOther : '其他';
    var ind = industry31ByCode(b.industryCode);
    if (!ind) return '';
    return b.industrySub ? ind.label + '｜' + b.industrySub : ind.label;
  }
  function incomes31() { return V31().incomes.slice(); }
  function income31Label(id, answers) {
    var inc = byId(V31().incomes, id);
    if (!inc) { var ex = arrOf(answers && answers.business && answers.business.incomesExtra).filter(function (x) { return x && x.id === id; })[0]; return ex ? cleanStr(ex.label, 40) : ''; }   // 3.2.7 官方新增的收入來源
    if (inc.custom && answers && answers.business && answers.business.incomeOther) return inc.label + '：' + answers.business.incomeOther;
    return inc.label;
  }
  function stage31Label(id) { var s = byId(V31().stages, id); return s ? s.label : ''; }
  function duty31Label(id, answers) {
    var d = byId(V31().duties, id);
    if (d) return d.label;
    var m = /^other:(.+)$/.exec(String(id || ''));
    return m ? m[1] : '';
  }

  /** 資源清單資料項目（固定 46 項＋自訂）：[{ id, label, example, def, groupId, groupLabel, custom }] */
  function resourceDataItems(answers) {
    var out = [];
    V31().resources.data.forEach(function (g) {
      g.items.forEach(function (it) { out.push({ id: it.id, label: it.label, example: it.example || '', def: it.example || '', groupId: g.id, groupLabel: g.label, custom: false }); });
    });
    var other = arrOf(getPath(answers, 'resources.dataOther'));
    other.forEach(function (o, i) {
      if (!o || typeof o !== 'object') return;
      var label = cleanStr(o.label, 40);
      if (!label) return;
      var it = { id: o.id && /^c_[a-f0-9]{8}$/.test(String(o.id)) ? String(o.id) : customId('c', label), label: label, example: '', def: '', groupId: 'custom', groupLabel: '其他資料', custom: true };
      if (o.supp === true) { it.supp = true; var cg = o.cat ? byId(V31().resources.data, o.cat) : null; if (cg) it.groupLabel = cg.label; }   // 3.2.7 官方新增（補充請求）：顯示於校長選的分類
      out.push(it);
    });
    return out;
  }
  /** 點亮（有）的資料項目：[{ ...item, source:'self'|'company' }] */
  function litDataItems(answers) {
    var d = getPath(answers, 'resources.data') || {};
    var other = {}; arrOf(getPath(answers, 'resources.dataOther')).forEach(function (o) { if (o && o.id) other[o.id] = o; });
    return resourceDataItems(answers).filter(function (it) {
      if (it.custom) return true;   // 自訂資料一律視為點亮
      return !!(d[it.id] && d[it.id].has === true);
    }).map(function (it) {
      var src = it.custom ? (other[it.id] && other[it.id].source) : (d[it.id] && d[it.id].source);
      var o = {}; Object.keys(it).forEach(function (k) { o[k] = it[k]; });
      o.source = src === 'company' ? 'company' : 'self';
      o.sourceLabel = o.source === 'company' ? '公司提供' : '自行整理';
      return o;
    });
  }
  /**
   * 3.1 資料夾規劃：只為點亮項目建分類資料夾，序號依點亮順序連續（01_、02_…）；不建對話紀錄固定資料夾（客人對話截圖為清單項目）。
   * 回傳 [{ itemId, name, label, parent:'', create:true, status:'yes', source }]
   */
  function folderPlan31(answers) {
    var lit = litDataItems(answers), base = lit.filter(function (it) { return !it.supp; }), extra = lit.filter(function (it) { return it.supp; });
    var data = base.map(function (it, i) { return { itemId: it.id, name: pad2(i + 1) + '_' + folderSafe(it.label), label: it.label, parent: '', create: true, status: 'yes', source: it.source }; });
    // 3.2：工具系統「行銷與體驗」點亮工具（含該分組自訂）各一個分類資料夾，編號接在資料項目之後
    var n = data.length;
    var tools = uploadToolItems31(answers).map(function (it, i) { return { itemId: it.id, name: pad2(n + i + 1) + '_' + folderSafe(it.label), label: it.label, parent: '', create: true, status: 'yes', source: it.source, kind: 'tool', groupId: it.groupId, groupLabel: it.groupLabel, custom: it.custom }; });
    // 3.2.7 官方新增的資料項目（補充請求）一律排在最後，不改既有資料夾編號
    var m = n + tools.length;
    return data.concat(tools, extra.map(function (it, i) { return { itemId: it.id, name: pad2(m + i + 1) + '_' + folderSafe(it.label), label: it.label, parent: '', create: true, status: 'yes', source: it.source, supp: true }; }));
  }
  /** 3.2 需放入資料的工具分組（其他工具分組與網站帳號不需放入） */
  var UPLOAD_TOOL_GROUPS31 = V31().resources.tools.filter(function (g) { return g.upload === true; }).map(function (g) { return g.id; });   // model3：resources.tools[i].upload（目前為 experience）
  /** 工具分組是否有點亮（固定工具或歸屬該分組的自訂工具 toolsOther[i].group） */
  function toolGroupLit31(r, g) {
    r = r || {}; var t = r.tools || {};
    return g.items.some(function (x) { return t[x]; }) || arrOf(r.toolsOther).some(function (o) { return o && o.group === g.id && cleanStr(o.label, 30); });
  }
  /**
   * 3.2 需放入資料的點亮工具（行銷與體驗）：[{ id:'t_<8 碼>', label, groupId, groupLabel, custom, source, sourceLabel, kind:'tool' }]
   * id＝customId('t', 工具名稱)（ASCII，符合 drive_register itemId 格式）；固定工具與同名自訂工具視為同一項。
   */
  function uploadToolItems31(answers) {
    var r = (answers && answers.resources) || {}, tools = r.tools || {}, out = [], seen = {};
    V31().resources.tools.forEach(function (g) {
      if (UPLOAD_TOOL_GROUPS31.indexOf(g.id) < 0) return;
      var push = function (label, e, custom) {
        var id = customId('t', label);
        if (seen[id]) return; seen[id] = 1;
        var src = e && e.source === 'company' ? 'company' : 'self';
        out.push({ id: id, label: label, groupId: g.id, groupLabel: g.label, custom: custom, source: src, sourceLabel: src === 'company' ? '公司提供' : '自行使用', kind: 'tool' });
      };
      g.items.forEach(function (x) { if (tools[x]) push(x, tools[x], false); });
      arrOf(r.toolsOther).forEach(function (o) { var lb = o && o.group === g.id ? cleanStr(o.label, 30) : ''; if (lb) push(lb, o, true); });
    });
    return out;
  }
  /**
   * 3.2 顯示用資料夾清單（後台、PDF、匯出、缺口）：工具項目只列已建資料夾或已貼網址者
   * （3.2 前送出的作業沒有工具分類資料夾，不列為未放入）。
   */
  function placePlan31(answers) {
    var a = answers || {}, have = (a.drive && a.drive.folders) || {}, links = (a.place && a.place.links) || {};
    return folderPlan31(a).filter(function (p) { return p.kind !== 'tool' || have[p.itemId] || (links[p.itemId] || []).length; });
  }

  function emptyAnswers31() {
    return {
      schema: 31,
      student: { account: '', name: '' },
      business: { name: '', industryCode: '', industrySub: '', industryOther: '', stage: '', incomes: [], incomeOther: '', mainIncome: '', otherRoles: '', otherRolesNone: false },
      duties: { items: [], other: [], handover: [] },
      steps: { receive: { none: false, sources: [], sourcesOther: [], channels: [], channelsOther: [], cycle: '', stages: [] }, lead: { none: false, role: '', stages: [] }, task: { none: false, name: '', stages: [] } },
      authority: { items: V31().authority.items.map(function (x) { return { id: x.id, label: x.label, mode: '' }; }), askTargets: [], askOther: '' },
      resources: { data: {}, dataOther: [], sites: [], sitesNone: false, tools: {}, toolsNone: {}, toolsOther: [], companySystemName: '' },
      place: { links: {} },
      drive: { mode: '', rootFolderId: '', rootUrl: '', folders: {}, ownerEmail: '', linkUrl: '' }
    };
  }
  /** 一般網址（https；http 自動改 https；無協定補 https）→ 正規化字串或 '' */
  function webUrl(v, max) {
    var u = cleanStr(v, max || 2000);
    if (!u) return '';
    if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
    if (!/^https:\/\//i.test(u)) { if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(u)) u = 'https://' + u; else return ''; }
    if (/[\s"'<>]/.test(u)) return '';
    return u;
  }
  /** 使用狀態（使用中／建置中／規劃中）與建置中、規劃中的追加欄位 */
  /** 負責對象欄位：planOwner（網站帳號的 owner 為歸屬，不可混用）；工具系統相容舊鍵 owner */
  function normStatus31(e, allowOwnerKey) {
    var v = V31().resources, st = byId(v.statuses, e && e.status) ? e.status : 'active';
    var out = { status: st, plannedUse: '', progress: '', owner: '' };
    if (st !== 'active') {
      out.plannedUse = cleanStr(e.plannedUse, 60);
      out.progress = cleanStr(e.progress, 60);
      var po = e.planOwner != null ? e.planOwner : (allowOwnerKey ? e.owner : '');
      out.owner = byId(v.plannedOwners, po) ? po : '';
    }
    return out;
  }
  function statusLabel31(id) { var x = byId(V31().resources.statuses, id); return x ? x.label : ''; }
  function plannedOwnerLabel31(id) { var x = byId(V31().resources.plannedOwners, id); return x ? x.label : ''; }
  function strList(v, max, each) { return listOf(v).map(function (x) { return cleanStr(x, each || 40); }).filter(Boolean).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).slice(0, max || 20); }
  function normStages31(v) {
    var lim = V31().stepLimits;
    return arrOf(v).map(function (st) {
      if (typeof st === 'string') st = { name: st };
      if (!st || typeof st !== 'object') return null;
      var name = cleanStr(st.name, lim.maxNameLength);
      if (!name) return null;
      return { name: name, tools: strList(st.tools, lim.maxTools, lim.maxToolLength) };
    }).filter(Boolean).slice(0, lim.maxStages);
  }
  /** 3.1 正規化（資料中心、mock、前台送出前共用）：回傳新物件 */
  function normalizeAnswers31(answers) {
    var v = V31(), a = answers || {}, out = emptyAnswers31();
    out.student = { account: cleanStr(getPath(a, 'student.account'), 120), name: cleanStr(getPath(a, 'student.name'), 60) };
    var b = a.business || {};
    var code = cleanStr(b.industryCode, 1).toUpperCase();
    if (code !== 'X' && !industry31ByCode(code)) code = b.industryOther ? 'X' : '';
    var ind = industry31ByCode(code);
    var sub = cleanStr(b.industrySub, 40);
    if (ind && sub && ind.subs.indexOf(sub) < 0) sub = '';   // 小類須在該大類內；不在者視為未選小類
    var incIds = v.incomes.map(function (x) { return x.id; });
    // 3.2.7 官方新增的收入來源（補充請求）：id＝x_＋8 碼，名稱存於 business.incomesExtra（只新增欄位）
    var incEx = {}; arrOf(b.incomesExtra).forEach(function (x) { if (x && /^x_[0-9a-f]{8}$/.test(String(x.id || '')) && cleanStr(x.label, 40) && incIds.indexOf(String(x.id)) < 0) incEx[String(x.id)] = cleanStr(x.label, 40); });
    var incomes = listOf(b.incomes).map(String).filter(function (id, i, arr) { return (incIds.indexOf(id) >= 0 || incEx[id]) && arr.indexOf(id) === i; });
    var main = cleanStr(b.mainIncome, 20);
    var mainOk = incomes.indexOf(main) >= 0 && !(byId(v.incomes, main) || {}).notMain;
    var pickable = incomes.filter(function (id) { return !(byId(v.incomes, id) || {}).notMain; });
    if (!mainOk) main = pickable.length === 1 ? pickable[0] : '';
    out.business = { name: cleanStr(b.name, 40), industryCode: code, industrySub: sub, industryOther: code === 'X' ? cleanStr(b.industryOther, 40) : '', stage: byId(v.stages, b.stage) ? b.stage : '',
      incomes: incomes, incomeOther: incomes.indexOf('other') >= 0 ? cleanStr(b.incomeOther, 20) : '', mainIncome: main, otherRoles: cleanStr(b.otherRoles, 60) };
    out.business.otherRolesNone = !out.business.otherRoles && b.otherRolesNone === true;
    var incExOut = incomes.filter(function (id) { return incEx[id]; }).map(function (id) { return { id: id, label: incEx[id] }; }); if (incExOut.length) out.business.incomesExtra = incExOut;   // 明確「目前沒有」（與未作答區分）
    var nb325 = normalizeBrand31(a); if (nb325.brandOwn) out.business.brandOwn = nb325.brandOwn; if (nb325.brandName) out.business.brandName = nb325.brandName;   // 3.2.5 自有品牌（只新增欄位）
    var d = a.duties || {};
    var dutyIds = v.duties.map(function (x) { return x.id; });
    var items = listOf(d.items).map(String).filter(function (id, i, arr) { return dutyIds.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    var other = strList(d.other, 10, 30);
    var allowed = items.concat(other.map(function (x) { return 'other:' + x; }));
    out.duties = { items: items, other: other, handover: listOf(d.handover).map(String).filter(function (id, i, arr) { return allowed.indexOf(id) >= 0 && arr.indexOf(id) === i; }).slice(0, v.dutiesMaxHandover) };
    var s = a.steps || {}, rc = s.receive || {}, ld = s.lead || {}, tk = s.task || {}, rcase = byId(v.cases, 'receive');
    var cycles = rcase.cycles.map(function (c) { return c.id; });
    out.steps.receive = { none: rc.none === true, sources: strList(rc.sources, 20, 30), sourcesOther: strList(rc.sourcesOther, 10, 30), channels: strList(rc.channels, 20, 30), channelsOther: strList(rc.channelsOther, 10, 30), cycle: cycles.indexOf(rc.cycle) >= 0 ? rc.cycle : '', stages: normStages31(rc.stages) };
    out.steps.lead = { none: ld.none === true, role: cleanStr(ld.role, 30), stages: normStages31(ld.stages) };
    out.steps.task = { none: tk.none === true, name: cleanStr(tk.name, 40), stages: normStages31(tk.stages) };
    // 案例「目前沒有」：前台收合不顯示的內容一併清空（步驟、客人來源、成交管道、週期、對象職位、任務名稱）
    ['receive', 'lead', 'task'].forEach(function (k) {
      var c = out.steps[k];
      if (!c.none) return;
      c.stages = [];
      if (k === 'receive') { c.sources = []; c.sourcesOther = []; c.channels = []; c.channelsOther = []; c.cycle = ''; }
      if (k === 'lead') c.role = '';
      if (k === 'task') c.name = '';
    });
    var au = a.authority || {}, modes = v.authority.modes.map(function (m) { return m.id; });
    var auItems = [], seenAu = {};
    arrOf(au.items).forEach(function (it, i) {
      if (!it || typeof it !== 'object') return;
      var base = byId(v.authority.items, it.id);
      var label = base ? base.label : cleanStr(it.label, 30);
      if (!label) return;
      var id = base ? base.id : (it.id && /^c_[a-f0-9]{8}$/.test(String(it.id)) ? String(it.id) : customId('c', label));
      if (seenAu[id]) return; seenAu[id] = 1;
      auItems.push({ id: id, label: label, mode: modes.indexOf(it.mode) >= 0 ? it.mode : '', custom: !base });
    });
    if (!auItems.length) auItems = v.authority.items.map(function (x) { return { id: x.id, label: x.label, mode: '', custom: false }; });
    out.authority = { items: auItems.slice(0, v.authority.maxItems), askTargets: strList(au.askTargets, 10, 20), askOther: cleanStr(au.askOther, 20) };
    var r = a.resources || {}, srcIds = ['self', 'company'];
    var data = {}, dataIn = r.data && typeof r.data === 'object' ? r.data : {};
    var fixedIds = {}; v.resources.data.forEach(function (g) { g.items.forEach(function (it) { fixedIds[it.id] = 1; }); });
    Object.keys(dataIn).forEach(function (id) { if (!fixedIds[id]) return; var e = dataIn[id]; if (e && e.has === true) data[id] = { has: true, source: srcIds.indexOf(e.source) >= 0 ? e.source : 'self' }; else if (e && e.has === false) data[id] = id === BRAND_LOGO_ID31 && e.logoPending === true ? { has: false, logoPending: true } : { has: false }; });
    var dataOther = [];
    arrOf(r.dataOther).forEach(function (o, i) { if (!o || typeof o !== 'object') return; var label = cleanStr(o.label, 40); if (!label) return; var id = o.id && /^c_[a-f0-9]{8}$/.test(String(o.id)) ? String(o.id) : customId('c', label); if (dataOther.some(function (x) { return x.id === id; })) return; var dO = { id: id, label: label, source: srcIds.indexOf(o.source) >= 0 ? o.source : 'self' }; if (o.supp === true) { dO.supp = true; if (byId(v.resources.data, o.cat)) dO.cat = String(o.cat); } dataOther.push(dO); });   // 3.2.7 supp／cat：官方新增（只新增欄位）
    var sites = [];
    arrOf(r.sites).forEach(function (st) {
      if (!st || typeof st !== 'object') return;
      var platform = cleanStr(st.platform, 20), url = cleanStr(st.url, 300);
      if (!platform && !url) return;
      var ss = normStatus31(st);
      sites.push({ platform: platform, platformOther: platform === '其他' ? cleanStr(st.platformOther, 20) : '', url: url, owner: st.owner === 'company' ? 'company' : 'self', uses: strList(st.uses, 10, 20), status: ss.status, plannedUse: ss.plannedUse, progress: ss.progress, planOwner: ss.owner });
    });
    var tools = {}, toolsIn = r.tools && typeof r.tools === 'object' ? r.tools : {}, toolNames = {};
    v.resources.tools.forEach(function (g) { g.items.forEach(function (t) { toolNames[t] = 1; }); });
    var toolEntry = function (e, label) { var ss = normStatus31(e, true); var o = { source: e.source === 'company' ? 'company' : 'self', status: ss.status, plannedUse: ss.plannedUse, progress: ss.progress, planOwner: ss.owner }; if (label != null) { o.label = label; if (UPLOAD_TOOL_GROUPS31.indexOf(e.group) >= 0) o.group = e.group; if (e.supp === true) { o.supp = true; if (byId(v.resources.tools, e.cat)) o.cat = String(e.cat); } } return o; };   // 3.2.7 supp／cat：官方新增工具（顯示於校長選的分組）   // 3.2：自訂工具可歸屬需放入資料的分組（group）
    Object.keys(toolsIn).forEach(function (name) { if (!toolNames[name]) return; var e = toolsIn[name]; if (e && (e.has === true || e.source || e.status)) tools[name] = toolEntry(e); });
    var toolsOther = [];
    arrOf(r.toolsOther).forEach(function (o) { if (!o || typeof o !== 'object') return; var label = cleanStr(o.label, 30); if (!label || toolsOther.some(function (x) { return x.label === label; })) return; toolsOther.push(toolEntry(o, label)); });
    // 明確「目前沒有」：網站帳號（無任何列時）、工具系統各分組（該組無點亮工具時）
    var toolsNone = {}, tnIn = r.toolsNone && typeof r.toolsNone === 'object' ? r.toolsNone : {};
    v.resources.tools.forEach(function (g) { if (tnIn[g.id] === true && !toolGroupLit31({ tools: tools, toolsOther: toolsOther }, g)) toolsNone[g.id] = true; });
    sites = sites.slice(0, v.resources.sites.max);
    out.resources = { data: data, dataOther: dataOther.slice(0, v.resources.maxCustomData), sites: sites, sitesNone: !sites.length && r.sitesNone === true, tools: tools, toolsNone: toolsNone, toolsOther: toolsOther.slice(0, v.resources.maxCustomTools), companySystemName: cleanStr(r.companySystemName, 40) };
    var sApp = strList(r.suppApplied, 60, 12).filter(function (x) { return /^x_[0-9a-f]{8}$/.test(x); }); if (sApp.length) out.resources.suppApplied = sApp;   // 3.2.7 已套用的「校長同意」上傳項目（只新增欄位）
    var planIds = {}; folderPlan31(out).forEach(function (p) { planIds[p.itemId] = 1; });
    var links = {}, linksIn = a.place && a.place.links && typeof a.place.links === 'object' ? a.place.links : {};
    Object.keys(linksIn).forEach(function (itemId) {
      if (!planIds[itemId]) return;
      var seen = {}, arr = [];
      arrOf(linksIn[itemId]).forEach(function (l) {
        if (typeof l === 'string') l = { url: l };
        if (!l || typeof l !== 'object') return;
        var u = webUrl(l.url);
        if (!u || seen[u]) return; seen[u] = 1;
        arr.push({ url: u, name: cleanStr(l.name, 80), fileId: DRIVE.idRe.test(String(l.fileId || '')) ? String(l.fileId) : '', kind: l.kind === 'shortcut' ? 'shortcut' : 'link', at: cleanStr(l.at, 20) });
      });
      if (arr.length) links[itemId] = arr.slice(0, v.place.maxLinksPerItem);
    });
    out.place = { links: links };
    var dr = a.drive || {};
    var folders = {};
    Object.keys(dr.folders || {}).forEach(function (k) { if (planIds[k] && DRIVE.idRe.test(String(dr.folders[k] || ''))) folders[k] = String(dr.folders[k]); });
    out.drive = { mode: ['oauth', 'link'].indexOf(dr.mode) >= 0 ? dr.mode : (dr.rootFolderId ? 'oauth' : (dr.linkUrl ? 'link' : '')), rootFolderId: DRIVE.idRe.test(String(dr.rootFolderId || '')) ? String(dr.rootFolderId) : '', rootUrl: cleanStr(dr.rootUrl, 300), folders: folders, ownerEmail: cleanStr(dr.ownerEmail, 120).toLowerCase(), linkUrl: cleanStr(dr.linkUrl, 2000) };
    return out;
  }
  /** 3.1 必填檢查：[{ path, label, message }] */
  function validate31(answers) {
    var a = answers, miss = [];
    var add = function (p, l, m) { miss.push({ path: p, label: l, message: m || (l + '為必填') }); };
    if (!a.student.account) add('student.account', '學員帳號');
    if (!a.student.name) add('student.name', '本名');
    if (!a.business.name) add('business.name', '項目名稱');
    if (!a.business.industryCode) add('business.industryCode', '行業');
    if (a.business.industryCode === 'X' && !a.business.industryOther) add('business.industryOther', '行業（其他）', '請填寫行業名稱');
    if (!a.business.stage) add('business.stage', '經營階段');
    if (!a.business.incomes.length) add('business.incomes', '收入來源', '請至少點亮一項收入來源');
    var pickable = a.business.incomes.filter(function (id) { return !(byId(V31().incomes, id) || {}).notMain; });
    if (pickable.length && !a.business.mainIncome) add('business.mainIncome', '主要收入', '請從已點亮的收入來源中選一項');
    if (a.business.incomes.indexOf('other') >= 0 && !a.business.incomeOther) add('business.incomeOther', '其他收入來源', '請填寫其他收入來源');
    if (!a.duties.items.length && !a.duties.other.length) add('duties.items', '工作項目', '請至少點選一項工作項目');
    var cases = ['receive', 'lead', 'task'].filter(function (k) { return !a.steps[k].none; });
    if (!cases.length) add('steps', '實際步驟', '至少整理一個案例的實際步驟');
    cases.forEach(function (k) {
      var c = byId(V31().cases, k);
      if (!a.steps[k].stages.length) add('steps.' + k + '.stages', c.label, c.label + '：請至少點選一個步驟，或選擇「' + c.noneLabel + '」');
      if (k === 'task' && !a.steps.task.name) add('steps.task.name', '任務名稱');
    });
    a.authority.items.forEach(function (it) { if (!it.mode) add('authority.' + it.id, '權限規則', '請標示「' + it.label + '」的決定方式'); });
    if (a.authority.items.some(function (it) { return it.mode === 'ask'; }) && !a.authority.askTargets.length && !a.authority.askOther) add('authority.askTargets', '請示對象', '有需要請示的事項時，請點選請示對象');
    // 網站帳號：提示以平台名稱或網址辨識，不用編號（資料中心已去除空白列，編號會與前台畫面不一致）
    a.resources.sites.forEach(function (s, i) { if (s.platform && !s.url) add('resources.sites.' + i + '.url', '網站帳號網址', '網站帳號「' + (s.platform === '其他' && s.platformOther ? s.platformOther : s.platform) + '」：請填寫網址'); if (s.url && !s.platform) add('resources.sites.' + i + '.platform', '網站帳號平台', '網站帳號「' + s.url.slice(0, 40) + '」：請選擇平台'); });
    return miss;
  }
  /**
   * 3.1 作答完整度規則（前台送出、補件補填共用；資料中心只用於標示未作答，不據此拒收）：
   * validate31 之外，每題都須明確作答（填寫內容或選「目前沒有」）。可傳前台原始答案或正規化後答案。
   * 網站帳號路徑編號＝傳入答案的列序（前台為畫面順序）。回傳 [{ path, label, message }]
   */
  function answerRules31(a) {
    a = a || {};
    var v = V31(), RV = v.resources, out = [], add = function (p, l, m) { out.push({ path: p, label: l, message: m }); };
    var t = function (x) { return String(x == null ? '' : x).trim(); };
    var b = a.business || {}, d = a.duties || {}, st = a.steps || {}, au = a.authority || {}, r = a.resources || {};
    if (!t(b.otherRoles) && b.otherRolesNone !== true) add('business.otherRoles', '其他身分或工作', '請填寫其他身分或工作，沒有的請選「目前沒有」');
    if (((d.items || []).length || (d.other || []).length) && !(d.handover || []).length) add('duties.handover', '優先移交項目', '請至少標出一項優先移交項目');
    var rc = st.receive || {}, ld = st.lead || {};
    if (rc.none !== true) {
      if (!(rc.sources || []).length && !(rc.sourcesOther || []).length) add('steps.receive.sources', '客人來源', '接待客人：請至少點選一項客人來源');
      if (!(rc.channels || []).length && !(rc.channelsOther || []).length) add('steps.receive.channels', '成交管道', '接待客人：請至少點選一項成交管道');
      if (!rc.cycle) add('steps.receive.cycle', '成交週期', '接待客人：請選擇成交週期');
    }
    if (ld.none !== true && !t(ld.role)) { var lc = byId(v.cases, 'lead'); add('steps.lead.role', lc.roleLabel, lc.label + '：請填寫' + lc.roleLabel); }
    if ((au.askTargets || []).indexOf('其他') >= 0 && !t(au.askOther)) add('authority.askOther', '其他請示對象', '請填寫其他請示對象');
    var data = r.data || {};
    RV.data.forEach(function (g) {
      var n = g.items.filter(function (it) { var e = data[it.id]; return !e || (e.has !== true && e.has !== false); }).length;
      if (n) add('resources.dataGroup.' + g.id, g.label, '資料「' + g.label + '」：還有 ' + n + ' 項未選擇有或沒有');
    });
    var sites = arrOf(r.sites);
    if (!sites.length && r.sitesNone !== true) add('resources.sites', '網站帳號', '請新增網站帳號，沒有的請選「目前沒有網站帳號」');
    var stReq = function (e, base, name) {
      if (!e.status || e.status === 'active') return;
      if (!t(e.plannedUse)) add(base + '.plannedUse', '預計用途', name + '：請填寫預計用途');
      if (!t(e.progress)) add(base + '.progress', '目前進度', name + '：請填寫目前進度');
      if (!e.planOwner) add(base + '.planOwner', '負責對象', name + '：請選擇負責對象');
    };
    sites.forEach(function (s, i) {
      var nm = '網站帳號 ' + (i + 1), base = 'resources.sites.' + i;
      if (!s.platform && !t(s.url)) add(base + '.platform', '網站帳號平台', nm + '：請選擇平台，或移除此列');
      else if (!s.platform) add(base + '.platform', '網站帳號平台', nm + '：請選擇平台');
      else if (!t(s.url)) add(base + '.url', '網站帳號網址', nm + '：請填寫網址');
      if (s.platform === '其他' && !t(s.platformOther)) add(base + '.platformOther', '平台名稱', nm + '：請填寫平台名稱');
      if (!(s.uses || []).length) add(base + '.uses', '用途', nm + '：請至少點選一項用途');
      stReq(s, base, nm);
    });
    var tools = r.tools || {}, tn = r.toolsNone || {}, n = 0;
    RV.tools.forEach(function (g) {
      var anyOn = toolGroupLit31(r, g);
      if (!anyOn && tn[g.id] !== true) add('resources.tools.' + g.id, g.label, '工具系統「' + g.label + '」：請點亮使用中的工具，沒有的請選「目前沒有」');
      if (g.id === 'company' && anyOn && !t(r.companySystemName)) add('resources.companySystemName', g.systemNameLabel || '系統名稱', '請填寫' + (g.systemNameLabel || '系統名稱'));
    });
    RV.tools.forEach(function (g) { g.items.forEach(function (x) { if (tools[x]) { stReq(tools[x], 'resources.toolDetail.' + n, x); n++; } }); });
    arrOf(r.toolsOther).forEach(function (o) { stReq(o, 'resources.toolDetail.' + n, o.label); n++; });
    return out;
  }
  /** 明確「目前沒有」的題目（後台、PDF、匯出共用）：[{ id, label, display }]；案例另見 noneCases、資料項目另見 notYet */
  function noneFields31(a) {
    var v = V31(), out = [];
    if (a.business && a.business.otherRolesNone) out.push({ id: 'business.otherRoles', label: '其他身分或工作', display: '目前沒有' });
    if (a.resources && a.resources.sitesNone) out.push({ id: 'resources.sites', label: '網站帳號', display: '目前沒有網站帳號' });
    v.resources.tools.forEach(function (g) { if (a.resources && a.resources.toolsNone && a.resources.toolsNone[g.id]) out.push({ id: 'resources.tools.' + g.id, label: '工具系統｜' + g.label, display: '目前沒有' }); });
    return out;
  }
  /**
   * 3.1 放入資料檢查：每個點亮項目至少 1 個檔案（driveStatus.folders[itemId].count）；未建資料夾者亦列出。
   * 回傳 [{ itemId, label, folderName, reason:'noFolder'|'empty' }]；授權模式以外（貼連結）只檢查根資料夾可讀。
   */
  function placementIssues31(answers, driveStatus) {
    var a = answers, out = [];
    var fo = (driveStatus && driveStatus.folders) || {}, have = (a.drive && a.drive.folders) || {};
    if (a.drive.mode === 'link') {
      if (!a.drive.linkUrl) out.push({ itemId: '', label: '資料夾連結', folderName: '', reason: 'noFolder' });
      else if (driveStatus && (!driveStatus.root || driveStatus.root.ok !== true)) out.push({ itemId: '', label: '資料夾連結', folderName: '', reason: 'unreadable' });   // 3.2：未確認可讀即不通過
      else if (driveStatus && driveStatus.root && driveStatus.root.count === 0) out.push({ itemId: '', label: '資料夾連結', folderName: '', reason: 'empty' });
      return out;
    }
    folderPlan31(a).forEach(function (p) {
      var kind = p.kind === 'tool' ? 'tool' : 'data';   // 3.2：行銷與體驗工具一併檢查
      if (!have[p.itemId]) { out.push({ itemId: p.itemId, label: p.label, folderName: p.name, reason: 'noFolder', kind: kind }); return; }
      var f = fo[p.itemId];
      if (!f || f.readable === false) { out.push({ itemId: p.itemId, label: p.label, folderName: p.name, reason: 'unreadable', kind: kind }); return; }
      var nLinks = ((a.place && a.place.links && a.place.links[p.itemId]) || []).length;
      if ((Number(f.count) || 0) + nLinks < V31().place.minFilesPerItem) out.push({ itemId: p.itemId, label: p.label, folderName: p.name, reason: 'empty', kind: kind });
    });
    return out;
  }
  /** 3.1 送出檢查：files 須為空；必填；driveStatus 提供時另檢查放入資料。回傳 null 或 { code, errorCode, message, path? } */
  function checkSubmission31(answers, files, driveStatus) {
    if (Array.isArray(files) && files.length) return issue3('FILE_KEY', '此版本不經網站收檔，請改放入雲端分類資料夾', 'files');
    var miss = validate31(answers);
    if (miss.length) return issue3('REQUIRED', miss[0].message, miss[0].path);
    var lim = V31().stepLimits;
    var cs = ['receive', 'lead', 'task'];
    for (var i = 0; i < cs.length; i++) if (answers.steps[cs[i]].stages.length > lim.maxStages) return issue3('STEP_LIMIT', '每個案例最多 ' + lim.maxStages + ' 個步驟', 'steps.' + cs[i]);
    if (!answers.drive.mode) return issue3('DRIVE_REQUIRED', '請先建立分類資料夾並放入檔案', 'drive');
    if (driveStatus) {
      var pi = placementIssues31(answers, driveStatus);
      if (pi.length) {
        var first = pi[0];
        var msg = first.reason === 'unreadable' ? '資料中心目前無法讀取「' + (first.folderName || first.label) + '」，請確認資料夾已共用' : first.reason === 'noFolder' ? '尚未建立「' + first.label + '」的分類資料夾' : '「' + first.label + '」尚未放入檔案（尚有 ' + pi.length + ' 項）';
        return issue3('PLACEMENT', msg, 'place.' + first.itemId);
      }
    }
    return null;
  }
  /** 3.1 缺口（後台用）：notYet＝未點亮的固定項目（尚未具備候選）、emptyFolders、placed；gapCount＝尚未放入 */
  function computeGaps31(answers, driveStatus) {
    var a = answers, fo = (driveStatus && driveStatus.folders) || {}, have = (a.drive && a.drive.folders) || {};
    var lit = {}; litDataItems(a).forEach(function (it) { lit[it.id] = it; });
    var g = { notYet: [], emptyFolders: [], unanswered: [], placed: [], noneStages: [], manualStages: [], naStages: [], unansweredStages: [], incompleteStages: [], flows: {}, overflow: [], legacy: false, v31: true, noneCases: [] };
    // 資料項目：明確選「沒有」者列入尚未具備（none:true）；未選有或沒有者列入 unanswered。
    // 舊版前台送出的作業沒有「沒有」記錄（explicitNone:false），未點亮項目沿用舊判定一律列入尚未具備。
    var dmap = (a.resources && a.resources.data) || {};
    var explicit = Object.keys(dmap).some(function (k) { return dmap[k] && dmap[k].has === false; });
    g.explicitNone = explicit;
    var skipG325 = {}; V31().resources.data.forEach(function (dg) { if (!dataGroupApplies31(a, dg)) skipG325[dg.id] = 1; });   // 3.2.5 不適用的條件分組（無品牌者不問品牌標誌）
    resourceDataItems(a).forEach(function (it) {
      if (skipG325[it.groupId]) return;
      var row = { id: it.id, label: it.label, group: it.groupLabel, def: it.def };
      if (!lit[it.id]) {
        if (it.custom) return;
        var isNo = !!(dmap[it.id] && dmap[it.id].has === false);
        row.none = isNo; row.answer = isNo ? 'none' : explicit ? 'unanswered' : 'legacy'; row.answerLabel = isNo ? '沒有' : explicit ? '未作答' : '未點亮';
        if (isNo || !explicit) g.notYet.push(row); else g.unanswered.push(row);
        return;
      }
      var f = fo[it.id], n = f ? (Number(f.count) || 0) : 0, nl = ((a.place && a.place.links && a.place.links[it.id]) || []).length;
      row.count = n; row.linkCount = nl; row.folderId = have[it.id] || ''; row.source = lit[it.id].sourceLabel;
      if (n + nl > 0) g.placed.push(row); else g.emptyFolders.push(row);
    });
    // 3.2 行銷與體驗工具（只計已建資料夾或已貼網址者；舊作業不列入）
    placePlan31(a).forEach(function (p) {
      if (p.kind !== 'tool') return;
      var f = fo[p.itemId], n = f ? (Number(f.count) || 0) : 0, nl = ((a.place && a.place.links && a.place.links[p.itemId]) || []).length;
      var row = { id: p.itemId, label: p.label, group: p.groupLabel, def: '', kind: 'tool', count: n, linkCount: nl, folderId: have[p.itemId] || '', source: p.source === 'company' ? '公司提供' : '自行使用' };
      if (n + nl > 0) g.placed.push(row); else g.emptyFolders.push(row);
    });
    ['receive', 'lead', 'task'].forEach(function (k) { if (a.steps[k].none) g.noneCases.push({ id: k, label: byId(V31().cases, k).label }); });
    g.building = buildingList31(a);
    g.noneFields = noneFields31(a);
    g.unansweredFields = answerRules31(a).filter(function (m) { return m.path.indexOf('resources.dataGroup.') !== 0; });   // 資料項目未作答已列於 unanswered
    g.gapCount = g.emptyFolders.length + g.unanswered.length;   // 3.2.5 未作答計入缺漏
    g.brandLogo = brandLogoState31(a);   // 3.2.5 品牌標誌（後台作業頁、PDF 顯示 Logo 狀態）
    return g;
  }
  /** 建置中／規劃中彙整（後台用）：網站帳號與工具系統中 status 非使用中者 [{ type, typeLabel, label, group, status, statusLabel, plannedUse, progress, owner, ownerLabel, url }] */
  function buildingList31(answers) {
    var a = answers, v = V31(), out = [];
    var push = function (type, typeLabel, label, group, e, url) {
      if (!e || !e.status || e.status === 'active') return;
      out.push({ type: type, typeLabel: typeLabel, label: label, group: group || '', status: e.status, statusLabel: statusLabel31(e.status), plannedUse: e.plannedUse || '', progress: e.progress || '', owner: e.planOwner || '', ownerLabel: plannedOwnerLabel31(e.planOwner), url: url || '' });
    };
    (a.resources.sites || []).forEach(function (s) { push('site', '網站帳號', s.platform === '其他' && s.platformOther ? s.platformOther : s.platform, '', s, s.url); });
    v.resources.tools.forEach(function (g) { g.items.forEach(function (t) { if (a.resources.tools[t]) push('tool', '工具系統', t, g.label, a.resources.tools[t], ''); }); });
    (a.resources.toolsOther || []).forEach(function (t) { var gg = (t.group || t.cat) ? byId(v.resources.tools, t.group || t.cat) : null; push('tool', '工具系統', t.label, gg ? gg.label : '其他工具', t, ''); });
    return out;
  }
  function dataCompleteness31(answers, driveStatus) {
    var g = computeGaps31(answers, driveStatus);
    var yes = g.placed.length + g.emptyFolders.length;
    return { yes: yes, placed: g.placed.length, no: g.notYet.length, unanswered: g.unanswered.length, total: yes + g.notYet.length + g.unanswered.length, text: g.placed.length + '／' + yes, v31: true };
  }
  /** 3.1 摘要（索引、票券、後台列表） */
  function workSummary31(answers) {
    var a = answers, b = a.business, v = V31();
    return { legacy: false, v31: true, name: b.name, roleLabel: '', industryId: b.industryCode, industryCode: b.industryCode, industrySub: b.industrySub, industryLabel: industry31Label(a), industryMain: (industry31ByCode(b.industryCode) || {}).label || (b.industryCode === 'X' ? '其他' : ''),
      stage: b.stage, stageLabel: stage31Label(b.stage),
      mainIncome: b.mainIncome ? { id: b.mainIncome, label: income31Label(b.mainIncome, a) } : null,
      incomes: b.incomes.map(function (id) { return { id: id, label: income31Label(id, a) }; }), incomeOther: b.incomeOther, otherRoles: b.otherRoles, otherRolesNone: !!b.otherRolesNone,
      modules: [], superior: null, performType: null, weeklyHours: '', otherWorks: [],
      dutyCount: a.duties.items.length + a.duties.other.length, handover: a.duties.handover.map(function (id) { return duty31Label(id, a); }),
      caseCount: ['receive', 'lead', 'task'].filter(function (k) { return !a.steps[k].none; }).length };
  }
  /** 3.1 作業資料 JSON（後台、PDF、匯出共用） */
  /**
   * 3.1 早期送出（2026.11.01 線上 schema3.gs 尚未含 sitesNone／toolsNone）的讀取時推導（不改寫原紀錄）：
   *   作業 JSON 的 raw.resources 沒有 sitesNone 鍵且網站帳號為空 → 視為「目前沒有網站帳號」（前台當時已強制二擇一）；
   *   沒有 toolsNone 鍵 → 未點亮任何工具的分組視為「目前沒有」。只修改記憶體中的物件（PDF、後台檢視、匯出共用），d.legacyNoneDerived＝true。
   */
  function legacyNoneFill31(d) {
    if (!d || typeof d !== 'object' || !d.raw || !isV31(d.raw)) return d;
    var r = d.raw.resources;
    if (!r || typeof r !== 'object') return d;
    var noSites = !Object.prototype.hasOwnProperty.call(r, 'sitesNone'), noTools = !Object.prototype.hasOwnProperty.call(r, 'toolsNone');
    if (!noSites && !noTools) return d;
    var v = V31(), tools = r.tools && typeof r.tools === 'object' ? r.tools : {};
    if (noSites) r.sitesNone = !(Array.isArray(r.sites) && r.sites.length);
    if (noTools) { r.toolsNone = {}; v.resources.tools.forEach(function (g) { if (!toolGroupLit31({ tools: tools, toolsOther: r.toolsOther }, g)) r.toolsNone[g.id] = true; }); }
    (Array.isArray(d.sections) ? d.sections : []).forEach(function (sec) {
      if (!sec || sec.id !== 'resources') return;
      var empty = !(sec.sites && sec.sites.length);
      if (noSites && empty && r.sitesNone) { sec.sitesNone = true; sec.sitesDisplay = '目前沒有網站帳號'; }
      if (noTools && sec.tools) sec.tools.noneGroups = v.resources.tools.filter(function (g) { return r.toolsNone[g.id] && !(sec.tools.groups || []).some(function (x) { return x.id === g.id && x.items && x.items.length; }); }).map(function (g) { return { id: g.id, label: g.label, display: '目前沒有' }; });
    });
    d.legacyNoneDerived = true;
    return d;
  }
  function buildLabeledData31(answers, meta, driveStatus) {
    var Sx = S(), v = V31(), a = answers;
    meta = meta || {};
    var fo = (driveStatus && driveStatus.folders) || {}, have = a.drive.folders || {};
    var url = function (fid) { return fid ? 'https://drive.google.com/drive/folders/' + fid : ''; };
    var sections = [];
    sections.push({ id: 'identity', label: '身分資料', kind: 'fields', icon: 'idcard', fields: [{ id: 'account', label: '學員帳號', value: a.student.account, display: a.student.account }, { id: 'name', label: '本名', value: a.student.name, display: a.student.name }] });
    var w = workSummary31(a);
    sections.push({ id: 'business', label: '經營項目', kind: 'fields', icon: 'briefcase', desc: byId(SECTIONS31, 'business').desc, fields: [
      { id: 'name', label: '項目名稱', value: a.business.name, display: a.business.name },
      { id: 'industry', label: '行業', value: a.business.industryCode, display: w.industryLabel, code: a.business.industryCode, sub: a.business.industrySub },
      { id: 'stage', label: '經營階段', value: a.business.stage, display: w.stageLabel },
      { id: 'incomes', label: '收入來源', value: a.business.incomes.slice(), display: w.incomes.map(function (x) { return x.label; }).join('、'), items: w.incomes.map(function (x) { return x.label; }) },
      { id: 'mainIncome', label: '主要收入', value: a.business.mainIncome, display: w.mainIncome ? w.mainIncome.label : '' },
      { id: 'otherRoles', label: '其他身分或工作', value: a.business.otherRoles, display: a.business.otherRoles || (a.business.otherRolesNone ? '目前沒有' : ''), none: !!a.business.otherRolesNone }
    ] });
    var dutyLabels = a.duties.items.map(function (id) { return duty31Label(id, a); }).concat(a.duties.other);
    sections.push({ id: 'duties', label: '職務內容', kind: 'duties', icon: 'list', desc: byId(SECTIONS31, 'duties').desc, items: dutyLabels, handover: w.handover, fields: [
      { id: 'items', label: '工作項目', value: a.duties.items.concat(a.duties.other.map(function (x) { return 'other:' + x; })), display: dutyLabels.join('、'), items: dutyLabels },
      { id: 'handover', label: '優先移交項目', value: a.duties.handover.slice(), display: w.handover.map(function (x, i) { return (i + 1) + '. ' + x; }).join('　'), items: w.handover }
    ] });
    var rcase = byId(v.cases, 'receive'), cyc = byId(rcase.cycles, a.steps.receive.cycle);
    var caseOut = function (k) {
      var c = byId(v.cases, k), s = a.steps[k];
      var o = { id: k, label: c.label, sub: c.sub, none: s.none, noneLabel: c.noneLabel, stages: s.stages.map(function (st, i) { return { order: i + 1, name: st.name, tools: st.tools.slice() }; }), count: s.stages.length, head: [] };
      if (k === 'receive') o.head = [
        { id: 'sources', label: '客人來源', items: s.sources.concat(s.sourcesOther), display: s.sources.concat(s.sourcesOther).join('、') },
        { id: 'channels', label: '成交管道', items: s.channels.concat(s.channelsOther), display: s.channels.concat(s.channelsOther).join('、') },
        { id: 'cycle', label: '成交週期', value: s.cycle, display: cyc ? cyc.label : '' }];
      if (k === 'lead') o.head = [{ id: 'role', label: c.roleLabel, value: s.role, display: s.role }];
      if (k === 'task') o.head = [{ id: 'name', label: c.nameLabel, value: s.name, display: s.name }];
      o.summary = s.none ? c.noneLabel : (o.count + ' 步' + (s.stages.some(function (st) { return st.tools.length; }) ? '・含工具' : ''));
      return o;
    };
    sections.push({ id: 'steps', label: '實際步驟', kind: 'steps', icon: 'route', desc: byId(SECTIONS31, 'steps').desc, cases: ['receive', 'lead', 'task'].map(caseOut) });
    var modeLabel = function (m) { var x = byId(v.authority.modes, m); return x ? x.label : ''; };
    var auCount = { self: 0, ask: 0, none: 0 };
    a.authority.items.forEach(function (it) { if (auCount[it.mode] != null) auCount[it.mode]++; });
    sections.push({ id: 'authority', label: '權限規則', kind: 'authority', icon: 'shield', desc: byId(SECTIONS31, 'authority').desc, modes: v.authority.modes.slice(),
      items: a.authority.items.map(function (it) { return { id: it.id, label: it.label, mode: it.mode, modeLabel: modeLabel(it.mode), custom: !!it.custom }; }),
      counts: auCount, askTargets: a.authority.askTargets.concat(a.authority.askOther ? [a.authority.askOther] : []), askDisplay: a.authority.askTargets.concat(a.authority.askOther ? ['其他：' + a.authority.askOther] : []).join('、') });
    var lit = litDataItems(a);
    var dataGroups = [];
    v.resources.data.forEach(function (g) {
      var items = lit.filter(function (it) { return it.groupId === g.id; }).map(function (it) { return { id: it.id, label: it.label, example: it.example, source: it.source, sourceLabel: it.sourceLabel }; });
      if (items.length) dataGroups.push({ id: g.id, label: g.label, items: items });
    });
    // 明確選「沒有」的資料項目（依分組）
    var dmap = a.resources.data || {}, noneGroups = [];
    v.resources.data.forEach(function (g) {
      var items = g.items.filter(function (it) { return dmap[it.id] && dmap[it.id].has === false; }).map(function (it) { return { id: it.id, label: it.label, display: '沒有' }; });
      if (items.length) noneGroups.push({ id: g.id, label: g.label, items: items });
    });
    var noneCount = noneGroups.reduce(function (n, g) { return n + g.items.length; }, 0);
    var custom = lit.filter(function (it) { return it.custom; });
    if (custom.length) dataGroups.push({ id: 'custom', label: '其他資料', items: custom.map(function (it) { return { id: it.id, label: it.label, example: '', source: it.source, sourceLabel: it.sourceLabel, custom: true }; }) });
    var toolGroups = [];
    v.resources.tools.forEach(function (g) {
      var withStatus = function (o, e) { o.status = e.status || 'active'; o.statusLabel = statusLabel31(o.status); o.plannedUse = e.plannedUse || ''; o.progress = e.progress || ''; o.planOwner = e.planOwner || ''; o.planOwnerLabel = plannedOwnerLabel31(e.planOwner); return o; };
      var items = g.items.filter(function (t) { return a.resources.tools[t]; }).map(function (t) { return withStatus({ label: t, source: a.resources.tools[t].source, sourceLabel: a.resources.tools[t].source === 'company' ? '公司提供' : '自行使用' }, a.resources.tools[t]); });
      a.resources.toolsOther.forEach(function (t) { if ((t.group || t.cat) === g.id) items.push(withStatus({ label: t.label, source: t.source, sourceLabel: t.source === 'company' ? '公司提供' : '自行使用', custom: true }, t)); });   // 3.2 歸屬分組的自訂工具
      if (g.id === 'company' && a.resources.companySystemName) items.push({ label: a.resources.companySystemName, source: 'company', sourceLabel: '公司提供', systemName: true, status: 'active', statusLabel: statusLabel31('active'), plannedUse: '', progress: '', planOwner: '', planOwnerLabel: '' });
      if (items.length) toolGroups.push({ id: g.id, label: g.label, items: items });
    });
    var withStatusO = function (o, e) { o.status = e.status || 'active'; o.statusLabel = statusLabel31(o.status); o.plannedUse = e.plannedUse || ''; o.progress = e.progress || ''; o.planOwner = e.planOwner || ''; o.planOwnerLabel = plannedOwnerLabel31(e.planOwner); return o; };
    var otherTools = a.resources.toolsOther.filter(function (t) { return !t.group && !t.cat; });   // 3.2.7 cat：官方新增工具顯示於校長選的分組
    if (otherTools.length) toolGroups.push({ id: 'custom', label: '其他工具', items: otherTools.map(function (t) { return withStatusO({ label: t.label, source: t.source, sourceLabel: t.source === 'company' ? '公司提供' : '自行使用', custom: true }, t); }) });
    var building = buildingList31(a);
    sections.push({ id: 'resources', label: '資源清單', kind: 'resources', icon: 'folder', desc: byId(SECTIONS31, 'resources').desc,
      data: { groups: dataGroups, count: lit.length, noneGroups: noneGroups, noneCount: noneCount, unansweredCount: computeGaps31(a, null).unanswered.length },
      sitesNone: !!a.resources.sitesNone, sitesDisplay: a.resources.sites.length ? '' : a.resources.sitesNone ? '目前沒有網站帳號' : '',
      sites: a.resources.sites.map(function (s) { return withStatusO({ platform: s.platform === '其他' && s.platformOther ? s.platformOther : s.platform, url: s.url, owner: s.owner, ownerLabel: s.owner === 'company' ? '公司或總部' : '個人', uses: s.uses.slice() }, s); }),
      tools: { groups: toolGroups, count: toolGroups.reduce(function (n, g) { return n + g.items.length; }, 0), noneGroups: v.resources.tools.filter(function (g) { return a.resources.toolsNone && a.resources.toolsNone[g.id]; }).map(function (g) { return { id: g.id, label: g.label, display: '目前沒有' }; }) }, building: building, buildingCount: building.length });
    var plan = placePlan31(a);   // 3.2：含行銷與體驗工具（舊作業沒有工具資料夾者不列）
    var placeItems = plan.map(function (p) {
      var f = fo[p.itemId] || null, fid = have[p.itemId] || '';
      var files = (f && Array.isArray(f.items)) ? f.items.map(function (x) { return { name: x.name, url: x.url || '', mime: x.mime || '', shortcut: !!x.shortcut, updated: x.updated || '' }; }) : [];
      var links = ((a.place && a.place.links && a.place.links[p.itemId]) || []).map(function (l) { return { url: l.url, name: l.name || l.url, fileId: l.fileId || '', kind: l.kind || 'link' }; });
      var isTool = p.kind === 'tool';
      return { id: p.itemId, label: p.label, kind: isTool ? 'tool' : 'data', groupLabel: isTool ? p.groupLabel : '', folderName: p.name, folderId: fid, folderUrl: url(fid), source: p.source, sourceLabel: p.source === 'company' ? '公司提供' : isTool ? '自行使用' : '自行整理', count: f ? (Number(f.count) || 0) : (fid ? null : 0), shortcuts: f ? (Number(f.shortcuts) || 0) : 0, links: links, linkCount: links.length, placed: !!((f && f.count > 0) || links.length), readable: f ? f.readable !== false : null, files: files, updated: f ? f.updated || '' : '' };
    });
    sections.push({ id: 'place', label: '放入資料', kind: 'place', icon: 'upload', desc: byId(SECTIONS31, 'place').desc, items: placeItems, total: placeItems.length, placed: placeItems.filter(function (x) { return x.placed; }).length, toolCount: placeItems.filter(function (x) { return x.kind === 'tool'; }).length });
    var gaps = computeGaps31(a, driveStatus), cp = dataCompleteness31(a, driveStatus);
    var dr = driveSummary(a, driveStatus);
    dr.folderCount = plan.length;
    return {
      meta: { title: Sx.META.title, tag: Sx.META.tag, org: Sx.META.org, schemaVersion: VERSION31, answerSchema: 31, receiptId: meta.receiptId || '', submittedAt: meta.submittedAt || '', timezone: meta.timezone || Sx.META.timezone, shareEmail: DRIVE.shareEmail },
      student: { account: a.student.account, name: a.student.name },
      work: w, sections: sections, overflowFlows: [], drive: dr, gaps: gaps, completeness: cp, raw: a, legacy: false, v31: true, links: [], attachments: []
    };
  }
  var EXPORT_TABS31 = [
    { id: 'business31', name: '經營項目', headers: ['回執編號', '本名', '項目名稱', '行業大類', '行業小類', '經營階段', '收入來源', '主要收入', '其他身分或工作', '工作項目', '優先移交 1', '優先移交 2', '優先移交 3'] },
    { id: 'steps31', name: '實際步驟', headers: ['回執編號', '本名', '案例', '目前沒有', '客人來源', '成交管道', '成交週期', '對象職位／任務名稱', '序號', '步驟', '使用工具'] },
    { id: 'authority31', name: '權限規則', headers: ['回執編號', '本名', '事項', '決定方式', '請示對象'] },
    { id: 'resources31', name: '資源清單', headers: ['回執編號', '本名', '類型', '分組', '項目', '來源或歸屬', '網址', '用途', '狀態', '預計用途', '目前進度', '負責對象'] },
    { id: 'building31', name: '建置中與規劃中', headers: ['回執編號', '本名', '類型', '分組', '項目', '狀態', '預計用途', '目前進度', '負責對象', '網址'] },
    { id: 'place31', name: '放入資料', headers: ['回執編號', '本名', '序號', '分類資料夾', '來源', '檔案數', '捷徑數', '網址數', '資料夾連結', '檔案名稱', '檔案或網址連結'] }
  ];
  /** 3.1 匯出列（含可點資料夾與檔案連結；每個檔案一列，無檔案的分類一列） */
  function exportRows31(labeled, ix) {
    var rows = { business31: [], steps31: [], authority31: [], resources31: [], building31: [], place31: [] };
    var id = ix.receiptId, nm = ix.name, a = labeled.raw, w = labeled.work;
    var sec = function (sid) { return labeled.sections.filter(function (s) { return s.id === sid; })[0]; };
    var h = w.handover || [];
    var dutyLabels = (sec('duties') || { items: [] }).items;
    rows.business31.push([id, nm, w.name, w.industryMain, w.industrySub || (w.industryCode === 'X' ? w.industryLabel : ''), w.stageLabel, w.incomes.map(function (x) { return x.label; }).join('、'), w.mainIncome ? w.mainIncome.label : '', w.otherRoles || (w.otherRolesNone ? '目前沒有' : ''), dutyLabels.join('、'), h[0] || '', h[1] || '', h[2] || '']);
    (sec('steps') || { cases: [] }).cases.forEach(function (c) {
      var hd = function (k) { var f = (c.head || []).filter(function (x) { return x.id === k; })[0]; return f ? f.display : ''; };
      var who = c.id === 'lead' ? hd('role') : c.id === 'task' ? hd('name') : '';
      if (c.none || !c.stages.length) { rows.steps31.push([id, nm, c.label, c.none ? '是' : '', hd('sources'), hd('channels'), hd('cycle'), who, '', c.none ? c.noneLabel : '', '']); return; }
      c.stages.forEach(function (st) { rows.steps31.push([id, nm, c.label, '', hd('sources'), hd('channels'), hd('cycle'), who, st.order, st.name, st.tools.join('、')]); });
    });
    var au = sec('authority');
    if (au) au.items.forEach(function (it) { rows.authority31.push([id, nm, it.label, it.modeLabel, it.mode === 'ask' ? au.askDisplay : '']); });
    var rs = sec('resources');
    if (rs) {
      rs.data.groups.forEach(function (g) { g.items.forEach(function (it) { rows.resources31.push([id, nm, '資料', g.label, it.label, it.sourceLabel, '', '', '', '', '', '']); }); });
      ((rs.data && rs.data.noneGroups) || []).forEach(function (g) { g.items.forEach(function (it) { rows.resources31.push([id, nm, '資料', g.label, it.label, '', '', '', '沒有', '', '', '']); }); });
      if (!rs.sites.length && rs.sitesNone) rows.resources31.push([id, nm, '網站帳號', '', '目前沒有網站帳號', '', '', '', '目前沒有', '', '', '']);
      rs.sites.forEach(function (s) { rows.resources31.push([id, nm, '網站帳號', '', s.platform, s.ownerLabel, s.url, s.uses.join('、'), s.statusLabel || '', s.plannedUse || '', s.progress || '', s.planOwnerLabel || '']); });
      rs.tools.groups.forEach(function (g) { g.items.forEach(function (it) { rows.resources31.push([id, nm, '工具系統', g.label, it.label, it.sourceLabel, '', '', it.statusLabel || '', it.plannedUse || '', it.progress || '', it.planOwnerLabel || '']); }); });
      ((rs.tools && rs.tools.noneGroups) || []).forEach(function (g) { rows.resources31.push([id, nm, '工具系統', g.label, '目前沒有', '', '', '', '目前沒有', '', '', '']); });
      (rs.building || []).forEach(function (b) { rows.building31.push([id, nm, b.typeLabel, b.group, b.label, b.statusLabel, b.plannedUse, b.progress, b.ownerLabel, b.url]); });
    }
    var pl = sec('place');
    if (pl) pl.items.forEach(function (it, i) {
      var base = [id, nm, i + 1, it.folderName, it.kind === 'tool' ? (it.groupLabel || '工具系統') + '・' + it.sourceLabel : it.sourceLabel, it.count == null ? '' : it.count, it.shortcuts || 0, it.linkCount || 0, it.folderUrl];
      var links = it.links || [];
      if (!it.files.length && !links.length) { rows.place31.push(base.concat(['', ''])); return; }
      it.files.forEach(function (f) { rows.place31.push(base.concat([f.name, f.url])); });
      links.forEach(function (l) { rows.place31.push(base.concat([(l.name || l.url) + '（網址）', l.url])); });
    });
    return rows;
  }
  /** 補件 section 類（3.1）：ref 為 business／duties／steps／authority／resources（整區取代） */
  function applySupplementPatch31(raw, item, patch) {
    var ref = String((item && item.ref) || '');
    var keys = ['business', 'duties', 'steps', 'authority', 'resources'];
    if (keys.indexOf(ref) < 0 || !patch || typeof patch !== 'object' || !patch[ref] || typeof patch[ref] !== 'object') return { ok: true, answers: raw, changed: [] };
    var a = JSON.parse(JSON.stringify(raw));
    a[ref] = patch[ref];
    var norm = normalizeAnswers31(a);
    var problem = checkSubmission31(norm, []);
    if (problem) return { ok: false, message: problem.message, problem: problem };
    return { ok: true, answers: norm, changed: [ref] };
  }
  /** 前台用：3.1 固定頁序（流程不再動態） */
  function sectionsFor31() { return SECTIONS31.map(function (s) { return { id: s.id, label: s.label, kind: s.kind, icon: s.icon, desc: s.desc }; }); }
  /** 前台不得出現的內部用語（送出前自檢、e2e 共用） */
  var BANNED_FRONT_TERMS = ['完整版', '快速版', '模組', '推導', '有做', '沒做', '缺口', '尚未具備', '諮詢可提供', '流程頁組成', '人工處理', '系統自動', '當舖'];

  /* ------------------------------------------------------------------ */
  /* 3.2 學員詳情快照（學院後台同步書籤 → student_sync；資料中心與 mock 共用）     */
  /* ------------------------------------------------------------------ */
  /**
   * 快照只收彙總結果與白名單欄位（不收身分證、電話、地址、LINE ID、IG、Zoom 等）；生日只供管理員 action 回傳。
   * 清單摘要四區（校長決定）：正課區、案例專區、AI應用專區、私享專場；專區「已購／總數」分母含已下架課程。
   */
  var STUDENT = {
    version: 1,
    summaryZones: ['正課區', '案例專區', 'AI應用專區', '私享專場'],
    maxZones: 30, maxCourses: 300, maxPurchases: 30, maxPast: 20, maxLevelHistory: 20, maxPlanTasks: 40, maxPlanHistory: 30, weeks: 8,
    maxBatch: 50, maxSnapshotChars: 45000,
    sourceRe: /^https:\/\/(www\.)?graceschool\.com\.tw(\/|$)/
  };
  function stDate(v) {
    var x = cleanStr(v, 40);
    var m = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/.exec(x);
    return m ? m[1] + '.' + pad2(+m[2]) + '.' + pad2(+m[3]) : '';
  }
  function stTime(v) {
    var x = cleanStr(v, 40);
    var m = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(x);
    if (!m) return '';
    return m[1] + '.' + pad2(+m[2]) + '.' + pad2(+m[3]) + (m[4] != null ? ' ' + pad2(+m[4]) + ':' + m[5] : '');
  }
  function stNum(v, min, max) { var n = Number(v); if (!isFinite(n)) return 0; if (min != null && n < min) n = min; if (max != null && n > max) n = max; return Math.round(n * 100) / 100; }
  function stInt(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? Math.min(n, 100000) : 0; }
  /** 快照正規化（白名單；資料中心寫入前、mock 共用）：回傳新物件；格式不符回 null */
  function normalizeStudentSnapshot(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    var pf = x.profile && typeof x.profile === 'object' ? x.profile : {};
    var lv = pf.level && typeof pf.level === 'object' ? pf.level : {}, pt = pf.points && typeof pf.points === 'object' ? pf.points : {};
    var out = { v: STUDENT.version };
    out.profile = {
      level: { code: cleanStr(lv.code, 20), name: cleanStr(lv.name, 20), expireAt: stDate(lv.expireAt) },
      status: cleanStr(pf.status, 4).toUpperCase(), points: { balance: stNum(pt.balance, -1e9, 1e9), expireAt: stDate(pt.expireAt) },
      registeredAt: stDate(pf.registeredAt), lastLoginAt: stTime(pf.lastLoginAt), birthday: stDate(pf.birthday)
    };
    out.zones = arrOf(x.zones).slice(0, STUDENT.maxZones).map(function (z) {
      if (!z || typeof z !== 'object') return null;
      var name = cleanStr(z.name, 30); if (!name) return null;
      var courses = arrOf(z.courses).slice(0, STUDENT.maxCourses).map(function (c) {
        if (!c || typeof c !== 'object') return null;
        var t = cleanStr(c.title, 80); if (!t) return null;
        var co = { title: t, onShelf: c.onShelf !== false, count: stInt(c.count), lastAt: stDate(c.lastAt) }, cid = stId(c.id); if (cid) co.id = cid;   // 3.2.6 官網 pro_id
        return co;
      }).filter(Boolean);
      var total = courses.length ? courses.length : stInt(z.total), bought = courses.length ? courses.filter(function (c) { return c.count > 0; }).length : Math.min(stInt(z.bought), total || stInt(z.bought));
      var last = courses.reduce(function (m, c) { return c.lastAt > m ? c.lastAt : m; }, stDate(z.lastAt));
      return { name: name, bought: bought, total: total, offShelf: courses.filter(function (c) { return !c.onShelf; }).length, lastAt: last, onShelf: z.onShelf !== false, courses: courses };
    }).filter(Boolean);
    out.purchases = arrOf(x.purchases).slice(0, STUDENT.maxPurchases).map(function (p) { if (!p || typeof p !== 'object') return null; var t = cleanStr(p.title, 80); if (!t) return null; return { at: stTime(p.at), title: t, points: stNum(p.points, -1e9, 1e9) }; }).filter(Boolean);
    out.pointsSpent = stNum(x.pointsSpent, 0, 1e10);
    var sp = x.studyPlan && typeof x.studyPlan === 'object' ? x.studyPlan : {}, cur = sp.current && typeof sp.current === 'object' ? sp.current : null;
    out.studyPlan = {
      current: cur ? stPlan(cur, true) : null,
      history: arrOf(sp.history).slice(0, STUDENT.maxPlanHistory).map(function (h) { return h && typeof h === 'object' ? stPlan(h, false) : null; }).filter(Boolean)
    };
    if (out.studyPlan.current) { var ts = out.studyPlan.current.tasks; out.studyPlan.current.done = ts.filter(function (t) { return t.done; }).length; out.studyPlan.current.total = ts.length; }
    var st = x.study && typeof x.study === 'object' ? x.study : {};
    out.study = { weeks: arrOf(st.weeks).slice(0, STUDENT.weeks).map(function (w) { return w && typeof w === 'object' ? { start: stDate(w.start), hours: stNum(w.hours, 0, 168) } : null; }).filter(function (w) { return w && w.start; }), totalHours: stNum(st.totalHours, 0, 1e6) };
    out.study.recentHours = Math.round(out.study.weeks.reduce(function (n, w) { return n + w.hours; }, 0) * 10) / 10;
    var cs = x.counsels && typeof x.counsels === 'object' ? x.counsels : {}, nx = cs.next && typeof cs.next === 'object' ? cs.next : null, cc = cs.counts && typeof cs.counts === 'object' ? cs.counts : {};
    out.counsels = {
      next: nx && stTime(nx.at) ? stCounselNext(nx) : null,
      past: arrOf(cs.past).slice(0, STUDENT.maxPast).map(function (p) { if (!p || typeof p !== 'object' || !stTime(p.at)) return null; return { at: stTime(p.at), title: cleanStr(p.title, 80), minutes: stInt(p.minutes) }; }).filter(Boolean),
      counts: { confirmed: stInt(cc.confirmed), pending: stInt(cc.pending), total: stInt(cc.total) }
    };
    out.levelHistory = arrOf(x.levelHistory).slice(0, STUDENT.maxLevelHistory).map(function (h) { if (!h || typeof h !== 'object') return null; return { at: stDate(h.at), from: cleanStr(h.from, 20), to: cleanStr(h.to, 20) }; }).filter(function (h) { return h && (h.from || h.to); });
    out.errors = {};
    if (x.errors && typeof x.errors === 'object') Object.keys(x.errors).slice(0, 12).forEach(function (k) { if (/^[A-Za-z]{1,20}$/.test(k)) out.errors[k] = cleanStr(x.errors[k], 80); });
    out.unmapped = strList(x.unmapped, 20, 40);
    // 單格上限：課程清單過長時先截短
    var sz = JSON.stringify(out).length;
    if (sz > STUDENT.maxSnapshotChars) { out.zones.forEach(function (z) { z.courses = z.courses.slice(0, 60); z.coursesTruncated = true; }); }
    if (JSON.stringify(out).length > STUDENT.maxSnapshotChars) out.studyPlan.history.forEach(function (h) { if (h.tasks) { h.taskCount = h.tasks.length; h.tasksDone = h.tasks.filter(function (t) { return t.done; }).length; delete h.tasks; } });   // 3.2.6 仍過大：歷次課表只留堂數
    return out;
  }
  /* 3.2.6 快照輔助：官網 ID、課表（本期與歷次共用格式）、下次諮詢（方式、地點、連結、備註） */
  function stId(v) { var x = cleanStr(v, 20); return /^[\w-]{1,20}$/.test(x) ? x : ''; }
  function stPlanTask(t) {
    if (!t || typeof t !== 'object') return null;
    var ti = cleanStr(t.title, 80); if (!ti) return null;
    var o = { title: ti, zone: cleanStr(t.zone, 30), dueAt: stDate(t.dueAt), state: cleanStr(t.state, 20), done: t.done === true }, id = stId(t.id), ba = stDate(t.boughtAt);
    if (id) o.id = id; if (ba) o.boughtAt = ba;
    return o;
  }
  function stPlan(p, isCur) {
    var o = { startAt: stDate(p.startAt), state: cleanStr(p.state, 20) };
    var id = stId(p.id), ap = stDate(p.appliedAt), ca = stDate(p.completedAt), du = stDate(p.dueAt), ss = cleanStr(p.siteState, 20).toLowerCase();
    if (id) o.id = id; if (ap) o.appliedAt = ap; if (ca) o.completedAt = ca; if (du) o.dueAt = du; if (ss) o.siteState = ss;
    if (isCur || Array.isArray(p.tasks)) o.tasks = arrOf(p.tasks).slice(0, STUDENT.maxPlanTasks).map(stPlanTask).filter(Boolean);
    if (isCur) { o.done = o.tasks.filter(function (t) { return t.done; }).length; o.total = o.tasks.length; }
    return o;
  }
  function stCounselNext(nx) {
    var o = { at: stTime(nx.at), title: cleanStr(nx.title, 80), status: cleanStr(nx.status, 20) }, url = cleanStr(nx.url, 500);
    if (/^https:\/\/[^\s"'<>]+$/.test(url)) o.url = url;
    var md = cleanStr(nx.mode, 20), pl = cleanStr(nx.place, 60), nt = cleanStr(nx.note, 200);
    if (md) o.mode = md; if (pl) o.place = pl; if (nt) o.note = nt;
    return o;
  }
  /**
   * 3.2.6 學員詳情理想結構（docs/STUDENT-DETAIL-DATA.md；student_detail 回應頂層欄位）：
   *   { profile, zones:[{ name, total, bought, truncated?, courses:[{ id, name, status, bought, lastBoughtAt, count }] }], purchases, pointsSpent,
   *     plans:[{ id, appliedAt, startAt, endAt, dueAt, completedAt, siteState, items:[{ id, name, zone, bought, boughtAt, dueAt }] }], watch:{ totalHours, weeks }, counsels }
   *   專區只列四區；正課區子分類已由書籤歸併；已下架又沒買過的課程不列入。
   */
  function studentIdeal(snap) {
    if (!snap) return null;
    var zones = STUDENT.summaryZones.map(function (n) {
      var z = (snap.zones || []).filter(function (x) { return x.name === n; })[0];
      if (!z) return { name: n, total: 0, bought: 0, courses: [] };
      var cs = (z.courses || []).filter(function (c) { return c.onShelf || c.count > 0; }).map(function (c, i) { return { id: c.id || (n + '#' + i), name: c.title, status: c.onShelf ? 'listed' : 'delisted', bought: c.count > 0, lastBoughtAt: c.lastAt || '', count: c.count }; });
      var o = { name: n, total: z.total, bought: z.bought, courses: cs }; if (z.coursesTruncated) o.truncated = true;
      return o;
    });
    var sp = snap.studyPlan || {}, plans = [];
    var toPlan = function (p, idx) {
      var items = (p.tasks || []).map(function (t, i) { return { id: t.id || ('p' + idx + 'i' + i), name: t.title, zone: t.zone || '', bought: !!t.done, boughtAt: t.boughtAt || '', dueAt: t.dueAt || '' }; });
      var due = p.dueAt || items.reduce(function (m, t) { return t.dueAt > m ? t.dueAt : m; }, '');
      var o = { id: p.id || ('p' + idx), appliedAt: p.appliedAt || p.startAt || '', startAt: p.startAt || p.appliedAt || '', endAt: due, dueAt: due, completedAt: p.completedAt || '', siteState: p.siteState || p.state || '', items: items };
      if (!p.tasks && p.taskCount != null) { o.taskCount = p.taskCount; o.tasksDone = p.tasksDone || 0; }
      return o;
    };
    if (sp.current) plans.push(toPlan(sp.current, 0));
    (sp.history || []).forEach(function (h, i) { plans.push(toPlan(h, i + 1)); });
    plans.sort(function (a, b) { return a.appliedAt < b.appliedAt ? 1 : a.appliedAt > b.appliedAt ? -1 : 0; });
    var st = snap.study || {};
    return { profile: snap.profile, zones: zones, purchases: snap.purchases || [], pointsSpent: snap.pointsSpent || 0, plans: plans,
      watch: { totalHours: st.totalHours || 0, weeks: (st.weeks || []).slice() }, counsels: snap.counsels || { next: null, past: [], counts: { confirmed: 0, pending: 0, total: 0 } } };
  }
  /** 剩餘天數（yyyy.mm.dd，台北日界）；無日期回 null */
  function studentDaysLeft(dateStr, nowMs) {
    var m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(dateStr || ''));
    if (!m) return null;
    var end = Date.UTC(+m[1], +m[2] - 1, +m[3]) - 8 * 3600000, t = new Date((nowMs == null ? Date.now() : nowMs) + 8 * 3600000);
    var today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 8 * 3600000;
    return Math.round((end - today) / 86400000);
  }
  /** 清單摘要（student_summary 每列）：四區已購／總數、級別、點數、進修時數、生日 */
  function studentSummary(snap, nowMs) {
    if (!snap) return null;
    var zones = {};
    STUDENT.summaryZones.forEach(function (n) { var z = snap.zones.filter(function (x) { return x.name === n; })[0]; zones[n] = z ? { bought: z.bought, total: z.total } : null; });
    var p = snap.profile;
    return { level: p.level.code, levelName: p.level.name || p.level.code, levelExpireAt: p.level.expireAt, levelDaysLeft: studentDaysLeft(p.level.expireAt, nowMs), status: p.status,
      points: p.points.balance, pointsExpireAt: p.points.expireAt, registeredAt: p.registeredAt, lastLoginAt: p.lastLoginAt, birthday: p.birthday,
      zones: zones, studyHours8w: snap.study.recentHours, totalHours: snap.study.totalHours,
      nextCounsel: snap.counsels.next ? snap.counsels.next.at : '', planState: snap.studyPlan.current ? snap.studyPlan.current.state : '' };
  }
  /** 學員詳情（student_detail 用）：快照＋剩餘天數 */
  function studentDetailView(snap, nowMs) {
    if (!snap) return null;
    var o = JSON.parse(JSON.stringify(snap));
    o.profile.level.daysLeft = studentDaysLeft(o.profile.level.expireAt, nowMs);
    o.profile.points.daysLeft = studentDaysLeft(o.profile.points.expireAt, nowMs);
    o.summary = studentSummary(snap, nowMs);
    return o;
  }

  /* ------------------------------------------------------------------ */
  /* 3.2.5 品牌標誌、制度與權益、資源清單作答（新增函式；既有函式不變）            */
  /* ------------------------------------------------------------------ */
  var BRAND_LOGO_ID31 = 'brand_logo', BRAND_LOGO_GROUP31 = 'logo';
  /**
   * 有自己的品牌：business.brandOwn==='yes' 或填了 business.brandName（前台原始答案）。
   * 正規化後的答案（目前 normalizeAnswers31 不保留這兩欄）→ 以 resources.data.brand_logo 有作答（有／還沒有設計）判定。
   */
  function brandOwned31(a) {
    var b = (a && a.business) || {};
    if (b.brandOwn === 'yes' || cleanStr(b.brandName, 40)) return true;
    if (b.brandOwn === 'no') return false;
    var e = getPath(a, 'resources.data.' + BRAND_LOGO_ID31);
    return !!(e && (e.has === true || e.has === false));
  }
  /** 條件分組（model3 v31.resources.data[i].when）是否適用此份答案；無 when＝一律適用 */
  function dataGroupApplies31(a, g) { return !!g && (!g.when || (g.when === 'brand' && brandOwned31(a))); }
  /** 品牌欄位正規化（供 normalizeAnswers31 合併保存）：{ brandOwn:'yes'|'no'|'', brandName（≤ 40） } */
  function normalizeBrand31(a) {
    var b = (a && a.business) || {}, own = b.brandOwn === 'yes' || b.brandOwn === 'no' ? b.brandOwn : '', nm = cleanStr(b.brandName, 40);
    if (nm && !own) own = 'yes';
    if (own === 'no') nm = '';
    return { brandOwn: own, brandName: nm };
  }
  /**
   * 品牌標誌狀態（前台、後台、PDF 共用）：
   * { required, answered, has, logoPending, folderKey:'brand_logo', groupId:'logo', brandOwn, brandName }
   * logoPending＝需要品牌標誌且選「還沒有設計」（resources.data.brand_logo.has===false；前台另寫 logoPending:true）
   */
  function brandLogoState31(a) {
    var e = getPath(a, 'resources.data.' + BRAND_LOGO_ID31) || null, req = brandOwned31(a), nb = normalizeBrand31(a);
    var has = !!(e && e.has === true), no = !!(e && e.has === false);
    return { required: req, answered: req && (has || no), has: req && has, logoPending: req && no, folderKey: BRAND_LOGO_ID31, groupId: BRAND_LOGO_GROUP31, brandOwn: nb.brandOwn || (req ? 'yes' : ''), brandName: nb.brandName };
  }
  /** 資源清單資料項目作答統計（不適用的條件分組不計）：{ total, answered, unanswered:[{ id, label, groupId, groupLabel, required }] } */
  function dataAnswerStats31(a) {
    var d = getPath(a, 'resources.data') || {}, out = { total: 0, answered: 0, unanswered: [] };
    V31().resources.data.forEach(function (g) {
      if (!dataGroupApplies31(a, g)) return;
      g.items.forEach(function (it) {
        out.total++;
        var e = d[it.id];
        if (e && (e.has === true || e.has === false)) out.answered++;
        else out.unanswered.push({ id: it.id, label: it.label, groupId: g.id, groupLabel: g.label, required: !!g.required });
      });
    });
    return out;
  }
  /** 置頂的資料項目 id（model3 pinTop 分組；目前為品牌標誌） */
  function pinTopDataIds31() {
    var out = [];
    V31().resources.data.forEach(function (g) { if (g.pinTop) g.items.forEach(function (it) { out.push(it.id); }); });
    return out;
  }
  /** 依 pinTop 置頂（穩定排序，不改原陣列）：list 的元素以 key（預設 itemId，其次 id）辨識 */
  function sortPinTop31(list, key) {
    var top = pinTopDataIds31(), k = key || null;
    var idOf = function (x) { return x == null ? '' : typeof x === 'string' ? x : k ? x[k] : (x.itemId != null ? x.itemId : x.id); };
    var arr = (list || []).slice();
    return arr.filter(function (x) { return top.indexOf(idOf(x)) >= 0; }).concat(arr.filter(function (x) { return top.indexOf(idOf(x)) < 0; }));
  }
  /**
   * 3.2.5 前台作答規則：answerRules31 去除不適用的條件分組（未表示有品牌時不問品牌標誌），
   * 加上「自有品牌」題（未選擇；選「有」未填品牌名稱）；品牌標誌未作答改用專屬訊息。回傳 [{ path, label, message }]
   */
  function answerRules325(a) {
    a = a || {};
    var v = V31(), bc = v.brand || { label: '自有品牌', nameLabel: '品牌名稱' }, skip = {};
    v.resources.data.forEach(function (g) { if (!dataGroupApplies31(a, g)) skip['resources.dataGroup.' + g.id] = 1; });
    var b = a.business || {}, extra = [], nm = cleanStr(b.brandName, 40);
    if (b.brandOwn !== 'yes' && b.brandOwn !== 'no' && !nm) extra.push({ path: 'business.brandOwn', label: bc.label, message: '請選擇是否有自己的品牌' });
    else if (b.brandOwn === 'yes' && !nm) extra.push({ path: 'business.brandName', label: bc.nameLabel, message: '請填寫品牌名稱' });
    var out = answerRules31(a).filter(function (m) { return !skip[m.path]; }).map(function (m) {
      return m.path === 'resources.dataGroup.' + BRAND_LOGO_GROUP31 ? { path: m.path, label: '品牌標誌', message: '品牌標誌：請選擇「有」並放入檔案，或勾選「還沒有設計」' } : m;
    });
    return extra.concat(out);
  }

  /* ------------------------------------------------------------------ */
  /* 區塊導覽（前台進度）                                                   */
  /* ------------------------------------------------------------------ */
  /** 依答案排出前台區塊順序（流程頁依規劃展開）：[{ id, label, kind, icon, flowKey?, mode? }] */
  function sectionsFor3(answers) {
    if (isV31(answers)) return sectionsFor31();
    var out = [];
    SECTIONS3.forEach(function (s) {
      if (!s.dynamic) { out.push({ id: s.id, label: s.label, kind: s.kind, icon: s.icon, desc: s.desc || '' }); return; }
      planFlows(answers).pages.forEach(function (t) { out.push({ id: t.sectionId, label: t.label, kind: 'flow', icon: t.icon, desc: t.desc, flowKey: t.key, mode: t.mode, modeLabel: t.mode === 'full' ? '完整版' : '快速版' }); });
    });
    return out;
  }
  function sectionLabel3(id) {
    var sec = byId(SECTIONS3, id) || byId(SECTIONS31, id);
    if (sec) return sec.label;
    var m = /^flow([1-3])$/.exec(String(id || ''));
    return m ? '流程頁 ' + m[1] : '';
  }

  return {
    VERSION: VERSION,
    FLOW_LIMITS: FLOW_LIMITS,
    FLOW_MODES: FLOW_MODES,
    QUIZ_FIELDS: QUIZ_FIELDS,
    QUIZ_MODULE: QUIZ_MODULE,
    MODULE_QUIZ: MODULE_QUIZ,
    MODULE_ITEM_CAP: MODULE_ITEM_CAP,
    DRIVE: DRIVE,
    SUPPLEMENT: SUPPLEMENT,
    STATUS_SUPPLEMENT: STATUS_SUPPLEMENT,
    SECTIONS3: SECTIONS3,
    MAIN_WORK_FIELDS: MAIN_WORK_FIELDS,
    INCOME_FIELDS: INCOME_FIELDS,
    EXPORT_TABS3: EXPORT_TABS3,
    get EXPORT_TABS_ALL() { return exportTabsAll(); },
    exportTabsAll: exportTabsAll,
    model: M,
    industryList: industryList,
    industryById: industryById,
    industryLabel: industryLabel,
    incomeSourcesFor: incomeSourcesFor,
    incomeById: incomeById,
    selectedIncomes: selectedIncomes,
    mainIncome: mainIncome,
    moduleById: moduleById,
    superiorById: superiorById,
    performTypeById: performTypeById,
    quizPrefill: quizPrefill,
    deriveModules: deriveModules,
    hasModule: hasModule,
    superiorTerm: superiorTerm,
    termReplace: termReplace,
    itemDef: itemDef,
    checklistFor: checklistFor,
    checklistItem: checklistItem,
    dialogItems: dialogItems,
    rootFolderName: rootFolderName,
    folderPlan: folderPlan,
    missingFolders: missingFolders,
    driveIdFromUrl: driveIdFromUrl,
    flowTemplateFor: flowTemplateFor,
    planFlows: planFlows,
    blankStage3: blankStage3,
    defaultStages3: defaultStages3,
    emptyFlow3: emptyFlow3,
    normalizeFlow3: normalizeFlow3,
    flowSummary3: flowSummary3,
    checkFlows3: checkFlows3,
    emptyAnswers3: emptyAnswers3,
    isLegacy: isLegacy,
    legacyModules: legacyModules,
    legacyChecklist: legacyChecklist,
    normalizeAnswers3: normalizeAnswers3,
    validate3: validate3,
    checkSubmission3: checkSubmission3,
    computeGaps3: computeGaps3,
    gapCount3: gapCount3,
    dataCompleteness: dataCompleteness,
    profileFieldsFor: profileFieldsFor,
    workSummary: workSummary,
    brandText3: brandText3,
    buildLabeledData3: buildLabeledData3,
    driveSummary: driveSummary,
    exportRows3: exportRows3,
    normalizeSupplementItems: normalizeSupplementItems,
    supplementStatus: supplementStatus,
    supplementStatusLabel: supplementStatusLabel,
    renderSupplementNotice: renderSupplementNotice,
    supplementLink: supplementLink,
    normalizeSupplementContent: normalizeSupplementContent,
    applySupplementPatch: applySupplementPatch,
    SUPP_FILE: SUPP_FILE,   // 3.3.8 補件附檔與回傳
    suppFileExt: suppFileExt,
    suppFileOk: suppFileOk,
    suppFileMime: suppFileMime,
    suppFileName: suppFileName,
    normalizeSupplementFile: normalizeSupplementFile,
    suppFileDeadline: suppFileDeadline,
    supplementFileOpen: supplementFileOpen,
    suppDlToken: suppDlToken,
    suppDlParse: suppDlParse,
    suppDlUrl: suppDlUrl,
    supplementFilePublic: supplementFilePublic,
    flowPagesAll: flowPagesAll,
    sectionsFor3: sectionsFor3,
    sectionLabel3: sectionLabel3,
    // 3.1 作業結構
    VERSION31: VERSION31,
    SECTIONS31: SECTIONS31,
    EXPORT_TABS31: EXPORT_TABS31,
    BANNED_FRONT_TERMS: BANNED_FRONT_TERMS,
    v31: V31,
    isV31: isV31,
    pageLabel31: pageLabel31,
    industry31List: industry31List,
    industry31ByCode: industry31ByCode,
    industry31Label: industry31Label,
    incomes31: incomes31,
    income31Label: income31Label,
    stage31Label: stage31Label,
    duty31Label: duty31Label,
    resourceDataItems: resourceDataItems,
    litDataItems: litDataItems,
    folderPlan31: folderPlan31,
    placePlan31: placePlan31,
    uploadToolItems31: uploadToolItems31,
    toolGroupLit31: toolGroupLit31,
    UPLOAD_TOOL_GROUPS31: UPLOAD_TOOL_GROUPS31,
    emptyAnswers31: emptyAnswers31,
    normalizeAnswers31: normalizeAnswers31,
    validate31: validate31,
    answerRules31: answerRules31,
    noneFields31: noneFields31,
    placementIssues31: placementIssues31,
    checkSubmission31: checkSubmission31,
    computeGaps31: computeGaps31,
    dataCompleteness31: dataCompleteness31,
    workSummary31: workSummary31,
    buildLabeledData31: buildLabeledData31,
    legacyNoneFill31: legacyNoneFill31,
    exportRows31: exportRows31,
    buildingList31: buildingList31,
    statusLabel31: statusLabel31,
    plannedOwnerLabel31: plannedOwnerLabel31,
    webUrl: webUrl,
    applySupplementPatch31: applySupplementPatch31,
    sectionsFor31: sectionsFor31,
    // 3.2.5 品牌標誌、制度與權益、資源清單作答（前台）
    BRAND_LOGO_ID31: BRAND_LOGO_ID31,
    brandOwned31: brandOwned31,
    dataGroupApplies31: dataGroupApplies31,
    normalizeBrand31: normalizeBrand31,
    brandLogoState31: brandLogoState31,
    dataAnswerStats31: dataAnswerStats31,
    pinTopDataIds31: pinTopDataIds31,
    sortPinTop31: sortPinTop31,
    answerRules325: answerRules325,
    // 3.2 學員詳情快照
    STUDENT: STUDENT,
    normalizeStudentSnapshot: normalizeStudentSnapshot,
    studentIdeal: studentIdeal,
    studentSummary: studentSummary,
    studentDetailView: studentDetailView,
    studentDaysLeft: studentDaysLeft
  };
});
