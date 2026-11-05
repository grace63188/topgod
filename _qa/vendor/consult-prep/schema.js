/*
 * G.R.A.C.E Academy《諮詢教材·專屬訂製》作業欄位設定檔
 * 前台、後台、資料中心（Apps Script）與離線模擬共用的單一來源。
 *
 * 輸出方式：UMD 風格，不使用 ES `export`，可直接以 <script src> 或由 build.py 內嵌：
 *   - 瀏覽器：window.CONSULT_SCHEMA
 *   - Node（測試、建置）：module.exports
 *   - Apps Script：複製為 schema.gs 後成為全域 CONSULT_SCHEMA（globalThis）
 *
 * 內容規範：所有文字繁體中文；說明句名詞化，不用「你」、不用問句。
 * 區塊順序（2.x 身分制，3.0 起為舊資料相容）：學員資料 → 身分選擇 → 基本輪廓 → 資料上傳 → 客戶流程 → 團隊流程 → 協作流程 → 對話紀錄 → 最想省下的時間
 * 3.0 工作組成架構（本業選擇、本業問答、資料提供、流程頁規劃、補件需求）見 src/model3.js 與 src/schema3.js（CONSULT_SCHEMA.V3）。
 */
(function (root, factory) {
  var schema = factory();
  root.CONSULT_SCHEMA = schema;
  if (typeof module === 'object' && module && module.exports) module.exports = schema;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 基本設定                                                            */
  /* ------------------------------------------------------------------ */
  var META = {
    title: '諮詢教材·專屬訂製',
    tag: '優化作業',
    org: 'G.R.A.C.E Academy',
    version: '3.0.0',
    timezone: 'Asia/Taipei',
    dateFormat: 'yyyy.mm.dd'
  };

  /** 優先批次（截止時間）：Script Properties 儲存，每批成員上限 200 */
  var BATCH = {
    maxMembers: 200,
    maxTitleLength: 40,
    maxHintLength: 80,
    maxCallNameLength: 20,
    visibleAfterDeadlineDays: 30,  // 截止後 30 天內前台仍回傳批次（逾期可送出，onTime=false）
    defaultHint: '越早完成，諮詢時段可優先安排',
    idRe: /^[A-Za-z0-9_-]{4,40}$/,
    keyRe: /^[0-9a-f]{16}$/           // 成員鍵＝名冊鍵雜湊（SHA-256 前 16 碼），不存帳號明文
  };

  /** 通知範本：變數以全形大括號外的 {名稱} 標示 */
  var NOTIFY = {
    maxTemplates: 10,
    maxNameLength: 40,
    maxRecipients: 200,            // 發送通知（notify_preview／notify_push）一次上限
    maxLogs: 50,                   // 發送紀錄保留筆數（notify_log）
    maxBodyLength: 5000,           // 與 LINE 單則文字上限相同；渲染後超過 5000 字的訊息於推播時個別失敗
    vars: ['稱呼', '截止時間', '作業連結', '雲端資料夾'],   // 3.2 {雲端資料夾}＝學姐自己的「本名_諮詢資料」網址          // 2.6.1 起 {綁定連結} 不列入可插入變數；既有範本含此變數時渲染為空並整行移除
    workUrl: 'https://grace63188.github.io/consult-prep/?openExternalBrowser=1',
    defaultTemplateId: 'consult-notice',
    defaultTemplateName: '一對一諮詢前置作業繳交通知',
    defaultTemplateBody: [
      '📋《一對一諮詢｜前置作業繳交通知》',
      '',
      '親愛的{稱呼}學姐好♡',
      '',
      '由於學姐目前還有後續的一對一諮詢尚未進行，校長希望進一步了解學姐近期的執行成果，以及實際遇到的問題。',
      '',
      '因此，特別交代助教通知學姐，請於期限內完成《諮詢教材·專屬訂製》，讓校長能根據學姐目前的實際進度，針對問題提供更具體的建議。',
      '',
      '▌一、作業入口與繳交期限',
      '',
      '✦ 截止時間：{截止時間}',
      '',
      '➥ 作業填寫入口',
      '{作業連結}',
      '',
      '📌 越早完成作業繳交，就能越早安排後續的一對一諮詢！',
      '',
      '▌二、作業填寫與繳交流程',
      '',
      '❶【填寫作業】',
      '點選上方連結，依序完成各區塊內容。',
      '',
      '❷【送出檢查】',
      '填寫完成後，進入最後一頁「送出檢查」，確認各區塊的完成狀態。',
      '',
      '❸【正式繳交】',
      '確認無誤後，點選「送出作業」即完成繳交。',
      '',
      '▌三、繳交注意事項',
      '',
      '✦ 學員帳號與本名須與官網註冊資料一致。',
      '✦ 作業送出後無法再修改，請確認內容完整後再提交。',
      '✦ 完成送出後，無需另外上傳官網或通知助教。',
      '',
      '📌 校長特別提醒',
      '',
      '這份作業是後續諮詢的重要參考，請學姐具體說明目前已完成的事項、執行成果，以及實際遇到的困難。',
      '',
      '作業內容越具體，校長越能掌握需要協助的問題，讓後續諮詢更有方向。',
      '',
      '請學姐把握時間，於截止期限前完成繳交！',
      '',
      '📩 收到這則通知後，請學姐回覆「確認」，讓助教知道訊息已送達♡'
    ].join('\n'),
    ackFooter: '📩 收到這則通知後，請學姐回覆「確認」，讓助教知道訊息已送達♡',   // 3.1：範本結尾請學姐回覆「確認」（Webhook 自動記錄並致謝）
    ackMarker: '回覆「確認」'
  };

  /**
   * 3.1 自動追蹤（資料中心 runAutomation 每小時；後台「自動提醒」設定頁）：全部預設開啟、每項可開關、文字可改。
   * 變數：學姐端 {稱呼}{截止時間}{作業連結}；管理端 {本名}{送出時間}{準時}、{日期}{摘要}、{名單}；回覆確認 {稱呼}{截止時間}。
   */
  var AUTOMATION = {
    kinds: ['remind48', 'remind24', 'noAck', 'thanks', 'submitNotify', 'digest', 'overdue'],
    labels: { remind48: '截止前 48 小時提醒', remind24: '截止前 24 小時提醒', noAck: '通知後 24 小時未回覆確認提醒', thanks: '送出致謝', submitNotify: '送出通知管理收件人', digest: '每日摘要（有變化才發）', overdue: '逾期通知管理收件人', ackReply: '回覆確認的自動回覆' },
    audience: { remind48: 'student', remind24: 'student', noAck: 'student', thanks: 'student', submitNotify: 'admin', digest: 'admin', overdue: 'admin', ackReply: 'student' },
    vars: { remind48: ['名字', '截止時間', '作業網址'], remind24: ['名字', '截止時間', '作業網址'], noAck: ['名字', '截止時間', '作業網址'], thanks: ['名字', '作業網址'], submitNotify: ['本名', '送出時間', '準時'], digest: ['日期', '摘要', '總數', '已繳交數', '準時數', '逾期繳交數', '填寫中數', '未開始數', '已確認數', '逾期未送出數', '無法送達數', '已繳交名單', '填寫中名單', '未開始名單', '逾期名單', '今日送出名單', '需提醒名單', '已用則數', '剩餘則數', '提醒暫停'], overdue: ['學姐名單', '人數'], ackReply: ['名字', '截止時間', '作業網址'] },
    // 學姐端文字變數：{名字}＝稱呼（舊名 {稱呼} 仍可用）、{作業網址}＝作業連結（舊名 {作業連結} 仍可用）、{截止時間}（無截止時間時整行省略）
    texts: {
      remind48: '{稱呼}學姐好♡\n提醒您《諮詢教材·專屬訂製》將於 {截止時間} 截止，目前尚未送出。\n越早完成，諮詢時段可優先安排。\n作業入口：{作業連結}',
      remind24: '{稱呼}學姐好♡\n《諮詢教材·專屬訂製》將於 {截止時間} 截止（剩不到 24 小時），目前尚未送出。\n作業入口：{作業連結}',
      noAck: '{稱呼}學姐好♡\n昨天發出的《諮詢教材·專屬訂製》通知尚未收到回覆，請學姐看到後回覆「確認」，謝謝♡\n截止時間：{截止時間}\n作業入口：{作業連結}',
      thanks: '{稱呼}學姐，已收到作業，謝謝學姐♡\n校長會依作業內容準備諮詢，若需補充資料會再另行通知。',
      submitNotify: '【送出通知】\n◆ {本名} 學姐已送出《諮詢教材·專屬訂製》\n・送出時間 {送出時間}\n・{準時}',
      digest: '【確認繳交】{日期}\n◆ 繳交狀況｜追蹤名單 {總數} 位\n・已繳交 {已繳交數}：{已繳交名單}\n・填寫中 {填寫中數}：{填寫中名單}\n・未開始 {未開始數}：{未開始名單}\n・逾期未送出 {逾期未送出數}：{逾期名單}\n◆ 需提醒名單\n{需提醒名單}\n◆ LINE 額度\n・本月已用 {已用則數} 則，剩 {剩餘則數} 則{提醒暫停}\n・已回覆確認 {已確認數}、LINE 無法送達 {無法送達數}',
      overdue: '【逾期名單】\n◆ 已超過截止時間仍未送出（{人數} 位）\n{學姐名單}',
      ackReply: '收到學姐的確認了，謝謝學姐♡\n提醒學姐：《諮詢教材·專屬訂製》截止時間是 {截止時間}，請在截止前完成並送出。\n作業連結：{作業網址}'
    },
    // 舊版預設文字（未曾修改者讀取時改用新預設）
    // 3.2：送出通知、每日摘要、逾期通知改【動作＋名詞】標題與 ◆／・ 分層；未曾修改的 3.1 預設自動改用新預設
    legacyTexts: { ackReply: ['{稱呼}學姐，已收到確認，謝謝♡\n作業截止：{截止時間}'], overdue: ['⏰ 逾期提醒\n以下學姐已超過截止時間仍未送出：\n{名單}', '⏰ 逾期提醒\n以下學姐已超過截止時間仍未送出：\n{學姐名單}'], digest: ['📊 諮詢前置作業 每日摘要 {日期}\n{摘要}', '📊 諮詢前置作業 每日摘要 {日期}\n追蹤名單 {總數} 位\n\n✅ 已繳交（{已繳交數}）：{已繳交名單}\n✍️ 填寫中（{填寫中數}）：{填寫中名單}\n⏳ 未開始（{未開始數}）：{未開始名單}\n⏰ 逾期未送出（{逾期未送出數}）：{逾期名單}\n\n已回覆確認 {已確認數}、LINE 無法送達 {無法送達數}\n本月 LINE 已用 {已用則數} 則（剩 {剩餘則數}）{提醒暫停}'], submitNotify: ['📥 作業送出通知\n{本名} 學姐已送出《諮詢前置作業》（{送出時間}）。{準時}'] },
    digestHour: 9,
    maxRecipients: 10,
    maxTextLength: 2000,
    quotaReserveRatio: 0.05,  // 3.3.7 保留給內部通知的比例（預設 5%）：本月剩餘低於保留則數時暫停對學姐的自動提醒，只保留管理員通知
    quotaWarnRatio: 0.2,      // 剩 < 20%：warn
    undoMinutes: 10           // 軟刪除可還原時間
  };

  /** LINE 官方帳號綁定與推播（Messaging API） */
  var LINE = {
    oaId: '@52grace',
    channelId: '2006775861',
    monthlyQuota: 6000,            // 3.3.7 主帳號 LINE API 查詢失敗且無上次紀錄時的備援上限（高用量方案每月 6,000 則，可在設定頁修改）
    adminMonthlyQuota: 200,        // 3.3.7 天使助教 OA（免費方案）備援上限，分開計算
    mainOverage: true,             // 3.3.7 主帳號可加購：超過方案額度照常發送（設定 LINE_QUOTA_CFG.mainOverage 可覆寫）
    overageNote: '已進入加購計費（每則約 NT$0.2 起）',   // 3.3.7 超過方案額度照常發送
    maxTextLength: 5000,
    bindCommand: '綁定',
    bindCodeLength: 6,
    bindCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // 去除 I O 0 1
    bindCodeMinutes: 15,           // 前台取得的綁定碼有效時間（CacheService）
    adminCodeDays: 7,              // 2.6.0 以前通知內綁定連結的綁定碼有效天數（2.6.1 起不再產生；既有碼仍可於 Webhook 使用至到期）
    tokenCacheMinutes: 14,         // stateless channel access token 有效 15 分鐘，快取 14 分鐘
    bindUrlBase: 'https://line.me/R/oaMessage/@52grace/?',
    bindDoneText: '{稱呼}學姐，LINE 通知綁定完成。',
    bindFailText: '綁定碼已失效',
    chatBase: 'https://chat.line.biz/',            // LINE 官方帳號管理的聊天（後台手動綁定與「開啟聊天室」）
    chatHosts: ['chat.line.biz', 'manager.line.biz'],
    userIdRe: /^U[0-9a-f]{32}$/
  };

  /** 常見複姓（稱呼去姓時優先比對） */
  /**
   * 智慧輸入（2.5.0 後台批次成員）：roster_match 以名冊本名比對任意貼上文字。
   * 比對規則：全名出現，或去姓後的名字（≥ 2 字）出現；去姓名字為停用詞時不比對（避免常見詞誤判）。
   */
  var ROSTER_MATCH = {
    maxTextLength: 20000,
    minGivenLength: 2,
    maxMatchesPerGroup: 8,
    maxGroups: 200,
    maxMissing: 30,
    debounceMs: 200,
    /** 常見非人名詞彙：去姓名字或疑似名字片段與之相同時不視為人名 */
    stopwords: [
      '學姊', '學姐', '學長', '學妹', '學弟', '同學', '老師', '校長', '助教', '助理', '小姐', '先生', '大家', '各位', '所有', '每位', '親愛', '親愛的',
      '時間', '截止', '截止時間', '期限', '日期', '今天', '明天', '後天', '昨天', '本週', '下週', '上週', '中午', '早上', '上午', '下午', '晚上', '傍晚', '凌晨', '週末',
      '作業', '前置', '前置作業', '諮詢', '一對一', '優先', '批次', '關注', '關注名單', '通知', '連結', '網址', '填寫', '送出', '完成', '繳交', '準時', '逾期', '進度', '成果', '問題', '建議',
      '具體', '實際', '目前', '近期', '後續', '希望', '了解', '根據', '提供', '執行', '安排', '時段', '越早', '盡快', '提醒', '公告', '訊息', '名單', '以下', '如下', '上述',
      '課程', '上課', '下課', '學院', '教室', '報名', '資料', '內容', '檔案', '照片', '影片', '流程', '客戶', '工作', '團隊', '品牌', '產品', '服務', '活動', '直播',
      '謝謝', '感謝', '收到', '好的', '麻煩', '辛苦', '辛苦了', '加油', '一起', '恭喜', '歡迎', '再見', '晚安', '早安', '午安', '抱歉', '不好意思', '沒問題', '了解了',
      '平安', '快樂', '美好', '美麗', '如意', '吉祥', '幸福', '健康', '順利', '開心', '溫暖', '光明', '文化', '中華', '台灣', '臺灣', '台北', '臺北', '新竹', '台中', '臺中', '高雄',
      '官方', '帳號', '群組', '記事本', '相簿', '已讀', '回覆', '貼圖', '表情', '圖片', '語音', '來電', '視訊', '收回', '標註', '置頂', '公告欄'
    ],
    honorifics: ['學姊', '學姐', '同學', '老師', '小姐', '先生', '姊姊', '姐姐', '姊', '姐'],
    /** 疑似名字片段含下列字時不視為名字（虛詞、代詞、禮貌用語） */
    nonNameChars: '的了嗎呢吧啊喔哦唷囉啦耶您們請謝要會能到這那個是在有與及或就都也還很好被讓把給從對於為以及已將並但而且所其之此每各位些'
  };

  var COMPOUND_SURNAMES = ['歐陽', '司馬', '上官', '諸葛', '東方', '皇甫', '尉遲', '公孫', '慕容', '長孫', '司徒', '夏侯', '軒轅', '令狐', '宇文', '單于', '端木', '司空', '西門', '南宮', '鮮于', '呼延', '百里', '東郭', '范姜', '張簡', '張廖'];

  /** 學員名冊（Script Properties 分片儲存，不建立雲端檔案）與前台公開查詢的限制 */
  var ROSTER = {
    maxRows: 5000,                 // roster_sync 單次筆數上限
    maxNameLength: 60,
    maxKeyLength: 120,             // 帳號或 Email 正規化後長度上限
    lookupFailLimit: 5,            // 同一 clientKey 連續查無次數
    lookupLockMinutes: 15,         // 鎖定時間
    publicPerMinute: 120,          // 免 token action 全站每分鐘上限（roster_lookup、session_start 合計）
    clientPerMinute: 20,           // 同一 clientKey 每分鐘上限
    fixedResponseMs: 350           // roster_lookup 回應時間固定化
  };

  /** 填寫計時 */
  var SESSION = {
    restartAfterDays: 90,          // 開始時間存在且未送出時不覆蓋，超過此天數視為新一輪
    progressTab: '填寫進度',
    statuses: { filling: '填寫中', submitted: '已送出', removed: '已移除' },
    // 即時填寫進度（progress_ping）
    pingEverySec: 60,              // 前台停留中每 60 秒回報一次（頁面可見時）
    pingMinSec: 15,                // 伺服器：同一 clientKey 每 15 秒最多寫入 1 次
    activeGapMin: 5,               // 兩次回報間隔 ≤ 5 分鐘才累加活動分鐘（排除閒置）
    activeWithinMin: 5,            // 最後活動 ≤ 5 分鐘：活動中
    idleWithinHours: 24,           // ≤ 24 小時：閒置；超過：停滯
    listCacheSec: 20,              // progress_list 快取秒數
    submittedDays: 7               // includeSubmitted 時回傳近 7 天已送出者
  };

  /** 刪除作業（delete_submission） */
  var REMOVAL = {
    maxBatch: 50,
    confirmWord: '刪除',
    restoreDays: 30
  };

  /**
   * 作業封存結構（雲端硬碟資料夾與後台 zip 共用）：
   *   本名_諮詢作業/
   *     本名_作業內容.pdf、作業資料.json、雲端連結.txt
   *     資料上傳/<類別名稱>/、客戶流程/<序號_步驟名稱>/、團隊流程/…、協作流程/…、對話紀錄/完成預約/、對話紀錄/詢問後未回覆/
   */
  var ARCHIVE = {
    suffix: '_諮詢作業',
    uploadsDir: '資料上傳',
    dialogDir: '對話紀錄',
    otherDir: '其他附件',
    linksFile: '雲端連結.txt',
    jsonFile: '作業資料.json',
    pdfSuffix: '_作業內容.pdf',
    driveOnlyFile: '需於雲端硬碟下載.txt',
    maxFileBytes: 30 * 1024 * 1024,   // 單檔經資料中心取回的上限（Apps Script 回應約 50MB，base64 膨脹 1.33 倍）
    allPrefix: '諮詢前置作業_全部_'
  };

  /** 雲端連結的共用對象（學員需將檔案共用給此帳號，可檢視即可） */
  var SHARE_EMAIL = 'grace63188@gmail.com';

  /** 雲端連結允許的網域（完全比對主機名稱） */
  var LINK_HOSTS = ['drive.google.com', 'docs.google.com', 'forms.gle'];

  /** 影片副檔名：一律拒收，改以雲端連結提供 */
  var VIDEO_EXT = ['mp4', 'mov', 'm4v', 'avi', 'wmv', 'flv', 'mkv', 'webm', '3gp', '3g2', 'mpeg', 'mpg', 'mts', 'm2ts', 'hevc', 'f4v', 'vob', 'ogv', 'rm', 'rmvb', 'asf'];

  var LIMITS = {
    maxFileBytes: 20 * 1024 * 1024,          // 單檔上限 20MB
    maxFilesPerField: 10,                    // 每類或每步驟最多檔數
    maxFiles: 80,                            // 單份作業最多檔數
    maxTotalBytes: 200 * 1024 * 1024,        // 單份作業附件總量
    maxLinksPerField: 10,                    // 每類最多雲端連結筆數
    maxLinkLength: 2000,                     // 網址長度上限
    maxLinkNoteLength: 200,                  // 連結說明長度上限
    maxAnswersBytes: 400 * 1024,             // 答案 JSON 上限（防止異常巨量內容）
    chunkBytes: 4 * 1024 * 1024,             // 分塊上傳每塊原始大小（256KiB 倍數）
    maxFlowStages: 30,                       // 每個流程最多步驟數（模板＋自訂）
    maxStageNameLength: 40,                  // 步驟名稱長度上限
    mimeToExt: {
      'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'image/heic': 'heic', 'image/heif': 'heic',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
    },
    acceptMime: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    acceptExt: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
  };

  /**
   * 檢查結果代碼（fileIssue／linkIssue／checkSubmission 回傳的 code）與資料中心錯誤碼對應。
   * 前台依 code 決定提示方式，例如 FILE_VIDEO 引導改貼雲端連結。
   */
  var ISSUE_CODES = {
    FILE_VIDEO: { errorCode: 'ERR_VIDEO_USE_LINK', label: '影片檔改以雲端連結提供' },
    FILE_TYPE: { errorCode: 'ERR_VALIDATION', label: '不支援的檔案類型' },
    FILE_SIZE: { errorCode: 'ERR_VALIDATION', label: '單檔超過上限' },
    FILE_INFO: { errorCode: 'ERR_VALIDATION', label: '檔案資訊不完整' },
    FILE_KEY: { errorCode: 'ERR_VALIDATION', label: '檔案對應位置不正確' },
    FILE_FIELD_LIMIT: { errorCode: 'ERR_VALIDATION', label: '單一類別或步驟檔案超過上限' },
    FILE_COUNT_LIMIT: { errorCode: 'ERR_VALIDATION', label: '附件數量超過上限' },
    FILE_TOTAL_LIMIT: { errorCode: 'ERR_VALIDATION', label: '附件總量超過上限' },
    LINK_FORMAT: { errorCode: 'ERR_LINK_INVALID', label: '雲端連結格式不正確' },
    LINK_HOST: { errorCode: 'ERR_LINK_INVALID', label: '雲端連結網域不在允許範圍' },
    LINK_LIMIT: { errorCode: 'ERR_LINK_INVALID', label: '雲端連結筆數或長度超過上限' },
    FLOW_STAGE: { errorCode: 'ERR_VALIDATION', label: '流程步驟格式不正確' },
    REQUIRED: { errorCode: 'ERR_VALIDATION', label: '必填未完成' }
  };

  var STATUSES = [
    { id: 'unread', label: '未讀' },
    { id: 'read', label: '已讀' },
    { id: 'supplement', label: '需補件' },
    { id: 'supplementOpen', label: '待補件' },     // 3.0：後台已建立補件需求、學姐尚未完成
    { id: 'supplemented', label: '已補件' }        // 3.0：補件需求全部完成
  ];

  /* ------------------------------------------------------------------ */
  /* 身分                                                                */
  /* ------------------------------------------------------------------ */
  var ROLES = [
    { id: 'owner', label: '經營者', desc: '品牌、店家或公司負責人', leads: true, icon: 'crown' },
    { id: 'manager', label: '團隊主管', desc: '受僱，負責帶人', leads: true, icon: 'team' },
    { id: 'employee', label: '受僱人員', desc: '受僱，不帶人', leads: false, icon: 'badge' },
    { id: 'freelancer', label: '自由工作者', desc: '個人接案，無員工', leads: false, icon: 'laptop' },
    { id: 'reseller', label: '經銷合作', desc: '經銷、代理或分潤合作', leads: 'conditional', icon: 'handshake' }
  ];

  var ALL_ROLES = ['owner', 'manager', 'employee', 'freelancer', 'reseller'];
  var LEAD_ROLES = ['owner', 'manager', 'reseller'];
  var EMPLOYED_ROLES = ['manager', 'employee'];

  /** 經銷合作且有下線夥伴才成立的條件（其他身分不受此條件限制） */
  var DOWNLINE_COND = { field: 'role.hasDownline', equals: 'yes', onlyForRole: 'reseller' };

  /* ------------------------------------------------------------------ */
  /* 共用選項                                                            */
  /* ------------------------------------------------------------------ */
  var OPTIONS = {
    industry: ['美業', '教育', '設計', '工程技術', '健康照護', '餐飲', '零售', '顧問諮詢', '其他'],
    serviceMode: ['一對一', '團體', '線上', '到府', '店面'],
    scale: ['獨立作業', '含助理', '團隊'],
    uploadStatus: [
      { id: 'yes', label: '有' },
      { id: 'no', label: '無' }
    ],
    flowTarget: [
      { id: 'external', label: '外部客人' },
      { id: 'internal', label: '內部需求方（主管、其他部門）' },
      { id: 'both', label: '兩者皆有' }
    ],
    yesNo: [
      { id: 'yes', label: '有' },
      { id: 'no', label: '無' }
    ],
    /** 流程步驟狀態（'' 為未填寫） */
    stageStatus: [
      { id: 'doing', label: '有做法' },
      { id: 'none', label: '尚無做法' },
      { id: 'na', label: '不適用' }
    ],
    /** 處理方式（狀態為「有做法」時才有） */
    stageHandling: [
      { id: 'manual', label: '人工處理' },
      { id: 'partial', label: '部分自動' },
      { id: 'auto', label: '系統自動' }
    ]
  };

  /* ------------------------------------------------------------------ */
  /* 欄位型別說明（供前後台實作參考）                                     */
  /* ------------------------------------------------------------------ */
  var FIELD_TYPES = {
    text: '單行文字',
    textarea: '多行文字',
    number: '數字',
    select: '單選（下拉或按鈕）',
    multiselect: '複選',
    radio: '單選（並列）',
    boolean: '切換或勾選',
    files: '檔案上傳（多檔，答案不存檔案，另以 files 傳送）',
    links: '雲端連結（可增列，每筆 { url, note }）',
    list: '可增列的文字清單（字串陣列；有 count 時為固定筆數）'
  };

  /* ------------------------------------------------------------------ */
  /* 資料上傳                                                            */
  /* ------------------------------------------------------------------ */
  /** 每一類共用欄位（files 不存入 answers，以 files[].key = 'uploads.<類別 id>' 傳送） */
  var UPLOAD_FIELDS = [
    { id: 'status', label: '狀態', type: 'radio', options: OPTIONS.uploadStatus, required: false },
    { id: 'files', label: '上傳檔案', type: 'files', placeholder: '圖片、PDF、Word、Excel、PowerPoint，單檔 20MB；影片改貼雲端連結', required: false, showIf: { field: 'status', equals: 'yes' } },
    {
      id: 'links', label: '雲端連結', type: 'links', required: false, showIf: { field: 'status', equals: 'yes' },
      placeholder: '影片或大型檔案；Google 雲端硬碟、文件、試算表、表單皆可',
      notice: '共用對象 ' + SHARE_EMAIL + '（可檢視）',
      itemFields: [
        { id: 'url', label: '網址', type: 'text', placeholder: '例：https://drive.google.com/…' },
        { id: 'note', label: '說明', type: 'text', placeholder: '例：2026 年培訓錄影' }
      ]
    },
    { id: 'note', label: '補充說明', type: 'textarea', placeholder: '沒有書面檔案的內容直接以文字說明，例如口頭規則', required: false, showIf: { field: 'status', equals: 'yes' } }
  ];

  /** 參考項目：{ key（識別碼）, label, primary（重點項目）, note } */
  function ref(key, label, primary) {
    return { key: key, label: label, primary: !!primary, note: '' };
  }
  /** 每類最後固定的參考項目 */
  var REF_OTHER = { key: 'other', label: '其他相關資料' };
  function refs(list, otherLabel) {
    return list.concat([ref(REF_OTHER.key, otherLabel || REF_OTHER.label)]);
  }

  /**
   * 11 類資料（2.3 移除「收款帳務」finance）。def 為範圍定義（desc 同值）；refs 為舉例標籤（不是欄位），最後一項固定為 key 'other'；
   * primary:true 為重點項目。roles：出現的身分；condition：經銷合作需有下線夥伴才出現。
   */
  function cat(o) { o.desc = o.def; return o; }
  /** 已移除的類別 id：舊答案含這些鍵時讀取忽略（normalizeAnswers 去除、各身分對應與匯出皆不列） */
  var LEGACY_CATEGORY_IDS = ['finance'];
  var UPLOAD_CATEGORIES = [
    cat({ id: 'brand', label: '品牌門面', icon: 'storefront', def: '與品牌形象有關的資料',
      roles: ['owner', 'manager', 'freelancer', 'reseller'],
      refs: refs([ref('logo', 'Logo'), ref('social', '社群帳號'), ref('website', '官網'), ref('portfolio', '作品集'), ref('reviews', '客戶評價')]) }),
    cat({ id: 'reception', label: '客戶接待', icon: 'chat', def: '與回覆及接待客人有關的資料',
      roles: ALL_ROLES,
      refs: refs([ref('lineOa', 'LINE 官方帳號設定'), ref('autoReply', '自動回覆'), ref('faq', '常見問答'), ref('booking', '預約方式'), ref('intake', '諮詢單')]) }),
    cat({ id: 'sales', label: '銷售資料', icon: 'tag', def: '與販售服務或產品有關的資料',
      roles: ALL_ROLES,
      refs: refs([ref('priceList', '價目表'), ref('serviceIntro', '服務介紹'), ref('quote', '報價單'), ref('scripts', '常用話術'), ref('cases', '成交案例'), ref('contract', '合約')]) }),
    cat({ id: 'marketing', label: '行銷資料', icon: 'megaphone', def: '與宣傳及推廣有關的資料',
      roles: ALL_ROLES,
      refs: refs([ref('posts', '貼文素材'), ref('campaign', '活動企劃'), ref('adCopy', '廣告文案')]) }),
    cat({ id: 'delivery', label: '服務交付', icon: 'package', def: '與提供服務過程有關的資料',
      roles: ALL_ROLES,
      refs: refs([ref('process', '服務流程'), ref('notice', '服務前通知'), ref('record', '服務紀錄'), ref('aftercare', '售後說明')]) }),
    cat({ id: 'crm', label: '客戶管理', icon: 'users', def: '與客人資料及消費紀錄有關的資料',
      roles: ALL_ROLES,
      refs: refs([ref('clientList', '客戶名單', true), ref('purchases', '消費紀錄', true), ref('followUp', '回訪紀錄')]) }),
    cat({ id: 'rules', label: '制度權益', icon: 'shield', def: '客人與品牌之間的規則及權益',
      roles: ALL_ROLES,
      roleHints: { manager: '限與自身團隊相關的規則與權益' },
      refs: refs([ref('cancel', '預約與取消'), ref('refund', '付款與退款'), ref('offers', '優惠方案'), ref('points', '會員點數'), ref('warranty', '售後保固')]) }),
    cat({ id: 'team', label: '團隊管理', icon: 'team', def: '與管理團隊成員有關的資料',
      roles: ['owner', 'manager', 'reseller'], condition: DOWNLINE_COND,
      refs: refs([ref('roles', '職位說明'), ref('handbook', '員工手冊'), ref('shifts', '排班表'), ref('payroll', '薪資計算'), ref('appraisal', '考核標準'), ref('norms', '團隊規範')]) }),
    cat({ id: 'training', label: '內部培訓', icon: 'book', def: '與教育訓練有關的資料',
      roles: ['owner', 'manager', 'employee', 'reseller'], condition: DOWNLINE_COND,
      refs: refs([ref('materials', '培訓教材'), ref('slides', '課件'), ref('newcomer', '新人手冊'), ref('recordings', '培訓錄影')]) }),
    cat({ id: 'meetings', label: '會議記錄', icon: 'notes', def: '與內部溝通及檢討有關的紀錄',
      roles: ['owner', 'manager', 'employee', 'reseller'], condition: DOWNLINE_COND,
      refs: refs([ref('minutes', '會議記錄'), ref('weekly', '週報'), ref('retro', '檢討紀錄')]) }),
    cat({ id: 'misc', label: '未分類', icon: 'inbox', def: '尚未整理或不確定歸類的資料',
      roles: ALL_ROLES,
      refs: refs([], '任何資料') })
  ];

  /* ------------------------------------------------------------------ */
  /* 流程                                                                */
  /* ------------------------------------------------------------------ */
  /** 使用工具快選標籤（前台 chips；答案 tools 陣列只存這些值，自填文字存 toolsOther） */
  var TOOL_OPTIONS = ['LINE', 'IG', 'Facebook', 'Google 表單', 'Google 日曆', 'Excel', '紙本', '電話'];

  /** 步驟 id 格式（模板固定 id；自訂由前台產生，例 c_x7k2qp） */
  var STAGE_ID_RE = /^[a-z0-9_]{1,40}$/;
  var UNANSWERED_LABEL = '未填寫';

  /**
   * 每步驟欄位（shots 不存入 answers，以 files[].key = '<流程 id>.<步驟 id>' 傳送）。
   * status：有做法／尚無做法／不適用；handling 只在 status＝doing 時出現。
   */
  var FLOW_STAGE_FIELDS = [
    { id: 'name', label: '步驟名稱', type: 'text', placeholder: '例：確認時段', maxLength: LIMITS.maxStageNameLength, required: false },
    { id: 'status', label: '狀態', type: 'radio', options: OPTIONS.stageStatus, required: false },
    { id: 'handling', label: '處理方式', type: 'radio', options: OPTIONS.stageHandling, required: false, showIf: { field: 'status', equals: 'doing' } },
    { id: 'steps', label: '實際做法', type: 'list', placeholder: '依先後順序逐條列出，例：客人私訊詢問 → 回覆價目表 → 確認時段', required: false, showIf: { field: 'status', equals: 'doing' } },
    { id: 'tools', label: '使用工具', type: 'multiselect', options: TOOL_OPTIONS, otherField: 'toolsOther', placeholder: '可複選', required: false, showIf: { field: 'status', equals: 'doing' } },
    { id: 'toolsOther', label: '其他工具', type: 'text', placeholder: '其他工具，例：Notion、記帳 App', required: false, showIf: { field: 'status', equals: 'doing' } },
    { id: 'shots', label: '截圖', type: 'files', placeholder: '此步驟的畫面或紀錄（選填）', required: false, showIf: { field: 'status', equals: 'doing' } }
  ];

  /** 流程編輯規則（前台據此控制新增、刪除、排序） */
  var FLOW_RULES = {
    maxStages: LIMITS.maxFlowStages,
    templateDeletable: false,      // 模板步驟不可刪除，只能設為不適用
    templateRenamable: true,       // 模板步驟可改名（templateName 保留原名稱）
    reorderable: true,             // 模板與自訂步驟皆可排序
    customIdPrefix: 'c_',
    idPattern: '^[a-z0-9_]{1,40}$'
  };

  function stage(id, label, icon, desc) {
    return { id: id, label: label, icon: icon, desc: desc, hint: desc };
  }

  /* ------------------------------------------------------------------ */
  /* 區塊                                                                */
  /* ------------------------------------------------------------------ */
  var SECTIONS = [
    /* 1 學員資料 ------------------------------------------------------ */
    {
      id: 'student', label: '學員資料', kind: 'fields', icon: 'idcard',
      roles: ALL_ROLES,
      desc: '學院學員身分核對',
      fields: [
        { id: 'account', label: '學員帳號', type: 'text', placeholder: '官網登入帳號', required: true },
        { id: 'name', label: '本名', type: 'text', placeholder: '與官網註冊相同的本名', required: true }
      ]
    },

    /* 2 身分選擇 ------------------------------------------------------ */
    {
      id: 'role', label: '身分選擇', kind: 'role', icon: 'person',
      roles: ALL_ROLES,
      desc: '依身分顯示對應題目',
      fields: [
        { id: 'id', label: '身分', type: 'radio', options: ROLES.map(function (r) { return { id: r.id, label: r.label, desc: r.desc, icon: r.icon }; }), required: true },
        { id: 'hasDownline', label: '下線夥伴', type: 'radio', options: OPTIONS.yesNo, placeholder: '由本人帶領、輔導或抽成的下線夥伴有無', notice: '選「有」時，團隊流程與團隊管理、內部培訓、會議記錄一併出現', required: true, showIf: { field: 'role.id', equals: 'reseller' } }
      ]
    },

    /* 3 基本輪廓 ------------------------------------------------------ */
    {
      id: 'profile', label: '基本輪廓', kind: 'fields', icon: 'briefcase',
      roles: ALL_ROLES,
      desc: '行業、品牌與營運樣貌',
      roleHints: {
        owner: '以自家品牌或店家的現況填寫',
        manager: '以任職公司與自身團隊的現況填寫',
        employee: '以任職公司與本人負責的業務填寫',
        freelancer: '以個人接案的現況填寫',
        reseller: '以經銷或代理的品牌與本人的經營現況填寫'
      },
      fields: [
        { id: 'industry', label: '行業類別', type: 'select', options: OPTIONS.industry, otherField: 'industryOther', placeholder: '選擇最接近的類別', required: false },
        { id: 'industryOther', label: '其他行業', type: 'text', placeholder: '例：寵物美容、婚禮顧問', required: false, showIf: { field: 'profile.industry', equals: '其他' } },
        { id: 'brand', label: '品牌名稱', type: 'text', placeholder: '店名、品牌名或經銷品牌', required: false, roles: ['owner', 'freelancer', 'reseller'] },
        { id: 'company', label: '任職公司', type: 'text', placeholder: '目前任職的公司名稱', required: false, roles: EMPLOYED_ROLES },
        { id: 'title', label: '職稱', type: 'text', placeholder: '例：店長、工程師、業務專員', required: false, roles: EMPLOYED_ROLES },
        { id: 'business', label: '主要業務', type: 'textarea', placeholder: '品牌在做的事與販售的服務或產品', required: false },
        { id: 'serviceMode', label: '服務形式', type: 'multiselect', options: OPTIONS.serviceMode, placeholder: '可複選', required: false },
        { id: 'scale', label: '營運規模', type: 'select', options: OPTIONS.scale, placeholder: '目前的人力配置', required: false, roles: ['owner', 'manager', 'freelancer', 'reseller'] },
        { id: 'headcount', label: '團隊人數', type: 'number', unit: '人', placeholder: '例：6', min: 1, required: false, roles: ['owner', 'manager', 'freelancer', 'reseller'], showIf: { field: 'profile.scale', equals: '團隊' } }
      ]
    },

    /* 4 資料上傳 ------------------------------------------------------ */
    {
      id: 'uploads', label: '資料上傳', kind: 'uploads', icon: 'upload',
      roles: ALL_ROLES,
      desc: '現有資源盤點與整理',
      hint: '為協助優化方案更貼近實際狀況，此區依學姐現有資源進行盤點與整理。建議於電腦前操作，依設備中既有的資料夾分類，逐一帶入對應類別。',
      notice: '影片或大型檔案以雲端連結提供，共用對象 ' + SHARE_EMAIL + '（可檢視）',
      itemFields: UPLOAD_FIELDS,
      categories: UPLOAD_CATEGORIES
    },

    /* 5 客戶流程 ------------------------------------------------------ */
    {
      id: 'customerFlow', label: '客戶流程', kind: 'flow', icon: 'route',
      roles: ALL_ROLES,
      desc: '從被發現到回購轉介的實際做法',
      roleHints: {
        employee: '以本人經手的部分填寫，由他人負責的步驟可標示不適用',
        reseller: '以終端客人向本人購買的路徑填寫'
      },
      headFields: [
        { id: 'target', label: '服務對象', type: 'radio', options: OPTIONS.flowTarget, required: false }
      ],
      stageFields: FLOW_STAGE_FIELDS,
      stages: [
        stage('discover', '被發現', 'search', '客人第一次知道品牌或服務的管道'),
        stage('contact', '第一次接觸', 'wave', '客人第一次主動聯繫時的處理'),
        stage('quote', '詢問報價', 'receipt', '價格與方案的說明方式'),
        stage('booking', '預約', 'calendar', '時段確認與預約成立'),
        stage('prep', '服務前準備', 'checklist', '服務前的提醒、備料與確認'),
        stage('service', '服務中', 'sparkle', '服務當下的流程與紀錄'),
        stage('payment', '收款', 'card', '收款與開立憑證'),
        stage('aftercare', '售後追蹤', 'heart', '服務後的關心與問題處理'),
        stage('repeat', '回購轉介', 'refresh', '促成再次消費與介紹新客')
      ]
    },

    /* 6 團隊流程 ------------------------------------------------------ */
    {
      id: 'teamFlow', label: '團隊流程', kind: 'flow', icon: 'team',
      roles: LEAD_ROLES, condition: DOWNLINE_COND,
      desc: '從招募到薪資計算的實際做法',
      roleHints: {
        manager: '以自身團隊的管理方式填寫，公司統一處理的步驟可標示不適用',
        reseller: '以帶領下線夥伴的方式填寫'
      },
      headFields: [],
      stageFields: FLOW_STAGE_FIELDS,
      stages: [
        stage('recruit', '招募', 'user-plus', '找人的管道與條件'),
        stage('interview', '面試錄用', 'clipboard', '面談、試做與錄用決定'),
        stage('training', '教育訓練', 'book', '新人上手的訓練方式'),
        stage('schedule', '排班', 'calendar', '班表安排與調整'),
        stage('dispatch', '派工', 'send', '工作分配的方式'),
        stage('handover', '交接回報', 'swap', '工作交接與進度回報'),
        stage('review', '考核', 'star', '表現評估與回饋'),
        stage('payroll', '薪資計算', 'coins', '薪資、抽成與分潤的計算與發放')
      ]
    },

    /* 7 協作流程 ------------------------------------------------------ */
    {
      id: 'collabFlow', label: '協作流程', kind: 'flow', icon: 'handshake',
      roles: ['manager', 'employee', 'reseller'],
      desc: '從接收任務到考核的實際做法',
      roleHints: {
        manager: '以向上回報與跨部門協作填寫',
        employee: '以接收主管任務到完成回報的流程填寫',
        reseller: '以與上線之間的協作填寫'
      },
      roleNotices: { reseller: '以與上線之間的協作填寫' },
      headFields: [],
      stageFields: FLOW_STAGE_FIELDS,
      stages: [
        stage('receive', '接收任務', 'inbox', '任務指派的來源與方式'),
        stage('execute', '執行', 'play', '執行過程中的依據與工具'),
        stage('report', '進度回報', 'chart', '回報的頻率與形式'),
        stage('handoff', '交接', 'swap', '工作交接給他人的方式'),
        stage('evaluate', '考核', 'star', '被評估的項目與方式')
      ]
    },

    /* 8 對話紀錄 ------------------------------------------------------ */
    {
      id: 'dialog', label: '對話紀錄', kind: 'fields', icon: 'message',
      roles: ALL_ROLES,
      desc: '真實對話紀錄與常見提問',
      notice: '截圖中的姓名與電話可遮蔽',
      roleHints: {
        employee: '以本人回覆客人或內部需求方的對話為主',
        reseller: '可同時包含客人對話與下線夥伴的提問'
      },
      fields: [
        { id: 'bookedShots', label: '完成預約', type: 'files', placeholder: '一段客人從詢問到完成預約或購買的對話', legacyKey: 'wonShots', required: false },
        { id: 'silentShots', label: '詢問後未回覆', type: 'files', placeholder: '一段客人詢問後沒有下文的對話', legacyKey: 'lostShots', required: false },
        { id: 'faq', label: '常見提問', type: 'list', count: 5, placeholder: '最常被問的五個問題，例：多少錢、要多久、可以先試嗎', required: false },
        { id: 'privacyAck', label: '個資提示', type: 'boolean', placeholder: '截圖中的姓名與電話已遮蔽或已知悉可遮蔽', required: false }
      ]
    },

    /* 9 最想省下的時間 ------------------------------------------------ */
    {
      id: 'timeSavers', label: '最想省下的時間', kind: 'fields', icon: 'clock',
      roles: ALL_ROLES,
      desc: '日常最耗時、最希望交出去的工作',
      fields: [
        { id: 'tasks', label: '最耗時的工作', type: 'list', placeholder: '日常工作中最花時間、最希望不用再做的事', examples: ['每天逐一回覆預約訊息', '月底手動對帳', '每次重新教新人同樣內容'], required: false }
      ]
    }
  ];

  var FLOW_IDS = ['customerFlow', 'teamFlow', 'collabFlow'];

  /* ------------------------------------------------------------------ */
  /* 缺口摘要（PDF 開頭與後台摘要共用）                                   */
  /* ------------------------------------------------------------------ */
  var GAP_RULES = {
    uploadsMissing: { label: '資料狀態為「無」的類別' },
    crmKey: { label: '客戶管理重點項目', items: ['客戶名單', '消費紀錄'] },
    links: { label: '雲端連結清單', notice: '以 ' + SHARE_EMAIL + ' 開啟' },
    noneStages: { label: '尚無做法的步驟' },
    manualStages: { label: '人工處理的步驟' },
    naStages: { label: '標為不適用的步驟' },
    unansweredStages: { label: '未填寫的步驟' },
    incompleteStages: { label: '未選處理方式的步驟' }
  };

  /** 舊附件位置 → 新位置（讀取與送出相容） */
  var LEGACY_FILE_KEYS = { 'dialog.wonShots': 'dialog.bookedShots', 'dialog.lostShots': 'dialog.silentShots' };

  /* ------------------------------------------------------------------ */
  /* 匯出工作表（xlsx）                                                   */
  /* ------------------------------------------------------------------ */
  var EXPORT_TABS = [
    { id: 'index', name: '索引', headers: ['回執編號', '送出時間', '本名', '學員帳號', '身分', '行業', '品牌名稱', '檔案數', '缺口數', '狀態', '資料夾連結', '開始時間', '填寫耗時（分）', '批次', '準時'] },
    { id: 'profile', name: '基本輪廓', headers: ['回執編號', '本名', '身分', '下線夥伴', '行業類別', '品牌名稱', '任職公司', '職稱', '主要業務', '服務形式', '營運規模', '團隊人數'] },
    { id: 'uploads', name: '資料上傳', headers: ['回執編號', '本名', '類別', '狀態', '檔案數', '連結數', '補充說明'] },
    { id: 'links', name: '雲端連結', headers: ['回執編號', '本名', '類別', '網址', '說明'] },
    { id: 'flows', name: '流程', headers: ['回執編號', '本名', '流程', '服務對象', '序號', '步驟名稱', '模板或自訂', '狀態', '處理方式', '做法', '工具', '其他工具', '截圖數'] },
    { id: 'dialog', name: '對話紀錄', headers: ['回執編號', '本名', '完成預約截圖數', '詢問後未回覆截圖數', '常見提問 1', '常見提問 2', '常見提問 3', '常見提問 4', '常見提問 5', '個資提示'] },
    { id: 'timeSavers', name: '最想省下的時間', headers: ['回執編號', '本名', '序號', '最耗時的工作'] }
  ];

  /* ------------------------------------------------------------------ */
  /* 工具函式                                                            */
  /* ------------------------------------------------------------------ */
  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function isEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return !v.some(function (x) { return !isEmpty(x); });
    if (typeof v === 'object') return false;
    return String(v).trim() === '';
  }

  /** 判斷 showIf／condition 是否成立；ctx 為整份答案（或類別資料） */
  function evalCondition(cond, ctx, roleId) {
    if (!cond) return true;
    if (cond.onlyForRole && roleId !== cond.onlyForRole) return true;
    var v = getPath(ctx, cond.field);
    if (Object.prototype.hasOwnProperty.call(cond, 'equals')) return v === cond.equals;
    if (cond.in) return cond.in.indexOf(v) >= 0;
    if (cond.notIn) return cond.notIn.indexOf(v) < 0;
    if (cond.includes) return Array.isArray(v) && v.indexOf(cond.includes) >= 0;
    return true;
  }

  function roleById(id) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i];
    return null;
  }

  /** 身分是否帶人（經銷合作依「下線夥伴」判斷） */
  function roleLeads(roleId, answers) {
    var r = roleById(roleId);
    if (!r) return false;
    if (r.leads === 'conditional') return getPath(answers || {}, 'role.hasDownline') === 'yes';
    return !!r.leads;
  }

  function sectionById(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i];
    return null;
  }

  function categoryById(id) {
    for (var i = 0; i < UPLOAD_CATEGORIES.length; i++) if (UPLOAD_CATEGORIES[i].id === id) return UPLOAD_CATEGORIES[i];
    return null;
  }

  function visibleFor(item, roleId, answers) {
    if (item.roles && item.roles.indexOf(roleId) < 0) return false;
    if (item.condition && !evalCondition(item.condition, answers || {}, roleId)) return false;
    return true;
  }

  /** 依身分（與答案中的條件）回傳可見區塊 */
  function sectionsForRole(roleId, answers) {
    return SECTIONS.filter(function (s) { return visibleFor(s, roleId, answers); });
  }

  /** 依身分回傳資料上傳可見類別 */
  function categoriesForRole(roleId, answers) {
    return UPLOAD_CATEGORIES.filter(function (c) { return visibleFor(c, roleId, answers); });
  }

  /** 區塊內依身分與 showIf 可見的欄位（section 可傳物件或 id） */
  function fieldsForRole(section, roleId, answers) {
    var sec = typeof section === 'string' ? sectionById(section) : section;
    if (!sec || !sec.fields) return [];
    return sec.fields.filter(function (f) {
      if (f.roles && f.roles.indexOf(roleId) < 0) return false;
      if (f.showIf && !evalCondition(f.showIf, answers || {}, roleId)) return false;
      return true;
    });
  }

  /** 區塊說明文字：身分提示 → 區塊 hint（較完整的說明，例：資料上傳）→ desc */
  function sectionHint(section, roleId) {
    return (section.roleHints && section.roleHints[roleId]) || section.hint || section.desc || '';
  }

  /** 身分專屬提示（例：經銷合作的協作流程），無則空字串 */
  function sectionNotice(section, roleId) {
    return (section.roleNotices && section.roleNotices[roleId]) || '';
  }

  function categoryHint(cat, roleId) {
    return (cat.roleHints && cat.roleHints[roleId]) || '';
  }

  /* ---- 流程步驟 ------------------------------------------------------ */
  function isFlowId(id) { return FLOW_IDS.indexOf(id) >= 0; }

  function templateStage(flowId, stageId) {
    var sec = sectionById(flowId);
    if (!sec || !sec.stages) return null;
    for (var i = 0; i < sec.stages.length; i++) if (sec.stages[i].id === stageId) return sec.stages[i];
    return null;
  }

  function blankStage(t) {
    return { id: t.id, template: true, templateName: t.label, name: t.label, status: '', handling: '', steps: [], tools: [], toolsOther: '' };
  }

  /** 預設骨架：模板步驟（固定 id、template:true、name 與 templateName 為原名稱），依預設順序 */
  function defaultStages(flowId) {
    var sec = sectionById(flowId);
    if (!sec || !sec.stages) return [];
    return sec.stages.map(blankStage);
  }

  function cleanStr(v) { return String(v == null ? '' : v).trim(); }

  /** 舊格式單一步驟 { na, steps, tools, toolsOther } → 狀態：na→'na'、有內容→'doing'、無→'' */
  function legacyStatus(v) {
    if (!v || typeof v !== 'object') return '';
    if (v.na) return 'na';
    if (listOf(v.steps).length || toolsText(v)) return 'doing';
    return '';
  }

  /**
   * 流程答案正規化：舊格式 stages{id:{na,steps,tools}} 轉為有序陣列；補齊缺少的模板步驟（插在預設順序的鄰近位置）；
   * 去除重複 id；模板步驟名稱空白時還原 templateName；status 非 doing 時清除 handling；
   * template 旗標一律依 id 是否為模板步驟判定（不信任前台）。值域與格式錯誤保留給 checkFlows 判斷。
   * 回傳 { ...flow, stages:[...] }（新物件）
   */
  function normalizeFlow(flowId, flow) {
    var sec = sectionById(flowId);
    var src = flow && typeof flow === 'object' ? flow : {};
    var out = {};
    Object.keys(src).forEach(function (k) { if (k !== 'stages') out[k] = src[k]; });
    if (sec && sec.headFields) sec.headFields.forEach(function (f) { if (out[f.id] == null) out[f.id] = ''; });
    var raw = src.stages;
    var list = [];
    if (Array.isArray(raw)) {
      list = raw.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
        var id = cleanStr(x.id);
        var t = templateStage(flowId, id);
        var tl = stageTools(x);
        var st = {
          id: id, template: !!t,
          templateName: t ? t.label : '',
          name: cleanStr(x.name),
          status: x.status == null ? '' : x.status,
          handling: x.handling == null ? '' : x.handling,
          steps: listOf(x.steps), tools: tl.tools, toolsOther: tl.toolsOther
        };
        if (t && !st.name) st.name = t.label;
        if (st.status !== 'doing') st.handling = '';
        return st;
      });
    } else if (raw && typeof raw === 'object') {
      // 舊格式：鍵為模板步驟 id
      list = (sec ? sec.stages : []).map(function (t) {
        var v = raw[t.id];
        var st = blankStage(t);
        if (v && typeof v === 'object') {
          var tl = stageTools(v);
          st.status = legacyStatus(v);
          if (st.status === 'doing') { st.steps = listOf(v.steps); st.tools = tl.tools; st.toolsOther = tl.toolsOther; }
        }
        return st;
      });
    }
    // 去除重複 id（保留第一個）
    var seen = {};
    list = list.filter(function (st) {
      if (seen['k' + st.id]) return false;
      seen['k' + st.id] = 1;
      return true;
    });
    // 補齊模板步驟：插在預設順序中前一個已存在模板步驟之後
    if (sec && sec.stages) {
      sec.stages.forEach(function (t, ti) {
        if (seen['k' + t.id]) return;
        var pos = 0;
        for (var j = ti - 1; j >= 0; j--) {
          var prevId = sec.stages[j].id;
          var at = -1;
          for (var k = 0; k < list.length; k++) if (list[k].id === prevId) { at = k; break; }
          if (at >= 0) { pos = at + 1; break; }
        }
        list.splice(pos, 0, blankStage(t));
        seen['k' + t.id] = 1;
      });
    }
    out.stages = list;
    return out;
  }

  /** 取得流程步驟陣列（相容舊格式） */
  function flowStages(flowId, answers) {
    return normalizeFlow(flowId, (answers || {})[flowId]).stages;
  }

  function stageDisplayName(st) {
    return cleanStr(st && st.name) || cleanStr(st && st.templateName) || '未命名步驟';
  }

  /** 流程計數：{ total, template, custom, status:{doing,none,na,unanswered}, handling:{manual,partial,auto,unset} } */
  function flowSummary(flowId, flow) {
    var stages = normalizeFlow(flowId, flow).stages;
    var sum = { total: stages.length, template: 0, custom: 0, status: { doing: 0, none: 0, na: 0, unanswered: 0 }, handling: { manual: 0, partial: 0, auto: 0, unset: 0 } };
    stages.forEach(function (st) {
      if (st.template) sum.template++; else sum.custom++;
      if (st.status === 'doing' || st.status === 'none' || st.status === 'na') sum.status[st.status]++;
      else sum.status.unanswered++;
      if (st.status === 'doing') {
        if (st.handling === 'manual' || st.handling === 'partial' || st.handling === 'auto') sum.handling[st.handling]++;
        else sum.handling.unset++;
      }
    });
    return sum;
  }

  /**
   * 流程圖節點資料（前後台畫圖用）：
   * { flowId, label, nodes:[{ order, id, name, templateName, renamed, template, custom, icon, status, statusLabel, handling, handlingLabel }], summary }
   */
  function flowDiagram(flowId, flow) {
    var sec = sectionById(flowId);
    var stages = normalizeFlow(flowId, flow).stages;
    return {
      flowId: flowId, label: sec ? sec.label : flowId,
      nodes: stages.map(function (st, i) {
        var t = st.template ? templateStage(flowId, st.id) : null;
        return {
          order: i + 1, id: st.id, name: stageDisplayName(st), templateName: st.templateName || '',
          renamed: !!st.template && stageDisplayName(st) !== st.templateName,
          template: !!st.template, custom: !st.template, icon: t ? t.icon : 'plus',
          status: st.status || '', statusLabel: stageStatusLabel(st.status),
          handling: st.status === 'doing' ? (st.handling || '') : '',
          handlingLabel: st.status === 'doing' ? stageHandlingLabel(st.handling) : ''
        };
      }),
      summary: flowSummary(flowId, flow)
    };
  }

  function stageStatusLabel(v) {
    if (!v) return UNANSWERED_LABEL;
    for (var i = 0; i < OPTIONS.stageStatus.length; i++) if (OPTIONS.stageStatus[i].id === v) return OPTIONS.stageStatus[i].label;
    return String(v);
  }
  function stageHandlingLabel(v) {
    for (var i = 0; i < OPTIONS.stageHandling.length; i++) if (OPTIONS.stageHandling[i].id === v) return OPTIONS.stageHandling[i].label;
    return '';
  }

  /** 前台產生自訂步驟 id（c_ + 6 碼），避開既有 id */
  function newCustomStageId(existing) {
    var used = {};
    (existing || []).forEach(function (x) { used[typeof x === 'string' ? x : (x && x.id)] = 1; });
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var n = 0; n < 1000; n++) {
      var id = FLOW_RULES.customIdPrefix;
      for (var i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
      if (!used[id]) return id;
    }
    return FLOW_RULES.customIdPrefix + Date.now().toString(36);
  }

  /** 空白自訂步驟（前台新增用） */
  function customStage(name, existing) {
    return { id: newCustomStageId(existing), template: false, templateName: '', name: cleanStr(name), status: '', handling: '', steps: [], tools: [], toolsOther: '' };
  }

  /**
   * 流程驗證（只檢查依身分可見的流程；answers 應先經 normalizeAnswers）：
   * 步驟數上限、id 格式與不重複、名稱長度、status 與 handling 值域。doing 未選 handling 不擋送出。
   * 回傳 null 或 { code:'FLOW_STAGE', errorCode, message, path }
   */
  function checkFlows(answers) {
    var roleId = getPath(answers, 'role.id');
    var secs = sectionsForRole(roleId, answers).filter(function (s) { return s.kind === 'flow'; });
    var okStatus = ['', 'doing', 'none', 'na'], okHandling = ['', 'manual', 'partial', 'auto'];
    for (var i = 0; i < secs.length; i++) {
      var sec = secs[i];
      var flow = answers[sec.id];
      if (flow == null) continue;
      var stages = flow.stages;
      if (!Array.isArray(stages)) return issue('FLOW_STAGE', sec.label + '：步驟格式不正確', { path: sec.id + '.stages' });
      if (stages.length > FLOW_RULES.maxStages) return issue('FLOW_STAGE', sec.label + '：步驟超過上限 ' + FLOW_RULES.maxStages + ' 步', { path: sec.id + '.stages' });
      var seen = {};
      for (var j = 0; j < stages.length; j++) {
        var st = stages[j];
        var path = sec.id + '.stages.' + j;
        if (!st || typeof st !== 'object') return issue('FLOW_STAGE', sec.label + '：第 ' + (j + 1) + ' 步格式不正確', { path: path });
        if (typeof st.id !== 'string' || !STAGE_ID_RE.test(st.id)) return issue('FLOW_STAGE', sec.label + '：第 ' + (j + 1) + ' 步識別碼格式不正確', { path: path });
        if (seen['k' + st.id]) return issue('FLOW_STAGE', sec.label + '：步驟識別碼重複', { path: path });
        seen['k' + st.id] = 1;
        if (String(st.name == null ? '' : st.name).length > LIMITS.maxStageNameLength) return issue('FLOW_STAGE', sec.label + '：步驟名稱超過 ' + LIMITS.maxStageNameLength + ' 字', { path: path + '.name' });
        if (okStatus.indexOf(st.status == null ? '' : st.status) < 0) return issue('FLOW_STAGE', sec.label + '：' + stageDisplayName(st) + ' 狀態值不正確', { path: path + '.status' });
        if (okHandling.indexOf(st.handling == null ? '' : st.handling) < 0) return issue('FLOW_STAGE', sec.label + '：' + stageDisplayName(st) + ' 處理方式值不正確', { path: path + '.handling' });
      }
    }
    return null;
  }

  /** 空白答案骨架 */
  function emptyAnswers() {
    var a = {
      student: { account: '', name: '' },
      role: { id: '', hasDownline: '' },
      profile: { industry: '', industryOther: '', brand: '', company: '', title: '', business: '', serviceMode: [], scale: '', headcount: '' },
      uploads: {},
      dialog: { faq: ['', '', '', '', ''], privacyAck: false },
      timeSavers: { tasks: [] }
    };
    UPLOAD_CATEGORIES.forEach(function (c) { a.uploads[c.id] = { status: '', links: [], note: '' }; });
    FLOW_IDS.forEach(function (id) {
      var sec = sectionById(id);
      a[id] = {};
      sec.headFields.forEach(function (f) { a[id][f.id] = ''; });
      a[id].stages = defaultStages(id);
    });
    return a;
  }

  /** 舊附件位置轉新位置（dialog.wonShots → dialog.bookedShots、dialog.lostShots → dialog.silentShots） */
  function canonicalFileKey(key) {
    return LEGACY_FILE_KEYS[key] || key;
  }

  /** 附件清單的位置統一為新鍵（回傳新陣列，不改動原物件） */
  function normalizeFiles(files) {
    if (!Array.isArray(files)) return files;
    return files.map(function (f) {
      if (!f || typeof f !== 'object') return f;
      var c = {};
      for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) c[k] = f[k];
      c.key = canonicalFileKey(f.key);
      return c;
    });
  }

  /**
   * 檔案上傳位置：回傳 [{key, label, section, category?, stage?, custom?}]；key 為上傳與命名用的路徑。
   * answers 有傳時，流程位置依該份答案的步驟（含自訂步驟）；未傳時為模板步驟。
   */
  function fileFields(answers) {
    var out = [];
    UPLOAD_CATEGORIES.forEach(function (c) {
      out.push({ key: 'uploads.' + c.id, label: c.label, section: 'uploads', category: c.id });
    });
    FLOW_IDS.forEach(function (fid) {
      var sec = sectionById(fid);
      var stages = answers ? flowStages(fid, answers) : defaultStages(fid);
      stages.forEach(function (st) {
        if (typeof st.id !== 'string' || !STAGE_ID_RE.test(st.id)) return;
        out.push({ key: fid + '.' + st.id, label: sec.label + '-' + stageDisplayName(st), section: fid, stage: st.id, custom: !st.template });
      });
    });
    SECTIONS.forEach(function (s) {
      if (s.kind !== 'fields') return;
      s.fields.forEach(function (f) {
        if (f.type === 'files') out.push({ key: s.id + '.' + f.id, label: s.label + '-' + f.label, section: s.id });
      });
    });
    return out;
  }

  /** 依身分可用的檔案上傳位置（流程位置依該份答案的步驟） */
  function fileFieldsForRole(roleId, answers) {
    var secIds = sectionsForRole(roleId, answers).map(function (s) { return s.id; });
    var catIds = categoriesForRole(roleId, answers).map(function (c) { return c.id; });
    return fileFields(answers || {}).filter(function (f) {
      if (secIds.indexOf(f.section) < 0) return false;
      if (f.category && catIds.indexOf(f.category) < 0) return false;
      return true;
    });
  }

  /** 位置的中文名（檔名用）；answers 有傳時自訂步驟以其名稱顯示；舊鍵相容 */
  function fileLabelForKey(key, answers) {
    key = canonicalFileKey(key);
    var list = fileFields(answers);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    var parts = String(key || '').split('.');
    if (parts.length === 2 && isFlowId(parts[0])) return sectionById(parts[0]).label + '-自訂步驟';
    return key;
  }

  /** 必填檢查：回傳 [{path, label}] */
  function validate(answers) {
    var errors = [];
    var roleId = getPath(answers, 'role.id');
    sectionsForRole(roleId || 'owner', answers).forEach(function (s) {
      if (s.kind !== 'fields' && s.kind !== 'role') return;
      fieldsForRole(s, roleId, answers).forEach(function (f) {
        if (!f.required) return;
        var v = getPath(answers, s.id + '.' + f.id);
        if (isEmpty(v)) errors.push({ path: s.id + '.' + f.id, label: f.label });
      });
    });
    return errors;
  }

  /* ---- 檔案 ---------------------------------------------------------- */
  /** 檔名副檔名（小寫，無則空字串） */
  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function cleanMime(mime) { return String(mime || '').toLowerCase().split(';')[0].trim(); }

  /** 影片判定：副檔名為影片或 MIME 為 video/* */
  function isVideo(name, mime) {
    return VIDEO_EXT.indexOf(extOf(name)) >= 0 || cleanMime(mime).indexOf('video/') === 0;
  }

  /**
   * 判定附件的有效副檔名：副檔名或 MIME 任一在白名單即可；
   * 檔名無合法副檔名時依 MIME 補上（例 image/jpeg → jpg），供檔名規則使用。影片或不支援時回傳 ''。
   */
  function extForFile(name, mime) {
    if (isVideo(name, mime)) return '';
    var ext = extOf(name);
    if (LIMITS.acceptExt.indexOf(ext) >= 0) return ext;
    return LIMITS.mimeToExt[cleanMime(mime)] || '';
  }

  function issue(code, message, extra) {
    var out = { code: code, errorCode: ISSUE_CODES[code].errorCode, message: message };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    return out;
  }

  function mbText(n) { return Math.round(n / 1048576) + 'MB'; }

  /**
   * 單檔檢查（選檔當下）：回傳 null 或 { code, errorCode, message }。
   * code 為 FILE_VIDEO 時前台應引導改貼雲端連結。
   */
  function fileIssue(name, mime, size) {
    if (isVideo(name, mime)) return issue('FILE_VIDEO', '影片檔請上傳至 Google 雲端硬碟後改貼雲端連結：' + name);
    var n = Number(size);
    if (size != null && isFinite(n) && n > LIMITS.maxFileBytes) return issue('FILE_SIZE', '檔案超過 ' + mbText(LIMITS.maxFileBytes) + '：' + name);
    if (!extForFile(name, mime)) return issue('FILE_TYPE', '不支援的檔案類型：' + name);
    return null;
  }

  /**
   * 附件清單檢查（前台、mock、資料中心共用）：
   *   files：[{ key, name, size, mime }]；answers 有傳時，key 須為該身分可用的上傳位置。
   * 回傳 null 或 { code, errorCode, message }。
   */
  function fileListIssue(files, answers) {
    if (!Array.isArray(files)) return issue('FILE_INFO', '檔案清單格式錯誤');
    if (files.length > LIMITS.maxFiles) return issue('FILE_COUNT_LIMIT', '附件數量超過上限 ' + LIMITS.maxFiles + ' 個');
    files = normalizeFiles(files);
    var validKeys = (answers ? fileFieldsForRole(getPath(answers, 'role.id'), answers) : fileFields()).map(function (f) { return f.key; });
    var perKey = {}, total = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || typeof f.name !== 'string' || !f.name) return issue('FILE_INFO', '第 ' + (i + 1) + ' 個檔案資訊不完整');
      if (validKeys.indexOf(f.key) < 0) return issue('FILE_KEY', '檔案對應位置不正確：' + f.name);
      var size = Number(f.size);
      if (!isFinite(size) || size < 0) return issue('FILE_INFO', '檔案大小資訊不正確：' + f.name);
      var fi = fileIssue(f.name, f.mime, size);
      if (fi) return fi;
      perKey[f.key] = (perKey[f.key] || 0) + 1;
      if (perKey[f.key] > LIMITS.maxFilesPerField) return issue('FILE_FIELD_LIMIT', '單一類別或步驟附件超過上限 ' + LIMITS.maxFilesPerField + ' 個：' + fileLabelForKey(f.key, answers));
      total += size;
    }
    if (total > LIMITS.maxTotalBytes) return issue('FILE_TOTAL_LIMIT', '附件總量超過上限 ' + mbText(LIMITS.maxTotalBytes));
    return null;
  }

  /** 舊介面：回傳 '' 或錯誤訊息 */
  function checkFileList(files, answers) {
    var r = fileListIssue(files, answers);
    return r ? r.message : '';
  }

  /* ---- 雲端連結 ------------------------------------------------------ */
  /** 正規化網址：去空白；無通訊協定補 https://；http:// 改 https:// */
  function normalizeLink(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    if (/^http:\/\//i.test(s)) s = 'https://' + s.slice(7);
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    return s;
  }

  function linkHost(url) {
    var m = /^https:\/\/([^\/?#@\s]+)(?:[\/?#]|$)/i.exec(String(url || ''));
    if (!m) return '';
    return m[1].toLowerCase().replace(/:443$/, '');
  }

  /** 單筆網址檢查（已正規化或原始皆可）：回傳 null 或 { code, errorCode, message } */
  function linkIssue(url) {
    var s = normalizeLink(url);
    if (!s) return issue('LINK_FORMAT', '雲端連結未填網址');
    if (s.length > LIMITS.maxLinkLength) return issue('LINK_LIMIT', '雲端連結過長');
    if (/[\s<>"']/.test(s)) return issue('LINK_FORMAT', '雲端連結格式不正確：' + s.slice(0, 80));
    var host = linkHost(s);
    if (!host) return issue('LINK_FORMAT', '雲端連結格式不正確：' + s.slice(0, 80));
    if (LINK_HOSTS.indexOf(host) < 0) return issue('LINK_HOST', '雲端連結僅接受 Google 雲端硬碟、文件、試算表、表單（' + LINK_HOSTS.join('、') + '）：' + s.slice(0, 80));
    return null;
  }

  /** 全部雲端連結檢查（只檢查狀態為「有」的類別）：回傳 null 或 { code, errorCode, message, path } */
  function checkLinks(answers) {
    var up = (answers && answers.uploads) || {};
    for (var i = 0; i < UPLOAD_CATEGORIES.length; i++) {
      var c = UPLOAD_CATEGORIES[i];
      var v = up[c.id];
      if (!v || v.status !== 'yes' || v.links == null) continue;
      if (!Array.isArray(v.links)) return issue('LINK_FORMAT', '雲端連結格式不正確：' + c.label, { path: 'uploads.' + c.id + '.links' });
      if (v.links.length > LIMITS.maxLinksPerField) return issue('LINK_LIMIT', '雲端連結超過上限 ' + LIMITS.maxLinksPerField + ' 筆：' + c.label, { path: 'uploads.' + c.id + '.links' });
      for (var j = 0; j < v.links.length; j++) {
        var l = v.links[j];
        var path = 'uploads.' + c.id + '.links.' + j;
        if (!l || typeof l !== 'object') return issue('LINK_FORMAT', '雲端連結格式不正確：' + c.label, { path: path });
        if (l.note != null && String(l.note).length > LIMITS.maxLinkNoteLength) return issue('LINK_LIMIT', '雲端連結說明過長：' + c.label, { path: path });
        var li = linkIssue(l.url);
        if (li) { li.path = path; li.message = c.label + '：' + li.message; return li; }
      }
    }
    return null;
  }

  /* ---- 使用工具 ------------------------------------------------------ */
  /** 工具文字拆成項目（頓號、逗號、分號、換行分隔） */
  function toolTokens(s) {
    if (Array.isArray(s)) return s.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(function (x) { return x; });
    return String(s == null ? '' : s).split(/[、,，;；\r\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  }

  /**
   * 步驟使用工具：快選標籤（tools 陣列，只含 TOOL_OPTIONS 內的值）與自填文字（toolsOther）分開保存。
   * 舊資料 tools 為字串時相容拆解：在快選清單內的歸入 tools，其餘併入 toolsOther。
   * 回傳 { tools: [], toolsOther: '' }
   */
  function stageTools(v) {
    v = v || {};
    var picked = [], other = [];
    var seen = {};
    toolTokens(v.tools).forEach(function (t) {
      if (seen[t]) return;
      seen[t] = 1;
      if (TOOL_OPTIONS.indexOf(t) >= 0) picked.push(t); else other.push(t);
    });
    toolTokens(v.toolsOther).forEach(function (t) { if (!seen[t]) { seen[t] = 1; other.push(t); } });
    picked = TOOL_OPTIONS.filter(function (t) { return picked.indexOf(t) >= 0; });
    return { tools: picked, toolsOther: other.join('、') };
  }

  /** 步驟使用工具的顯示文字（快選＋自填，以頓號相連） */
  function toolsText(v) {
    var t = stageTools(v);
    return t.tools.concat(toolTokens(t.toolsOther)).join('、');
  }

  /**
   * 答案正規化（資料中心與 mock 於驗證前呼叫）：
   * 雲端連結去除空白列、網址正規化；說明去頭尾空白；狀態非「有」的類別清空連結與補充說明；
   * 流程統一為有序步驟陣列（normalizeFlow：舊格式 stages{id:{na,steps,tools}} 轉換、使用工具 { tools:[], toolsOther:'' }）。
   * 回傳新物件，不改動原物件。
   */
  function normalizeAnswers(answers) {
    var a = JSON.parse(JSON.stringify(answers || {}));
    var up = a.uploads;
    if (up && typeof up === 'object') {
      Object.keys(up).forEach(function (k) {
        if (!categoryById(k)) { delete up[k]; return; }   // 已移除的類別（例 finance）與未知鍵：讀取忽略
        var v = up[k];
        if (!v || typeof v !== 'object') return;
        if (v.status !== 'yes') { v.links = []; v.note = ''; return; }
        if (!Array.isArray(v.links)) return;
        v.links = v.links.filter(function (l) { return l && typeof l === 'object' && (String(l.url || '').trim() || String(l.note || '').trim()); })
          .map(function (l) { return { url: normalizeLink(l.url), note: String(l.note == null ? '' : l.note).trim() }; });
      });
    }
    FLOW_IDS.forEach(function (fid) {
      var flow = a[fid];
      if (!flow || typeof flow !== 'object') return;
      a[fid] = normalizeFlow(fid, flow);
    });
    return a;
  }

  /**
   * 送出前整體檢查（必填、雲端連結、附件）：回傳 null 或 { code, errorCode, message }。
   * answers 應先經 normalizeAnswers。
   */
  function checkSubmission(answers, files) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return issue('REQUIRED', '作業內容格式錯誤');
    if (!roleById(getPath(answers, 'role.id'))) return issue('REQUIRED', '身分值不正確');
    var errs = validate(answers);
    if (errs.length) return issue('REQUIRED', '必填未完成：' + errs.map(function (x) { return x.label; }).join('、'), { fields: errs });
    var li = checkLinks(answers);
    if (li) return li;
    var fl = checkFlows(answers);
    if (fl) return fl;
    return fileListIssue(files || [], answers);
  }

  /* ---- 顯示 ---------------------------------------------------------- */
  function optionLabel(options, value) {
    if (!options) return value == null ? '' : String(value);
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (typeof o === 'string') { if (o === value) return o; }
      else if (o.id === value || String(o.id) === String(value)) return o.label;
    }
    return value == null ? '' : String(value);
  }

  function labelsOf(options, values) {
    if (!Array.isArray(values)) return optionLabel(options, values);
    return values.map(function (v) { return optionLabel(options, v); }).join('、');
  }

  function statusLabel(id) { return optionLabel(STATUSES, id); }

  /** 條列值轉陣列（字串依換行拆開；去除空白項） */
  function listOf(v) {
    var arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : String(v).split(/\r?\n/));
    return arr.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(function (x) { return x; });
  }

  function displayOf(f, v) {
    if (f.type === 'boolean') return v ? '已確認' : '';
    if (f.type === 'list') return listOf(v).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n');
    if (f.options) return labelsOf(f.options, v);
    if (Array.isArray(v)) return v.join('、');
    if (v == null) return '';
    return String(v) + (f.unit && String(v) !== '' ? ' ' + f.unit : '');
  }

  function industryText(answers) {
    var ind = getPath(answers, 'profile.industry') || '';
    var other = getPath(answers, 'profile.industryOther');
    return ind === '其他' && other ? '其他：' + String(other).trim() : String(ind);
  }

  /** 名單用「品牌名稱」：受僱身分以任職公司代替 */
  function brandText(answers) {
    var roleId = getPath(answers, 'role.id');
    var p = (answers && answers.profile) || {};
    if (EMPLOYED_ROLES.indexOf(roleId) >= 0) return String(p.company || p.brand || '');
    return String(p.brand || '');
  }

  /**
   * 缺口摘要：
   *   attachments：[{ key }]（用於計算各類、各步驟檔案數；舊鍵相容）
   * 回傳 { uploadsMissing, crmKey, links, shareEmail, noneStages, manualStages, naStages, unansweredStages, incompleteStages, emptyStages(=unansweredStages，舊名相容), flows }
   * 步驟項目：{ flowId, flow, stageId, stage, order, template }
   */
  function computeGaps(answers, attachments) {
    answers = answers || {};
    var roleId = getPath(answers, 'role.id');
    var counts = {};
    (attachments || []).forEach(function (x) { var k = canonicalFileKey(x.key); counts[k] = (counts[k] || 0) + 1; });
    var up = answers.uploads || {};
    var gaps = { uploadsMissing: [], crmKey: null, links: [], shareEmail: SHARE_EMAIL, noneStages: [], manualStages: [], naStages: [], unansweredStages: [], incompleteStages: [], flows: {} };

    categoriesForRole(roleId, answers).forEach(function (c) {
      var v = up[c.id] || {};
      if (v.status === 'no') gaps.uploadsMissing.push({ id: c.id, label: c.label });
      if (v.status === 'yes') {
        (v.links || []).forEach(function (l) {
          if (l && l.url) gaps.links.push({ categoryId: c.id, category: c.label, url: l.url, note: l.note || '' });
        });
      }
    });

    var crm = up.crm || {};
    var crmFiles = crm.status === 'yes' ? (counts['uploads.crm'] || 0) : 0;
    var crmLinks = crm.status === 'yes' ? (crm.links || []).filter(function (l) { return l && l.url; }).length : 0;
    gaps.crmKey = {
      items: GAP_RULES.crmKey.items.slice(),
      status: crm.status || '',
      statusLabel: crm.status ? optionLabel(OPTIONS.uploadStatus, crm.status) : '未填寫',
      fileCount: crmFiles,
      linkCount: crmLinks,
      attached: crmFiles + crmLinks > 0
    };

    sectionsForRole(roleId, answers).forEach(function (sec) {
      if (sec.kind !== 'flow') return;
      var flow = answers[sec.id] || {};
      var stages = normalizeFlow(sec.id, flow).stages;
      gaps.flows[sec.id] = flowSummary(sec.id, flow);
      stages.forEach(function (st, i) {
        var item = { flowId: sec.id, flow: sec.label, stageId: st.id, stage: stageDisplayName(st), order: i + 1, template: !!st.template };
        if (st.status === 'none') gaps.noneStages.push(item);
        else if (st.status === 'na') gaps.naStages.push(item);
        else if (st.status === 'doing') {
          if (st.handling === 'manual') gaps.manualStages.push(item);
          else if (!st.handling) gaps.incompleteStages.push(item);
        } else gaps.unansweredStages.push(item);
      });
    });
    gaps.emptyStages = gaps.unansweredStages;   // 舊名相容（2.1 以前）
    return gaps;
  }

  /** 缺口數（名單索引列欄位）：資料狀態為「無」的類別數＋所有流程中尚無做法的步驟數 */
  function gapCount(answers) {
    var g = computeGaps(answers, []);
    return gapCountOf(g);
  }

  /** 由缺口摘要計算缺口數（相容 2.1 以前的摘要：無 noneStages 時只計類別） */
  function gapCountOf(g) {
    if (!g) return 0;
    return (g.uploadsMissing || []).length + (g.noneStages || []).length;
  }

  /**
   * 作業資料 JSON（資料中心與 mock 共用）
   *   attachments：[{ key, label, originalName, fileName, size, mime, fileId }]
   *   meta：{ receiptId, submittedAt（yyyy.mm.dd HH:mm）, timezone? }
   */
  function buildLabeledData(answers, attachments, meta) {
    answers = answers || {};
    attachments = attachments || [];
    meta = meta || {};
    var roleId = getPath(answers, 'role.id');
    var role = roleById(roleId) || { id: roleId, label: roleId, desc: '' };
    attachments = attachments.map(function (a) {
      var k = canonicalFileKey(a.key);
      if (k === a.key) return a;
      var c = {};
      for (var p in a) if (Object.prototype.hasOwnProperty.call(a, p)) c[p] = a[p];
      c.key = k;
      c.label = fileLabelForKey(k, answers);
      return c;
    });
    var filesByKey = {};
    attachments.forEach(function (a) { (filesByKey[a.key] = filesByKey[a.key] || []).push(a.fileName); });

    var out = {
      meta: {
        title: META.title, tag: META.tag, org: META.org, schemaVersion: META.version,
        receiptId: meta.receiptId || '', submittedAt: meta.submittedAt || '', timezone: meta.timezone || META.timezone,
        shareEmail: SHARE_EMAIL
      },
      student: { account: getPath(answers, 'student.account') || '', name: getPath(answers, 'student.name') || '' },
      role: { id: role.id, label: role.label, desc: role.desc || '', hasDownline: getPath(answers, 'role.hasDownline') || '', hasDownlineLabel: roleId === 'reseller' ? optionLabel(OPTIONS.yesNo, getPath(answers, 'role.hasDownline')) : '' },
      sections: [],
      links: [],
      attachments: attachments,
      gaps: computeGaps(answers, attachments),
      raw: answers
    };

    sectionsForRole(roleId, answers).forEach(function (sec) {
      if (sec.id === 'student' || sec.id === 'role') return;
      var block = { id: sec.id, label: sec.label, kind: sec.kind, icon: sec.icon, desc: sec.desc, hint: sectionHint(sec, roleId), notice: sectionNotice(sec, roleId) || sec.notice || '' };
      var data = answers[sec.id] || {};
      if (sec.kind === 'fields') {
        block.fields = fieldsForRole(sec, roleId, answers).map(function (f) {
          var v = data[f.id];
          var entry = { id: f.id, label: f.label, type: f.type, value: v === undefined ? null : v, display: displayOf(f, v) };
          if (f.type === 'files') { entry.files = filesByKey[sec.id + '.' + f.id] || []; entry.display = entry.files.join('\n'); }
          if (f.type === 'list') entry.items = listOf(v);
          return entry;
        });
      } else if (sec.kind === 'uploads') {
        block.categories = categoriesForRole(roleId, answers).map(function (c) {
          var v = data[c.id] || {};
          var yes = v.status === 'yes';
          var links = yes ? (v.links || []).filter(function (l) { return l && l.url; }).map(function (l) { return { url: l.url, note: l.note || '' }; }) : [];
          links.forEach(function (l) { out.links.push({ categoryId: c.id, category: c.label, url: l.url, note: l.note }); });
          return {
            id: c.id, label: c.label, icon: c.icon, def: c.def, desc: c.def, hint: categoryHint(c, roleId),
            refs: c.refs.map(function (r) { return { key: r.key, label: r.label, primary: !!r.primary }; }),
            status: v.status || '', statusLabel: v.status ? optionLabel(OPTIONS.uploadStatus, v.status) : '未填寫',
            files: yes ? (filesByKey['uploads.' + c.id] || []) : [],
            links: links,
            note: yes ? String(v.note || '') : ''
          };
        });
      } else if (sec.kind === 'flow') {
        block.head = sec.headFields.map(function (f) {
          var v = data[f.id];
          return { id: f.id, label: f.label, value: v || '', display: optionLabel(f.options, v) };
        });
        var flowData = normalizeFlow(sec.id, data);
        block.summary = flowSummary(sec.id, flowData);
        block.stages = flowData.stages.map(function (st, i) {
          var t = st.template ? templateStage(sec.id, st.id) : null;
          var doing = st.status === 'doing';
          var files = doing ? (filesByKey[sec.id + '.' + st.id] || []) : [];
          var steps = doing ? st.steps : [];
          var tools = doing ? toolsText(st) : '';
          return {
            order: i + 1, id: st.id, template: !!st.template, custom: !st.template,
            name: stageDisplayName(st), label: stageDisplayName(st), templateName: st.templateName || '',
            renamed: !!st.template && stageDisplayName(st) !== st.templateName,
            icon: t ? t.icon : 'plus', desc: t ? t.desc : '', hint: t ? t.desc : '',
            status: st.status || '', statusLabel: stageStatusLabel(st.status),
            handling: doing ? (st.handling || '') : '', handlingLabel: doing ? stageHandlingLabel(st.handling) : '',
            incomplete: doing && !st.handling,
            na: st.status === 'na', filled: !!st.status,
            steps: steps, tools: tools,
            toolList: doing ? st.tools : [], toolsOther: doing ? st.toolsOther : '', files: files,
            fields: [
              { id: 'status', label: '狀態', value: st.status || '', display: stageStatusLabel(st.status) },
              { id: 'handling', label: '處理方式', value: doing ? (st.handling || '') : '', display: doing ? stageHandlingLabel(st.handling) : '' },
              { id: 'steps', label: '實際做法', value: steps, display: displayOf({ type: 'list' }, steps) },
              { id: 'tools', label: '使用工具', value: doing ? st.tools : [], display: tools },
              { id: 'toolsOther', label: '其他工具', value: doing ? st.toolsOther : '', display: doing ? st.toolsOther : '' },
              { id: 'shots', label: '截圖', value: files, display: files.join('\n') }
            ]
          };
        });
        block.diagram = flowDiagram(sec.id, flowData).nodes;
      }
      out.sections.push(block);
    });
    return out;
  }

  /**
   * 匯出列（除「索引」外各工作表；索引由資料中心依名單產生）
   *   labeled：作業資料 JSON；ix：{ receiptId, name, role }
   * 回傳 { profile:[...], uploads:[...], links:[...], flows:[...], dialog:[...], timeSavers:[...] }（每列為陣列，順序同 EXPORT_TABS.headers）
   */
  function exportRows(labeled, ix) {
    var a = (labeled && labeled.raw) || {};
    var id = ix.receiptId, nm = ix.name;
    var roleId = getPath(a, 'role.id');
    var pr = a.profile || {};
    var counts = {};
    ((labeled && labeled.attachments) || []).forEach(function (x) { var k = canonicalFileKey(x.key); counts[k] = (counts[k] || 0) + 1; });
    var rows = { profile: [], uploads: [], links: [], flows: [], dialog: [], timeSavers: [] };
    var scaleOn = !!(roleById(roleId) && roleId !== 'employee');
    rows.profile.push([id, nm, ix.role || (roleById(roleId) || {}).label || '', roleId === 'reseller' ? optionLabel(OPTIONS.yesNo, getPath(a, 'role.hasDownline')) : '',
      industryText(a), pr.brand || '', pr.company || '', pr.title || '', pr.business || '', labelsOf(OPTIONS.serviceMode, pr.serviceMode || []),
      scaleOn ? (pr.scale || '') : '', scaleOn && pr.scale === '團隊' ? (pr.headcount || '') : '']);

    var up = a.uploads || {};
    categoriesForRole(roleId, a).forEach(function (c) {
      var v = up[c.id] || {};
      var yes = v.status === 'yes';
      var links = yes ? (v.links || []).filter(function (l) { return l && l.url; }) : [];
      rows.uploads.push([id, nm, c.label, v.status ? optionLabel(OPTIONS.uploadStatus, v.status) : '', yes ? (counts['uploads.' + c.id] || 0) : 0, links.length, yes ? (v.note || '') : '']);
      links.forEach(function (l) { rows.links.push([id, nm, c.label, l.url, l.note || '']); });
    });

    sectionsForRole(roleId, a).forEach(function (sec) {
      if (sec.kind !== 'flow') return;
      var flow = a[sec.id] || {};
      var target = sec.id === 'customerFlow' ? optionLabel(OPTIONS.flowTarget, flow.target) : '';
      normalizeFlow(sec.id, flow).stages.forEach(function (st, i) {
        var doing = st.status === 'doing';
        rows.flows.push([id, nm, sec.label, target, i + 1, stageDisplayName(st), st.template ? '模板' : '自訂',
          stageStatusLabel(st.status), doing ? stageHandlingLabel(st.handling) : '',
          doing ? st.steps.join('\n') : '', doing ? st.tools.join('、') : '', doing ? st.toolsOther : '',
          doing ? (counts[sec.id + '.' + st.id] || 0) : 0]);
      });
    });

    var dg = a.dialog || {};
    var faq = Array.isArray(dg.faq) ? dg.faq : [];
    rows.dialog.push([id, nm, counts['dialog.bookedShots'] || 0, counts['dialog.silentShots'] || 0, faq[0] || '', faq[1] || '', faq[2] || '', faq[3] || '', faq[4] || '', dg.privacyAck ? '已確認' : '']);

    listOf(getPath(a, 'timeSavers.tasks')).forEach(function (t, i) { rows.timeSavers.push([id, nm, i + 1, t]); });
    return rows;
  }

  /* ---- 學員名冊與填寫計時 ------------------------------------------------ */
  /** 名冊查詢鍵正規化：去頭尾空白、小寫、去除控制字元（帳號與 Email 共用；前台、資料中心、mock 一致） */
  function rosterKey(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​﻿]/g, '').trim().toLowerCase().slice(0, ROSTER.maxKeyLength);
  }

  /**
   * 名冊同步列整理：{ account[, email], name } → { keys:[正規化鍵], name } 或 null（無本名或無可用鍵）。
   * 一人一鍵：以 account 正規化為唯一鍵（正式官網 uid 即 Email）；只有在沒有 account 時才退而以 email 作為鍵，不另存 Email 鍵。
   * keys 維持陣列形狀（恆為一筆），供資料中心與 mock 共用。
   */
  function rosterRow(row) {
    if (!row || typeof row !== 'object') return null;
    var name = String(row.name == null ? '' : row.name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > ROSTER.maxNameLength) return null;
    var key = rosterKey(row.account) || rosterKey(row.email);
    return key ? { keys: [key], name: name } : null;
  }

  /** 填寫耗時文字：分鐘數 → 「X 天 Y 小時」「Y 小時 Z 分」「Z 分」；空值回 '' */
  function durationText(min) {
    var n = Number(min);
    if (min == null || min === '' || !isFinite(n) || n < 0) return '';
    n = Math.round(n);
    if (n < 1) return '不到 1 分';
    var d = Math.floor(n / 1440), h = Math.floor((n % 1440) / 60), m = n % 60;
    if (d) return d + ' 天' + (h ? ' ' + h + ' 小時' : '');
    if (h) return h + ' 小時' + (m ? ' ' + m + ' 分' : '');
    return m + ' 分';
  }

  /** 開始與送出時間（yyyy.mm.dd HH:mm[:ss] 或毫秒）→ 耗時分鐘；無法計算回 null */
  function durationMinutes(startedAt, endedAt) {
    var a = timeToMs(startedAt), b = timeToMs(endedAt);
    if (a == null || b == null || b < a) return null;
    return Math.round((b - a) / 60000);
  }

  /** 'yyyy.mm.dd HH:mm[:ss]'（Asia/Taipei）或毫秒數 → 毫秒；格式不符回 null */
  function timeToMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var m = /^(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(v).trim());
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 8, Number(m[5]), Number(m[6] || 0));
  }

  /* ------------------------------------------------------------------ */
  /* 稱呼、遮罩、截止時間、通知範本、優先批次（2.5.0）                       */
  /* ------------------------------------------------------------------ */
  /**
   * 稱呼：本名去姓。複姓（COMPOUND_SURNAMES）優先去除；兩字名取後一字；三字名去首字；
   * 含英文字母（英文名或中英混合）與四字以上非複姓的名字維持原樣。
   */
  function callName(fullName) {
    var n = String(fullName == null ? '' : fullName).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!n) return '';
    if (/[A-Za-z]/.test(n)) return n;
    n = n.replace(/\s+/g, '');
    var chars = n.split('');
    if (chars.length <= 1) return n;
    if (chars.length === 2) return chars[1];
    for (var i = 0; i < COMPOUND_SURNAMES.length; i++) {
      var s = COMPOUND_SURNAMES[i];
      if (n.indexOf(s) === 0 && chars.length > s.length) return n.slice(s.length);
    }
    if (chars.length === 3) return n.slice(1);
    return n;
  }

  /**
   * 去姓後的名字（供文字比對）：複姓優先；其餘去首字；含英文字母或結果不足 2 字回 ''。
   * 與 callName 不同：兩字名回 ''（單字不比對），四字以上非複姓去首字（陳大文豪 → 大文豪）。
   */
  function givenName(fullName) {
    var n = String(fullName == null ? '' : fullName).replace(/\s+/g, '');
    if (!n || /[A-Za-z]/.test(n)) return '';
    var g = '';
    for (var i = 0; i < COMPOUND_SURNAMES.length; i++) {
      if (n.indexOf(COMPOUND_SURNAMES[i]) === 0 && n.length > COMPOUND_SURNAMES[i].length) { g = n.slice(COMPOUND_SURNAMES[i].length); break; }
    }
    if (!g) g = n.slice(1);
    return g.length >= ROSTER_MATCH.minGivenLength ? g : '';
  }

  /** 全形英數與標點轉半形、全形空白轉半形（比對與截止時間解析共用；長度不變，位置一一對應） */
  function halfWidth(s) {
    return String(s == null ? '' : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' ');
  }

  /** 名冊搜尋比對：本名或稱呼部分符合（不分大小寫、去空白）；q 需已正規化（去空白、小寫） */
  function rosterNameHit(name, q) {
    if (!q) return false;
    var n = halfWidth(name).replace(/\s+/g, '').toLowerCase();
    if (n.indexOf(q) >= 0) return true;
    var c = callName(name).replace(/\s+/g, '').toLowerCase();
    return !!c && c.indexOf(q) >= 0;
  }

  function isStopword(t) { return ROSTER_MATCH.stopwords.indexOf(t) >= 0; }
  function stripHonorific(t) {
    for (var i = 0; i < ROSTER_MATCH.honorifics.length; i++) {
      var h = ROSTER_MATCH.honorifics[i];
      if (t.length > h.length + 1 && t.slice(-h.length) === h) return t.slice(0, -h.length);
    }
    return t;
  }
  function looksLikeName(t) {
    if (!/^[㐀-鿿]{2,4}$/.test(t) || isStopword(t)) return false;
    for (var i = 0; i < t.length; i++) if (ROSTER_MATCH.nonNameChars.indexOf(t.charAt(i)) >= 0) return false;
    return true;
  }

  /**
   * 疑似名字片段（未找到區使用）：LINE 標註「@名字」、名單分隔片段（2–4 個中文字）、「名字＋學姐／同學…」。
   * 回傳 [{ token, s, e }]（位置以 halfWidth 後文字計）。
   */
  function nameCandidates(text) {
    var t = halfWidth(text), out = [], seen = {};
    function push(tok, s) {
      tok = stripHonorific(tok);
      if (!looksLikeName(tok) || seen[tok]) return;
      seen[tok] = 1; out.push({ token: tok, s: s, e: s + tok.length });
    }
    var m, re = /@([^\s@,，、。:;!?()「」『』\[\]<>~]{2,12})/g;
    while ((m = re.exec(t))) push(m[1], m.index + 1);
    var seg = /[^\n\r、,，;；|｜\/\t ]+/g;
    while ((m = seg.exec(t))) {
      var raw = m[0], s = m.index;
      var lead = /^(?:\d{1,3}[.)、．]|[-•・●*‧①-⑳]+)/.exec(raw);
      if (lead) { raw = raw.slice(lead[0].length); s += lead[0].length; }
      raw = raw.replace(/[。.!?！？~～♡♥:：]+$/, '');
      if (raw.charAt(0) === '@') continue;
      push(raw, s);
    }
    var hon = /([㐀-鿿]{2,3})(?=學姊|學姐|同學)/g;
    while ((m = hon.exec(t))) {
      var cand = m[1];
      if (cand.length === 3 && !looksLikeName(cand)) push(cand.slice(1), m.index + 1); else push(cand, m.index);
    }
    return out;
  }

  /**
   * 以名冊比對任意文字（LINE 群組訊息、名單、公告全文）。
   * entries: [{ key, name, masked?, … }]（其餘欄位原樣帶回）。
   * 規則：全名出現，或去姓後名字（≥ 2 字、非停用詞）出現；去姓名字出現在已比對全名內者不重複計；
   *       去姓名字群組的候選含「已以全名唯一確定」的學姐時，視為同一人而略過。
   * 回傳 { groups:[{ token, matches:[entry…] }] }，依文字中首次出現位置排序；未找到的疑似名字以 matches:[] 列在最後。
   */
  function matchRosterText(text, entries) {
    var C = ROSTER_MATCH;
    var t = halfWidth(text).slice(0, C.maxTextLength);
    var tl = t.toLowerCase();
    // 文字中所有長度 2–8 的子字串（中文名查表用，避免逐名 indexOf）
    var subs = {};
    for (var i = 0; i < t.length; i++) for (var L = 2; L <= 8 && i + L <= t.length; L++) subs[t.substr(i, L)] = 1;
    // 以「比對字串」為單位（同名或同去姓名字的多位學姐共用同一字串，位置只找一次），每個字串保存出現位置與對應學姐；
    // 效能：文字 20000 字、名冊 5000 位、名字重複出現數千次時仍為線性掃描，不做逐筆兩兩比較。
    var tokens = {}, tokenOrder = [], posCache = {};
    function positions(hay, needle) {
      var c = posCache[needle];
      if (c) return c;
      c = [];
      var p = hay.indexOf(needle);
      while (p >= 0) { c.push(p); p = hay.indexOf(needle, p + 1); }
      posCache[needle] = c;
      return c;
    }
    function addToken(tok, pos, en, full) {
      var g = tokens[tok];
      if (!g) { g = tokens[tok] = { token: tok, full: false, pos: pos, keys: {}, matches: [] }; tokenOrder.push(tok); }
      if (full) g.full = true;
      if (en && !g.keys[en.key]) { g.keys[en.key] = 1; g.matches.push(en); }
    }
    (entries || []).forEach(function (en) {
      var nm = halfWidth(en && en.name).replace(/\s+/g, ' ').trim();
      if (!nm) return;
      if (/[A-Za-z]/.test(nm)) {
        var low = nm.toLowerCase();
        if (low.length < 2) return;
        var byText = {};
        positions(tl, low).forEach(function (p) {
          var a = tl.charAt(p - 1), b = tl.charAt(p + low.length);
          if (/[a-z0-9]/.test(a) || /[a-z0-9]/.test(b)) return;
          var tok = t.substr(p, low.length);
          (byText[tok] = byText[tok] || []).push(p);
        });
        Object.keys(byText).forEach(function (tok) { addToken(tok, byText[tok], en, true); });
        return;
      }
      var n = nm.replace(/\s+/g, '');
      if (n.length >= 2 && (n.length > 8 || subs[n])) { var pn = positions(t, n); if (pn.length) addToken(n, pn, en, true); }
      var g = givenName(n);
      if (g && !isStopword(g) && (g.length > 8 || subs[g])) { var pg = positions(t, g); if (pg.length) addToken(g, pg, en, false); }
    });
    // 區間：每個字串的每個出現位置一筆；依起點遞增、長度遞減、全名優先排序後單趟掃描：
    //   最長比對：被較長全名涵蓋的較短全名（王美 ⊂ 王美好）不列入；去姓名字出現在已比對全名內者不列入。
    var iv = [];
    tokenOrder.forEach(function (k) { var g = tokens[k]; g.pos.forEach(function (p) { iv.push({ s: p, e: p + k.length, token: k, full: g.full }); }); });
    iv.sort(function (a, b) { return a.s - b.s || b.e - a.e || (a.full === b.full ? 0 : a.full ? -1 : 1); });
    var occ = [], maxFullEnd = -1;
    iv.forEach(function (o) {
      if (maxFullEnd >= o.e) return;
      if (o.full) maxFullEnd = o.e;
      occ.push(o);
    });
    var groups = {}, order = [];
    occ.forEach(function (o) {
      var k = o.token;
      if (groups[k]) return;
      var g = tokens[k];
      groups[k] = { token: k, s: o.s, full: g.full, matches: g.matches.slice() };
      order.push(k);
    });
    var sure = {};
    order.forEach(function (k) { var g = groups[k]; if (g.full && g.matches.length === 1) sure[g.matches[0].key] = 1; });
    var out = [];
    order.forEach(function (k) {
      var g = groups[k];
      if (!g.full && g.matches.some(function (m) { return sure[m.key]; })) return;
      g.matches.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : (String(a.masked) < String(b.masked) ? -1 : 1); });
      out.push({ token: g.token, matches: g.matches.slice(0, C.maxMatchesPerGroup), total: g.matches.length });
    });
    // 未找到：疑似名字片段不與任何比對位置重疊、也不與已比對字串互相包含
    var tokens = out.map(function (g) { return g.token; });
    var miss = nameCandidates(t).filter(function (c) {
      if (occ.some(function (o) { return c.s < o.e && c.e > o.s; })) return false;
      return !tokens.some(function (k) { return k.indexOf(c.token) >= 0 || c.token.indexOf(k) >= 0; });
    }).slice(0, C.maxMissing);
    return { groups: out.slice(0, C.maxGroups).concat(miss.map(function (c) { return { token: c.token, matches: [], total: 0 }; })) };
  }

  /**
   * 從任意文字找出截止時間 → { ms, iso, text, hasTime } 或 null。
   * 支援：2026.11.05（四）12:00、2026/11/5 12:00、2026-11-05 12:00、2026年11月5日、11月5日中午12點、11/5 下午3點半、截止時間：…。
   * 無年份時取 nowMs 所在年（早於 nowMs 60 天以上改為隔年）；無時間時為 23:59。
   * 多個日期時以「截止／期限／繳交」字樣在前、或「前」在後、含時間、含年份者優先。
   */
  function findDeadline(text, nowMs) {
    var t = halfWidth(text);
    if (!t || !/\d/.test(t)) return null;
    nowMs = nowMs == null ? Date.now() : nowMs;
    var re = /(?:(\d{4})\s*[年.\/-]\s*)?(\d{1,2})\s*([月.\/-])\s*(\d{1,2})(?!\d)\s*[日號号]?(?:\s*\(\s*(?:週|周|星期|禮拜)?\s*[一二三四五六日天]\s*\)|\s*(?:週|周|星期|禮拜)\s*[一二三四五六日天])?(?:\s*(上午|早上|中午|下午|晚上|傍晚|凌晨|AM|PM|am|pm)?\s*(?:(\d{1,2})(?!\d)\s*(?::\s*(\d{2})|[點点時]\s*(?:(\d{1,2})\s*分|(半)|整)?)|(中午|午夜)))?/g;
    var m, best = null, nowY = new Date(nowMs + 8 * 3600000).getUTCFullYear();
    while ((m = re.exec(t))) {
      if (!m[0]) { re.lastIndex++; continue; }
      var start = m.index;
      if (start > 0 && /\d/.test(t.charAt(start - 1))) continue;
      var hasYear = !!m[1];
      var mo = Number(m[2]), d = Number(m[4]), sep = m[3];
      var hasTime = m[6] != null || !!m[10];
      var before = t.slice(Math.max(0, start - 16), start), after = t.slice(m.index + m[0].length, m.index + m[0].length + 6);
      var label = /截止|期限|繳交|deadline|due/i.test(before) || /^\s*(?:前|之前|以前|截止)/.test(after);
      if (!hasYear && sep !== '月' && !label && !hasTime) continue;   // 11/5、2.5 這類需有字樣或時間佐證
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      var h = 23, mi = 59;
      if (m[10]) { h = m[10] === '中午' ? 12 : 23; mi = m[10] === '中午' ? 0 : 59; }
      else if (m[6] != null) {
        h = Number(m[6]); mi = m[7] != null ? Number(m[7]) : m[8] != null ? Number(m[8]) : m[9] ? 30 : 0;
        var pd = m[5] || '';
        if (/下午|晚上|傍晚|pm/i.test(pd) && h < 12) h += 12;
        else if (pd === '中午' && h < 6) h += 12;
        else if (/上午|早上|凌晨|am/i.test(pd) && h === 12) h = 0;
        if (h === 24 && mi === 0) { h = 23; mi = 59; }
        if (h > 23 || mi > 59) continue;
      }
      var y = hasYear ? Number(m[1]) : nowY;
      var ms = Date.UTC(y, mo - 1, d, h - 8, mi);
      var chk = new Date(ms + 8 * 3600000);
      if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) continue;
      if (!hasYear && ms < nowMs - 60 * 86400000) ms = Date.UTC(y + 1, mo - 1, d, h - 8, mi);
      var score = (label ? 4 : 0) + (hasTime ? 2 : 0) + (hasYear ? 1 : 0);
      if (!best || score > best.score) best = { ms: ms, score: score, text: t.slice(start, m.index + m[0].length).trim(), hasTime: hasTime };
    }
    return best ? { ms: best.ms, iso: deadlineIso(best.ms), text: best.text, hasTime: best.hasTime } : null;
  }

  /**
   * 解析 LINE 官方帳號聊天室網址或 userId → { userId, accountId } 或 null。
   * 支援：https://chat.line.biz/<accountId>/chat/U…（含查詢字串、#、結尾斜線、URL 編碼）、
   *       https://manager.line.biz/account/<accountId>/chat/U…、chat.line.biz/… 省略協定、單獨的 userId（U＋32 碼小寫十六進位）。
   * 其他網域、userId 格式不符（長度、大寫、非十六進位）一律回 null。
   */
  function parseLineChat(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return null;
    try { s = decodeURIComponent(s); } catch (e) { /* 保留原文 */ }
    s = s.replace(/[\s​]+/g, '');
    if (LINE.userIdRe.test(s)) return { userId: s, accountId: '' };
    var m = /^(?:https?:\/\/)?([a-z0-9.-]+)(\/[^?#]*)?/i.exec(s);
    if (!m || LINE.chatHosts.indexOf(m[1].toLowerCase()) < 0) return null;
    var path = m[2] || '';
    var c = /^\/(?:account\/)?([A-Za-z0-9@._-]{2,64})\/chat\/([^\/]+)\/?$/.exec(path);
    if (!c || !LINE.userIdRe.test(c[2])) return null;
    return { userId: c[2], accountId: c[1] };
  }
  /**
   * LINE 對應分類（書籤回傳的個人聊天候選 → 後台三區）：
   *  auto：恰好 1 位候選、為好友，且管理者設定名稱（nickname）或好友自取名稱（name）包含完整本名（不分大小寫、去空白、全形轉半形）
   *  pick：其餘有好友候選者（多筆，或 1 筆但名稱不含本名），候選只列好友
   *  none：無候選或皆非好友
   *  對話帳號比對（書籤讀取候選對話，以對話中的官網帳號雜湊與名冊鍵比對）：候選帶 verified:true 者恰好一位（且為好友）時
   *  由 pick 提升為 auto，via 為 'chat'；零位或多位相符時維持 pick（各候選保留 verified 標示）
   * → { kind, pick:候選|null, options:[好友候選…], via:'name'|'chat'|'' }
   */
  function classifyLineMap(fullName, candidates) {
    var norm = function (x) { return halfWidth(x).replace(/\s+/g, '').toLowerCase(); };
    var n = norm(fullName);
    var list = (Array.isArray(candidates) ? candidates : []).filter(function (c) { return c && LINE.userIdRe.test(String(c.userId || '')); });
    var friends = list.filter(function (c) { return c.friend === true; });
    if (!friends.length) return { kind: 'none', pick: null, options: [], via: '' };
    var has = function (c) { return !!n && (norm(c.nickname).indexOf(n) >= 0 || norm(c.name).indexOf(n) >= 0); };
    if (list.length === 1 && has(friends[0])) return { kind: 'auto', pick: friends[0], options: friends, via: 'name' };
    var ver = friends.filter(function (c) { return c.verified === true; });
    if (ver.length === 1) return { kind: 'auto', pick: ver[0], options: friends, via: 'chat' };
    return { kind: 'pick', pick: null, options: friends, via: '' };
  }

  /** 官方帳號聊天室網址（accountId 未知時回 ''） */
  function lineChatUrl(accountId, userId) {
    if (!accountId || !LINE.userIdRe.test(String(userId || ''))) return '';
    return LINE.chatBase + encodeURIComponent(accountId).replace(/%40/g, '@') + '/chat/' + userId;
  }

  /** 遮罩帳號：Email 保留前兩碼與網域（ab***@gmail.com）；非 Email 保留前兩碼（ab***）；輸入先經 rosterKey 正規化 */
  function maskKey(s) {
    var k = rosterKey(s);
    if (!k) return '';
    var at = k.indexOf('@');
    var head = at >= 0 ? k.slice(0, at) : k;
    var tail = at >= 0 ? k.slice(at) : '';
    var keep = head.length > 2 ? head.slice(0, 2) : head.slice(0, 1);
    return keep + '***' + tail;
  }

  /**
   * 截止時間解析 → 毫秒；無法解析回 null。
   * 接受：毫秒數、含時區的 ISO（2026-11-05T12:00:00+08:00、…Z）、不含時區的 yyyy-mm-ddTHH:mm 或 yyyy.mm.dd HH:mm（視為 Asia/Taipei）。
   */
  function parseDeadline(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim();
    if (/(?:Z|[+\-]\d{2}:?\d{2})$/.test(s) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      var ms = Date.parse(s);
      return isFinite(ms) ? ms : null;
    }
    var exact = timeToMs(s);
    if (exact != null) return exact;
    var dt325 = /^(\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2})(?:\s*[（(][^）)]*[）)])?\s+(.+)$/.exec(s);   // 3.2.5 日期＋時間（HHMM、HMM、HH、HH.MM、全形…）統一解析
    if (dt325) { var tn325 = normTimeInput(dt325[2]); if (!tn325 && /^[\d\uFF10-\uFF19:\uFF1A.\uFF0E\s]+$/.test(dt325[2])) return null; if (tn325 && tn325 !== dt325[2]) { var p325 = parseDeadline(dt325[1].replace(/[.\/]/g, '-').replace(/-(\d)(?=-|$)/g, '-0$1') + ' ' + tn325); if (p325 != null) return p325; } }
    var f = findDeadline(s);                 // 寬鬆格式：2026/11/5 12:00、2026.11.05（四）12:00、11月5日中午12點…
    return f ? f.ms : null;
  }

  /** 毫秒 → ISO（固定 +08:00）：yyyy-mm-ddTHH:mm:00+08:00（秒數歸零） */
  function deadlineIso(ms) {
    if (ms == null || !isFinite(ms)) return '';
    var t = new Date(Math.floor(ms / 60000) * 60000 + 8 * 3600000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()) + 'T' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':00+08:00';
  }

  /** 截止時間顯示：yyyy.mm.dd（週X）HH:mm（Asia/Taipei；週為 一二三四五六日）；無法解析回 '' */
  function formatDeadline(v) {
    var ms = parseDeadline(v);
    if (ms == null) return '';
    var t = new Date(ms + 8 * 3600000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var w = '日一二三四五六'.charAt(t.getUTCDay());
    return t.getUTCFullYear() + '.' + p(t.getUTCMonth() + 1) + '.' + p(t.getUTCDate()) + '（週' + w + '）' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes());
  }

  /** 準時判斷：送出時間（yyyy.mm.dd HH:mm[:ss] 或毫秒）≤ 截止時間；任一無法解析回 null */
  function isOnTime(submittedAt, deadline) {
    var a = timeToMs(submittedAt), b = parseDeadline(deadline);
    if (a == null || b == null) return null;
    return a <= b;
  }

  /**
   * 通知範本渲染：vars = { 稱呼, 截止時間, 作業連結 }。
   * 含 {綁定連結} 的行一律整行移除（2.6.1：LINE 對應改由後台完成，通知不再附綁定連結；既有範本相容）；{截止時間} 值為空字串時該行移除（發送通知無批次且未指定）；三個以上連續換行收斂為兩個；未知變數保留原文。
   */
  /** 截止時間（yyyy.mm.dd HH:mm，台北時間；無效回 ''） */
  function formatDeadlinePlain(v) {
    var ms = parseDeadline(v);
    if (ms == null) return '';
    var t = new Date(ms + 8 * 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getUTCFullYear() + '.' + p(t.getUTCMonth() + 1) + '.' + p(t.getUTCDate()) + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes());
  }
  /**
   * 學姐端自動訊息變數（含別名）：{名字}／{稱呼}、{截止時間}、{作業網址}／{作業連結}
   * o = { callName, deadline（iso 或 ''）, plain?（true：yyyy.mm.dd HH:mm；否則含星期） }；無截止時間時 {截止時間}＝''（renderTemplate 整行省略）
   */
  function automationVars(o) {
    o = o || {};
    var dl = o.deadline ? (o.plain ? formatDeadlinePlain(o.deadline) : formatDeadline(o.deadline)) : '';
    var cn = String(o.callName || '');
    return { '名字': cn, '稱呼': cn, '截止時間': dl, '作業網址': NOTIFY.workUrl, '作業連結': NOTIFY.workUrl };
  }
  /*
   * 自動提醒防重複（3.1.3；runAutomation 與 mock 共用同一規則）
   *   notifyFlags(leftMs)：發作業通知時距截止已不足 48／24 小時 → 同步標記對應提醒已發 { h48, h24 }
   *   reminderPlan(o)：o = { deadlineMs, nowMs, flags:{ h48, h24, noAck }, notifies:[{ at, ok, kind }], ack, enabled:{ remind48, remind24, noAck } }
   *     → { remind48, remind24, noAck, hold }（hold：本次不發的原因代碼）
   *     1. 學姐未收到作業通知（notify／resend／batch／supplement 成功）前不發任何截止提醒
   *     2. 作業通知後 12 小時內不發截止提醒
   *     3. 未回覆確認提醒與截止提醒不在同一小時：本次已排截止提醒 → 未回覆確認延後；任一自動提醒 60 分鐘內已發 → 本次全部延後
   */
  var REMIND_RULES = { notifyKinds: ['notify', 'resend', 'batch', 'supplement'], ackKinds: ['notify', 'resend'], autoKinds: ['remind48', 'remind24', 'noAck'], quietAfterNotifyH: 12, sameHourMin: 60, noAckAfterH: 24 };
  function notifyFlags(leftMs) {
    var o = {};
    if (leftMs == null || !isFinite(leftMs)) return o;
    if (leftMs <= 48 * 3600000) o.h48 = 1;
    if (leftMs <= 24 * 3600000) o.h24 = 1;
    return o;
  }
  function reminderPlan(o) {
    o = o || {};
    var R = REMIND_RULES, fl = o.flags || {}, en = o.enabled || {}, now = Number(o.nowMs), out = { remind48: false, remind24: false, noAck: false, hold: '' };
    var left = o.deadlineMs == null ? null : o.deadlineMs - now;
    if (left == null || !(left > 0)) { out.hold = 'noDeadline'; return out; }
    var nts = (o.notifies || []).filter(function (n) { return n && n.ok; });
    var lastOf = function (kinds) { var t = null; nts.forEach(function (n) { if (kinds.indexOf(n.kind) >= 0) { var ms = timeToMs(n.at); if (ms != null && (t == null || ms > t)) t = ms; } }); return t; };
    var notifiedMs = lastOf(R.notifyKinds), ackBaseMs = lastOf(R.ackKinds), autoMs = lastOf(R.autoKinds);
    if (notifiedMs == null) { out.hold = 'notNotified'; return out; }
    if (autoMs != null && now - autoMs < R.sameHourMin * 60000) { out.hold = 'sameHour'; return out; }
    var quiet = now - notifiedMs < R.quietAfterNotifyH * 3600000;
    if (!quiet) {
      if (en.remind24 && left <= 24 * 3600000 && fl.h24 !== 1) out.remind24 = true;
      else if (en.remind48 && left <= 48 * 3600000 && left > 24 * 3600000 && fl.h48 !== 1) out.remind48 = true;
    }
    var deadlineDue = out.remind24 || out.remind48;
    if (en.noAck && !o.ack && fl.noAck !== 1 && ackBaseMs != null && now - ackBaseMs >= R.noAckAfterH * 3600000) {
      if (deadlineDue) out.hold = 'noAckNextHour'; else out.noAck = true;
    }
    if (quiet && !out.noAck && !out.hold) out.hold = 'quietAfterNotify';
    return out;
  }
  function renderTemplate(body, vars) {
    vars = vars || {};
    var lines = String(body == null ? '' : body).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    lines.forEach(function (line) {
      if (line.indexOf('{綁定連結}') >= 0) return;
      if (line.indexOf('{截止時間}') >= 0 && vars['截止時間'] === '') return;   // 發送通知：無批次且未指定截止時間時整行移除
      if (line.indexOf('{雲端資料夾}') >= 0 && vars['雲端資料夾'] === '') return;   // 3.2：學姐尚未登錄雲端資料夾時整行移除
      out.push(line.replace(/\{([^{}\n]{1,20})\}/g, function (m, name) {
        if (!Object.prototype.hasOwnProperty.call(vars, name) && name.indexOf('學') >= 0) { var alt = name.indexOf('學姊') >= 0 ? name.split('學姊').join('學姐') : name.split('學姐').join('學姊'); if (Object.prototype.hasOwnProperty.call(vars, alt)) name = alt; }   // 3.3.8 稱呼改「學姐」：{學姊名單}／{學姐名單} 等新舊變數名通用
        return Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null ? String(vars[name]) : m;
      }));
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  }

  /** 舊範本遷移：移除含 {綁定連結} 的行（含前一行「➥ LINE 通知綁定」標題形式），三個以上連續換行收斂為兩個；無此變數時原樣回傳 */
  function stripBindLine(body) {
    var src = String(body == null ? '' : body);
    if (src.indexOf('{綁定連結}') < 0) return src;
    return src.replace(/\r\n?/g, '\n').split('\n').filter(function (line) { return line.indexOf('{綁定連結}') < 0; })
      .join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  }

  /** 範本內使用到的變數名稱（去重，依出現順序） */
  function templateVars(body) {
    var seen = {}, out = [];
    String(body == null ? '' : body).replace(/\{([^{}\n]{1,20})\}/g, function (m, name) { if (!seen[name]) { seen[name] = 1; out.push(name); } return m; });
    return out;
  }

  /** 範本整理：{ id?, name, body } → { ok:true, template:{ id, name, body } } 或 { ok:false, message } */
  function normalizeTemplate(input) {
    if (!input || typeof input !== 'object') return { ok: false, message: '範本格式錯誤' };
    var id = String(input.id == null ? '' : input.id).trim();
    if (id && !BATCH.idRe.test(id)) return { ok: false, message: '範本編號格式不正確' };
    var name = String(input.name == null ? '' : input.name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!name) return { ok: false, message: '範本名稱為必填' };
    if (name.length > NOTIFY.maxNameLength) return { ok: false, message: '範本名稱不可超過 ' + NOTIFY.maxNameLength + ' 字' };
    var body = String(input.body == null ? '' : input.body).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+$/, '');
    if (!body.trim()) return { ok: false, message: '範本內容為必填' };
    if (body.length > NOTIFY.maxBodyLength) return { ok: false, message: '範本內容不可超過 ' + NOTIFY.maxBodyLength + ' 字' };
    return { ok: true, template: { id: id, name: name, body: body } };
  }

  /** 綁定網址：https://line.me/R/oaMessage/@52grace/?綁定%20<碼>（訊息文字 URL 編碼） */
  function bindUrl(code) {
    return LINE.bindUrlBase + encodeURIComponent(LINE.bindCommand + ' ' + String(code || '').toUpperCase());
  }

  /** 綁定訊息解析：「綁定 XXXXXX」（大小寫、全半形空白皆可）→ 6 碼大寫；不符回 '' */
  function parseBindMessage(text) {
    var m = new RegExp('^\\s*' + LINE.bindCommand + '[\\s　]*([A-Za-z0-9]{' + LINE.bindCodeLength + '})\\s*$').exec(String(text == null ? '' : text));
    return m ? m[1].toUpperCase() : '';
  }

  /**
   * 批次整理：input = { id?, title, deadline, hint?, members:[{ key, name, masked?, callName? }], archived? }
   *  → { ok:true, batch } 或 { ok:false, message }
   * 成員鍵為名冊鍵雜湊（16 碼十六進位）；稱呼未填時由本名去姓；同鍵只保留第一筆。
   */
  function normalizeBatch(input) {
    if (!input || typeof input !== 'object') return { ok: false, message: '名單格式錯誤' };
    var clean = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); };
    var id = String(input.id == null ? '' : input.id).trim();
    if (id && !BATCH.idRe.test(id)) return { ok: false, message: '名單編號格式不正確' };
    var title = clean(input.title, BATCH.maxTitleLength + 1);
    if (!title) return { ok: false, message: '名單名稱為必填' };
    if (title.length > BATCH.maxTitleLength) return { ok: false, message: '名單名稱不可超過 ' + BATCH.maxTitleLength + ' 字' };
    var ms = parseDeadline(input.deadline);
    if (ms == null) return { ok: false, message: '截止時間格式不正確' };
    var hint = clean(input.hint, BATCH.maxHintLength + 1);
    if (!hint) hint = BATCH.defaultHint;
    if (hint.length > BATCH.maxHintLength) return { ok: false, message: '提示文字不可超過 ' + BATCH.maxHintLength + ' 字' };
    var members = Array.isArray(input.members) ? input.members : [];
    if (members.length > BATCH.maxMembers) return { ok: false, message: '成員不可超過 ' + BATCH.maxMembers + ' 位' };
    var seen = {}, out = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i] || {};
      var key = String(m.key == null ? '' : m.key).trim().toLowerCase();
      if (!BATCH.keyRe.test(key)) return { ok: false, message: '成員鍵格式不正確（第 ' + (i + 1) + ' 位）' };
      if (seen[key]) continue;
      seen[key] = 1;
      var name = clean(m.name, ROSTER.maxNameLength);
      if (!name) return { ok: false, message: '成員本名為必填（第 ' + (i + 1) + ' 位）' };
      var cn = clean(m.callName, BATCH.maxCallNameLength) || callName(name);
      out.push({ key: key, name: name, masked: clean(m.masked, ROSTER.maxKeyLength), callName: cn });
    }
    return { ok: true, batch: { id: id, title: title, deadline: deadlineIso(ms), hint: hint, members: out, archived: input.archived === true } };
  }

  /** 批次是否於前台可見：未封存且截止後未超過 30 天 */
  function batchVisible(batch, nowMs) {
    if (!batch || batch.archived) return false;
    var dl = parseDeadline(batch.deadline);
    if (dl == null) return false;
    return (nowMs - dl) <= BATCH.visibleAfterDeadlineDays * 86400000;
  }

  /**
   * 由多個可見批次中挑選一筆：未截止者取截止最早；皆已截止取截止最近一筆；無則 null
   */
  function pickBatch(batches, nowMs) {
    var open = [], past = [];
    (batches || []).forEach(function (b) {
      if (!batchVisible(b, nowMs)) return;
      var dl = parseDeadline(b.deadline);
      (dl >= nowMs ? open : past).push({ b: b, dl: dl });
    });
    if (open.length) { open.sort(function (x, y) { return x.dl - y.dl; }); return open[0].b; }
    if (past.length) { past.sort(function (x, y) { return y.dl - x.dl; }); return past[0].b; }
    return null;
  }

  /** 批次內成員：鍵相符的成員物件或 null */
  function batchMember(batch, key) {
    var k = String(key == null ? '' : key).toLowerCase();
    var hit = null;
    ((batch && batch.members) || []).forEach(function (m) { if (!hit && m.key === k) hit = m; });
    return hit;
  }

  /** 前台用批次摘要：{ id, title, deadline, deadlineText, hint, callName, overdue } */
  function batchBrief(batch, member, nowMs) {
    if (!batch) return null;
    var dl = parseDeadline(batch.deadline);
    return { id: batch.id, title: batch.title, deadline: batch.deadline, deadlineText: formatDeadline(batch.deadline), hint: batch.hint || BATCH.defaultHint,
      callName: (member && member.callName) || callName(member && member.name), overdue: dl != null && nowMs > dl };
  }

  /** 前後台可用的 icon 語意名稱總表（區塊、身分、類別、步驟；plus 為自訂步驟） */
  /* ------------------------------------------------------------------ */
  /* 作業封存結構（雲端硬碟資料夾與 zip 共用）                            */
  /* ------------------------------------------------------------------ */
  /** 資料夾與檔名：\ / : * ? " < > | 與控制字元改全形底線，去頭尾句點與空白，長度上限 60 */
  function archiveSafe(s, max) {
    var out = String(s == null ? '' : s).replace(/[\\\/:*?"<>|\u0000-\u001f\u007f]/g, '＿').replace(/[\s　]+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').trim();
    if (!out) out = '未命名';
    max = max || 60;
    return out.length > max ? out.slice(0, max) : out;
  }

  /** 作業資料夾名稱：本名_諮詢作業；used（已用名稱，陣列或 has 函式）重複時加 _yyyy.mm.dd，再重複加 _02、_03… */
  function archiveFolderName(name, dateStr, used) {
    var has = typeof used === 'function' ? used : function (n) { return (used || []).indexOf(n) >= 0; };
    var base = archiveSafe(name) + ARCHIVE.suffix;
    if (!has(base)) return base;
    var dated = base + (dateStr ? '_' + dateStr : '');
    if (dateStr && !has(dated)) return dated;
    for (var i = 2; i < 1000; i++) { var n = dated + '_' + (i < 10 ? '0' + i : i); if (!has(n)) return n; }
    return dated + '_' + Date.now();
  }

  /**
   * 附件 key → 封存子資料夾路徑（陣列）：
   *   uploads.<類別> → ['資料上傳', 類別名稱]
   *   <流程>.<步驟 id> → [流程名稱, '序號_步驟名稱']（序號依該份答案步驟順序，兩位數）
   *   dialog.bookedShots／silentShots → ['對話紀錄', '完成預約'／'詢問後未回覆']
   *   無法辨識 → ['其他附件']
   */
  function archiveDirForKey(key, answers) {
    key = canonicalFileKey(String(key || ''));
    var parts = key.split('.');
    if (parts[0] === 'uploads') {
      var c = categoryById(parts[1]);
      return [ARCHIVE.uploadsDir, archiveSafe(c ? c.label : parts[1])];
    }
    if (isFlowId(parts[0])) {
      var sec = sectionById(parts[0]);
      var stages = answers ? flowStages(parts[0], answers) : defaultStages(parts[0]);
      for (var i = 0; i < stages.length; i++) {
        if (stages[i].id === parts[1]) return [sec.label, (i + 1 < 10 ? '0' : '') + (i + 1) + '_' + archiveSafe(stageDisplayName(stages[i]), 40)];
      }
      return [sec.label, '自訂步驟'];
    }
    if (parts[0] === 'dialog') {
      var dsec = sectionById('dialog');
      var f = null;
      (dsec.fields || []).forEach(function (x) { if (x.id === parts[1]) f = x; });
      return [ARCHIVE.dialogDir, archiveSafe(f ? f.label : parts[1])];
    }
    return [ARCHIVE.otherDir];
  }

  /** 雲端連結清單文字：一行一筆「類別或步驟｜說明｜網址」；無連結回 '' */
  function archiveLinksText(labeled) {
    var links = (labeled && (labeled.links || (labeled.gaps && labeled.gaps.links))) || [];
    if (!links.length) return '';
    return links.map(function (l) {
      return [String(l.category || l.stage || '').replace(/[\r\n|｜]+/g, ' '), String(l.note || '—').replace(/[\r\n|｜]+/g, ' ') || '—', String(l.url || '')].join('｜');
    }).join('\r\n') + '\r\n';
  }

  /**
   * zip 內容清單（後台瀏覽器打包；與雲端硬碟資料夾結構無關，依附件 key 分類）：
   *   detail：get() 回傳 { index, data, files:[{ fileId, name, size, mime, key?, label?, path? }], folderUrl }
   *   opts：{ root（資料夾名，預設 本名_諮詢作業）, maxFileBytes }
   * → { root, entries:[{ path, fileId?, text?, size, kind:'pdf'|'json'|'file'|'text' }], driveOnly:[{ path, name, size }] }
   * 附件檔名保留資料中心命名（本名_yyyy.mm.dd_類別名[_序號].副檔名）；同一資料夾同名時加序號。
   */
  function zipEntries(detail, opts) {
    opts = opts || {};
    var d = detail || {}, data = d.data || null, ix = d.index || {};
    var raw = data && data.raw ? normalizeAnswers(data.raw) : null;
    var name = archiveSafe(ix.name || (data && data.student && data.student.name) || '未命名');
    var root = opts.root || (name + ARCHIVE.suffix);
    var max = opts.maxFileBytes || ARCHIVE.maxFileBytes;
    var entries = [], driveOnly = [], seen = {};
    function uniq(path) {
      if (!seen[path]) { seen[path] = 1; return path; }
      var m = /^(.*?)(\.[A-Za-z0-9]+)?$/.exec(path), n = 2, p;
      do { p = m[1] + '_' + (n < 10 ? '0' : '') + n + (m[2] || ''); n++; } while (seen[p]);
      seen[p] = 1; return p;
    }
    var files = (d.files || []).slice().sort(function (a, b) { return String(a.name) < String(b.name) ? -1 : 1; });
    var hasJson = false;
    files.forEach(function (f) {
      var n = String(f.name || '');
      var size = Number(f.size) || 0;
      var path, kind = 'file';
      if (f.label === '作業內容 PDF' || /_作業內容\.pdf$/.test(n)) { path = name + '_作業內容.pdf'; kind = 'pdf'; }
      else if (f.label === '作業資料 JSON' || /_作業資料\.json$/.test(n)) { path = ARCHIVE.jsonFile; kind = 'json'; hasJson = true; }
      else if (n === ARCHIVE.linksFile || n === ARCHIVE.driveOnlyFile || /_PDF產生失敗\.txt$/.test(n)) return;   // 由打包時重新產生
      else {
        var dir = f.key ? archiveDirForKey(f.key, raw) : (f.path ? String(f.path).split('/').filter(Boolean) : [ARCHIVE.otherDir]);
        path = dir.join('/') + '/' + archiveSafe(n, 120);
      }
      path = uniq(path);
      if (size > max) { driveOnly.push({ path: path, name: n, size: size }); return; }
      entries.push({ path: path, fileId: f.fileId, size: size, kind: kind });
    });
    if (!hasJson && data) entries.push({ path: uniq(ARCHIVE.jsonFile), text: JSON.stringify(data, null, 2), kind: 'json' });
    var lt = archiveLinksText(data);
    if (lt) entries.push({ path: uniq(ARCHIVE.linksFile), text: lt, kind: 'text' });
    if (driveOnly.length) {
      var url = d.folderUrl || ix.folderUrl || '';
      entries.push({ path: uniq(ARCHIVE.driveOnlyFile), kind: 'text', text: '以下檔案超過單次下載上限 ' + Math.round(max / 1048576) + 'MB，需於雲端硬碟下載' + (url ? '：' + url : '') + '\r\n' +
        driveOnly.map(function (x) { return x.path + '｜' + (Math.round(x.size / 104857.6) / 10) + 'MB'; }).join('\r\n') + '\r\n' });
    }
    return { root: root, entries: entries, driveOnly: driveOnly };
  }

  /** 全部下載的壓縮檔名：諮詢前置作業_全部_yyyy.mm.dd.zip */
  function archiveAllName(dateStr) { return ARCHIVE.allPrefix + dateStr + '.zip'; }

  /* ------------------------------------------------------------------ */
  /* 即時填寫進度                                                        */
  /* ------------------------------------------------------------------ */
  /** 狀態分類：submitted／active（最後活動 ≤ 5 分鐘）／idle（≤ 24 小時）／stalled */
  function progressState(lastSeenMs, nowMs, submitted) {
    if (submitted) return 'submitted';
    if (lastSeenMs == null || !isFinite(lastSeenMs)) return 'stalled';
    var gap = (nowMs - lastSeenMs) / 60000;
    if (gap <= SESSION.activeWithinMin) return 'active';
    if (gap <= SESSION.idleWithinHours * 60) return 'idle';
    return 'stalled';
  }
  /** 活動分鐘累加：兩次回報間隔 ≤ 5 分鐘才計入（回傳新累計，四捨五入至 0.1） */
  function addActiveMinutes(prevActive, prevMs, nowMs) {
    var base = Number(prevActive) || 0;
    if (prevMs == null || !isFinite(prevMs)) return base;
    var gap = (nowMs - prevMs) / 60000;
    if (gap <= 0 || gap > SESSION.activeGapMin) return base;
    return Math.round((base + gap) * 10) / 10;
  }
  /** progress_ping 參數整理：null（格式不符）或 { sectionId, sectionLabel, sectionIndex, sectionTotal, percent } */
  function pingFields(req) {
    if (!req || typeof req !== 'object') return null;
    var sid = String(req.sectionId || '');
    if (!/^[A-Za-z][A-Za-z0-9]{0,29}$/.test(sid)) return null;   // 3.0 流程頁 flow1…flow3
    var idx = Math.floor(Number(req.sectionIndex)), tot = Math.floor(Number(req.sectionTotal)), pct = Math.round(Number(req.percent));
    if (!isFinite(idx) || !isFinite(tot) || tot < 1 || tot > 30 || idx < 1 || idx > tot) return null;
    if (!isFinite(pct)) pct = 0;
    var sec = sectionById(sid);
    var g = typeof globalThis !== 'undefined' ? globalThis : {};
    var label3 = g.CONSULT_SCHEMA3 && g.CONSULT_SCHEMA3.sectionLabel3 ? g.CONSULT_SCHEMA3.sectionLabel3(sid) : '';
    var label = sec ? sec.label : label3 || ({ review: '送出檢查' })[sid] || cleanStr(req.sectionLabel).slice(0, 20);
    return { sectionId: sid, sectionLabel: label, sectionIndex: idx, sectionTotal: tot, percent: Math.max(0, Math.min(100, pct)) };
  }

  /**
   * 填寫明細（3.1.3；progress_ping 選填 detail，存「填寫進度」第 16 欄）：
   *   in  { s:[[區塊 id, 完成度 0–100]…]（≤ 10）, q:[待補題目…]（≤ 12、每項 ≤ 30 字）, p:[已放入, 應放入]（放入資料進度）, n:待補題數 }
   *   out 正規化物件或 null（格式不符時忽略，不影響進度回報）
   */
  function pingDetail(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    var o = {};
    if (Array.isArray(d.s)) o.s = d.s.slice(0, 10).filter(function (x) { return Array.isArray(x) && /^[A-Za-z][A-Za-z0-9]{0,29}$/.test(String(x[0])); }).map(function (x) { var v = Math.round(Number(x[1])); return [String(x[0]), isFinite(v) ? Math.max(0, Math.min(100, v)) : 0]; });
    if (Array.isArray(d.q)) o.q = d.q.slice(0, 12).map(function (x) { return cleanStr(x).slice(0, 30); }).filter(Boolean);
    if (Array.isArray(d.p) && d.p.length === 2) { var a = Math.floor(Number(d.p[0])), b = Math.floor(Number(d.p[1])); if (isFinite(a) && isFinite(b) && a >= 0 && b >= 0 && b <= 99) o.p = [Math.min(a, b), b]; }
    if (d.n != null && isFinite(Number(d.n))) o.n = Math.max(0, Math.min(999, Math.floor(Number(d.n))));
    return Object.keys(o).length ? o : null;
  }

  /* ------------------------------------------------------------------ */
  /* 3.2：匯報、學院後台同步、諮詢準備台、諮詢教材（資料中心與 mock 共用）     */
  /* ------------------------------------------------------------------ */
  /**
   * 匯報類別：principal＝校長匯報（準備工具）、digest＝助教匯報（確認繳交）、submitNotify＝送出通知、overdue＝逾期名單。
   * 標題一律【動作＋名詞】；層級符號 ◆（一層）・（二層）。mode：'line'＝LINE＋後台、'admin'＝只在後台；reply＝即時匯報（Webhook 回覆）。
   */
  var REPORT = {
    kinds: ['principal', 'digest', 'submitNotify', 'overdue'],
    titles: { principal: '【準備工具】', digest: '【確認繳交】', submitNotify: '【送出通知】', overdue: '【逾期名單】', test: '【測試】' },
    labels: { principal: '校長匯報', digest: '助教匯報', submitNotify: '送出通知', overdue: '逾期名單' },
    roles: ['principal', 'assistant'],
    roleLabels: { principal: '校長', assistant: '助教' },
    roleReport: { principal: 'principal', assistant: 'digest' },
    keepDays: 60,
    weekDays: 7,
    replyKeyword: '匯報',
    L1: '◆ ', L2: '・'
  };
  /** 匯報方式正規化 */
  function reportMode(v) { return v === 'admin' ? 'admin' : 'line'; }
  /** 收件人角色正規化 */
  function recipientRole(v) { return v === 'assistant' ? 'assistant' : 'principal'; }
  /** 3.2.4 管理收件人是否接收（enabled 欄位；舊資料未設定＝接收） */
  function recipientEnabled(r) { return !!r && r.enabled !== false; }
  /**
   * 3.2.4 管理通知路由：天使助教可用（已設定且連線）→ 只發有 adminUserId 的收件人（'admin'），只有主帳號者待命（'standby'）；
   *   天使助教未設定／未連線 → 主帳號 userId 備援（'main'）；都沒有 → 'none'。不看 enabled（由呼叫端略過關閉者）。
   */
  function recipientRoute(r, adminUp, mainUp) {
    if (!r) return 'none';
    if (adminUp) return r.adminUserId ? 'admin' : 'standby';
    return r.userId && mainUp ? 'main' : 'none';
  }

  /**
   * 3.2.4 提醒截止（後台手動提醒；不改截止時間、不重建通知）：範本存 Script Property REMIND_TEXT（未設定＝預設文字）
   *   變數：{稱呼}／{名字}、{截止時間}（yyyy.mm.dd（週X）HH:mm）、{完成度}（作業填寫進度百分比，未開始＝0）、{作業連結}／{作業網址}
   */
  var REMIND_MANUAL = { maxLength: 1000, kind: 'remind', title: '提醒截止',
    defaultText: '{稱呼}學姐，提醒諮詢教材·專屬訂製作業只到 {截止時間}\n學姐目前完成度：{完成度}%\n請學姐一定記得準時繳交，逾時會影響到諮詢的資格跟權益喔🥹🤍',
    vars: [['稱呼', '學姐稱呼'], ['截止時間', '目前截止時間'], ['完成度', '作業填寫進度（%）'], ['作業連結', '前台作業網址']] };
  /** 3.2.5 提醒補交（待補件、逾時未交）：Script Property REMIND_LATE_TEXT（只新增；未設定＝預設） */
  var REMIND_LATE = { title: '提醒補交', kind: 'remind',
    defaultText: '{稱呼}學姐，提醒補交的資料只到 {截止}，請學姐記得在期限內補上，逾時會影響到諮詢的資格跟權益喔🥹🤍' };
  function remindManualVars(o) {
    o = o || {};
    var cn = String(o.callName || ''), pct = Math.max(0, Math.min(100, Math.round(Number(o.percent) || 0)));
    var dl = o.deadline ? formatDeadline(o.deadline) : '';
    return { '稱呼': cn, '名字': cn, '截止時間': dl, '截止': dl, '完成度': String(pct), '作業連結': NOTIFY.workUrl, '作業網址': NOTIFY.workUrl };
  }
  function remindLateText(t) { t = String(t == null ? '' : t).replace(/\r\n?/g, '\n'); return t.trim() ? t.slice(0, REMIND_MANUAL.maxLength) : REMIND_LATE.defaultText; }
  /**
   * 3.2.5 時間輸入統一解析：HHMM、HMM、HH、H、HH:MM、HH.MM、HH MM、全形數字與冒號 → 'HH:MM'；不合法回 ''（呼叫端標紅阻擋）
   */
  /**
   * 3.2.5 確認自動回覆偵測狀態（gas watchAckState 與後台顯示共用）
   * x：{ watched, notified, submitted, acked, deadlineMs, now, supps:[{ id, finished, notifiedAfter, dueMs }], sakId }
   * → { on, kind:'work'|'supp'|'', reason, suppId }；reason＝acked｜submitted｜suppDone｜pastDeadline｜suppPastDue｜notNotified｜notWatched｜suppNotNotified
   */
  function ackStateEval(x) {
    x = x || {};
    var off = function (r) { return { on: false, kind: '', reason: r, suppId: '' }; };
    if (!x.watched) return off('notWatched');
    if (!x.notified) return off('notNotified');
    if (!x.submitted) {
      if (x.acked) return off('acked');
      if (x.deadlineMs != null && x.now > x.deadlineMs) return off('pastDeadline');
      return { on: true, kind: 'work', reason: '', suppId: '' };
    }
    var supps = Array.isArray(x.supps) ? x.supps : [], r = supps.filter(function (s) { return s && !s.finished; })[0];
    if (!r) return off(supps.length ? 'suppDone' : 'submitted');
    if (x.sakId && x.sakId === r.id) return off('acked');
    if (!r.notifiedAfter) return off('suppNotNotified');
    if (r.dueMs != null && x.now > r.dueMs) return off('suppPastDue');
    return { on: true, kind: 'supp', reason: '', suppId: r.id };
  }
  var ACK_REASON_LABEL = { acked: '已確認', submitted: '已送出', suppDone: '已補件', pastDeadline: '已過截止', suppPastDue: '已過截止', notNotified: '未發通知', notWatched: '未發通知', suppNotNotified: '未發通知' };
  /** 顯示文字：自動回覆：偵測中｜偵測中（補件）｜已停止（原因） */
  function ackStateLabel(a) {
    if (!a) return '';
    if (a.on) return '自動回覆：偵測中' + (a.kind === 'supp' ? '（補件）' : '');
    return '自動回覆：已停止（' + (ACK_REASON_LABEL[a.reason] || '未發通知') + '）';
  }
  function normTimeInput(v) {
    var s = String(v == null ? '' : v).replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[\uFF1A\uFE13\uFE55]/g, ':').replace(/\uFF0E/g, '.').replace(/\u3000/g, ' ').trim();
    if (!s) return '';
    var m = /^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/.exec(s), h, mi;
    if (m) { h = +m[1]; mi = +m[2]; if (m[2].length !== 2) return ''; }
    else if (/^\d{1,4}$/.test(s)) { if (s.length <= 2) { h = +s; mi = 0; } else { h = +s.slice(0, s.length - 2); mi = +s.slice(-2); } }
    else return '';
    if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return '';
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  /** 範本正規化：空白＝預設；超長截斷 */
  function remindManualText(t) { t = String(t == null ? '' : t).replace(/\r\n?/g, '\n'); return t.trim() ? t.slice(0, REMIND_MANUAL.maxLength) : REMIND_MANUAL.defaultText; }

  /** 時間 → 'yyyy.mm.dd HH:mm'（台北；3.2.4 起含年份） */
  function shortTime(v) {
    var ms = typeof v === 'number' ? v : (timeToMs(v) != null ? timeToMs(v) : parseDeadline(v));
    if (ms == null) return '';
    var t = new Date(ms + 8 * 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getUTCFullYear() + '.' + p(t.getUTCMonth() + 1) + '.' + p(t.getUTCDate()) + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes());   // 3.2.4：含年份
  }
  /** 毫秒 → 'yyyy.mm.dd HH:mm:ss'（台北） */
  function stampOf(ms) {
    var t = new Date(ms + 8 * 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getUTCFullYear() + '.' + p(t.getUTCMonth() + 1) + '.' + p(t.getUTCDate()) + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds());
  }
  /** 官網時間（'2026-11-04 15:50:00'、'2026-11-04T15:50:00+08:00'、毫秒）→ 毫秒；無時區者視為台北 */
  function siteTimeMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim();
    if (/T\d{2}:\d{2}/.test(s) && /(?:Z|[+\-]\d{2}:?\d{2})$/.test(s)) { var ms = Date.parse(s); return isFinite(ms) ? ms : null; }
    return timeToMs(s);
  }

  /**
   * 需提醒名單（助教匯報）：未送出且（逾期、48 小時內截止、通知後未回覆確認）
   * rows：watch_list rows → [{ name, reason, deadlineText }]
   */
  function remindList(rows, nowMs) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || r.state === 'submitted') return;
      var dl = parseDeadline(r.deadline), left = dl == null ? null : dl - nowMs, why = [];
      if (left != null && left <= 0) why.push('逾期');
      else if (left != null && left <= 48 * 3600000) why.push('48 小時內截止');
      var notified = (r.notifies || []).some(function (n) { return n && n.ok && (n.kind === 'notify' || n.kind === 'resend'); });
      if (notified && !r.ack) why.push('未回覆確認');
      if (!notified && r.state === 'none') why.push('尚未收到通知');
      if (!why.length) return;
      out.push({ name: r.name, reason: why.join('、'), deadline: r.deadline || '', deadlineText: r.deadline ? shortTime(r.deadline) : '' });
    });
    return out;
  }
  function remindListText(list) {
    if (!list.length) return REPORT.L2 + '無';
    return list.map(function (x) { return REPORT.L2 + x.name + '｜' + x.reason + (x.deadlineText ? '｜截止 ' + x.deadlineText : ''); }).join('\n');
  }

  /**
   * 諮詢準備台計算（prep_board 與校長匯報共用）
   *   o = { rows:[{ key, name, nextCounsel:{ at, items, status }|null, hw:{ state }, dataConfirmed, toolDone, … }], nowMs, leadHours, from?, to? }
   *   → { rows（補 dueAt、dueText、dueLeftMin、urgency、status）, today:[key], calendar:{ from, to, events }, stats }
   */
  var PREP = { leadHoursDefault: 48, leadHoursMin: 1, leadHoursMax: 168, soonMs: 24 * 3600000, notifyKinds: ['notify', 'resend', 'batch', 'supplement', 'thanks', 'remind48', 'remind24', 'noAck'] };
  /**
   * 3.2.4 名冊作業階段：idle（未追蹤或未發通知、或上一次流程已結束 → 一般狀態，可發送作業通知）｜progress（已通知未送出：作業進行中）｜tool（已送出、工具與諮詢教材都未完成交付：工具製作中）
   *   o = { inWatch, notified, state, toolDone, matDelivered }
   */
  function workPhase(o) {
    o = o || {};
    if (!o.inWatch || !o.notified) return 'idle';
    if (o.state !== 'submitted') return 'progress';
    return o.toolDone || o.matDelivered ? 'idle' : 'tool';
  }
  /** 3.2.5：流程結束後再發作業通知＝新流程（保留上一次紀錄） */
  var CYCLE_RESTART = true;
  var WORK_PHASE_LABEL = { progress: '作業進行中', tool: '工具製作中' };
  /**
   * 3.2.4 歷次紀錄（資料中心與 mock 共用，純函式）：
   *   receipts：該學姐全部回執（作業索引每列一份：receiptId, submittedAt, onTime, driveUrl, batchId）
   *   watch：追蹤名單條目（每位一筆；hist＝上一次流程摘要、rs＝本次流程開始、at、d、td、tda、nt）
   *   counsels：[{ at, title, status }]（官網學員資料的已完成諮詢＋已預約）；materials：[{ material, state, deliveredAt }]
   * → { rows（新→舊）:[{ notifiedAt, deadline, submittedAt, onTime, receiptId, driveUrl, counsel, toolDoneAt, materialDeliveredAt, material, state, current }], summary:{ count, lastDone, lastCounsel } }
   */
  function studentHistory(o) {
    o = o || {};
    var now = Number(o.nowMs) || Date.now(), ms = function (v) { var m = timeToMs(v); if (m == null) m = parseDeadline(v); if (m == null && v) { var t = Date.parse(v); m = isNaN(t) ? null : t; } return m; };
    var rec = (o.receipts || []).filter(function (x) { return x && x.receiptId && ms(x.submittedAt) != null; }).slice().sort(function (a, b) { return ms(a.submittedAt) - ms(b.submittedAt); });
    var cs = (o.counsels || []).filter(function (c) { return c && ms(c.at) != null; }).slice().sort(function (a, b) { return ms(a.at) - ms(b.at); });
    var mats = (o.materials || []).filter(function (f) { return f && f.state === 'delivered' && ms(f.deliveredAt) != null; });
    var e = o.watch || null, cyc = [];
    if (e) {
      (e.hist || []).forEach(function (h) { if (h && ms(h.at) != null) cyc.push({ start: ms(h.at), d: h.d || '', tda: h.tda || '', td: h.td === 1, current: false }); });
      var cs0 = ms(e.rs || e.at); cyc.push({ start: cs0 == null ? now : cs0, d: e.d || '', tda: e.tda || '', td: e.td === 1, current: true, legacy: !e.rs && !(e.hist || []).length });
      cyc.sort(function (a, b) { return a.start - b.start; });
    }
    var nt = (e && e.nt) || [], NK = ['notify', 'resend', 'batch', 'supplement'];
    var rows = [], used = {};
    cyc.forEach(function (c, i) {
      var lo = c.legacy || i === 0 && !cyc[0].start ? -Infinity : c.start, hi = i + 1 < cyc.length ? cyc[i + 1].start : Infinity;
      if (c.legacy) lo = -Infinity;
      var inR = rec.filter(function (x) { var m = ms(x.submittedAt); return m >= lo && m < hi && !used[x.receiptId]; });
      var r = inR.length ? inR[inR.length - 1] : null; if (r) used[r.receiptId] = 1;
      var n0 = nt.filter(function (n) { var m = ms(n.at); return n && n.ok && NK.indexOf(n.kind) >= 0 && m != null && m >= c.start - 60000 && m < hi; })[0];
      rows.push({ c: c, r: r, notifiedAt: n0 ? n0.at : stampOf(c.start), hi: hi });
    });
    rec.forEach(function (x) { if (!used[x.receiptId]) rows.push({ c: null, r: x, notifiedAt: '', hi: Infinity }); });
    var out = rows.map(function (z) {
      var r = z.r, sub = r ? ms(r.submittedAt) : null, c = z.c;
      var cn = sub == null ? null : cs.filter(function (k) { return ms(k.at) >= sub; })[0] || null;
      var lo = c ? c.start : (sub == null ? -Infinity : sub);
      var mf = mats.filter(function (f) { var m = ms(f.deliveredAt); return m >= lo && m < z.hi; }).slice(-1)[0] || null;
      var dl = c ? c.d : '';
      return { notifiedAt: z.notifiedAt, deadline: dl, submittedAt: r ? r.submittedAt : '', onTime: r ? (dl ? isOnTime(r.submittedAt, dl) : (r.onTime != null ? r.onTime : null)) : null,
        receiptId: r ? r.receiptId : '', driveUrl: r && /^https:\/\//.test(String(r.driveUrl || '')) ? r.driveUrl : '',
        counsel: cn ? { at: cn.at, title: cn.title || '', status: cn.status || '' } : null, toolDoneAt: c && c.tda ? c.tda : '', toolDone: !!(c && c.td),
        materialDeliveredAt: mf ? mf.deliveredAt : '', material: mf ? mf.material || '' : '',
        state: !r ? (c && c.current ? 'progress' : 'none') : ((c && c.td) || mf ? 'done' : 'submitted'), current: !!(c && c.current), _k: sub != null ? sub : (c ? c.start : 0) };
    }).sort(function (a, b) { return b._k - a._k; });
    out.forEach(function (x) { delete x._k; });
    var past = cs.filter(function (k) { return ms(k.at) <= now; });
    return { rows: out, summary: { count: rec.length, lastDone: rec.length ? rec[rec.length - 1].submittedAt : '', lastCounsel: past.length ? past[past.length - 1].at : '' } };
  }
  /** 3.2.4：本輪作業通知是否已發出（作業通知、補件、批次；成功者）→ 進行中／可提醒截止 */
  function watchNotified(nt) { return (Array.isArray(nt) ? nt : []).some(function (n) { return n && n.ok === true && ['notify', 'resend', 'batch', 'supplement'].indexOf(n.kind) >= 0; }); }
  /** 3.2.4：是否已發送過作業通知（追蹤名單通知紀錄 nt 有一筆成功的作業類通知；教材下單通知不算） */
  function prepNotified(nt) { return (Array.isArray(nt) ? nt : []).some(function (n) { return n && n.ok === true && PREP.notifyKinds.indexOf(n.kind) >= 0; }); }
  function prepCompute(o) {
    o = o || {};
    var now = Number(o.nowMs) || Date.now(), lead = Number(o.leadHours) || PREP.leadHoursDefault;
    var dayStart = function (ms) { var t = new Date(ms + 8 * 3600000); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 8 * 3600000; };
    var today0 = dayStart(now), today1 = today0 + 86400000;
    var tNow = new Date(now + 8 * 3600000), wd = (tNow.getUTCDay() + 6) % 7, week0 = today0 - wd * 86400000, week1 = week0 + 7 * 86400000;
    // 3.2.4：只納入已發送作業通知的學姐（notified === false 者移到 others，不列入今日待辦、行事曆與計數；諮詢詳情仍可查預約）
    var others = [];
    var rows = (o.rows || []).map(function (r) {
      var x = {}; Object.keys(r).forEach(function (k) { x[k] = r[k]; });
      var at = x.nextCounsel ? parseDeadline(x.nextCounsel.at) : null;
      var sent = x.hw && x.hw.state === 'submitted', mf = x.material;
      // 3.5.1 本次作業的教材已交付（交付時間不早於作業送出）＝已完成，不再依賴手動勾選；已放棄的流程不算
      var delivered = !!(sent && mf && mf.state === 'delivered' && !mf.abandoned && !mf.abandonedAt && (timeToMs(mf.deliveredAt) || 0) >= (timeToMs(x.hw.submittedAt) || 0));
      var done = !!(x.dataConfirmed && x.toolDone) || delivered;
      x.status = done ? 'done' : !sent ? 'hw' : (x.dataConfirmed || x.toolDone) ? 'doing' : 'todo';
      if (delivered) x.deliveredDone = true;
      if (at == null) { x.dueAt = ''; x.dueText = ''; x.dueLeftMin = null; x.urgency = 'none'; x.counselMs = null; return x; }
      var due = at - lead * 3600000;
      x.counselMs = at; x.dueMs = due;
      x.dueAt = deadlineIso(due); x.dueText = formatDeadline(due); x.dueLeftMin = Math.round((due - now) / 60000);
      x.urgency = done ? 'done' : due < now ? 'over' : due - now <= PREP.soonMs ? 'soon' : 'ok';
      if (x.nextCounsel) { x.nextCounsel = { at: x.nextCounsel.at, atText: formatDeadline(at), items: (x.nextCounsel.items || []).slice(), status: x.nextCounsel.status || '', merged: (x.nextCounsel.items || []).length > 1 }; }
      return x;
    });
    // 3.2.5 逾時送出（未手動列入）：不列入諮詢準備（移到 others，標 lateExcluded）
    rows.forEach(function (r) { if (r.hw && r.hw.state === 'submitted' && r.hw.onTime === false && !r.lateIncluded) r.lateExcluded = true; });
    others = rows.filter(function (r) { return r.notified === false || r.lateExcluded; });
    rows = rows.filter(function (r) { return r.notified !== false && !r.lateExcluded; });
    var future = rows.filter(function (r) { return r.counselMs != null && r.counselMs > now; });
    var today = future.filter(function (r) { return r.dueMs < today1 && (r.status !== 'done' || (r.dueMs >= today0)); })
      .sort(function (a, b) { return a.dueMs - b.dueMs; }).map(function (r) { return r.key; });
    var from = o.from ? parseDeadline(String(o.from) + ' 00:00') : null, to = o.to ? parseDeadline(String(o.to) + ' 23:59') : null;
    if (from == null) { var t1 = new Date(now + 8 * 3600000); from = Date.UTC(t1.getUTCFullYear(), t1.getUTCMonth(), 1) - 8 * 3600000; }
    if (to == null) { var t2 = new Date(now + 8 * 3600000); to = Date.UTC(t2.getUTCFullYear(), t2.getUTCMonth() + 2, 1) - 8 * 3600000 - 60000; }
    var events = [];
    rows.forEach(function (r) {
      if (r.counselMs == null) return;
      if (r.counselMs >= from && r.counselMs <= to) events.push({ key: r.key, name: r.name, type: 'counsel', at: deadlineIso(r.counselMs) });
      if (r.dueMs >= from && r.dueMs <= to) events.push({ key: r.key, name: r.name, type: 'due', at: r.dueAt });
    });
    events.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    var stats = {
      week: rows.filter(function (r) { return r.counselMs != null && r.counselMs >= week0 && r.counselMs < week1; }).length,
      pending: future.filter(function (r) { return r.status === 'todo' || r.status === 'doing'; }).length,
      done: future.filter(function (r) { return r.status === 'done'; }).length,
      hwNotSent: future.filter(function (r) { return r.status === 'hw'; }).length,
      noBooking: rows.filter(function (r) { return r.counselMs == null; }).length
    };
    rows.concat(others).forEach(function (r) { delete r.counselMs; delete r.dueMs; });
    return { rows: rows, others: others, today: today, calendar: { from: formatDeadlinePlain(from).slice(0, 10), to: formatDeadlinePlain(to).slice(0, 10), events: events }, stats: stats, leadHours: lead };
  }

  /**
   * 校長匯報【準備工具】：今日要準備工具的學姐（下次諮詢時間＋項目＋準備期限）、7 天內諮詢、作業未送出
   * board：prepCompute 結果；date：'yyyy.mm.dd'
   */
  function reportPrincipalText(board, date, nowMs) {
    var L1 = REPORT.L1, L2 = REPORT.L2, byKey = {}, now = Number(nowMs) || Date.now();
    board.rows.forEach(function (r) { byKey[r.key] = r; });
    var items = function (r) { return (r.nextCounsel && r.nextCounsel.items && r.nextCounsel.items.length ? r.nextCounsel.items.join('＋') : '未填項目'); };
    var lines = [REPORT.titles.principal + date];
    lines.push(L1 + '今日準備工具（' + board.today.length + ' 位）');
    if (!board.today.length) lines.push(L2 + '無');
    board.today.forEach(function (k) { var r = byKey[k]; lines.push(L2 + r.name + '｜諮詢 ' + shortTime(r.nextCounsel.at) + '｜' + items(r) + '｜期限 ' + shortTime(r.dueAt) + (r.urgency === 'over' ? '（已逾期）' : '') + (r.status === 'done' ? '（已完成）' : '')); });
    var wk = board.rows.filter(function (r) { var ms = r.nextCounsel ? parseDeadline(r.nextCounsel.at) : null; return ms != null && ms > now && ms - now <= REPORT.weekDays * 86400000; })
      .sort(function (a, b) { return parseDeadline(a.nextCounsel.at) - parseDeadline(b.nextCounsel.at); });
    lines.push(L1 + '7 天內諮詢（' + wk.length + ' 位）');
    if (!wk.length) lines.push(L2 + '無');
    wk.forEach(function (r) { lines.push(L2 + r.name + '｜' + shortTime(r.nextCounsel.at) + '｜' + items(r) + '｜' + ({ done: '已完成', hw: '作業未送出', doing: '準備中', todo: '待準備' }[r.status] || '')); });
    var hw = board.rows.filter(function (r) { var ms = r.nextCounsel ? parseDeadline(r.nextCounsel.at) : null; return ms != null && ms > now && r.status === 'hw'; });
    lines.push(L1 + '作業未送出（' + hw.length + ' 位）');
    if (!hw.length) lines.push(L2 + '無');
    hw.forEach(function (r) { lines.push(L2 + r.name + '｜諮詢 ' + shortTime(r.nextCounsel.at) + (r.hw && r.hw.state === 'filling' ? '｜填寫中 ' + (r.hw.percent || 0) + '%' : '｜未開始')); });
    return lines.join('\n');
  }

  /**
   * 學院後台預約 → 每位學姐下次諮詢（counsel_sync 與書籤共用規則）
   *   rows：[{ member_uid, start_at, items?, title?, counsel_type_name?, counsel_status }]
   *   → { byUid:{ uid:{ at(ISO), items[], status } }, kept, skipped }：只取 confirmed／combined 且未來；同一學姐同一時段合併；取最近一筆
   */
  var COUNSEL = { statuses: ['confirmed', 'combined'], maxRows: 3000, maxItems: 8, maxItemLength: 40 };
  function counselGroup(rows, nowMs) {
    var now = Number(nowMs) || Date.now(), slots = {}, skipped = 0, kept = 0;
    (rows || []).forEach(function (r) {
      if (!r || typeof r !== 'object') { skipped++; return; }
      var uid = cleanStr(r.member_uid), st = cleanStr(r.counsel_status).toLowerCase(), ms = siteTimeMs(r.start_at);
      if (!uid || COUNSEL.statuses.indexOf(st) < 0 || ms == null || ms <= now) { skipped++; return; }
      var its = Array.isArray(r.items) ? r.items : [r.title || r.counsel_type_name || ''];
      if (!Array.isArray(r.items) && r.title && r.counsel_type_name && r.counsel_type_name !== r.title) its = [r.title];
      var id = uid.toLowerCase() + '|' + ms, s = slots[id] || (slots[id] = { uid: uid, ms: ms, items: [], status: st });
      its.forEach(function (t) { t = cleanStr(t).slice(0, COUNSEL.maxItemLength); if (t && s.items.indexOf(t) < 0 && s.items.length < COUNSEL.maxItems) s.items.push(t); });
      if (st === 'combined') s.status = 'combined';
      ['url', 'mode', 'place', 'note'].forEach(function (f) { var v = cleanStr(r[f]); if (f === 'url' && !/^https:\/\/[^\s"'<>]+$/.test(v)) v = ''; if (v && !s[f]) s[f] = v.slice(0, f === 'url' ? 500 : f === 'note' ? 200 : 60); });   // 3.2.6 諮詢方式、地點、連結、預約備註
      kept++;
    });
    var byUid = {};
    Object.keys(slots).forEach(function (id) {
      var s = slots[id], u = s.uid.toLowerCase();
      if (!byUid[u] || byUid[u].ms > s.ms) byUid[u] = s;
    });
    var out = {};
    Object.keys(byUid).forEach(function (u) { var s = byUid[u], o = { at: deadlineIso(s.ms), items: s.items, status: s.items.length > 1 ? 'combined' : s.status }; ['url', 'mode', 'place', 'note'].forEach(function (f) { if (s[f]) o[f] = s[f]; }); out[s.uid] = o; });
    return { byUid: out, kept: kept, skipped: skipped };
  }

  /**
   * 諮詢教材：狀態、商品、文字、比對規則
   */
  var MATERIAL = {
    states: ['unnotified', 'notified', 'ordered', 'delivered'],
    labels: { unnotified: '未通知下單', notified: '已通知待下單', ordered: '已下單待交付', delivered: '已交付' },
    productId: 805,
    productName: '《AI指令設計》',
    orderUrl: 'https://www.graceschool.com.tw/product/show/805?kind=65',
    reasonMatch: '購買課程 - 《AI指令設計》',
    pointsSearch: 'AI指令設計',
    keyword: '領取諮詢教材',
    folderName: '諮詢教材交付',
    tab: '諮詢教材',
    headers: ['flowId', 'rosterKey', 'libId', 'material', 'amount', 'deadline', 'state', 'notifiedAt', 'replyOrderedAt', 'matchPending', 'matchedAt', 'orderEvidence', 'driveFileId', 'fileName', 'fileSize', 'lineFileSent', 'deliverTextMode', 'unzipCard', 'deliverCard', 'deliveredAt', 'receivedAt', 'updatedAt', 'createdAt',
      /* 3.3.0 只新增（附加在最後）：本次諮詢、下單網址與商品 ID、發送者、點擊、我已下單、比對依據與問題、交付來源與連結、自動交付、提醒、收件人核對 */
      'cycle', 'orderUrl', 'orderProductId', 'orderBy', 'clickAt', 'clickLast', 'clickN', 'claimAt', 'matchBy', 'matchBasis', 'matchIssue', 'matchNote', 'matchOrderId', 'matchAmount',
      'deliverSource', 'deliverUrl', 'deliverAuto', 'deliverHold', 'remindAt', 'remindN', 'syncAt', 'dlDeadline', 'dlClickAt', 'dlClickN', 'dlRevokedAt',
      /* 3.3.2 只新增：流程關閉時間（同學姐有新流程時舊的等待下單關閉）、交付檔副本（沿用工具檔時複製到「諮詢教材交付／本名」）、交付檔類型（zip｜html｜file） */
      'closedAt', 'deliverFileId', 'deliverKind',
      /* 3.3.3 只新增：放棄領取（時間、原因、操作者）、交付版本（交付當下工具第 N 版） */
      'abandonedAt', 'abandonReason', 'abandonBy', 'deliverVersion',
      /* 3.3.4 只新增：下載截止（發送下單通知時設定；交付時優先作為下載期限） */
      'downloadDeadline'],
    maxFileBytes: 50 * 1024 * 1024,
    chunkBytes: 4 * 1024 * 1024,
    getMaxBytes: 8 * 1024 * 1024,
    libMax: 50,
    maxNameLength: 60,
    maxAmount: 10000000,
    texts: {
      order: '《諮詢教材｜下單通知》\n\n親愛的{名字}學姐妳好♡\n校長根據學姐的諮詢內容，準備了專屬諮詢教材：\n《{教材}》\n━━━━━━━━━━━━━━━━━━\n【教材下單】\n✦ 下單項目｜《{商品}》\n✦ 下單金額｜{金額} 課費\n✦ 下單連結｜{下單連結}\n✦ 下單期限｜{下單期限}\n━━━━━━━━━━━━━━━━━━\n官方確認下單後，會用 LINE 傳送教材檔案♡\n完成下單或確定領取，請回覆「領取諮詢教材」',
      deliver: '《諮詢教材｜交付通知》\n\n親愛的{名字}學姐妳好♡\n已確認學姐完成下單，上方 ZIP 就是校長為學姐準備的：\n《{教材}》\n━━━━━━━━━━━━━━━━━━\n請用「電腦」下載 ZIP，解壓縮後再開啟（步驟見下方圖卡）；手機無法直接開啟。\n━━━━━━━━━━━━━━━━━━\n【一次性交付】\n本次版本即為正式交付內容，請備份到自己的電腦與雲端；遺失、誤刪或更換裝置，官方不再補發。\n\n完成下單或確定領取，請回覆「領取諮詢教材」',
      replyBefore: '收到學姐的回覆♡\n官方確認下單後，會用 LINE 傳送《{教材}》教材檔案。',
      replyAfter: '收到♡ 學姐已領取《{教材}》。\n請用電腦解壓縮後開啟，並備份到自己的電腦與雲端。'
    }
  };
  /**
   * 3.2.4 教材下單商品（Script Property MAT_PRODUCTS）：商品 ID 清單＋商品名稱關鍵字；舊 #805《AI指令設計》保留（idNames 為 ID 的名稱對照，點數紀錄沒有商品 ID 時以名稱比對）
   *   { ids:[805], keywords:['諮詢教材'], idNames:{ '805':'AI指令設計' }, displayName:'諮詢教材', orderUrl, seen:[{ id, name, at, n }] }
   */
  var MAT_PRODUCTS = { maxIds: 20, maxKeywords: 20, maxSeen: 20, maxName: 40, defaults: { ids: [805], keywords: ['諮詢教材'], idNames: { '805': 'AI指令設計' }, displayName: '諮詢教材' } };
  function normalizeMatProducts(o) {
    o = o && typeof o === 'object' ? o : {};
    var D = MAT_PRODUCTS.defaults, ids = [], kws = [], names = {};
    (Array.isArray(o.ids) ? o.ids : D.ids).forEach(function (x) { var n = Math.floor(Number(String(x).replace(/^#/, ''))); if (n > 0 && n < 1e9 && ids.indexOf(n) < 0 && ids.length < MAT_PRODUCTS.maxIds) ids.push(n); });
    (Array.isArray(o.keywords) ? o.keywords : D.keywords).forEach(function (x) { var t = cleanStr(x).slice(0, MAT_PRODUCTS.maxName); if (t && kws.indexOf(t) < 0 && kws.length < MAT_PRODUCTS.maxKeywords) kws.push(t); });
    var src = o.idNames && typeof o.idNames === 'object' ? o.idNames : D.idNames;
    ids.forEach(function (id) { var t = cleanStr(src[String(id)] || (String(id) === '805' && !o.idNames ? D.idNames['805'] : '')).slice(0, MAT_PRODUCTS.maxName); if (t) names[String(id)] = t; });
    var url = cleanStr(o.orderUrl);
    return { ids: ids, keywords: kws, idNames: names, displayName: cleanStr(o.displayName).slice(0, MAT_PRODUCTS.maxName) || kws[0] || D.displayName,
      orderUrl: /^https:\/\/(www\.)?graceschool\.com\.tw\//.test(url) ? url.slice(0, 200) : MATERIAL.orderUrl,
      seen: (Array.isArray(o.seen) ? o.seen : []).filter(function (x) { return x && typeof x === 'object' && (x.id || x.name); }).slice(0, MAT_PRODUCTS.maxSeen).map(function (x) { return { id: x.id ? String(x.id).slice(0, 20) : '', name: cleanStr(x.name).slice(0, 80), at: cleanStr(x.at).slice(0, 20), n: Math.max(0, Math.floor(Number(x.n) || 0)) }; }) };
  }
  /** 點數紀錄的商品：商品 ID（productId）與名稱（productName，或 reason「購買課程 - 《名稱》」） */
  function materialProductOf(p) {
    p = p || {};
    var id = p.productId != null && p.productId !== '' ? String(p.productId).replace(/^#/, '') : '';
    var name = cleanStr(p.productName), r = cleanStr(p.reason);
    if (!name) { var m = /《([^》]+)》/.exec(r) || /購買課程\s*[-－–]\s*(.+)$/.exec(r); name = m ? cleanStr(m[1]) : ''; }
    return { id: /^\d{1,9}$/.test(id) ? id : '', name: name.slice(0, 80) };
  }
  /** 是否為教材下單商品：商品 ID 在清單內、或商品名稱（含 reason）含任一關鍵字或 ID 對照名稱 */
  function materialProductHit(p, cfg) {
    var c = cfg && cfg.ids ? cfg : normalizeMatProducts(cfg), pr = materialProductOf(p), text = halfWidth(pr.name + ' ' + cleanStr(p && p.reason));
    if (pr.id && c.ids.some(function (x) { return String(x) === pr.id; })) return true;
    var terms = c.keywords.concat(Object.keys(c.idNames).map(function (k) { return c.idNames[k]; }));
    return terms.some(function (t) { return t && text.indexOf(halfWidth(t)) >= 0; });
  }
  /** 書籤讀取官網點數紀錄的搜尋字（search[reason]）：名稱關鍵字＋ID 對照名稱 */
  function materialPointTerms(cfg) {
    var c = cfg && cfg.ids ? cfg : normalizeMatProducts(cfg), out = [];
    c.keywords.concat(Object.keys(c.idNames).map(function (k) { return c.idNames[k]; })).forEach(function (t) { if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }
  /** 下單項目顯示：官網 #805、#xxx《顯示名稱》 */
  function materialProductLabel(cfg) { var c = cfg && cfg.ids ? cfg : normalizeMatProducts(cfg); return '《' + c.displayName + '》'; }
  function materialStateLabel(st) { return MATERIAL.labels[st] || ''; }
  /** 金額顯示：15000 → '15,000' */
  function amountText(n) { n = Math.round(Number(n) || 0); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /** 下單通知文字變數 */
  function materialVars(o) {
    o = o || {};
    return { '名字': String(o.callName || ''), '稱呼': String(o.callName || ''), '教材': String(o.material || ''), '金額': amountText(o.amount), '下單連結': String(o.orderUrl || MATERIAL.orderUrl), '商品': String(o.product || MAT_PRODUCTS.defaults.displayName), '下單期限': o.deadline ? formatDeadlinePlain(o.deadline) : '（未填）', '檔名': String(o.fileName || '') };
  }
  /** 關鍵字判斷（全形半形、空白不拘） */
  function isMaterialKeyword(text) { return halfWidth(String(text || '')).replace(/\s+/g, '').indexOf(MATERIAL.keyword) >= 0; }
  /**
   * 點數紀錄比對：flows（state notified）× points → [{ flowId, point }]
   *   條件：hashOf(point.uid) === flow.rosterKey、reason 含 reasonMatch、created_at 晚於 notifiedAt；取最早且未被使用（usedIds＋本次已配對）
   */
  function materialMatch(flows, points, hashOf, usedIds, products) {
    var used = {}; (usedIds || []).forEach(function (id) { used[String(id)] = 1; });
    var cfg = normalizeMatProducts(products);   // 3.2.4：商品 ID 在清單內或名稱含關鍵字（未給設定＝預設 #805＋「諮詢教材」）
    var cand = (points || []).filter(function (p) { return p && p.id != null && p.uid && materialProductHit(p, cfg) && siteTimeMs(p.created_at) != null; })
      .map(function (p) { return { p: p, h: hashOf(String(p.uid)), ms: siteTimeMs(p.created_at) }; })
      .sort(function (a, b) { return a.ms - b.ms; });
    var out = [];
    (flows || []).filter(function (f) { return f && f.state === 'notified' && f.notifiedAt; })
      .sort(function (a, b) { return String(a.notifiedAt) < String(b.notifiedAt) ? -1 : 1; })
      .forEach(function (f) {
        var nms = timeToMs(f.notifiedAt);
        var hit = cand.filter(function (c) { return !used[String(c.p.id)] && c.h === f.rosterKey && nms != null && c.ms > nms; })[0];
        if (!hit) return;
        used[String(hit.p.id)] = 1;
        var pr = materialProductOf(hit.p);
        out.push({ flowId: f.flowId, point: { pointId: String(hit.p.id), reason: String(hit.p.reason).slice(0, 80), points: Number(hit.p.points) || 0, at: stampOf(hit.ms), productId: pr.id, productName: pr.name } });
      });
    return out;
  }

  /* ================================================================ */
  /* 3.3.0 諮詢流程：確認金額 → 確認下單 → 等待下單 → 比對訂單 → 交付教材          */
  /*   六段流程軌：製作工具、測試工具、確認金額、確認下單、等待下單、交付教材         */
  /*   比對（一定要認人）：對象僅限該學姐本人（名冊鍵相同）、下單通知發出之後的購買、 */
  /*   商品 ID（orderUrl 可解析且官網資料有 pro_id）優先，否則名稱關鍵字；金額＝確認金額才可自動交付 */
  /* ================================================================ */
  var ORDER = {
    STAGES: [['make', '製作工具'], ['test', '測試工具'], ['price', '確認金額'], ['order', '確認下單'], ['wait', '等待下單'], ['deliver', '交付教材']],
    PREP_TABS: ['make', 'test', 'price', 'order'],
    DELIVER_TABS: ['wait', 'ready', 'log'],
    baseKeywords: ['諮詢教材', 'AI指令'],
    quickDays: [3, 5, 7],
    maxPurchases: 3000,
    maxReason: 60,
    maxPrice: 10000000,
    priceLogKeep: 20,
    clickKeep: 20,
    timeline: [['notifiedAt', '下單通知發出'], ['clickAt', '點前往下單'], ['claimAt', '按我已下單'], ['matchedAt', '比對到訂單'], ['deliveredAt', '教材交付']],
    issues: { amount: '金額不符，請確認', noAmount: '金額無法核對，請確認', recipient: '收件人核對未通過，未自動交付' },
    /* 3.3.2 下單網址只限學院官網（前台 go.html 放行條件相同）；領取教材轉址只限 Drive 與前台 tool.html 交付連結（dl.html 放行條件相同） */
    SITE_RE: /^https:\/\/(www\.)?graceschool\.com\.tw(\/[^\s"'<>]*)?$/,
    DL_URL_RE: /^https:\/\/((drive|docs)\.google\.com\/[^\s"'<>]*|grace63188\.github\.io\/consult-prep\/tool\.html#dl\.mf[0-9A-Za-z-]{4,40}\.[0-9a-f]{12})$/,
    expiredLabel: '已逾下單期限',
    abandonLabel: '已放棄',   // 3.3.3 放棄領取
    maxAbandonReason: 60,
    deliverKinds: { zip: 'ZIP', html: 'HTML 工具', file: '工具檔' },
    mergeWindowMs: 30 * 60000
  };
  /** 官網下單網址 → 商品 ID（/product/show/805、?pro_id=805、/products/805）；無法解析回 '' */
  function orderProductIdOf(url) {
    var s = cleanStr(url), m = /\/product\/show\/(\d{1,9})(?:[/?#]|$)/.exec(s) || /[?&](?:pro_id|product_id|pid)=(\d{1,9})(?:&|#|$)/.exec(s) || /\/products?\/(\d{1,9})(?:[/?#]|$)/.exec(s);
    return m ? String(Number(m[1])) : '';
  }
  /** 下單網址檢查：https、無空白與引號、≤ 500 字 → '' 或錯誤訊息 */
  function orderUrlIssue(url) {
    var s = cleanStr(url);
    if (!s) return '請填官網下單網址';
    if (!/^https:\/\/[^\s"'<>]+$/.test(s)) return '下單網址需為 https 開頭';
    if (s.length > 500) return '下單網址過長';
    if (!ORDER.SITE_RE.test(s)) return '下單網址需為學院官網（graceschool.com.tw）';   // 3.3.2 與 go.html 白名單一致
    return '';
  }
  /** 3.3.2 下單期限已過（等待下單中）→ true：停止列入同步與自動交付，期限後購買需人工確認 */
  function orderDeadlineOver(f, nowMs) {
    if (!f || f.state !== 'notified' || !f.deadline) return false;
    var ms = parseDeadline(f.deadline); return ms != null && (nowMs == null ? Date.now() : nowMs) > ms;
  }
  /** 3.3.2 每位學姐最新一筆教材流程（試算表順序＝建立順序；已關閉者不列）→ { 名冊鍵: flow } */
  function orderLatestByKey(flows) {
    var o = {}; (flows || []).forEach(function (f) { if (f && f.rosterKey) o[f.rosterKey] = f; });
    Object.keys(o).forEach(function (k) { if (o[k].closedAt) delete o[k]; });
    return o;
  }
  /** 3.3.2 同步與自動交付對象：每位學姐最新一筆、等待下單、未關閉、未逾下單期限 */
  function orderSyncFlows(flows, nowMs) {
    var L = orderLatestByKey(flows);
    return Object.keys(L).map(function (k) { return L[k]; }).filter(function (f) { return f.state === 'notified' && !f.closedAt && !f.abandonedAt && !orderDeadlineOver(f, nowMs); });   // 3.3.3 已放棄不比對
  }
  /** 3.3.2 領取教材轉址網址是否放行（伺服器 order_dl 與前台 dl.html 相同條件） */
  function orderDlUrlOk(u) { return ORDER.DL_URL_RE.test(cleanStr(u)); }
  /** 比對用名稱關鍵字：教材下單商品設定的關鍵字＋ID 對照名稱＋預設「諮詢教材」「AI指令」 */
  function orderKeywords(cfg) {
    var c = cfg && cfg.ids ? cfg : normalizeMatProducts(cfg), out = [];
    ORDER.baseKeywords.concat(c.keywords || []).concat(Object.keys(c.idNames || {}).map(function (k) { return c.idNames[k]; })).forEach(function (t) { t = cleanStr(t); if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }
  /** 購買紀錄正規化：{ id, uid, at, productId?, productName?, reason?, amount?（課費；負數取絕對值）} → 物件或 null */
  function orderPurchaseNorm(p) {
    if (!p || typeof p !== 'object') return null;
    var id = cleanStr(p.id).slice(0, 60), uid = cleanStr(p.uid).slice(0, 120), at = cleanStr(p.at || p.created_at || p.buy_at).slice(0, 40), ms = siteTimeMs(at);
    if (!id || !uid || ms == null) return null;
    var pr = materialProductOf({ productId: p.productId != null ? p.productId : p.pro_id, productName: p.productName != null ? p.productName : p.pro_name, reason: p.reason });
    var raw = p.amount != null && p.amount !== '' ? p.amount : p.points, n = raw == null || raw === '' ? null : Math.abs(Math.round(Number(raw)));
    return { id: id, uid: uid, at: stampOf(ms), ms: ms, productId: pr.id, productName: pr.name, reason: cleanStr(p.reason).slice(0, 120), amount: n != null && isFinite(n) && n > 0 ? n : null };
  }
  /** 名稱是否含關鍵字（全形半形不拘） */
  function orderKeywordHit(p, keywords) {
    var text = halfWidth(cleanStr(p.productName) + ' ' + cleanStr(p.reason));
    return (keywords || []).some(function (t) { return t && text.indexOf(halfWidth(t)) >= 0; });
  }
  /**
   * 單一學姐的訂單比對（認人＋時間＋商品＋金額）
   *   flow：{ flowId, rosterKey, notifiedAt, amount（確認金額）, orderProductId? }
   *   purchases：已正規化（orderPurchaseNorm）且帶 key（uid 的名冊鍵）
   *   opts：{ keywords, used:{ 購買 id:1 } }
   * → null（無符合）或 { purchase, basis:'id'|'keyword', ok（可自動交付）, issue:''|'amount'|'noAmount', note }
   */
  function orderMatch(flow, purchases, opts) {
    opts = opts || {};
    if (!flow || !/^[0-9a-f]{16}$/.test(String(flow.rosterKey || ''))) return null;
    var since = timeToMs(flow.notifiedAt); if (since == null) return null;
    var used = opts.used || {}, kw = opts.keywords && opts.keywords.length ? opts.keywords : ORDER.baseKeywords;
    var mine = (purchases || []).filter(function (p) { return p && p.key === flow.rosterKey && p.ms != null && p.ms >= since && !used[p.id]; }).sort(function (a, b) { return a.ms - b.ms; });
    if (!mine.length) return null;
    var pid = String(flow.orderProductId || ''), hit = null, basis = '';
    if (pid && mine.some(function (p) { return !!p.productId; })) { hit = mine.filter(function (p) { return p.productId === pid; })[0] || null; basis = 'id'; }
    else { hit = mine.filter(function (p) { return orderKeywordHit(p, kw); })[0] || null; basis = 'keyword'; }
    if (!hit) return null;
    var want = Math.round(Number(flow.amount) || 0);
    if (basis === 'id' && hit.amount == null) {   // 3.3.2 ID 命中但無金額（課程總覽）：同學姐 ±30 分內金額相符的扣點紀錄補配
      var h0 = hit, alt = mine.filter(function (p) { return p !== h0 && p.amount != null && p.amount === want && (!p.productId || p.productId === pid) && Math.abs(p.ms - h0.ms) <= ORDER.mergeWindowMs; })
        .sort(function (a, b) { return Math.abs(a.ms - h0.ms) - Math.abs(b.ms - h0.ms); })[0];
      if (alt) { hit = alt; if (!hit.productId) hit.productId = pid; }
    }
    var issue = hit.amount == null ? 'noAmount' : hit.amount !== want ? 'amount' : '';
    var note = (basis === 'id' ? '商品 ID #' + hit.productId : '商品名稱含關鍵字') + '・' + hit.at.slice(0, 16) + (hit.amount != null ? '・' + amountText(hit.amount) : '');
    return { purchase: hit, basis: basis, ok: !issue, issue: issue, note: note };
  }
  /**
   * 合併官網兩種來源（已正規化）：點數紀錄（有金額、名稱在 reason）＋課程總覽（有 pro_id、無金額）
   *   3.3.2 以「同一學姐、時間相差 ≤ 30 分」為主、名稱相符為輔（多筆候選時名稱相符者優先，其次時間最近）→ 點數紀錄補上商品 ID；
   *   配不到的總覽紀錄保留（金額未知）
   */
  function orderPurchasesMerge(list) {
    var pts = [], ovs = [];
    (list || []).forEach(function (p) { if (!p) return; (p.amount == null && p.productId ? ovs : pts).push(p); });
    var taken = {};
    var nameHit = function (o, p) { return !!(o.productName && (o.productName === p.productName || cleanStr(p.reason).indexOf(o.productName) >= 0)); };
    pts.forEach(function (p) {
      if (p.productId) return;
      var cand = ovs.map(function (o, i) { return { o: o, i: i, n: nameHit(o, p) ? 1 : 0, d: Math.abs(o.ms - p.ms) }; })
        .filter(function (c) { return !taken[c.i] && c.o.uid.toLowerCase() === p.uid.toLowerCase() && c.d <= ORDER.mergeWindowMs; })
        .sort(function (a, b) { return b.n - a.n || a.d - b.d; });
      if (cand.length) { taken[cand[0].i] = 1; p.productId = cand[0].o.productId; if (!p.productName) p.productName = cand[0].o.productName; }
    });
    return pts.concat(ovs.filter(function (o, i) { return !taken[i]; }));
  }
  /** 確認金額檢查：金額為 1–1000 萬整數；與原定價不同時需改價原因 → '' 或錯誤訊息 */
  function orderPriceIssue(initial, amount, reason) {
    var a = Math.round(Number(String(amount == null ? '' : amount).replace(/[,\s]/g, '')));
    if (!isFinite(a) || a <= 0 || a > ORDER.maxPrice) return '請填確認金額（新台幣，整數）';
    var pi = Math.round(Number(initial) || 0);
    if (pi > 0 && a !== pi && !cleanStr(reason)) return '金額與原定價不同，請填改價原因';
    if (cleanStr(reason).length > ORDER.maxReason) return '改價原因最多 ' + ORDER.maxReason + ' 字';
    return '';
  }
  /** 3.3.4 下載截止預設：下單截止當天＋N 天（預設 7）23:59（台北）→ ISO；下單截止無法解析回 '' */
  function orderDownloadDefault(deadline, days) {
    var ms = parseDeadline(deadline); if (ms == null) return '';
    var t = new Date(ms + 8 * 3600000);
    return deadlineIso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + (days == null ? 7 : Number(days)), 23, 59) - 8 * 3600000);
  }
  /** 3.3.4 下載截止檢查：需可解析且晚於下單截止 → '' ｜ 錯誤說明 */
  function orderDownloadIssue(deadline, downloadDeadline) {
    var a = parseDeadline(deadline), b = parseDeadline(downloadDeadline);
    if (b == null) return '請填下載截止（日期與時間）';
    if (a != null && b <= a) return '下載截止需晚於下單截止';
    return '';
  }
  /** 3.3.4 交付時的下載期限：流程有 downloadDeadline 且尚未過 → 沿用；否則（舊資料或已過）＝交付當天＋預設天數 23:59 */
  function orderFlowDlDeadline(f, nowMs, days) {
    var now = nowMs == null ? Date.now() : nowMs, ms = f && f.downloadDeadline ? parseDeadline(f.downloadDeadline) : null;
    return ms != null && ms > now ? deadlineIso(ms) : orderQuickDeadline(now, days);
  }
  /** 快選下單期限：今天＋N 天 23:59（台北）→ ISO */
  function orderQuickDeadline(nowMs, days) {
    var t = new Date((nowMs == null ? Date.now() : nowMs) + 8 * 3600000);
    return deadlineIso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + Number(days || 0), 23, 59) - 8 * 3600000);
  }
  /**
   * 學姐所在階段：make 製作工具、test 測試工具、price 確認金額、order 確認下單、wait 等待下單、ready 待交付、log 交付紀錄
   *   tt：tooltest 公開列（state、priceConfirmed、cycle、at）；mat：該學姐最新教材流程（state、cycle、deliveredAt）
   *   教材流程屬於本次諮詢：流程 cycle 與工具 cycle 相同；舊流程（無 cycle）未交付、或交付時間晚於工具建立時間
   */
  /** 教材流程是否屬於本次諮詢（工具 cycle 相同；舊流程未交付、或交付時間晚於工具建立） */
  function flowMatCurrent(tt, mat) {
    tt = tt || {};
    return !!(mat && mat.state && (mat.cycle ? String(mat.cycle) === String(tt.cycle || '') : (mat.state !== 'delivered' || !tt.createdAt || String(mat.deliveredAt || '') >= String(tt.createdAt))));
  }
  /** 3.3.3 是否已開始製作（按開始製作、有工具、已定價、已離開製作中；舊資料同此） */
  function flowToolStarted(tt) {
    tt = tt || {}; var s = tt.state || 'make';
    return !!(tt.started || tt.startedAt || tt.toolUrl || Number(tt.priceInitial) > 0 || (s !== 'make' && s !== ''));
  }
  /**
   * 3.5.1 流程步驟（資料中心、後台、作業追蹤、內部提醒、匯報共用的唯一判定）：
   *   make 未開始製作｜started 已開始未上傳｜test 助教測試中｜fix 待校長修改｜price 確認金額｜order 確認下單｜wait 等待學姐下單｜ready 待交付｜done 已交付｜abandon 已放棄
   *   tt：tooltest 公開列（state、started、startedAt、toolUrl、priceInitial、priceConfirmed、cycle、createdAt）；mat：該學姐最新教材流程（state、cycle、deliveredAt、abandonedAt）
   */
  function flowStepOf(tt, mat) {
    tt = tt || {}; var s = tt.state || 'make';
    if (s === 'make' || !s) return flowToolStarted(tt) ? 'started' : 'make';
    if (s === 'test' || s === 'fix') return s;
    if (flowMatCurrent(tt, mat)) {
      if (mat.abandonedAt || mat.abandoned) return 'abandon';
      if (mat.state === 'delivered') return 'done';
      if (mat.state === 'ordered') return 'ready';
      if (mat.state === 'notified') return 'wait';
    }
    return Number(tt.priceConfirmed) > 0 ? 'order' : 'price';
  }
  /** 流程步驟 → 作業追蹤 3.3.6 流程分頁：make 待製作（含已開始）、test 測試中（含待修改）、order 下單中（金額、下單、等待）、ready、done、abandon */
  var FLOW_STAGE = { make: 'make', started: 'make', test: 'test', fix: 'test', price: 'order', order: 'order', wait: 'order', ready: 'ready', done: 'done', abandon: 'abandon' };
  function flowStageOf(step) { return FLOW_STAGE[step] || 'make'; }
  /**
   * 3.5.1 待看作業（內部提醒「學姐作業」21:00 彙整、每日匯報「已送出待看」共用）：
   *   作業已送出、校長尚未看（未開啟作業、未標資料確認、未自動標已看）、流程仍停在「待製作・尚未開始」
   *   o = { submitted, dataConfirmed, seen, step }（step＝flowStepOf）；已開始製作、已上傳、測試中、下單中、待交付、已交付、已放棄一律不算
   */
  function workReviewPending(o) {
    o = o || {};
    if (!o.submitted || o.dataConfirmed || o.seen) return false;
    return (o.step || 'make') === 'make';
  }
  /** 校長動作 → 視為已看作業：開啟作業（open）、開始製作（start）、上傳工具（upload）、定價／確認金額（price） */
  var WORK_SEEN_EVENTS = ['open', 'start', 'upload', 'price', 'backfill'];
  /** 學姐所在階段（流程四分頁與交付分頁用）：make 製作工具、test 測試工具、price 確認金額、order 確認下單、wait 等待下單、ready 待交付、log 交付紀錄 */
  function orderStageOf(tt, mat) {
    tt = tt || {}; var s = tt.state || 'make';
    if (s === 'make' || s === 'fix' || !s) return 'make';
    if (s === 'test') return 'test';
    var cur = flowMatCurrent(tt, mat);
    if (cur && mat.state === 'delivered') return 'log';
    if (cur && mat.state === 'ordered') return 'ready';
    if (cur && mat.state === 'notified') return 'wait';
    return tt.priceConfirmed > 0 ? 'order' : 'price';
  }
  /** 六段流程軌目前位置（0–5）：ready／log 都在「交付教材」 */
  var ORDER_TRACK = { make: 0, test: 1, price: 2, order: 3, wait: 4, ready: 5, log: 6 };
  function orderTrackIndex(stage) { return ORDER_TRACK[stage] != null ? ORDER_TRACK[stage] : 0; }
  /** 時間軸（下單通知發出、點前往下單、按我已下單、比對到訂單、教材交付）→ [{ k, label, at（yyyy.mm.dd HH:mm 或 ''）}] */
  function orderTimeline(f) {
    f = f || {};
    return ORDER.timeline.map(function (x) { var ms = timeToMs(f[x[0]]); return { k: x[0], label: x[1], at: ms == null ? '' : stampOf(ms).slice(0, 16) }; });
  }
  /** 點擊紀錄連結：前台 go.html?t=<flowId>.<簽章> */
  function orderClickToken(flowId, sig) { return String(flowId || '') + '.' + String(sig || ''); }
  function orderClickParse(t) { var m = /^(mf[0-9A-Za-z-]{4,40})\.([0-9a-f]{12})$/.exec(String(t || '')); return m ? { flowId: m[1], sig: m[2] } : null; }

  /** Drive 匯出格式（drive_folder_files：Google 文件類需匯出） */
  var DRIVE_EXPORT = {
    'application/vnd.google-apps.document': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
    'application/vnd.google-apps.spreadsheet': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
    'application/vnd.google-apps.presentation': { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
    'application/vnd.google-apps.drawing': { mimeType: 'image/png', ext: 'png' }
  };
  function driveExportOf(mime) {
    mime = String(mime || '');
    if (mime.indexOf('application/vnd.google-apps.') !== 0) return null;
    if (mime === 'application/vnd.google-apps.folder' || mime === 'application/vnd.google-apps.shortcut') return null;
    return DRIVE_EXPORT[mime] || { mimeType: 'application/pdf', ext: 'pdf' };
  }

  /* ================================================================ */
  /* 3.2.7 補充請求：前台「還有其他想補充」→ 官方 LINE → 後台「補充請求」 */
  /*   訊息格式：親愛的官方，我是{本名}。我在《{作業名稱}》的〔{路徑}〕{還想新增|還想上傳|還想補充}：{內容} */
  /*   附加選項：Script Properties SUPP_OPT_ALL（全體）、SUPP_OPT_<名冊鍵>（只給該學姐）；前台合併顯示、標「新增」、不自動勾選 */
  /* ================================================================ */
  var SUPP = {
    tab: '補充請求',
    headers: ['收到時間', '名冊鍵', '本名', '作業名稱', '路徑', '類型', '內容', '原始訊息', 'LINE userId', '狀態', '項目名稱', '範圍', '處理時間', '回覆文字', '回覆結果'],
    products: ['諮詢教材·專屬訂製', '諮詢前置作業'],
    kinds: { multi: { label: '新增', verb: '還想新增' }, upload: { label: '上傳', verb: '還想上傳' }, 'case': { label: '補充', verb: '還想補充' } },
    status: { open: '待處理', add: '已新增', no: '不需要' },
    scopeLabel: { one: '只加給學姐', all: '全體' },
    unmatched: '未對應',
    optAllKey: 'SUPP_OPT_ALL', optPrefix: 'SUPP_OPT_', pendingKey: 'SUPP_PENDING_N', textKey: 'SUPP_TEXT',
    maxAll: 80, maxOne: 40, maxLabel: 40, maxContent: 300, maxText: 300,
    /** 12 個「還有其他想補充」路徑 → 前台加入位置（pick：資料／工具類由校長選分類） */
    targets: [
      { id: 'income', max: 20, re: /^經營項目 › 收入來源$/, label: '收入來源選項' },
      { id: 'duty', max: 30, re: /^職務內容 › 工作項目$/, label: '工作項目選項' },
      { id: 'source', max: 30, re: /^實際步驟 › 接待客人 › 客人來源$/, label: '客人來源選項' },
      { id: 'channel', max: 30, re: /^實際步驟 › 接待客人 › 成交管道$/, label: '成交管道選項' },
      { id: 'step', max: 40, re: /^實際步驟 › (接待客人|帶領團隊|執行任務)$/, label: '步驟選項', sub: { '接待客人': 'receive', '帶領團隊': 'lead', '執行任務': 'task' } },
      { id: 'auth', max: 30, re: /^權限規則$/, label: '權限事項' },
      { id: 'ask', max: 20, re: /^權限規則 › 請示對象$/, label: '請示對象選項' },
      { id: 'data', max: 40, re: /^資源清單 › 資料$/, label: '資料項目', pick: 'data' },
      { id: 'site', max: 20, re: /^資源清單 › 網站帳號$/, label: '平台選項' },
      { id: 'tool', max: 30, re: /^資源清單 › 工具系統$/, label: '工具選項', pick: 'tool' },
      { id: 'upload', max: 40, re: /^放入資料 › (.+)$/, label: '放入資料項目', pick: 'data', ref: true },
      { id: 'suppUpload', max: 40, re: /^補件需求 › (.+)$/, label: '補件資料項目', pick: 'data', ref: true }
    ],
    texts: {
      add: '已在〔{路徑}〕加入「{項目}」，重新整理作業頁面就會看到，請學姐點選後繼續填寫♡',
      no: '謝謝學姐的補充♡ 這一項可以直接在〔{路徑}〕自行新增，或在諮詢時和校長說明就可以了。'
    },
    vars: [['稱呼', '學姐稱呼'], ['路徑', '前台位置'], ['項目', '項目名稱']]
  };
  var SUPP_KIND_BY_VERB = { '還想新增': 'multi', '還想上傳': 'upload', '還想補充': 'case' };
  var SUPP_RE = /^親愛的官方\s*[，,]\s*我是\s*([^。\n]{1,40}?)\s*[。.]\s*我在\s*《\s*(諮詢教材\s*[·・•‧.]\s*專屬訂製|諮詢前置作業)\s*》\s*的\s*〔\s*([^〕\n]{1,120}?)\s*〕\s*(還想新增|還想上傳|還想補充)\s*[：:]\s*([\s\S]+)$/;
  /** 補充訊息解析 → { name, product, path, kind:'multi'|'upload'|'case', content } ｜ null（不符格式） */
  function suppParse(text) {
    var t = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[​-‍⁠﻿]/g, '').trim();
    if (t.length > 2000) return null;
    var m = SUPP_RE.exec(t);
    if (!m) return null;
    var content = m[5].replace(/\s+$/, '').replace(/^\s+/, '');
    if (!content) return null;
    var path = m[3].split(/\s*[›>＞]\s*/).map(function (x) { return x.trim(); }).filter(Boolean).join(' › ');
    if (!path) return null;
    return { name: m[1].trim(), product: /前置/.test(m[2]) ? SUPP.products[1] : SUPP.products[0], path: path, kind: SUPP_KIND_BY_VERB[m[4]], content: content.slice(0, SUPP.maxContent) };
  }
  /** 路徑 → { id, label, sub, pick, ref } ｜ null（不在 12 個位置內） */
  function suppTarget(path) {
    var p = String(path == null ? '' : path).trim();
    for (var i = 0; i < SUPP.targets.length; i++) {
      var t = SUPP.targets[i], m = t.re.exec(p);
      if (!m) continue;
      return { id: t.id, label: t.label, sub: t.sub ? (t.sub[m[1]] || '') : '', pick: t.pick || '', ref: t.ref ? m[1] : '', max: t.max || SUPP.maxLabel };
    }
    return null;
  }
  /** 選項 id（x_＋8 碼）：位置＋案例＋名稱衍生，同一選項全體與個人共用同一 id */
  function suppOptId(t, sub, label) {
    var sv = String(t || '') + '|' + String(sub || '') + '|' + String(label || '').trim(), h = 5381;
    for (var i = 0; i < sv.length; i++) h = ((h * 33) ^ sv.charCodeAt(i)) >>> 0;
    return 'x_' + ('00000000' + h.toString(16)).slice(-8);
  }
  /** 項目名稱預設：內容第一行去尾端標點，≤ 40 字 */
  function suppDefaultLabel(content) {
    var l = String(content == null ? '' : content).replace(/\r\n?/g, '\n').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || '';
    return l.replace(/[。．.!！?？~～♡❤]+$/, '').trim().slice(0, SUPP.maxLabel);
  }
  var SUPP_TARGET_IDS = SUPP.targets.map(function (t) { return t.id; });
  /** 選項正規化：{ id, t, s, l, g, at, p } ｜ null */
  function suppOptNorm(o) {
    if (!o || typeof o !== 'object') return null;
    var t = String(o.t || ''), l = String(o.l == null ? '' : o.l).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, SUPP.maxLabel);
    if (SUPP_TARGET_IDS.indexOf(t) < 0 || !l) return null;
    var tdef = SUPP.targets.filter(function (x) { return x.id === t; })[0]; if (tdef && tdef.max) l = l.slice(0, tdef.max).trim();   // 各位置的名稱上限（與前台欄位一致）
    var s = t === 'step' && /^(receive|lead|task)$/.test(String(o.s || '')) ? String(o.s) : '';
    if (t === 'step' && !s) return null;
    var out = { id: suppOptId(t, s, l), t: t, s: s, l: l };
    var g = String(o.g || '').slice(0, 30); if (g && /^[A-Za-z][A-Za-z0-9_]*$/.test(g)) out.g = g;
    if (o.at) out.at = String(o.at).slice(0, 20);
    if (o.p === 1 || o.p === true) out.p = 1;
    if (/^[0-9a-f]{16}$/.test(String(o.k || ''))) out.k = String(o.k);   // 全體選項的提出者（名冊鍵；只存資料中心，前台只收到 mine）
    return out;
  }
  function suppOptList(raw) {
    var arr = raw; if (typeof raw === 'string') { try { arr = JSON.parse(raw || '[]'); } catch (e) { arr = []; } }
    var out = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (o) { var n = suppOptNorm(o); if (n && !seen[n.id]) { seen[n.id] = 1; out.push(n); } });
    return out;
  }
  /** 加入選項（同 id 不重複；超過上限丟出 ERR_LIMIT 由呼叫端處理）→ { list, added } */
  function suppOptAdd(list, opt, max) {
    var cur = suppOptList(list), n = suppOptNorm(opt);
    if (!n) return { list: cur, added: false, invalid: true };
    if (cur.some(function (x) { return x.id === n.id; })) return { list: cur, added: false };
    if (cur.length >= (max || SUPP.maxAll)) return { list: cur, added: false, full: true };
    cur.push(n);   // 一律排在清單最後（不改既有選項與資料夾編號）
    return { list: cur, added: true };
  }
  /**
   * 前台附加選項：全體在前、個人在後；同 id 只留一筆（範圍以全體為準）→ [{ ...opt, scope:'all'|'one', mine?:1 }]
   * h（該學姐名冊鍵）：個人選項與她提出的全體選項標 mine（前台顯示「官方已依學姐的補充」）；輸出不含提出者鍵
   */
  function suppMerge(allList, ownList, h) {
    var out = [], seen = {};
    suppOptList(allList).forEach(function (o) { seen[o.id] = 1; o.scope = 'all'; if (h && o.k === h) o.mine = 1; delete o.k; out.push(o); });
    suppOptList(ownList).forEach(function (o) { if (seen[o.id]) { if (h) out.forEach(function (x) { if (x.id === o.id) x.mine = 1; }); return; } seen[o.id] = 1; o.scope = 'one'; o.mine = 1; delete o.k; out.push(o); });
    return out;
  }
  /** 依位置分組：{ income:[opt…], step:{ receive:[…] }, … } */
  function suppByTarget(opts) {
    var out = {};
    (opts || []).forEach(function (o) {
      if (!o || !o.t) return;
      if (o.t === 'step') { out.step = out.step || {}; (out.step[o.s] = out.step[o.s] || []).push(o); return; }
      (out[o.t] = out[o.t] || []).push(o);
    });
    return out;
  }
  /** 未處理數 */
  function suppPendingCount(rows) { return (rows || []).filter(function (r) { return r && r.status === SUPP.status.open; }).length; }
  /** 回覆文字變數 */
  function suppVars(o) { o = o || {}; return { '稱呼': String(o.callName || ''), '路徑': String(o.path || ''), '項目': String(o.item || '') }; }

  function iconKeys() {
    var set = { plus: 1 };
    SECTIONS.forEach(function (s) { set[s.icon] = 1; if (s.stages) s.stages.forEach(function (st) { set[st.icon] = 1; }); });
    ROLES.forEach(function (r) { set[r.icon] = 1; });
    UPLOAD_CATEGORIES.forEach(function (c) { set[c.icon] = 1; });
    return Object.keys(set).sort();
  }


  /* ---------------- 3.3.7 書籤版本 ---------------- */
  /** 三支書籤共用版本號（src/roster-bookmarklet.js、src/line-map-bookmarklet.js 的 BM_VERSION 需一致；build.py 檢查） */
  var BOOKMARKLET = { version: '3.6.0', kinds: { roster: '學院後台同步', orders: '同步學院下單', linemap: 'LINE 對應' } };
  /** 'x.y.z' 比較：a < b → -1、相等 0、a > b → 1；無法解析視為 0.0.0 */
  function semverCmp(a, b) {
    var p = function (v) { var m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(v == null ? '' : v).trim()); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
    var x = p(a), y = p(b);
    for (var i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
    return 0;
  }
  /** 書籤版本判讀：未帶版本（3.3.6 以前）或低於最新 → outdated */
  function bookmarkletCheck(v) {
    var s = String(v == null ? '' : v).trim().replace(/^v/, '');
    var ok = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(s);
    return { version: ok ? s : '', latest: BOOKMARKLET.version, outdated: !ok || semverCmp(s, BOOKMARKLET.version) < 0, label: ok ? 'v' + s : '未標版本（3.3.6 以前）' };
  }

  /* ---------------- 3.3.7 LINE 額度（依方案；LINE API 為準） ---------------- */
  /** 額度設定正規化：{ mainLimit, adminLimit, reserveRatio(0–0.5), mainOverage } */
  function lineQuotaCfg(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var int = function (v, d) { var n = Math.round(Number(v)); return v === '' || v == null || !isFinite(n) || n < 1 ? d : Math.min(10000000, n); };
    var ratio = Number(r.reserveRatio);
    if (r.reservePct != null && r.reservePct !== '') ratio = Number(r.reservePct) / 100;
    if (!isFinite(ratio) || ratio < 0) ratio = AUTOMATION.quotaReserveRatio;
    return { mainLimit: int(r.mainLimit, LINE.monthlyQuota), adminLimit: int(r.adminLimit, LINE.adminMonthlyQuota), reserveRatio: Math.min(0.5, Math.round(ratio * 1000) / 1000), mainOverage: r.mainOverage != null ? r.mainOverage !== false : LINE.mainOverage !== false };
  }
  /**
   * 額度判讀（純函式；資料中心與 mock 共用）
   * raw：{ type:'limited'|'none', value|limit, used|totalUsage }；opt：{ fallbackLimit, reserveRatio, overage, estimated }
   *  limited → limit＝value；none → 不設上限（limit／remaining 為 null、level ok、paused false）
   *  → { type, limit, used, remaining, unlimited, overage, over, overBy, reserve, budget, level:'ok'|'warn'|'low'|'over', paused }
   *  overage（可加購）時超過上限照常發送，level 'over'；reserve＝ceil(limit × reserveRatio)；budget＝學姐自動提醒可用則數（null＝不限）
   */
  function lineQuotaEval(raw, opt) {
    raw = raw || {}; opt = opt || {};
    var type = raw.type === 'none' ? 'none' : 'limited';
    var used = Math.max(0, Number(raw.used != null ? raw.used : raw.totalUsage) || 0);
    var ratio = opt.reserveRatio != null && isFinite(Number(opt.reserveRatio)) ? Math.max(0, Number(opt.reserveRatio)) : AUTOMATION.quotaReserveRatio;
    if (type === 'none') return { type: 'none', limit: null, used: used, remaining: null, unlimited: true, overage: true, over: false, overBy: 0, reserve: 0, budget: null, level: 'ok', paused: false, estimated: !!opt.estimated };
    var lim = Number(raw.value != null ? raw.value : raw.limit);
    if (!(lim >= 0) || !isFinite(lim)) lim = Number(opt.fallbackLimit) || LINE.monthlyQuota;
    var remaining = Math.max(0, lim - used), reserve = Math.ceil(lim * ratio), overage = opt.overage === true, over = used >= lim && lim > 0;
    var level = over && overage ? 'over' : remaining < reserve || remaining <= 0 ? 'low' : remaining < lim * AUTOMATION.quotaWarnRatio ? 'warn' : 'ok';
    return { type: 'limited', limit: lim, used: used, remaining: remaining, unlimited: false, overage: overage, over: over, overBy: Math.max(0, used - lim), reserve: reserve, budget: Math.max(0, remaining - reserve), level: level, paused: remaining < reserve || remaining <= 0, estimated: !!opt.estimated };
  }
  /** 發送 n 則的試算 → { willSend, afterRemaining(null＝不限), enough, shortBy, overage(會進入加購計費), note } */
  function lineQuotaSend(q, n) {
    q = q || {}; n = Math.max(0, Number(n) || 0);
    if (q.unlimited || q.type === 'none' || q.limit == null) return { willSend: n, afterRemaining: null, enough: true, shortBy: 0, overage: false, note: '' };
    var rem = Math.max(0, Number(q.remaining) || 0), after = rem - n, short = after < 0 ? -after : 0;
    if (q.overage) return { willSend: n, afterRemaining: Math.max(0, after), enough: true, shortBy: 0, overage: short > 0 || !!q.over, overCount: short, note: short > 0 || q.over ? LINE.overageNote : '' };
    return { willSend: n, afterRemaining: Math.max(0, after), enough: short === 0, shortBy: short, overage: false, note: '' };
  }

  return {
    META: META,
    ROSTER: ROSTER,
    SESSION: SESSION,
    REMOVAL: REMOVAL,
    ARCHIVE: ARCHIVE,
    BATCH: BATCH,
    NOTIFY: NOTIFY,
    BOOKMARKLET: BOOKMARKLET, semverCmp: semverCmp, bookmarkletCheck: bookmarkletCheck,
    LINE: LINE, lineQuotaCfg: lineQuotaCfg, lineQuotaEval: lineQuotaEval, lineQuotaSend: lineQuotaSend,
    COMPOUND_SURNAMES: COMPOUND_SURNAMES,
    ROSTER_MATCH: ROSTER_MATCH,
    givenName: givenName,
    halfWidth: halfWidth,
    rosterNameHit: rosterNameHit,
    nameCandidates: nameCandidates,
    matchRosterText: matchRosterText,
    findDeadline: findDeadline,
    parseLineChat: parseLineChat,
    classifyLineMap: classifyLineMap,
    lineChatUrl: lineChatUrl,
    callName: callName,
    maskKey: maskKey,
    parseDeadline: parseDeadline,
    deadlineIso: deadlineIso,
    formatDeadline: formatDeadline,
    isOnTime: isOnTime,
    renderTemplate: renderTemplate,
    templateVars: templateVars,
    normalizeTemplate: normalizeTemplate,
    bindUrl: bindUrl,
    stripBindLine: stripBindLine,
    parseBindMessage: parseBindMessage,
    normalizeBatch: normalizeBatch,
    batchVisible: batchVisible,
    pickBatch: pickBatch,
    batchMember: batchMember,
    batchBrief: batchBrief,
    archiveSafe: archiveSafe,
    archiveFolderName: archiveFolderName,
    archiveDirForKey: archiveDirForKey,
    archiveLinksText: archiveLinksText,
    archiveAllName: archiveAllName,
    zipEntries: zipEntries,
    progressState: progressState,
    addActiveMinutes: addActiveMinutes,
    pingFields: pingFields,
    pingDetail: pingDetail,
    LEGACY_CATEGORY_IDS: LEGACY_CATEGORY_IDS,
    SHARE_EMAIL: SHARE_EMAIL,
    LINK_HOSTS: LINK_HOSTS,
    VIDEO_EXT: VIDEO_EXT,
    LIMITS: LIMITS,
    ISSUE_CODES: ISSUE_CODES,
    STATUSES: STATUSES,
    AUTOMATION: AUTOMATION,
    formatDeadlinePlain: formatDeadlinePlain,
    automationVars: automationVars,
    REMIND_MANUAL: REMIND_MANUAL,
    remindManualVars: remindManualVars,
    remindManualText: remindManualText,
    REMIND_RULES: REMIND_RULES,
    notifyFlags: notifyFlags,
    reminderPlan: reminderPlan,
    REPORT: REPORT,
    reportMode: reportMode,
    recipientRole: recipientRole,
    recipientEnabled: recipientEnabled,
    recipientRoute: recipientRoute,
    shortTime: shortTime,
    stampOf: stampOf,
    siteTimeMs: siteTimeMs,
    remindList: remindList,
    remindListText: remindListText,
    PREP: PREP,
    prepCompute: prepCompute,
    prepNotified: prepNotified,
    watchNotified: watchNotified,
    workPhase: workPhase,
    WORK_PHASE_LABEL: WORK_PHASE_LABEL,
    CYCLE_RESTART: CYCLE_RESTART,
    ackStateEval: ackStateEval,
    ackStateLabel: ackStateLabel,
    ACK_REASON_LABEL: ACK_REASON_LABEL,
    REMIND_LATE: REMIND_LATE, remindLateText: remindLateText, normTimeInput: normTimeInput,
    studentHistory: studentHistory,
    reportPrincipalText: reportPrincipalText,
    COUNSEL: COUNSEL,
    counselGroup: counselGroup,
    MATERIAL: MATERIAL,
    materialStateLabel: materialStateLabel,
    amountText: amountText,
    materialVars: materialVars,
    isMaterialKeyword: isMaterialKeyword,
    SUPP: SUPP, suppParse: suppParse, suppTarget: suppTarget, suppOptId: suppOptId, suppDefaultLabel: suppDefaultLabel, suppOptNorm: suppOptNorm, suppOptList: suppOptList,
    suppOptAdd: suppOptAdd, suppMerge: suppMerge, suppByTarget: suppByTarget, suppPendingCount: suppPendingCount, suppVars: suppVars,
    materialMatch: materialMatch,
    ORDER: ORDER, orderProductIdOf: orderProductIdOf, orderUrlIssue: orderUrlIssue, orderDeadlineOver: orderDeadlineOver, orderLatestByKey: orderLatestByKey, orderSyncFlows: orderSyncFlows, orderDlUrlOk: orderDlUrlOk, orderKeywords: orderKeywords, orderPurchaseNorm: orderPurchaseNorm, orderKeywordHit: orderKeywordHit, orderMatch: orderMatch, orderPurchasesMerge: orderPurchasesMerge,
    orderPriceIssue: orderPriceIssue, orderQuickDeadline: orderQuickDeadline, orderDownloadDefault: orderDownloadDefault, orderDownloadIssue: orderDownloadIssue, orderFlowDlDeadline: orderFlowDlDeadline, orderStageOf: orderStageOf, flowMatCurrent: flowMatCurrent, flowToolStarted: flowToolStarted, flowStepOf: flowStepOf, FLOW_STAGE: FLOW_STAGE, flowStageOf: flowStageOf, workReviewPending: workReviewPending, WORK_SEEN_EVENTS: WORK_SEEN_EVENTS, orderTrackIndex: orderTrackIndex, orderTimeline: orderTimeline, orderClickToken: orderClickToken, orderClickParse: orderClickParse,
    MAT_PRODUCTS: MAT_PRODUCTS,
    normalizeMatProducts: normalizeMatProducts,
    materialProductOf: materialProductOf,
    materialProductHit: materialProductHit,
    materialPointTerms: materialPointTerms,
    materialProductLabel: materialProductLabel,
    DRIVE_EXPORT: DRIVE_EXPORT,
    driveExportOf: driveExportOf,
    ROLES: ROLES,
    LEAD_ROLES: LEAD_ROLES,
    EMPLOYED_ROLES: EMPLOYED_ROLES,
    OPTIONS: OPTIONS,
    FIELD_TYPES: FIELD_TYPES,
    SECTIONS: SECTIONS,
    FLOW_IDS: FLOW_IDS,
    UPLOAD_FIELDS: UPLOAD_FIELDS,
    UPLOAD_CATEGORIES: UPLOAD_CATEGORIES,
    FLOW_STAGE_FIELDS: FLOW_STAGE_FIELDS,
    FLOW_RULES: FLOW_RULES,
    STAGE_ID_RE: STAGE_ID_RE,
    LEGACY_FILE_KEYS: LEGACY_FILE_KEYS,
    REF_OTHER: REF_OTHER,
    TOOL_OPTIONS: TOOL_OPTIONS,
    GAP_RULES: GAP_RULES,
    EXPORT_TABS: EXPORT_TABS,
    getPath: getPath,
    isEmpty: isEmpty,
    evalCondition: evalCondition,
    roleById: roleById,
    roleLeads: roleLeads,
    sectionById: sectionById,
    categoryById: categoryById,
    sectionsForRole: sectionsForRole,
    categoriesForRole: categoriesForRole,
    fieldsForRole: fieldsForRole,
    sectionHint: sectionHint,
    sectionNotice: sectionNotice,
    categoryHint: categoryHint,
    emptyAnswers: emptyAnswers,
    fileFields: fileFields,
    fileFieldsForRole: fileFieldsForRole,
    fileLabelForKey: fileLabelForKey,
    canonicalFileKey: canonicalFileKey,
    normalizeFiles: normalizeFiles,
    defaultStages: defaultStages,
    normalizeFlow: normalizeFlow,
    flowStages: flowStages,
    flowSummary: flowSummary,
    flowDiagram: flowDiagram,
    customStage: customStage,
    newCustomStageId: newCustomStageId,
    stageDisplayName: stageDisplayName,
    stageStatusLabel: stageStatusLabel,
    stageHandlingLabel: stageHandlingLabel,
    checkFlows: checkFlows,
    validate: validate,
    extOf: extOf,
    isVideo: isVideo,
    extForFile: extForFile,
    fileIssue: fileIssue,
    fileListIssue: fileListIssue,
    checkFileList: checkFileList,
    normalizeLink: normalizeLink,
    linkIssue: linkIssue,
    checkLinks: checkLinks,
    normalizeAnswers: normalizeAnswers,
    checkSubmission: checkSubmission,
    toolTokens: toolTokens,
    stageTools: stageTools,
    toolsText: toolsText,
    optionLabel: optionLabel,
    labelsOf: labelsOf,
    statusLabel: statusLabel,
    listOf: listOf,
    industryText: industryText,
    brandText: brandText,
    computeGaps: computeGaps,
    gapCount: gapCount,
    gapCountOf: gapCountOf,
    buildLabeledData: buildLabeledData,
    exportRows: exportRows,
    rosterKey: rosterKey,
    rosterRow: rosterRow,
    durationText: durationText,
    durationMinutes: durationMinutes,
    timeToMs: timeToMs,
    iconKeys: iconKeys
  };
});
