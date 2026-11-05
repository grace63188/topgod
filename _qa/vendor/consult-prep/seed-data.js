/*
 * 離線示範作業資料（3.0／3.1）：3 份 3.0（自媒體業配為主、美業店主、保險業務）＋1 份 2.x 舊格式（經銷合作，相容示範）＋1 份 3.1 作業結構（林雅婷 保險業務）
 * 輸出：window.CONSULT_MOCK_SEED（瀏覽器）／module.exports（Node）
 * 每筆 { answers, files:[{key,name,size,mime,base64}], status, email, durationMin, drive?:{ ownerEmail, counts:{ itemId: 檔案數 | { count, shortcuts } } } }
 * 另附 roster（示範名冊）、progress（已開始未送出）、batch（官方關注名單）、supplement（示範補件需求）屬性；
 * legacySet：2.x 三份示範（CONSULT_CONFIG.mockSeedSet='legacy' 時載入，供舊資料相容測試）。
 */
(function (root, factory) {
  var seed = factory(root);
  root.CONSULT_MOCK_SEED = seed;
  if (typeof module === 'object' && module && module.exports) module.exports = seed;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // 1×1 PNG（示範附件）
  var PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  function png(key, name) { return { key: key, name: name, size: 68, mime: 'image/png', base64: PNG }; }

  /**
   * 流程步驟（2.2 有序陣列）：
   *   T(id, handling, steps, tools, opt)  模板步驟、有做法（opt.name 改名、opt.status 覆寫狀態）
   *   NONE(id)／NA(id)／BLANK(id)          模板步驟：尚無做法／不適用／未填寫
   *   C(id, name, handling, steps, tools)  自訂步驟（handling 傳 'none' 時為尚無做法）
   * 使用工具以快選陣列 tools ＋ 自填 toolsOther 保存；schema 未載入時保留字串，由 normalizeAnswers 相容拆解。
   */
  var S = root.CONSULT_SCHEMA || (typeof require === 'function' ? (function () { try { return require('../src/schema.js'); } catch (e) { return null; } })() : null);
  function tl(tools) { return S && S.stageTools ? S.stageTools({ tools: tools || '' }) : { tools: tools || '', toolsOther: '' }; }
  function T(id, handling, steps, tools, opt) {
    var t = tl(tools);
    opt = opt || {};
    return { id: id, template: true, name: opt.name || '', status: 'doing', handling: handling || '', steps: steps || [], tools: t.tools, toolsOther: t.toolsOther };
  }
  function mark(id, status) { return { id: id, template: true, name: '', status: status, handling: '', steps: [], tools: [], toolsOther: '' }; }
  function NONE(id) { return mark(id, 'none'); }
  function NA(id) { return mark(id, 'na'); }
  function BLANK(id) { return mark(id, ''); }
  function C(id, name, handling, steps, tools) {
    if (handling === 'none') return { id: id, template: false, name: name, status: 'none', handling: '', steps: [], tools: [], toolsOther: '' };
    var t = tl(tools);
    return { id: id, template: false, name: name, status: 'doing', handling: handling || '', steps: steps || [], tools: t.tools, toolsOther: t.toolsOther };
  }
  /** 資料上傳類別 */
  function yes(note, links) { return { status: 'yes', note: note || '', links: links || [] }; }
  function no() { return { status: 'no', note: '', links: [] }; }
  function link(url, note) { return { url: url, note: note || '' }; }

  /* ---------------- 1 美業經營者 ---------------- */
  var beautyOwner = {
    status: '已讀',
    email: 'grace.lin88@gmail.com',
    durationMin: 1560,   // 1 天 2 小時
    answers: {
      student: { account: 'grace_lin88', name: '林雅庭' },
      role: { id: 'owner', hasDownline: '' },
      profile: {
        industry: '美業', industryOther: '', brand: '庭 Lash & Brow', company: '', title: '',
        business: '美睫嫁接與霧眉，另販售睫毛保養液', serviceMode: ['一對一', '店面'], scale: '含助理', headcount: ''
      },
      uploads: {
        brand: yes('IG 與 Google 商家皆有經營', [link('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp', '作品集原檔')]),
        reception: yes('LINE 歡迎訊息已設定，常見問答尚未整理'),
        sales: yes('價目表每季更新'),
        marketing: no(),
        delivery: yes('服務流程只有紙本筆記'),
        crm: yes('客戶名單在紙本登記簿，消費紀錄寫在客戶卡'),
        rules: yes('取消改期規則寫在 LINE 自動回覆；付款規則與保固為口頭說明'),
        team: yes('排班用 LINE 群公告，抽成手算'),
        training: yes('', [link('https://drive.google.com/file/d/1TrainVideo2026/view', '新人嫁接示範錄影')]),
        meetings: no(),
        misc: no()
      },
      customerFlow: {
        target: 'external',
        stages: [
          T('discover', 'partial', ['IG 作品貼文', '舊客介紹', 'Google 地圖搜尋'], 'IG、Google 商家'),
          T('contact', 'partial', ['客人 LINE 私訊', '自動回覆傳價目表圖片', '詢問需求'], 'LINE 官方帳號', { name: '私訊詢問' }),
          T('quote', 'manual', ['依需求說明方案', '傳價目表'], 'LINE'),
          T('booking', 'manual', ['詢問時段', '翻看紙本登記簿', '回覆確認', '手寫登記'], 'LINE、紙本登記簿'),
          C('c_deposit', '收取訂金', 'none'),
          T('prep', 'manual', ['前一天傳提醒訊息', '準備材料'], 'LINE'),
          T('service', 'manual', ['確認需求', '施作', '拍成果照'], '手機'),
          T('payment', 'manual', ['現場報價', '轉帳或現金', '手寫記帳'], 'LINE Pay、紙本'),
          T('aftercare', 'auto', ['LINE 官方帳號兩天後自動傳保養提醒'], 'LINE'),
          NONE('repeat')
        ]
      },
      teamFlow: {
        stages: [
          T('recruit', 'manual', ['IG 限動徵人', '同業介紹'], 'IG'),
          T('interview', 'manual', ['面談', '試做一位客人'], ''),
          T('training', 'manual', ['跟著看 3 天', '練習假人頭', '做親友'], ''),
          T('schedule', 'partial', ['每月底排班', 'LINE 群公告'], 'LINE 群、Google 日曆'),
          T('dispatch', 'manual', ['依預約時段指定美睫師'], 'LINE'),
          T('handover', '', ['下班前口頭報告'], ''),
          NA('review'),
          T('payroll', 'manual', ['月底算件數', '手寫計算抽成'], '紙本、計算機')
        ]
      },
      dialog: {
        faq: ['多少錢', '可以維持多久', '會不會痛', '這週有位子嗎', '可以改期嗎'],
        privacyAck: true
      },
      timeSavers: {
        tasks: ['每天逐一回覆價目與時段詢問', '手抄預約到登記簿再抄到記帳表', '月底對帳算抽成']
      }
    },
    files: [
      png('uploads.brand', 'logo.png'),
      png('uploads.sales', 'price-2026.png'),
      png('uploads.reception', 'line-welcome.png'),
      png('uploads.crm', 'client-card.png'),
      png('customerFlow.booking', 'booking-book.png'),
      png('dialog.bookedShots', 'booked-1.png'),
      png('dialog.bookedShots', 'booked-2.png'),
      png('dialog.silentShots', 'silent-1.png')
    ]
  };

  /* ---------------- 2 公司內受僱工程師 ---------------- */
  var employeeEngineer = {
    status: '未讀',
    email: 'kevin.chen@example.com',
    durationMin: 95,
    answers: {
      student: { account: 'kevin_chen', name: '陳冠宇' },
      role: { id: 'employee', hasDownline: '' },
      profile: {
        industry: '工程技術', industryOther: '', brand: '', company: '宏昇系統整合', title: '系統工程師',
        business: '企業與店家的監控系統安裝與年度維護', serviceMode: ['到府', '線上'], scale: '', headcount: ''
      },
      uploads: {
        reception: no(),
        sales: yes('報價由業務處理，本人只提供點位清單'),
        marketing: no(),
        delivery: yes('公司有施工 SOP，勘查表為紙本', [link('https://docs.google.com/document/d/1SopDoc789/edit', '施工 SOP')]),
        crm: no(),
        rules: yes('保固規則寫在合約'),
        training: yes('', [link('https://drive.google.com/drive/folders/1EngTraining', '新人教育訓練資料夾')]),
        meetings: yes('週五填週報'),
        misc: no()
      },
      customerFlow: {
        target: 'both',
        stages: [
          NA('discover'),
          NA('contact'),
          T('quote', 'manual', ['業務轉需求', '到場勘查', '回報點位給業務報價'], 'LINE 群、紙本勘查表', { name: '到場勘查' }),
          T('booking', 'manual', ['業務排定後在群組通知'], 'LINE 群'),
          T('prep', 'manual', ['領料', '確認圖面', '前一天與客人確認'], 'LINE、紙本領料單'),
          T('service', 'manual', ['配線', '安裝', '測試', '教學', '拍照回報'], '手機'),
          C('c_accept', '驗收簽名', 'manual', ['客人在紙本驗收單簽名', '拍照上傳群組'], '紙本、LINE 群'),
          NA('payment'),
          T('aftercare', 'manual', ['客人有問題直接打給本人'], '電話、LINE'),
          C('c_annual', '年度保養通知', 'none'),
          NA('repeat')
        ]
      },
      collabFlow: {
        stages: [
          T('receive', 'manual', ['業務在群組貼需求', '主管指派'], 'LINE 群'),
          T('execute', 'manual', ['依圖面施工', '遇問題拍照問主管'], 'LINE、手機'),
          T('report', 'partial', ['完工拍照貼群組', '週五填週報'], 'LINE 群、Excel'),
          T('handoff', 'manual', ['請假時口頭交接給同事'], ''),
          BLANK('evaluate')
        ]
      },
      dialog: {
        faq: ['什麼時候可以來', '這個可以修嗎', '多久保固', '要不要加錢', '手機怎麼連'],
        privacyAck: true
      },
      timeSavers: {
        tasks: ['勘查表重打成電子檔', '回覆客人手機連線問題', '填週報']
      }
    },
    files: [
      png('uploads.delivery', 'service-record.png'),
      png('collabFlow.report', 'weekly-report.png'),
      png('customerFlow.c_accept', 'acceptance.png'),
      png('dialog.bookedShots', 'chat-1.png')
    ]
  };

  /* ---------------- 3 經銷合作者（有下線） ---------------- */
  var reseller = {
    status: '需補件',
    email: 'mei.wang.soulmate@gmail.com',
    durationMin: 4320,   // 3 天
    answers: {
      student: { account: 'mei_wang', name: '王美琪' },
      role: { id: 'reseller', hasDownline: 'yes' },
      profile: {
        industry: '零售', industryOther: '', brand: 'SOULMATE 髮品 經銷', company: '', title: '',
        business: '洗護髮產品經銷，並帶領下線夥伴推廣', serviceMode: ['線上', '一對一'], scale: '團隊', headcount: 8
      },
      uploads: {
        brand: yes('品牌方提供 Logo 與官網', [link('https://drive.google.com/drive/folders/1BrandKitSoulmate', '品牌方素材包')]),
        reception: no(),
        sales: yes('品牌方價目圖與優惠方案'),
        marketing: yes('IG 限動素材自己做', [link('https://drive.google.com/file/d/1ReelsDemo/view', '產品使用短影音')]),
        delivery: no(),
        crm: no(),
        rules: yes('退貨依品牌方規定'),
        team: yes('分潤由品牌方系統計算'),
        training: yes('', [link('https://forms.gle/AbCdEf123456', '新夥伴報名表')]),
        meetings: no(),
        misc: no()
      },
      customerFlow: {
        target: 'external',
        stages: [
          T('discover', 'manual', ['IG 限動分享使用心得', '朋友介紹'], 'IG'),
          T('contact', 'manual', ['客人私訊詢問'], 'IG、LINE'),
          T('quote', 'manual', ['傳品牌價目圖與優惠'], 'LINE'),
          NA('booking'),
          T('prep', 'manual', ['確認庫存', '包貨'], ''),
          T('service', 'partial', ['寄出並傳單號'], '7-11 交貨便', { name: '出貨寄送' }),
          T('payment', 'manual', ['客人轉帳截圖', '本人對帳'], '手機銀行'),
          T('aftercare', 'manual', ['一週後問使用感受'], 'LINE'),
          NONE('repeat')
        ]
      },
      teamFlow: {
        stages: [
          T('recruit', 'manual', ['使用過產品的客人中邀請'], 'LINE'),
          T('interview', 'manual', ['一對一面談說明制度'], 'LINE 通話'),
          T('training', 'partial', ['轉傳品牌方教材', '在群組回答問題'], 'LINE 群'),
          C('c_newbie', '新人第一週陪跑', 'none'),
          NA('schedule'),
          NA('dispatch'),
          T('handover', 'manual', ['夥伴在群組回報業績'], 'LINE 群'),
          NONE('review'),
          T('payroll', 'auto', ['品牌方系統自動算分潤', '本人核對'], '品牌後台')
        ]
      },
      collabFlow: {
        stages: [
          T('receive', 'manual', ['上線在群組公告活動'], 'LINE 群'),
          T('execute', 'manual', ['依活動內容向客人推廣'], 'IG、LINE'),
          T('report', 'manual', ['月底回報進貨與業績'], 'LINE'),
          C('c_restock', '進貨下單', 'auto', ['在品牌後台下單', '系統自動扣款與出貨'], '品牌後台'),
          NA('handoff'),
          T('evaluate', 'auto', ['依月業績決定級別'], '品牌後台')
        ]
      },
      dialog: {
        faq: ['跟官網買有什麼差別', '適合我的髮質嗎', '多久會到', '可以先試用嗎', '加入夥伴要多少錢'],
        privacyAck: false
      },
      timeSavers: {
        tasks: ['回答新夥伴重複問題', '對帳', '手動整理客人名單']
      }
    },
    files: [
      png('uploads.brand', 'review-1.png'),
      png('uploads.sales', 'offer.png'),
      png('teamFlow.training', 'group-qa.png')
    ]
  };

  /* ================= 3.0 新架構示範 ================= */
  /** 3.0 流程步驟：P(id, status, handling, steps, tools, name?)；Q(id, status, handling) 快速版（只存狀態與處理方式） */
  function P(id, status, handling, steps, tools, name) { var t = tl(tools); return { id: id, template: true, name: name || '', status: status || '', handling: status === 'doing' ? (handling || '') : '', steps: status === 'doing' ? (steps || []) : [], tools: status === 'doing' ? t.tools : [], toolsOther: status === 'doing' ? t.toolsOther : '' }; }
  function Q(id, status, handling) { return { id: id, template: true, name: '', status: status || '', handling: status === 'doing' ? (handling || '') : '', steps: [], tools: [], toolsOther: '' }; }
  function PC(id, name, status, handling, steps, tools) { var t = tl(tools); return { id: id, template: false, name: name, status: status, handling: status === 'doing' ? (handling || '') : '', steps: status === 'doing' ? (steps || []) : [], tools: status === 'doing' ? t.tools : [], toolsOther: status === 'doing' ? t.toolsOther : '' }; }
  function yn(yesIds, noIds) { var o = {}; (yesIds || []).forEach(function (k) { o[k] = 'yes'; }); (noIds || []).forEach(function (k) { o[k] = 'no'; }); return o; }

  /* ---------------- A 自媒體創作者（業配合作為主） ---------------- */
  var mediaCreator = {
    status: '已讀',
    email: 'yun.creator@gmail.com',
    durationMin: 2700,   // 1 天 21 小時
    drive: { ownerEmail: 'yun.creator@gmail.com', counts: { mediaKit: 1, quote: { count: 2, shortcuts: 1 }, collabContract: 4, brief: 3, supplierContract: 2, orders: { count: 1, shortcuts: 1 }, productPlan: 1, identity: 3, portfolio: 12, marketing: 6, results: 2, dlgBooked: 2, dlgNoReply: 1 } },
    answers: {
      schema: 3,
      student: { account: 'yun_chou', name: '周映彤' },
      mainWork: { name: '自媒體創作者', industry: 'media', industryOther: '', weeklyHours: 50, otherWorks: [{ name: '英文家教', weeklyHours: 4 }] },
      income: { sources: ['sponsor', 'groupbuy', 'ownproduct', 'course'], other: '', main: 'sponsor' },
      quiz: { clients: 'yes', team: 'no', superior: 'no', superiorType: '', superiorOther: '', brand: 'yes', performance: 'yes', performanceType: 'create' },
      profile: { brand: '映彤 Yun｜生活選物', company: '', title: '', business: 'IG 與 YouTube 生活與美妝內容，業配為主，另有團購與自有商品', serviceMode: ['線上'], scale: '', headcount: '' },
      flows: {
        'income.sponsor': { mode: 'full', source: 'income:sponsor', target: 'external', note: '', stages: [
          P('p01', 'doing', 'manual', ['品牌私訊或 Email 邀約', '手動記在備忘錄'], 'IG、Email'),
          P('p02', 'doing', 'partial', ['Canva 版媒體資料卡', '依粉絲數與觀看報價'], 'Canva、Google 試算表'),
          P('p03', 'doing', 'manual', ['與品牌來回確認腳本', '在行事曆排檔期'], 'LINE、Google 日曆'),
          P('p04', 'none'),
          P('p05', 'doing', 'manual', ['自己拍攝剪輯'], 'CapCut'),
          P('p06', 'doing', 'manual', ['傳預覽影片給品牌', '依回饋修改'], 'LINE、Google 雲端硬碟'),
          P('p07', 'doing', 'partial', ['排程發布'], 'IG、YouTube'),
          P('p08', 'none'),
          PC('c_remind', '尾款催款', 'none'),
          P('p09', 'doing', 'manual', ['開立勞報單', '手動對帳'], 'Excel')
        ] },
        'income.groupbuy': { mode: 'quick', source: 'income:groupbuy', note: '每月一團，對帳最花時間', stages: [Q('p01', 'doing', 'manual'), Q('p02', 'doing', 'manual'), Q('p03', 'doing', 'manual'), Q('p04', 'doing', 'partial'), Q('p05', 'doing', 'partial'), Q('p06', 'doing', 'manual'), Q('p07', 'na'), Q('p08', 'none')] },
        'income.ownproduct': { mode: 'quick', source: 'income:ownproduct', note: '', stages: [Q('p01', 'doing', 'manual'), Q('p02', 'doing', 'manual'), Q('p03', 'doing', 'manual'), Q('p04', 'none'), Q('p05', 'doing', 'manual'), Q('p06', 'doing', 'partial'), Q('p07', 'none'), Q('p08', '')] }
      },
      dataChecklist: yn(['mediaKit', 'quote', 'collabContract', 'brief', 'supplierContract', 'orders', 'productPlan', 'costPrice', 'scripts', 'clientList', 'identity', 'portfolio', 'marketing', 'trainingPlan', 'results'], ['caseReport', 'profitShare', 'factory', 'rules']),
      drive: { mode: 'oauth', rootFolderId: '', rootUrl: '', folders: {}, ownerEmail: 'yun.creator@gmail.com', linkUrl: '' },
      dialog: { faq: ['一則業配多少錢', '可以只發限動嗎', '團購什麼時候開', '有沒有折扣碼', '商品什麼時候補貨'], privacyAck: true },
      timeSavers: { tasks: ['逐一回覆品牌邀約與報價', '團購結單後對帳分潤', '追尾款與開勞報單'] }
    },
    files: []
  };

  /* ---------------- B 美業店主（單次服務為主） ---------------- */
  var beautyOwner3 = {
    status: '已讀',
    email: 'grace.lin88@gmail.com',
    durationMin: 1560,   // 1 天 2 小時
    drive: { ownerEmail: 'grace.lin88@gmail.com', counts: { depositRule: 1, workPhotos: 24, pkgPlan: 2, pkgContract: 1, catalog: 1, pricing: 2, scripts: 3, reception: 2, clientList: 1, purchases: 1, roles: 1, identity: 4, portfolio: 30, dlgBooked: 2, dlgNoReply: 1 } },
    answers: {
      schema: 3,
      student: { account: 'grace_lin88', name: '林雅庭' },
      mainWork: { name: '美睫美眉工作室店主', industry: 'beauty', industryOther: '', weeklyHours: 48, otherWorks: [] },
      income: { sources: ['service', 'package', 'retail', 'teach'], other: '', main: 'service' },
      quiz: { clients: 'yes', team: 'yes', superior: 'no', superiorType: '', superiorOther: '', brand: 'yes', performance: 'no', performanceType: '' },
      profile: { brand: '庭 Lash & Brow', company: '', title: '', business: '美睫嫁接與霧眉，另販售睫毛保養液與開設技術課', serviceMode: ['一對一', '店面'], scale: '含助理', headcount: '' },
      flows: {
        'income.service': { mode: 'full', source: 'income:service', target: 'external', note: '', stages: [
          P('p01', 'doing', 'partial', ['IG 作品貼文', '舊客介紹', 'Google 地圖搜尋'], 'IG、Google 商家'),
          P('p02', 'doing', 'partial', ['客人 LINE 私訊', '自動回覆傳價目表圖片'], 'LINE 官方帳號', '私訊詢問'),
          P('p03', 'doing', 'manual', ['詢問時段', '翻看紙本登記簿', '手寫登記'], 'LINE、紙本登記簿'),
          P('p04', 'doing', 'manual', ['前一天傳提醒訊息'], 'LINE'),
          P('p05', 'doing', 'manual', ['確認需求', '施作', '拍成果照'], '手機'),
          P('p06', 'doing', 'manual', ['現場報價', '轉帳或現金', '手寫記帳'], 'LINE Pay、紙本'),
          P('p07', 'doing', 'auto', ['LINE 官方帳號兩天後自動傳保養提醒'], 'LINE'),
          P('p08', 'none'),
          P('p09', 'none')
        ] },
        'income.package': { mode: 'quick', source: 'income:package', note: '儲值扣點靠紙本卡', stages: [Q('p01', 'doing', 'manual'), Q('p02', 'doing', 'manual'), Q('p03', 'doing', 'manual'), Q('p04', 'doing', 'manual'), Q('p05', 'doing', 'manual'), Q('p06', 'doing', 'manual'), Q('p07', 'none'), Q('p08', 'none')] },
        teamFlow: { mode: 'quick', source: 'module:lead', note: '', stages: [Q('recruit', 'doing', 'manual'), Q('interview', 'doing', 'manual'), Q('training', 'doing', 'manual'), Q('schedule', 'doing', 'partial'), Q('dispatch', 'doing', 'manual'), Q('handover', 'doing', 'manual'), Q('review', 'na'), Q('payroll', 'doing', 'manual')] }
      },
      dataChecklist: yn(['depositRule', 'workPhotos', 'pkgPlan', 'pkgContract', 'catalog', 'pricing', 'scripts', 'reception', 'clientList', 'purchases', 'rules', 'roles', 'shifts', 'identity', 'portfolio'], ['pkgLedger', 'serviceSop', 'contract', 'marketing']),
      drive: { mode: 'oauth', rootFolderId: '', rootUrl: '', folders: {}, ownerEmail: 'grace.lin88@gmail.com', linkUrl: '' },
      dialog: { faq: ['多少錢', '可以維持多久', '會不會痛', '這週有位子嗎', '可以改期嗎'], privacyAck: true },
      timeSavers: { tasks: ['每天逐一回覆價目與時段詢問', '手抄預約到登記簿再抄到記帳表', '月底對帳算抽成'] }
    },
    files: []
  };

  /* ---------------- C 保險業務（新契約佣金為主；受僱於公司、帶增員團隊） ---------------- */
  var insuranceAgent = {
    status: '未讀',
    email: 'kevin.chen@example.com',
    durationMin: 95,
    drive: { ownerEmail: 'kevin.chen@example.com', counts: { prospects: 1, needs: 2, proposalTpl: 3, paymentReminder: 1, claims: 0, catalog: 5, scripts: 1, clientList: 1, roles: 0, policy: 1, identity: 2, dlgBooked: 1 } },
    answers: {
      schema: 3,
      student: { account: 'kevin_chen', name: '陳冠宇' },
      mainWork: { name: '保險業務主任', industry: 'finance', industryOther: '', weeklyHours: 45, otherWorks: [] },
      income: { sources: ['newbiz', 'renewal', 'recruit'], other: '', main: 'newbiz' },
      quiz: { clients: 'yes', team: 'yes', superior: 'yes', superiorType: 'boss', superiorOther: '', brand: 'yes', performance: 'no', performanceType: '' },
      profile: { brand: '', company: '宏昇人壽 信義通訊處', title: '業務主任', business: '壽險與醫療險規劃，帶領 6 位新進夥伴', serviceMode: ['一對一', '線上'], scale: '團隊', headcount: 6 },
      flows: {
        'income.newbiz': { mode: 'full', source: 'income:newbiz', target: 'external', note: '', stages: [
          P('p01', 'doing', 'manual', ['舊客轉介', '公司分配名單', '記在筆記本'], 'LINE、紙本'),
          P('p02', 'doing', 'manual', ['LINE 約時間', '到府或咖啡廳'], 'LINE、Google 日曆'),
          P('p03', 'doing', 'partial', ['公司需求分析表', '手填後拍照'], '公司 App、紙本'),
          P('p04', 'doing', 'auto', ['公司系統產生建議書'], '公司系統'),
          P('p05', 'doing', 'partial', ['行動投保', '客人簽名'], '公司 App'),
          P('p06', 'doing', 'auto', ['系統通知照會'], '公司系統'),
          P('p07', 'doing', 'manual', ['親送保單', '說明條款'], ''),
          P('p08', 'none')
        ] },
        'income.renewal': { mode: 'quick', source: 'income:renewal', note: '生日與繳費提醒靠手機行事曆', stages: [Q('p01', 'doing', 'manual'), Q('p02', 'none'), Q('p03', 'doing', 'manual'), Q('p04', 'doing', 'manual'), Q('p05', 'doing', 'partial'), Q('p06', 'none')] },
        teamFlow: { mode: 'quick', source: 'module:lead', note: '', stages: [Q('recruit', 'doing', 'manual'), Q('interview', 'doing', 'manual'), Q('training', 'doing', 'partial'), Q('schedule', 'na'), Q('dispatch', 'na'), Q('handover', 'doing', 'manual'), Q('review', 'doing', 'auto'), Q('payroll', 'doing', 'auto')] }
      },
      dataChecklist: yn(['prospects', 'needs', 'proposalTpl', 'paymentReminder', 'claims', 'catalog', 'scripts', 'clientList', 'roles', 'policy', 'identity'], ['policyTable', 'serviceLog', 'reception', 'contract', 'rules', 'shifts', 'workSop', 'portfolio', 'marketing']),
      drive: { mode: 'oauth', rootFolderId: '', rootUrl: '', folders: {}, ownerEmail: 'kevin.chen@example.com', linkUrl: '' },
      dialog: { faq: ['這張保單多少錢', '理賠要多久', '可以用信用卡繳嗎', '解約會損失多少', '小孩適合哪一種'], privacyAck: true },
      timeSavers: { tasks: ['手動整理客戶保單與繳費日', '回答新夥伴重複問題', '每週填業績回報表'] }
    },
    files: []
  };

  var seeds = [mediaCreator, beautyOwner3, insuranceAgent, reseller];
  /* ---------------- 3.1 作業結構示範：林雅婷（保險業務，確認稿 work-final/front.html 的範例） ---------------- */
  var insurance31 = {
    answers: {
      schema: 31,
      student: { account: 'yating.lin@gmail.com', name: '林雅婷' },
      business: { name: '保險業務', industryCode: 'L', industrySub: '保險業務', industryOther: '', stage: 'stable', incomes: ['commission', 'network'], incomeOther: '', mainIncome: 'commission', otherRoles: '' },
      duties: { items: ['reply', 'reception', 'quote', 'closing', 'aftercare', 'content', 'training', 'meeting', 'report'], other: [], handover: ['reply', 'aftercare', 'report'] },
      steps: {
        receive: { none: false, sources: ['FB', 'LINE 官方帳號', '朋友介紹', '舊客回購'], sourcesOther: [], channels: ['LINE 個人', '現場'], channelsOther: [], cycle: 'month',
          stages: [{ name: '回答問題', tools: ['LINE 個人'] }, { name: '見面洽談', tools: [] }, { name: '提供方案', tools: ['公司系統'] }, { name: '報價', tools: ['公司系統'] }, { name: '簽約下訂', tools: ['公司系統'] }, { name: '收款', tools: ['刷卡機或行動支付'] }, { name: '售後關心', tools: [] }] },
        lead: { none: false, role: '業務新人', stages: [{ name: '說明任務', tools: ['LINE 群組'] }, { name: '示範操作', tools: ['公司系統'] }, { name: '提供資料', tools: ['Google 雲端硬碟'] }, { name: '追蹤進度', tools: [] }, { name: '給予回饋', tools: [] }] },
        task: { none: false, name: '製作保單健檢報告', stages: [{ name: '收集客戶保單', tools: ['LINE 個人'] }, { name: '輸入保障內容', tools: ['公司系統'] }, { name: '製作比較表', tools: ['Excel'] }, { name: '說明調整建議', tools: [] }] }
      },
      authority: { items: [{ id: 'pricing', mode: 'ask' }, { id: 'refund', mode: 'ask' }, { id: 'intake', mode: 'self' }, { id: 'schedule', mode: 'self' }, { id: 'promo', mode: 'ask' }, { id: 'purchase', mode: 'none' }, { id: 'staffing', mode: 'self' }, { id: 'contract', mode: 'ask' }, { id: 'customerData', mode: 'self' }], askTargets: ['主管或公司'], askOther: '' },
      resources: {
        data: { catalog: { has: true, source: 'company' }, serviceFlow: { has: true, source: 'company' }, faq: { has: true, source: 'self' }, plans: { has: true, source: 'company' }, scripts: { has: true, source: 'self' }, contracts: { has: true, source: 'company' },
          customerList: { has: true, source: 'self' }, followUps: { has: true, source: 'self' }, trainingMaterials: { has: true, source: 'company' }, hqCourses: { has: true, source: 'company' }, systemGuide: { has: true, source: 'company' }, salesReports: { has: true, source: 'company' }, chatShots: { has: true, source: 'self' }, referenceSites: { has: true, source: 'self' } },
        dataOther: [],
        sites: [
          { platform: 'IG', url: 'https://instagram.com/yating.insure', owner: 'self', uses: ['曝光宣傳', '客人詢問'], status: 'active' },
          { platform: 'LINE 官方帳號', url: 'https://lin.ee/yatingins', owner: 'self', uses: ['客人詢問', '預約'], status: 'active' },
          { platform: '官網', url: 'https://example-insure.com/agents/yating', owner: 'company', uses: ['曝光宣傳'], status: 'active' },
          { platform: '其他', platformOther: '個人預約頁', url: 'https://yating-booking.example.com', owner: 'self', uses: ['預約'], status: 'building', plannedUse: '客人自行預約保單健檢', progress: '版面設計中', planOwner: 'self' }
        ],
        tools: { 'LINE 官方帳號': { has: true, source: 'self' }, 'LINE 個人': { has: true, source: 'self' }, '電話': { has: true, source: 'self' }, 'Google 日曆': { has: true, source: 'self' }, '刷卡機或行動支付': { has: true, source: 'company' }, 'Google 試算表': { has: true, source: 'self' }, 'Canva': { has: true, source: 'self' }, 'LINE 群組': { has: true, source: 'self' },
          '公司內部系統': { has: true, source: 'company' }, '公司 App': { has: true, source: 'company' }, '公司報表': { has: true, source: 'company' },
          'IG 限動互動': { has: true, source: 'self', status: 'planning', plannedUse: '保險觀念小測驗導流', progress: '', planOwner: 'self' }, '預約連結': { has: true, source: 'self', status: 'building', plannedUse: '保單健檢預約', progress: '已申請預約系統帳號', planOwner: 'vendor' } },
        toolsOther: [], companySystemName: '業務員行動投保系統'
      },
      place: { links: { referenceSites: [{ url: 'https://www.example-insurance-portal.com', name: '保險業務員個人頁範例' }] } },
      drive: { mode: 'oauth', ownerEmail: 'yating.lin@gmail.com' }
    },
    files: [], status: '已讀', durationMin: 72,
    drive: { ownerEmail: 'yating.lin@gmail.com', counts: { catalog: 2, serviceFlow: 1, faq: 1, plans: 2, scripts: 1, contracts: 1, customerList: 1, followUps: 1, trainingMaterials: { count: 2, shortcuts: 1 }, hqCourses: 1, systemGuide: 1, salesReports: 1, chatShots: 1, referenceSites: 1, 'tool:IG 限動互動': 1, 'tool:預約連結': 1 } }
  };
  seeds.push(insurance31);
  var legacySet = [beautyOwner, employeeEngineer, reseller];

  /**
   * 示範名冊：3 位已送出的學員＋2 位已開始未送出的學員（帳號 → 本名）；一人一鍵（正式官網 uid 即 Email，書籤只送 account 一鍵），示範帳號沿用作業紀錄的 student.account。
   * 智慧輸入示範：同名兩位（陳冠宇）、同名字不同姓（宋晴禾、張晴禾）、名字為常見詞（王美好，「美好」列為停用詞）、複姓（歐陽娜娜）。
   */
  seeds.roster = [
    { account: 'yun_chou', name: '周映彤' },
    { account: 'grace_lin88', name: '林雅庭' },
    { account: 'kevin_chen', name: '陳冠宇' },
    { account: 'mei_wang', name: '王美琪' },
    { account: 'hsh_nail', name: '黃詩涵' },
    { account: 'jerry_chang', name: '張哲宇' },
    { account: 'kevin.chen2@gmail.com', name: '陳冠宇' },
    { account: 'sung.sunny', name: '宋晴禾' },
    { account: 'qinghe.chang@gmail.com', name: '張晴禾' },
    { account: 'ou_yang', name: '歐陽娜娜' },
    { account: 'mei_hao', name: '王美好' },
    { account: 'yating.lin@gmail.com', name: '林雅婷' },
    { account: 'hsiu_yun', name: '林秀芸' },
    { account: 'chien_yu', name: '李茜語' },
    { account: 'yu_an', name: '陳予安' },
    { account: 'hui_ning', name: '黃卉寧' }
  ];
  /** 3.1 單一追蹤名單示範：舊關注名單遷移後（成員晴禾、秀芸、茜語、予安、卉寧；截止 2026.11.05 12:00 必須保留） */
  seeds.watch = {
    deadline: '2026-11-05T12:00:00+08:00',
    members: ['sung.sunny', 'hsiu_yun', 'chien_yu', 'yu_an', 'hui_ning'],
    lineBound: ['hsiu_yun', 'yu_an']
  };
  /** 3.1 自動追蹤示範：管理收件人（校長 LINE） */
  seeds.automation = { adminRecipients: [{ userId: 'U' + 'c0ffee'.repeat(5) + '01', name: '校長' }] };

  /** 示範填寫進度：已開始未送出（startedMinAgo、lastSeenMinAgo 以載入當下回推） */
  /** 即時填寫進度示範：活動中（蔡宛臻）、閒置（黃詩涵）、停滯（張哲宇）；已完成為上方 3 份示範作業中近 7 天送出者 */
  seeds.progress = [
    { account: 'wan_tsai', name: '蔡宛臻', role: '美甲接案', startedMinAgo: 95, lastSeenMinAgo: 1, activeMin: 52, sectionId: 'flow1', percent: 46 },
    { account: 'hsh_nail', name: '黃詩涵', role: '美睫師', startedMinAgo: 2 * 1440 + 180, lastSeenMinAgo: 45, activeMin: 38, sectionId: 'dataShare', percent: 27 },
    { account: 'jerry_chang', name: '張哲宇', role: '門市店長', startedMinAgo: 6 * 1440, lastSeenMinAgo: 3 * 1440 + 20, activeMin: 21, sectionId: 'profile', percent: 12 }
  ];
  /** 示範補件需求（3.0）：對周映彤最新作業建立 3 項（補資料：結案報告；補填區塊：課程或訂閱流程改完整版；其他資料） */
  seeds.supplement = {
    account: 'yun_chou',
    due: '2026.11.12',
    items: [
      { type: 'data', ref: 'caseReport', note: '近三個月任一合作的結案報告' },
      { type: 'section', ref: 'income.course', note: '課程或訂閱的流程以完整版補填' },
      { type: 'custom', title: '近三個月業配收入明細', note: '品牌、金額、收款日即可' }
    ]
  };

  /** 示範優先批次（2.5.0）：截止 2026.11.05 12:00；成員為示範名冊 5 位（鍵為示範作業使用的帳號寫法，狀態才能對應）；林雅庭已綁定 LINE 通知 */
  seeds.batch = {
    id: 'b20261011-DEMO1',
    title: '11 月優先諮詢',
    deadline: '2026-11-05T12:00:00+08:00',
    hint: '',
    members: ['grace_lin88', 'kevin_chen', 'mei_wang', 'hsh_nail', 'jerry_chang'],
    lineBound: ['grace_lin88']
  };

  /* 2.x 三份示範（相容測試）：名冊、填寫進度、關注名單與 3.0 相同，填寫進度改為身分 id 與 2.x 區塊 */
  legacySet.roster = seeds.roster.filter(function (r) { return r.account !== 'yun_chou'; });   // 2.x 示範名冊 10 位
  legacySet.progress = [
    { account: 'wan_tsai', name: '蔡宛臻', role: 'owner', startedMinAgo: 95, lastSeenMinAgo: 1, activeMin: 52, sectionId: 'customerFlow', percent: 46 },
    { account: 'hsh_nail', name: '黃詩涵', role: 'freelancer', startedMinAgo: 2 * 1440 + 180, lastSeenMinAgo: 45, activeMin: 38, sectionId: 'uploads', percent: 27 },
    { account: 'jerry_chang', name: '張哲宇', role: 'manager', startedMinAgo: 6 * 1440, lastSeenMinAgo: 3 * 1440 + 20, activeMin: 21, sectionId: 'profile', percent: 12 }
  ];
  legacySet.batch = seeds.batch;
  seeds.legacySet = legacySet;

  return seeds;
});
