/*
 * G.R.A.C.E Academy《諮詢前置作業》3.0 工作組成模型（資料）
 * 由 work-model/model.json（3.1 設計稿）整理：16 個行業、收入來源與流程範本、資料清單（共用 28 項＋收入來源項目 158 項，含放入範例）、
 * 模組、上級、表現類型、團隊／協作／訓練與表現流程範本、舊身分對應。函式層見 src/schema3.js。
 * 輸出：window.CONSULT_MODEL3／module.exports／Apps Script 全域 CONSULT_MODEL3
 */
(function (root, factory) {
  var model = factory();
  root.CONSULT_MODEL3 = model;
  if (typeof module === 'object' && module && module.exports) module.exports = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
 "version": "3.0.0",
 "modules": [
  {
   "id": "serve",
   "label": "服務客人",
   "icon": "users",
   "def": "本業每週有固定接待的客人、學員、案主或合作廠商",
   "flow": "customerFlow",
   "question": "本業每週都有要接待的客人、學員、案主或合作廠商",
   "followUp": null
  },
  {
   "id": "lead",
   "label": "帶領團隊",
   "icon": "team",
   "def": "本業有由本人安排工作、培訓或計薪的員工、助理或下線夥伴",
   "flow": "teamFlow",
   "question": "本業有人要向本人回報工作（員工、助理、下線）",
   "followUp": null
  },
  {
   "id": "report",
   "label": "配合上級",
   "icon": "building",
   "def": "本業的任務、規範或績效由主管、公司、品牌總部、上線、教練或經紀人決定",
   "flow": "collabFlow",
   "question": "本業有需要聽從或請示的對象",
   "followUp": "superior"
  },
  {
   "id": "brand",
   "label": "經營品牌",
   "icon": "storefront",
   "def": "本業有由本人維護的店家品牌、個人品牌或社群帳號",
   "flow": null,
   "question": "本業有自己的品牌、個人品牌或社群帳號在經營",
   "followUp": null
  },
  {
   "id": "perform",
   "label": "個人表現",
   "icon": "trophy",
   "def": "本業的主要產出是本人的訓練、賽事、演出或作品",
   "flow": "performFlow",
   "question": "本業的成果主要來自比賽、演出或創作",
   "followUp": "performType"
  }
 ],
 "superiors": [
  {
   "id": "boss",
   "label": "主管或公司",
   "term": "主管",
   "orgTerm": "公司",
   "desc": "任職公司的主管、老闆或事務所主持人",
   "icon": "briefcase"
  },
  {
   "id": "hq",
   "label": "品牌總部",
   "term": "總部",
   "orgTerm": "總部",
   "desc": "加盟、代理或授權品牌的總公司",
   "icon": "building"
  },
  {
   "id": "upline",
   "label": "上線",
   "term": "上線",
   "orgTerm": "組織",
   "desc": "經銷、直銷或分潤制度中的上層夥伴",
   "icon": "handshake"
  },
  {
   "id": "coach",
   "label": "教練或球團",
   "term": "教練",
   "orgTerm": "球團或協會",
   "desc": "訓練、選訓與賽程安排的決定者",
   "icon": "whistle"
  },
  {
   "id": "agent",
   "label": "經紀人或經紀公司",
   "term": "經紀人",
   "orgTerm": "經紀公司",
   "desc": "通告、合約與曝光的安排者",
   "icon": "mic"
  },
  {
   "id": "other",
   "label": "其他",
   "term": "上級",
   "orgTerm": "單位",
   "desc": "自行填寫稱呼",
   "icon": "plus",
   "custom": true
  }
 ],
 "performTypes": [
  {
   "id": "sport",
   "label": "運動",
   "desc": "選手、競技、體能表現"
  },
  {
   "id": "stage",
   "label": "表演",
   "desc": "音樂、戲劇、舞蹈、主持"
  },
  {
   "id": "create",
   "label": "創作",
   "desc": "影音、寫作、插畫、直播內容"
  }
 ],
 "quiz": [
  {
   "id": "serve",
   "module": "serve",
   "q": "本業每週都有要接待的客人、學員、案主或合作廠商",
   "examples": [
    "店內客人",
    "上課的學生",
    "委託案件的客戶"
   ]
  },
  {
   "id": "lead",
   "module": "lead",
   "q": "本業有人要向本人回報工作（員工、助理、下線）",
   "examples": [
    "店內員工",
    "兼職助理",
    "下線夥伴"
   ]
  },
  {
   "id": "report",
   "module": "report",
   "q": "本業有需要聽從或請示的對象",
   "examples": [
    "公司主管",
    "品牌總部",
    "上線、教練、經紀人"
   ],
   "followUp": "superior"
  },
  {
   "id": "brand",
   "module": "brand",
   "q": "本業有自己的品牌、個人品牌或社群帳號在經營",
   "examples": [
    "店家 IG",
    "個人形象帳號",
    "網路商店"
   ]
  },
  {
   "id": "perform",
   "module": "perform",
   "q": "本業的成果主要來自比賽、演出或創作",
   "examples": [
    "運動賽事",
    "音樂演出",
    "影片或直播內容"
   ],
   "followUp": "performType"
  }
 ],
 "profileFields": [
  {
   "id": "brand",
   "label": "品牌名稱",
   "type": "text",
   "modules": [
    "brand"
   ]
  },
  {
   "id": "company",
   "label": "任職公司或單位",
   "type": "text",
   "modules": [
    "report"
   ],
   "termLabel": {
    "hq": "品牌名稱（總部）",
    "upline": "所屬組織",
    "coach": "球團或協會",
    "agent": "經紀公司"
   }
  },
  {
   "id": "title",
   "label": "職稱",
   "type": "text",
   "modules": [
    "report"
   ]
  },
  {
   "id": "business",
   "label": "主要業務",
   "type": "textarea",
   "modules": [
    "*"
   ]
  },
  {
   "id": "serviceMode",
   "label": "服務形式",
   "type": "multiselect",
   "options": [
    "一對一",
    "團體",
    "線上",
    "到府",
    "店面"
   ],
   "modules": [
    "serve"
   ]
  },
  {
   "id": "scale",
   "label": "營運規模",
   "type": "select",
   "options": [
    "含助理",
    "團隊"
   ],
   "modules": [
    "lead"
   ]
  },
  {
   "id": "headcount",
   "label": "團隊人數",
   "type": "number",
   "unit": "人",
   "modules": [
    "lead"
   ]
  }
 ],
 "dialogItems": [
  {
   "id": "dlgBooked",
   "label": "完成預約",
   "altLabel": "任務交辦",
   "def": "詢問到完成預約或成交的完整對話",
   "example": "完成預約的對話截圖"
  },
  {
   "id": "dlgNoReply",
   "label": "詢問後未回覆",
   "altLabel": "問題回報",
   "def": "客人詢問後沒有下文的對話",
   "example": "詢問後未回覆的對話截圖"
  }
 ],
 "checklist": [
  {
   "id": "catalog",
   "label": "服務目錄",
   "def": "販售的服務或產品項目",
   "module": "serve",
   "example": "服務或商品項目表、菜單照片、型錄 PDF",
   "industryLabel": true
  },
  {
   "id": "pricing",
   "label": "價目或方案",
   "def": "價格、套餐、方案或費率",
   "module": "serve",
   "example": "價目表照片、報價單 PDF、方案說明圖",
   "industryLabel": true
  },
  {
   "id": "scripts",
   "label": "常用話術",
   "def": "回覆詢問、介紹與成交時常用的說法",
   "module": "serve",
   "example": "LINE 常用回覆、成交話術筆記、私訊範本截圖"
  },
  {
   "id": "reception",
   "label": "接待與預約",
   "def": "預約方式、自動回覆、常見問答、諮詢單",
   "module": "serve",
   "example": "預約表單連結截圖、自動回覆設定、常見問答"
  },
  {
   "id": "serviceSop",
   "label": "服務 SOP",
   "def": "服務前中後的固定做法與通知",
   "module": "serve",
   "example": "服務流程表、注意事項單張、交付清單",
   "industryLabel": true
  },
  {
   "id": "clientList",
   "label": "客戶名單",
   "def": "客人的基本資料與聯絡方式",
   "module": "serve",
   "example": "客戶試算表、會員系統匯出檔、紙本名冊照片",
   "primary": true,
   "industryLabel": true
  },
  {
   "id": "purchases",
   "label": "消費紀錄",
   "def": "每位客人的購買、療程或案件紀錄",
   "module": "serve",
   "example": "消費紀錄表、系統匯出報表、紙本卡照片",
   "primary": true,
   "industryLabel": true
  },
  {
   "id": "contract",
   "label": "合約或同意書",
   "def": "與客人簽署的文件",
   "module": "serve",
   "example": "合約範本、同意書掃描檔"
  },
  {
   "id": "rules",
   "label": "制度權益",
   "def": "預約取消、退款、優惠、保固等規則",
   "module": "serve",
   "example": "取消與退款規定、優惠辦法、保固說明"
  },
  {
   "id": "identity",
   "label": "品牌識別",
   "def": "Logo、社群帳號、官網",
   "module": "brand",
   "example": "Logo 檔、社群帳號清單、官網網址截圖"
  },
  {
   "id": "portfolio",
   "label": "作品或案例",
   "def": "作品集、成果案例、客戶評價",
   "module": "brand",
   "example": "作品照、成果案例、客戶評價截圖"
  },
  {
   "id": "marketing",
   "label": "行銷素材",
   "def": "貼文、活動企劃、廣告文案",
   "module": "brand",
   "example": "貼文圖檔、活動企劃、廣告文案"
  },
  {
   "id": "roles",
   "label": "職位說明",
   "def": "成員的職務內容與分工",
   "module": "lead",
   "example": "職務分工表、職位說明文件"
  },
  {
   "id": "shifts",
   "label": "排班或派工表",
   "def": "班表、工作分配",
   "module": "lead",
   "example": "班表、派工表截圖"
  },
  {
   "id": "payroll",
   "label": "薪資或分潤計算",
   "def": "薪資、抽成、獎金的算法",
   "module": "lead",
   "example": "薪資或抽成計算表、獎金辦法"
  },
  {
   "id": "appraisal",
   "label": "考核標準",
   "def": "成員表現的評估項目",
   "module": "lead",
   "example": "考核表、評分標準"
  },
  {
   "id": "trainingMaterials",
   "label": "培訓教材",
   "def": "帶新人用的教材、課件、錄影",
   "module": "lead",
   "example": "新人教材、課件、教學錄影"
  },
  {
   "id": "meetings",
   "label": "會議記錄",
   "def": "會議、週報、檢討紀錄",
   "module": "lead",
   "example": "週會紀錄、檢討筆記"
  },
  {
   "id": "policy",
   "label": "公司規範",
   "def": "{組織}訂定的手冊、守則、獎懲辦法、合約",
   "module": "report",
   "example": "員工手冊、守則、合約",
   "superiorLabel": true
  },
  {
   "id": "workSop",
   "label": "作業 SOP",
   "def": "{組織}規定的作業流程文件",
   "module": "report",
   "example": "作業流程文件、操作手冊"
  },
  {
   "id": "authorityDocs",
   "label": "權限文件",
   "def": "權限表、簽核流程、系統帳號說明",
   "module": "report",
   "example": "權限表、簽核流程圖、系統帳號說明"
  },
  {
   "id": "receivedTraining",
   "label": "受訓教材",
   "def": "{組織}提供的培訓內容",
   "module": "report",
   "example": "受訓講義、課程錄影連結"
  },
  {
   "id": "reports",
   "label": "回報表單",
   "def": "向{上級}回報用的表單、週報、日誌",
   "module": "report",
   "example": "週報範本、回報表單截圖"
  },
  {
   "id": "trainingPlan",
   "label": "訓練或創作計畫",
   "def": "週期計畫、排程",
   "module": "perform",
   "example": "訓練或創作排程表、週期計畫",
   "performLabel": {
    "sport": "訓練計畫",
    "stage": "練習計畫",
    "create": "創作排程"
   }
  },
  {
   "id": "results",
   "label": "成績或作品紀錄",
   "def": "比賽、演出或發布的成果",
   "module": "perform",
   "example": "成績紀錄、演出或作品清單、數據截圖",
   "performLabel": {
    "sport": "比賽紀錄與成績",
    "stage": "演出紀錄與曲目",
    "create": "作品清單與數據"
   }
  },
  {
   "id": "condition",
   "label": "狀態紀錄",
   "def": "身體、傷病、嗓音或工作狀態",
   "module": "perform",
   "example": "體測、傷病或狀態紀錄",
   "performLabel": {
    "sport": "體測與傷病紀錄",
    "stage": "身體與嗓音紀錄",
    "create": "產能與狀態紀錄"
   }
  },
  {
   "id": "sponsorship",
   "label": "贊助或合作合約",
   "def": "贊助、業配、演出合約",
   "module": "perform",
   "example": "贊助或演出合約"
  },
  {
   "id": "media",
   "label": "媒體資料",
   "def": "報導、曝光、形象照",
   "module": "perform",
   "example": "報導連結、形象照、媒體露出截圖"
  }
 ],
 "incomeItems": {
  "mediaKit": {
   "label": "媒體資料卡",
   "def": "粉絲數、受眾輪廓、平均觀看與互動數據的介紹檔",
   "example": "媒體資料卡 PDF、後台受眾數據截圖"
  },
  "quote": {
   "label": "報價單",
   "def": "各合作形式的價格與附加條件",
   "example": "報價單 PDF、價目圖卡"
  },
  "collabContract": {
   "label": "合作合約",
   "def": "與品牌或客戶約定的合作內容、費用與權利條款",
   "example": "合作合約、委託書、確認信截圖"
  },
  "brief": {
   "label": "腳本或企劃",
   "def": "合作內容的腳本、分鏡或企劃書",
   "example": "腳本文件、分鏡、品牌給的 brief"
  },
  "caseReport": {
   "label": "結案報告",
   "def": "合作結束後的曝光、互動與導購成效整理",
   "example": "結案報告 PDF、成效數據截圖"
  },
  "supplierContract": {
   "label": "供應商合約",
   "def": "與廠商約定的供貨價、分潤與退換貨條件",
   "example": "廠商合約、分潤約定截圖"
  },
  "productList": {
   "label": "商品清單",
   "def": "販售商品的品名、規格、進價與售價",
   "example": "商品試算表、型錄、進價表"
  },
  "orders": {
   "label": "訂單紀錄",
   "def": "每筆訂單的品項、金額、付款與出貨狀態",
   "example": "訂單匯出檔、喊單表、對帳單"
  },
  "shipping": {
   "label": "出貨流程",
   "def": "撿貨、包裝、物流寄送與退換貨的固定做法",
   "example": "出貨 SOP、物流設定截圖、包裝照片"
  },
  "profitShare": {
   "label": "分潤對帳表",
   "def": "每團或每期的銷售額、分潤比例與撥款紀錄",
   "example": "分潤對帳表、撥款紀錄截圖"
  },
  "productPlan": {
   "label": "商品企劃書",
   "def": "自有商品的定位、規格、成本與上市規劃",
   "example": "商品企劃簡報、定位筆記"
  },
  "factory": {
   "label": "工廠報價與打樣紀錄",
   "def": "代工廠報價、打樣版次與修改紀錄",
   "example": "工廠報價單、打樣照片與修改紀錄"
  },
  "costPrice": {
   "label": "成本與定價表",
   "def": "商品成本結構、售價與毛利計算",
   "example": "成本試算表、定價表"
  },
  "courseOutline": {
   "label": "課程大綱",
   "def": "課程章節、單元內容與時數",
   "example": "課程大綱文件、課表"
  },
  "courseVideo": {
   "label": "課程或教學影片",
   "def": "已錄製的課程、教學示範或直播回放",
   "example": "課程影片、直播回放、教學示範"
  },
  "studentList": {
   "label": "學員名單",
   "def": "報名學員的聯絡方式、方案與學習進度",
   "example": "學員試算表、報名表單匯出檔"
  },
  "subPlan": {
   "label": "訂閱或會員方案",
   "def": "訂閱等級、價格與會員權益",
   "example": "訂閱方案說明、會員權益表"
  },
  "salesPage": {
   "label": "銷售頁",
   "def": "課程或商品的介紹頁、預購頁",
   "example": "銷售頁網址截圖、預購頁"
  },
  "platformReport": {
   "label": "平台收益報表",
   "def": "各平台廣告分潤、打賞、訂閱或課程銷售的結算明細",
   "example": "平台後台收益報表、結算截圖"
  },
  "liveSchedule": {
   "label": "發布或開播排程",
   "def": "固定上片、開播或上架的時間表",
   "example": "上片或開播排程表、內容行事曆"
  },
  "platformContract": {
   "label": "平台或經紀合約",
   "def": "與直播平台、經紀公司約定的拆帳與獨家條款",
   "example": "平台或經紀合約"
  },
  "endorseContract": {
   "label": "代言合約",
   "def": "代言期間、露出範圍、肖像權與費用條款",
   "example": "代言合約、品牌大使合約"
  },
  "annualPlan": {
   "label": "年度合作排程",
   "def": "整年度的出席、拍攝與發布時程",
   "example": "年度合作排程表"
  },
  "exposure": {
   "label": "曝光成效紀錄",
   "def": "每次曝光的觸及、互動與媒體露出",
   "example": "曝光成效截圖、媒體露出整理"
  },
  "affLinks": {
   "label": "導購連結清單",
   "def": "各平台的專屬連結、折扣碼與對應商品",
   "example": "導購連結與折扣碼清單"
  },
  "commission": {
   "label": "佣金或抽成明細",
   "def": "佣金、獎金或抽成的計算方式與入帳紀錄",
   "example": "佣金或抽成明細、獎金單"
  },
  "depositRule": {
   "label": "預約與訂金規則",
   "def": "訂金收取、改期、遲到與取消的規定",
   "example": "訂金與改期規定圖卡、公告截圖"
  },
  "workPhotos": {
   "label": "施作照片",
   "def": "施作前後對照與作品紀錄",
   "example": "施作前後照片、作品集"
  },
  "pkgPlan": {
   "label": "儲值或療程方案表",
   "def": "儲值金額、療程堂數、贈送內容與有效期限",
   "example": "儲值或療程方案表、方案圖卡"
  },
  "pkgContract": {
   "label": "預付型契約",
   "def": "儲值或療程方案的契約與履約保障說明",
   "example": "預付型契約、方案同意書"
  },
  "pkgLedger": {
   "label": "儲值扣點紀錄",
   "def": "每位客人的儲值、扣點與剩餘次數",
   "example": "儲值扣點表、點數卡照片"
  },
  "inventory": {
   "label": "庫存表",
   "def": "商品或耗材的進貨、出貨與庫存數量",
   "example": "庫存表、進出貨紀錄"
  },
  "teachMaterial": {
   "label": "講義或教材",
   "def": "上課用的講義、教材包與材料清單",
   "example": "講義、教材包清單"
  },
  "certTemplate": {
   "label": "結業證書範本",
   "def": "課程結業或認證的證書格式",
   "example": "證書範本檔"
  },
  "consentForm": {
   "label": "療程同意書",
   "def": "療程風險說明與客人簽署的同意文件",
   "example": "療程同意書範本"
  },
  "followUp": {
   "label": "追蹤紀錄表",
   "def": "術後或課後的回訪、回診與追蹤紀錄",
   "example": "回訪追蹤表、術後關懷訊息截圖"
  },
  "leadList": {
   "label": "名單分配表",
   "def": "公司分配或自行開發的潛在客名單與進度",
   "example": "名單分配表、邀約紀錄"
  },
  "brochure": {
   "label": "課程簡章",
   "def": "課程內容、時段、費用與報名方式",
   "example": "課程簡章、招生 DM"
  },
  "tuition": {
   "label": "學費與退費辦法",
   "def": "學費、優惠與退費規定",
   "example": "學費表、退費辦法"
  },
  "attendance": {
   "label": "點名與繳費紀錄",
   "def": "出缺席、請假補課與繳費狀態",
   "example": "點名表、繳費紀錄"
  },
  "grades": {
   "label": "成績與學習紀錄",
   "def": "考試成績、作業與學習進度",
   "example": "成績表、學習報告"
  },
  "lessonPlan": {
   "label": "教學計畫",
   "def": "每週或每期的教學進度與內容",
   "example": "教學計畫、進度表"
  },
  "lessonLog": {
   "label": "上課紀錄",
   "def": "每次上課的內容、時數與學生表現",
   "example": "上課紀錄、家長回報截圖"
  },
  "hourlyRate": {
   "label": "鐘點收費表",
   "def": "依科目、程度或時數的收費標準",
   "example": "鐘點收費表"
  },
  "trainerProfile": {
   "label": "講師簡介",
   "def": "學經歷、專長主題與授課實績",
   "example": "講師簡介 PDF、授課實績"
  },
  "proposal": {
   "label": "課程提案書",
   "def": "依客戶需求設計的課程內容與時數",
   "example": "課程提案書"
  },
  "survey": {
   "label": "課後問卷",
   "def": "學員滿意度與回饋的問卷及統計",
   "example": "課後問卷、滿意度統計"
  },
  "timetable": {
   "label": "課表",
   "def": "授課班級、時段與教室安排",
   "example": "課表、排課表"
  },
  "materialList": {
   "label": "教材或教具清單",
   "def": "自編教材、教具的品項與售價",
   "example": "教材或教具清單、售價表"
  },
  "requirement": {
   "label": "需求單",
   "def": "客戶需求、風格參考、尺寸規格與期限",
   "example": "需求單、客戶提供的參考圖"
  },
  "deliveryList": {
   "label": "交付清單",
   "def": "交付檔案的格式、數量與版本紀錄",
   "example": "交付清單、版本紀錄"
  },
  "monthlyPlan": {
   "label": "月費方案",
   "def": "長期合作的月費內容與工作量",
   "example": "月費方案說明"
  },
  "workSchedule": {
   "label": "工作排程表",
   "def": "每月或每週的製作與發布時程",
   "example": "工作排程表、內容行事曆"
  },
  "monthlyReport": {
   "label": "月報",
   "def": "每月執行成果與數據整理",
   "example": "月報 PDF、數據整理"
  },
  "shootPlan": {
   "label": "拍攝企劃",
   "def": "拍攝腳本、場地、服裝與時程安排",
   "example": "拍攝企劃、腳本、場勘照片"
  },
  "license": {
   "label": "授權條款",
   "def": "素材或作品的使用範圍與授權方式",
   "example": "授權條款、使用範圍說明"
  },
  "designGuide": {
   "label": "設計規範",
   "def": "公司或品牌的設計標準與審稿規則",
   "example": "設計規範、品牌手冊"
  },
  "spec": {
   "label": "需求規格書",
   "def": "功能需求、畫面流程與技術規格",
   "example": "需求規格書、流程圖"
  },
  "acceptance": {
   "label": "驗收單",
   "def": "驗收項目、測試結果與簽認紀錄",
   "example": "驗收單、測試紀錄"
  },
  "maintContract": {
   "label": "維護合約",
   "def": "維護範圍、回應時間與月費",
   "example": "維護合約"
  },
  "assets": {
   "label": "主機與網域清單",
   "def": "主機、網域、帳號與到期日",
   "example": "主機與網域清單、到期日表"
  },
  "ticketLog": {
   "label": "問題回報紀錄",
   "def": "客戶回報的問題、處理過程與結果",
   "example": "問題回報表、工單截圖"
  },
  "invoice": {
   "label": "請款紀錄",
   "def": "請款單、發票與收款狀態",
   "example": "請款單、發票紀錄"
  },
  "userList": {
   "label": "付費用戶名單",
   "def": "付費用戶、方案與續訂狀態",
   "example": "付費用戶匯出檔"
  },
  "supportLog": {
   "label": "客服紀錄",
   "def": "用戶提問與處理紀錄",
   "example": "客服紀錄、常見問題整理"
  },
  "devRules": {
   "label": "開發規範",
   "def": "程式碼、版本控管與上線規則",
   "example": "開發規範、上線檢查表"
  },
  "perfReview": {
   "label": "績效考核",
   "def": "個人目標、考核項目與結果",
   "example": "考核表、目標設定"
  },
  "productSpec": {
   "label": "產品規格書",
   "def": "產品尺寸、材質、圖面與檢驗標準",
   "example": "產品規格書、圖面"
  },
  "workOrder": {
   "label": "工單與排程",
   "def": "生產工單、排程與進度",
   "example": "工單、生產排程表"
  },
  "qc": {
   "label": "品檢紀錄",
   "def": "進料、製程與出貨的檢驗結果",
   "example": "品檢紀錄表"
  },
  "shipDoc": {
   "label": "出貨單",
   "def": "出貨品項、數量與簽收紀錄",
   "example": "出貨單、簽收單"
  },
  "estimate": {
   "label": "估價單",
   "def": "現場勘查後的工料估價",
   "example": "估價單"
  },
  "sitePhotos": {
   "label": "施工照片",
   "def": "施工前、中、後的照片紀錄",
   "example": "施工前中後照片"
  },
  "warranty": {
   "label": "驗收與保固書",
   "def": "完工驗收與保固範圍",
   "example": "驗收單、保固書"
  },
  "ptPlan": {
   "label": "堂數方案與價格",
   "def": "堂數組合、單堂價格與有效期限",
   "example": "堂數方案表、價目圖卡"
  },
  "parq": {
   "label": "健康評估表",
   "def": "運動前健康問卷、病史與目標",
   "example": "健康評估問卷"
  },
  "sessionLog": {
   "label": "上課與堂數紀錄",
   "def": "每堂內容、出席與剩餘堂數",
   "example": "上課紀錄、堂數表"
  },
  "measure": {
   "label": "檢測紀錄",
   "def": "體組成、體能或身體數據的定期測量",
   "example": "體組成報告、檢測紀錄"
  },
  "groupTimetable": {
   "label": "團課課表",
   "def": "團體課的時段、地點與名額",
   "example": "團課課表"
  },
  "signIn": {
   "label": "報名與簽到紀錄",
   "def": "報名名單、繳費與出席簽到",
   "example": "報名名單、簽到表"
  },
  "dietLog": {
   "label": "飲食紀錄",
   "def": "個案的飲食日誌與餐點照片",
   "example": "飲食紀錄、餐點照片"
  },
  "assessForm": {
   "label": "評估問卷",
   "def": "初次諮詢的健康、飲食與生活習慣問卷",
   "example": "評估問卷"
  },
  "trackSheet": {
   "label": "追蹤表",
   "def": "定期回報的體重、數據與調整紀錄",
   "example": "追蹤表、回報截圖"
  },
  "careRecord": {
   "label": "照護紀錄",
   "def": "照護內容、生命徵象與異常紀錄",
   "example": "照護紀錄範本"
  },
  "handover": {
   "label": "交班表",
   "def": "交接班的個案狀況與待辦",
   "example": "交班表、交接筆記"
  },
  "eduSheet": {
   "label": "衛教單張",
   "def": "給個案或家屬的衛教說明",
   "example": "衛教單張"
  },
  "dailyReport": {
   "label": "營業日報",
   "def": "每日營業額、來客數與品項銷售",
   "example": "營業日報、POS 報表"
  },
  "deliveryReport": {
   "label": "外送平台報表",
   "def": "外送平台的訂單、抽成與撥款明細",
   "example": "外送平台報表、撥款明細"
  },
  "packSpec": {
   "label": "包裝規格",
   "def": "外帶外送的包材、封口與標示方式",
   "example": "包材清單、包裝照片"
  },
  "groupOrder": {
   "label": "團體訂單紀錄",
   "def": "團膳、外燴或禮盒訂單的需求與交期",
   "example": "團體訂單表"
  },
  "deliveryLog": {
   "label": "配送紀錄",
   "def": "配送時間、地點與簽收",
   "example": "配送紀錄、簽收單"
  },
  "franchiseContract": {
   "label": "加盟合約",
   "def": "加盟金、權利金、進貨與商圈保障條款",
   "example": "加盟合約"
  },
  "purchaseLog": {
   "label": "叫貨紀錄",
   "def": "向總部或供應商叫貨的品項、數量與金額",
   "example": "叫貨單、叫貨紀錄"
  },
  "auditLog": {
   "label": "稽核紀錄",
   "def": "總部稽核的項目、結果與改善",
   "example": "稽核表、改善紀錄"
  },
  "royalty": {
   "label": "權利金與月報",
   "def": "每月營收回報與權利金計算",
   "example": "月報、權利金計算表"
  },
  "foodLabel": {
   "label": "食品標示與檢驗",
   "def": "成分標示、營養標示與檢驗報告",
   "example": "標示圖檔、檢驗報告"
  },
  "salesReport": {
   "label": "銷售報表",
   "def": "POS 或平台的每日、每月銷售統計",
   "example": "POS 或平台銷售報表"
  },
  "dealerPrice": {
   "label": "經銷價目表",
   "def": "各級經銷的進貨價與數量折扣",
   "example": "經銷價目表"
  },
  "dealerList": {
   "label": "經銷商名單",
   "def": "經銷商的聯絡方式、區域與進貨紀錄",
   "example": "經銷商名單"
  },
  "agencyContract": {
   "label": "代理合約",
   "def": "代理區域、期限、業績門檻與價格條款",
   "example": "代理合約"
  },
  "stockFlow": {
   "label": "進出貨紀錄",
   "def": "進口、進貨與出貨數量的往來紀錄",
   "example": "進出貨紀錄"
  },
  "liveOrders": {
   "label": "喊單紀錄",
   "def": "直播中登記的買家、品項與數量",
   "example": "喊單表、留言截圖"
  },
  "diagnosis": {
   "label": "診斷或訪談紀錄",
   "def": "初談、需求診斷與訪談內容",
   "example": "訪談紀錄、診斷報告"
  },
  "projReport": {
   "label": "期中與結案報告",
   "def": "執行成果、建議與後續規劃",
   "example": "期中或結案報告"
  },
  "intakeForm": {
   "label": "諮詢單",
   "def": "諮詢前填寫的背景資料與問題",
   "example": "諮詢單表單、填寫範例"
  },
  "summary": {
   "label": "諮詢建議摘要",
   "def": "每次諮詢後提供的重點與建議",
   "example": "諮詢建議摘要"
  },
  "clientMeeting": {
   "label": "客戶會議紀錄",
   "def": "與客戶的會議內容與決議",
   "example": "會議紀錄"
  },
  "vendorList": {
   "label": "廠商名單",
   "def": "合作廠商的服務、報價與聯絡方式",
   "example": "廠商名單、報價比較"
  },
  "budget": {
   "label": "預算表",
   "def": "活動或專案的預算與實際支出",
   "example": "預算表、支出明細"
  },
  "rundown": {
   "label": "活動流程表",
   "def": "活動當天的時程、人員與分工",
   "example": "活動流程表、分工表"
  },
  "timesheet": {
   "label": "工時紀錄",
   "def": "每件案件的處理時數與請款依據",
   "example": "工時紀錄表"
  },
  "prospects": {
   "label": "名單開發表",
   "def": "潛在客戶來源、約訪與進度",
   "example": "名單開發表、約訪紀錄"
  },
  "needs": {
   "label": "需求分析表",
   "def": "家庭結構、既有保障與不足之處的分析",
   "example": "需求分析表"
  },
  "proposalTpl": {
   "label": "建議書範本",
   "def": "規劃建議書與試算",
   "example": "建議書範本、試算表"
  },
  "policyTable": {
   "label": "客戶保單整理表",
   "def": "客戶既有保單的險種、保額與繳費",
   "example": "保單整理表"
  },
  "paymentReminder": {
   "label": "繳費與重要日期表",
   "def": "續期繳費日、生日與保單週年日",
   "example": "繳費與重要日期表"
  },
  "claims": {
   "label": "理賠紀錄",
   "def": "理賠申請、文件與結果",
   "example": "理賠紀錄、申請文件清單"
  },
  "serviceLog": {
   "label": "客戶服務紀錄",
   "def": "契約變更、保單檢視與服務往來",
   "example": "服務紀錄表"
  },
  "recruitList": {
   "label": "增員名單",
   "def": "增員對象、面談與考照進度",
   "example": "增員名單、面談紀錄"
  },
  "orgPerf": {
   "label": "組織業績表",
   "def": "成員業績、達成率與晉升進度",
   "example": "組織業績表"
  },
  "allowance": {
   "label": "津貼與獎金辦法",
   "def": "組織津貼、育成獎金的計算規則",
   "example": "津貼與獎金辦法"
  },
  "kyc": {
   "label": "風險屬性評估",
   "def": "客戶投資風險屬性問卷與結果",
   "example": "風險屬性問卷範本"
  },
  "allocation": {
   "label": "資產配置報告",
   "def": "提供給客戶的配置建議與檢視報告",
   "example": "資產配置報告範本"
  },
  "tierList": {
   "label": "客戶分級名單",
   "def": "依資產或往來程度分級的客戶名單",
   "example": "客戶分級名單"
  },
  "compliance": {
   "label": "合規規範",
   "def": "主管機關與公司的銷售、錄音與文件規定",
   "example": "合規規範、錄音與文件規定"
  },
  "listings": {
   "label": "物件清單",
   "def": "委託物件的資料、照片與狀態",
   "example": "物件清單、物件照片"
  },
  "mandate": {
   "label": "委託書",
   "def": "銷售或租賃的委託契約",
   "example": "委託書範本"
  },
  "viewingLog": {
   "label": "帶看紀錄",
   "def": "帶看時間、客人反應與後續",
   "example": "帶看紀錄表"
  },
  "buyerList": {
   "label": "買方名單",
   "def": "買方需求、預算與聯絡方式",
   "example": "買方名單"
  },
  "dealLog": {
   "label": "成交紀錄",
   "def": "成交價格、服務費與交屋進度",
   "example": "成交紀錄表"
  },
  "siteScript": {
   "label": "案場銷講",
   "def": "建案介紹、銷講與常見問答",
   "example": "案場銷講稿、常見問答"
  },
  "priceTable": {
   "label": "價目表與付款辦法",
   "def": "各戶別價格、付款期程與優惠",
   "example": "價目表、付款辦法"
  },
  "visitorLog": {
   "label": "來人登記表",
   "def": "來案場客人的資料、需求與回籠紀錄",
   "example": "來人登記表"
  },
  "changeLog": {
   "label": "成交與客變紀錄",
   "def": "訂簽、對保與客戶變更紀錄",
   "example": "成交與客變紀錄"
  },
  "leaseTpl": {
   "label": "租約範本",
   "def": "租賃契約與附約",
   "example": "租約範本"
  },
  "handoverList": {
   "label": "點交清單",
   "def": "屋況、設備與鑰匙的點交紀錄",
   "example": "點交清單"
  },
  "rentLedger": {
   "label": "收租表",
   "def": "每月租金、押金與繳款狀態",
   "example": "收租表"
  },
  "repairLog": {
   "label": "修繕紀錄",
   "def": "報修、處理與費用",
   "example": "修繕紀錄"
  },
  "carSpec": {
   "label": "車款規格與價目",
   "def": "車型、配備與牌價",
   "example": "車款規格表、牌價表"
  },
  "testDrive": {
   "label": "試乘紀錄",
   "def": "試乘時間、車型與客人回饋",
   "example": "試乘紀錄"
  },
  "pdi": {
   "label": "交車檢查表",
   "def": "交車前檢查與點交項目",
   "example": "交車檢查表"
  },
  "partnerPlans": {
   "label": "貸款與保險方案表",
   "def": "合作銀行、融資與保險方案比較",
   "example": "貸款與保險方案比較表"
  },
  "productManual": {
   "label": "產品手冊",
   "def": "產品成分、功效與使用方式",
   "example": "產品手冊、成分說明"
  },
  "bonusPlan": {
   "label": "獎金制度",
   "def": "獎金、晉升與資格維持的規定",
   "example": "獎金制度文件"
  },
  "orgChart": {
   "label": "組織圖",
   "def": "推薦與安置關係的組織架構",
   "example": "組織圖、後台截圖"
  },
  "partnerList": {
   "label": "夥伴名單",
   "def": "夥伴的加入日期、等級與聯絡方式",
   "example": "夥伴名單"
  },
  "autoshipList": {
   "label": "定期購名單",
   "def": "定期購顧客、品項與扣款日",
   "example": "定期購名單"
  },
  "dealerContract": {
   "label": "經銷合約",
   "def": "經銷等級、進貨門檻與區域條款",
   "example": "經銷合約"
  },
  "purchasePrice": {
   "label": "進貨價表",
   "def": "各等級的進貨價與折扣",
   "example": "進貨價表"
  },
  "downlineOrders": {
   "label": "下線叫貨紀錄",
   "def": "下線的叫貨、出貨與收款",
   "example": "下線叫貨紀錄"
  },
  "season": {
   "label": "年度賽程表",
   "def": "全年賽事、報名截止與目標賽事",
   "example": "年度賽程表"
  },
  "teamContract": {
   "label": "隊伍或團體合約",
   "def": "隊薪、出賽或演出的權利義務條款",
   "example": "隊伍或團體合約"
  },
  "trainingReport": {
   "label": "訓練回報表",
   "def": "提供給教練或隊伍的訓練回報",
   "example": "訓練回報表"
  },
  "sponsorPitch": {
   "label": "贊助提案",
   "def": "提供給贊助商的提案與合作方案",
   "example": "贊助提案簡報"
  },
  "gigQuote": {
   "label": "演出報價表",
   "def": "各類演出的價格與條件",
   "example": "演出報價表"
  },
  "techRider": {
   "label": "技術需求表",
   "def": "演出所需的音響、燈光與場地需求",
   "example": "技術需求表"
  },
  "grantPlan": {
   "label": "補助計畫書",
   "def": "補助申請的計畫內容與預算",
   "example": "補助計畫書"
  },
  "reimburse": {
   "label": "核銷資料",
   "def": "補助執行的單據與成果報告",
   "example": "核銷單據、成果報告"
  }
 },
 "industries": [
  {
   "id": "beauty",
   "label": "美業",
   "covers": "美甲美睫、美容護膚、髮型、紋繡、醫美諮詢、寵物美容",
   "tools": [
    "LINE 官方帳號",
    "線上預約系統",
    "POS 收銀",
    "IG／Threads",
    "Google 日曆",
    "紙本或試算表客戶卡"
   ],
   "pain": "預約改期與爽約、儲值扣點靠紙本、技術好不等於會帶人、客人回流與殺價",
   "checklistLabels": {
    "catalog": "服務項目表",
    "pricing": "價目表",
    "serviceSop": "術前須知與術後衛教",
    "clientList": "客戶名單（含過敏禁忌）",
    "purchases": "消費與療程紀錄"
   },
   "incomes": [
    {
     "id": "service",
     "label": "單次服務",
     "desc": "每次到店或到府施作收費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "被發現",
      "詢問與報價",
      "預約與訂金",
      "服務前確認",
      "現場諮詢與施作",
      "結帳",
      "術後衛教",
      "回訪提醒",
      "回購轉介"
     ],
     "items": [
      "depositRule",
      "workPhotos"
     ]
    },
    {
     "id": "package",
     "label": "儲值與療程卡",
     "desc": "預收儲值金或療程堂數後逐次扣點",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "方案介紹",
      "體驗或試做",
      "成交與簽約",
      "收款或分期",
      "建檔與扣點",
      "定期施作",
      "餘額提醒",
      "續購"
     ],
     "items": [
      "pkgPlan",
      "pkgContract",
      "pkgLedger"
     ]
    },
    {
     "id": "retail",
     "label": "保養品與商品",
     "desc": "居家保養品、美甲美睫用品或髮品零售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品進貨",
      "服務中推薦",
      "試用",
      "成交",
      "庫存扣帳",
      "使用追蹤",
      "補貨回購"
     ],
     "items": [
      "productList",
      "inventory",
      "orders",
      "supplierContract"
     ]
    },
    {
     "id": "teach",
     "label": "技術教學課程",
     "desc": "美甲、美睫、紋繡等技術教學與認證",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招生公告",
      "諮詢與報名",
      "收費與合約",
      "課前準備",
      "上課實作",
      "作業回饋",
      "結業與證書",
      "結業後追蹤"
     ],
     "items": [
      "courseOutline",
      "teachMaterial",
      "studentList",
      "certTemplate"
     ]
    },
    {
     "id": "medical",
     "label": "醫美療程諮詢",
     "desc": "診所諮詢師依成交療程計業績獎金",
     "kind": "serve",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "名單分配與邀約",
      "到診諮詢",
      "醫師評估",
      "方案報價",
      "成交與同意書",
      "療程安排",
      "術後追蹤",
      "回診與加購"
     ],
     "items": [
      "leadList",
      "consentForm",
      "followUp",
      "commission"
     ]
    },
    {
     "id": "employ",
     "label": "受僱底薪與抽成",
     "desc": "店內受僱，依服務或指定數抽成",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "排班",
      "接客與指定",
      "施作",
      "結帳登錄業績",
      "抽成核對",
      "店內會議"
     ],
     "items": [
      "commission"
     ]
    }
   ]
  },
  {
   "id": "edu",
   "label": "教育",
   "covers": "補教、家教、才藝、企業內訓、線上課程",
   "tools": [
    "補教管理系統",
    "LINE 群組與官方帳號",
    "Google Classroom",
    "Google 表單",
    "視訊會議",
    "線上課程平台",
    "試算表排課"
   ],
   "pain": "詢問漏接、排課衝堂、點名與家長通知靠人工、收費對帳與催繳、溝通綁在個人 LINE",
   "checklistLabels": {
    "catalog": "課程表",
    "pricing": "學費方案",
    "serviceSop": "教案與上課流程",
    "clientList": "學生與家長名單",
    "purchases": "繳費與出缺席紀錄"
   },
   "incomes": [
    {
     "id": "class",
     "label": "班課學費",
     "desc": "補習班、才藝班的期別學費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招生宣傳",
      "諮詢與試聽",
      "報名繳費",
      "分班排課",
      "上課與點名",
      "作業與成績",
      "家長溝通",
      "續班"
     ],
     "items": [
      "brochure",
      "tuition",
      "attendance",
      "grades"
     ]
    },
    {
     "id": "tutor",
     "label": "家教與一對一",
     "desc": "依鐘點或堂數收費的個別教學",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "媒合或介紹",
      "試教",
      "談定時段與鐘點",
      "備課",
      "上課",
      "進度回報",
      "收費",
      "續約"
     ],
     "items": [
      "lessonPlan",
      "lessonLog",
      "hourlyRate"
     ]
    },
    {
     "id": "corporate",
     "label": "企業內訓與講座",
     "desc": "企業、學校、公部門邀課的講師費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "邀約或提案",
      "需求訪談",
      "報價與合約",
      "課程設計",
      "授課",
      "課後問卷",
      "請款與發票",
      "結案報告"
     ],
     "items": [
      "trainerProfile",
      "proposal",
      "quote",
      "survey"
     ]
    },
    {
     "id": "online",
     "label": "線上課程",
     "desc": "募資、預購或平台上架的錄播課程",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選題與市調",
      "預購或募資",
      "腳本與錄製",
      "剪輯上架",
      "銷售推廣",
      "學員問答",
      "課程更新"
     ],
     "items": [
      "courseOutline",
      "courseVideo",
      "studentList",
      "platformReport",
      "salesPage"
     ]
    },
    {
     "id": "employ",
     "label": "受僱授課鐘點",
     "desc": "補習班或學校受僱，依鐘點或底薪計酬",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "排課",
      "備課",
      "授課與點名",
      "學生狀況回報",
      "鐘點核對",
      "教學會議"
     ],
     "items": [
      "timetable",
      "teachMaterial"
     ]
    },
    {
     "id": "material",
     "label": "教材與教具",
     "desc": "自編教材、講義或教具銷售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "開發",
      "製作",
      "定價",
      "銷售",
      "出貨",
      "改版"
     ],
     "items": [
      "materialList",
      "orders"
     ]
    }
   ],
   "dedupe": {
    "tuition": "pricing",
    "hourlyRate": "pricing",
    "timetable": "catalog",
    "attendance": "purchases"
   }
  },
  {
   "id": "design",
   "label": "設計",
   "covers": "平面與品牌設計、室內設計、攝影、影像剪輯、插畫",
   "tools": [
    "Adobe 系列",
    "Figma",
    "Canva",
    "Google 雲端硬碟",
    "LINE",
    "Behance／IG 作品集",
    "試算表報價"
   ],
   "pain": "修改次數無上限、訂金尾款拖延、需求口頭變更、作品授權範圍不清",
   "checklistLabels": {
    "catalog": "服務方案與作品集",
    "pricing": "報價單範本",
    "serviceSop": "需求單與交付清單",
    "clientList": "客戶名單",
    "purchases": "專案紀錄"
   },
   "incomes": [
    {
     "id": "project",
     "label": "專案接案",
     "desc": "依案報價的設計委託",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "詢問",
      "需求訪談",
      "報價與合約",
      "收訂金",
      "提案初稿",
      "修改",
      "定稿交付",
      "收尾款",
      "回購轉介"
     ],
     "items": [
      "quote",
      "collabContract",
      "requirement",
      "deliveryList"
     ]
    },
    {
     "id": "retainer",
     "label": "月費長期合作",
     "desc": "社群代操、品牌顧問等按月計費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "提案",
      "簽約",
      "每月排程",
      "製作",
      "審稿",
      "上線",
      "月報",
      "續約"
     ],
     "items": [
      "monthlyPlan",
      "workSchedule",
      "monthlyReport"
     ]
    },
    {
     "id": "shoot",
     "label": "拍攝案",
     "desc": "婚攝、商品、形象等拍攝委託",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "詢價與檔期",
      "報價與訂金",
      "拍攝企劃",
      "拍攝",
      "選片",
      "後製修圖",
      "交件",
      "收尾款"
     ],
     "items": [
      "quote",
      "collabContract",
      "shootPlan",
      "deliveryList"
     ]
    },
    {
     "id": "product",
     "label": "設計商品與素材",
     "desc": "字型、模板、插畫周邊等販售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "設計",
      "打樣",
      "上架",
      "銷售",
      "出貨或下載",
      "售後"
     ],
     "items": [
      "productList",
      "orders",
      "license"
     ]
    },
    {
     "id": "teach",
     "label": "設計教學",
     "desc": "設計、攝影、剪輯教學課程",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招生公告",
      "諮詢與報名",
      "課前準備",
      "上課實作",
      "作業回饋",
      "結業與證書"
     ],
     "items": [
      "courseOutline",
      "courseVideo",
      "studentList"
     ]
    },
    {
     "id": "employ",
     "label": "受僱設計",
     "desc": "公司或工作室受僱設計",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "接收需求單",
      "排程",
      "設計",
      "主管審稿",
      "修改",
      "交付歸檔"
     ],
     "items": [
      "requirement",
      "designGuide",
      "workSchedule"
     ]
    }
   ],
   "dedupe": {
    "quote": "pricing",
    "requirement": "serviceSop",
    "deliveryList": "serviceSop"
   }
  },
  {
   "id": "tech",
   "label": "工程技術",
   "covers": "網站與軟體工程（接案、受僱）、維修、施工與安裝",
   "tools": [
    "GitHub",
    "Trello／Jira",
    "Notion",
    "Slack／LINE",
    "試算表排程",
    "紙本勘查表"
   ],
   "pain": "需求變更與驗收爭議、維護範圍不清、工時估算失準、施工紀錄與保固分散",
   "checklistLabels": {
    "catalog": "服務方案與案例",
    "pricing": "報價單範本",
    "serviceSop": "需求規格與驗收文件",
    "clientList": "客戶名單",
    "purchases": "專案與維護紀錄"
   },
   "incomes": [
    {
     "id": "dev",
     "label": "接案開發",
     "desc": "網站、系統、App 的委託開發",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "需求訪談",
      "規格書",
      "報價與合約",
      "收訂金",
      "開發與里程碑",
      "測試",
      "驗收",
      "上線與尾款",
      "維護"
     ],
     "items": [
      "quote",
      "collabContract",
      "spec",
      "acceptance"
     ]
    },
    {
     "id": "maint",
     "label": "維護與主機月費",
     "desc": "網站維護、主機代管的月費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "簽約",
      "主機與網域建置",
      "定期更新備份",
      "問題回報",
      "修復",
      "月報與請款",
      "續約"
     ],
     "items": [
      "maintContract",
      "assets",
      "ticketLog",
      "invoice"
     ]
    },
    {
     "id": "saas",
     "label": "自有產品訂閱",
     "desc": "自有軟體、外掛或模板的訂閱收入",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "需求驗證",
      "開發",
      "上線",
      "推廣",
      "訂閱收款",
      "客服",
      "改版"
     ],
     "items": [
      "productSpec",
      "userList",
      "platformReport",
      "supportLog"
     ]
    },
    {
     "id": "install",
     "label": "施工與安裝",
     "desc": "水電、裝修、設備安裝等現場工程",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "現場勘查",
      "估價",
      "簽約與訂金",
      "備料派工",
      "施工",
      "驗收",
      "尾款與保固"
     ],
     "items": [
      "estimate",
      "sitePhotos",
      "warranty"
     ]
    },
    {
     "id": "employ",
     "label": "受僱薪資",
     "desc": "公司內部工程師或主管",
     "kind": "employ",
     "quizHint": {
      "report": "yes",
      "serve": "no"
     },
     "flow": [
      "接收需求",
      "估時排程",
      "開發",
      "程式碼審查",
      "測試上線",
      "回報與考核"
     ],
     "items": [
      "devRules",
      "workSchedule",
      "perfReview"
     ]
    }
   ],
   "dedupe": {
    "quote": "pricing",
    "spec": "serviceSop",
    "acceptance": "serviceSop"
   }
  },
  {
   "id": "mfg",
   "label": "製造",
   "covers": "代工生產、自有產品製造、工廠受僱",
   "tools": [
    "ERP",
    "生產排程表",
    "LINE",
    "試算表進銷存",
    "品檢表"
   ],
   "pain": "生產排程與品檢紀錄分散、打樣與改版來回、出貨與請款對帳、廠內交接靠口頭",
   "checklistLabels": {
    "catalog": "產品型錄",
    "pricing": "報價單",
    "serviceSop": "生產與出貨流程",
    "clientList": "客戶名單",
    "purchases": "訂單與出貨紀錄"
   },
   "incomes": [
    {
     "id": "oem",
     "label": "代工生產",
     "desc": "依客戶規格生產的 OEM／ODM 訂單",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "詢價",
      "報價與打樣",
      "簽約下單",
      "備料",
      "排程生產",
      "品檢",
      "出貨",
      "請款"
     ],
     "items": [
      "productSpec",
      "quote",
      "workOrder",
      "qc",
      "shipDoc"
     ]
    },
    {
     "id": "ownproduct",
     "label": "自有產品銷售",
     "desc": "自有品牌產品的生產與銷售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "產品企劃",
      "打樣",
      "量產",
      "上架或鋪貨",
      "接單",
      "出貨",
      "售後",
      "改版"
     ],
     "items": [
      "productSpec",
      "productList",
      "orders",
      "inventory"
     ]
    },
    {
     "id": "employ",
     "label": "受僱薪資",
     "desc": "工廠或公司內部受僱",
     "kind": "employ",
     "quizHint": {
      "report": "yes",
      "serve": "no"
     },
     "flow": [
      "接收工單",
      "備料",
      "生產或作業",
      "品檢",
      "回報",
      "考核"
     ],
     "items": [
      "workOrder",
      "qc",
      "perfReview"
     ]
    }
   ],
   "dedupe": {
    "quote": "pricing",
    "productList": "catalog",
    "orders": "purchases"
   }
  },
  {
   "id": "health",
   "label": "健康照護",
   "covers": "健身教練、瑜伽、營養師、護理與照護、按摩整復",
   "tools": [
    "LINE 官方帳號",
    "預約或課表系統",
    "Google 表單",
    "體組成量測紀錄",
    "試算表堂數表",
    "線上課程平台"
   ],
   "pain": "堂數與有效期限靠人工記、收入綁鐘點與體力、學員評估與檢測紀錄分散、館內抽成與自招學員分不清",
   "checklistLabels": {
    "catalog": "課程或療程項目",
    "pricing": "價目與堂數方案",
    "serviceSop": "評估表與注意事項",
    "clientList": "學員名單（含健康狀況）",
    "purchases": "上課或療程紀錄"
   },
   "incomes": [
    {
     "id": "private",
     "label": "一對一課程",
     "desc": "私人教練、私人瑜伽、整復等堂數制",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "體驗課",
      "評估與目標",
      "方案成交",
      "排課",
      "上課紀錄",
      "定期檢測",
      "續購堂數"
     ],
     "items": [
      "ptPlan",
      "parq",
      "sessionLog",
      "measure"
     ]
    },
    {
     "id": "group",
     "label": "團體課與工作坊",
     "desc": "團課、小班、工作坊報名費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "排課公告",
      "報名繳費",
      "課前提醒",
      "上課",
      "簽到",
      "課後回饋",
      "回流"
     ],
     "items": [
      "groupTimetable",
      "signIn"
     ]
    },
    {
     "id": "gym",
     "label": "館內教練抽成",
     "desc": "健身房或教室受僱，課程與館方拆帳",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "館方分派或自招",
      "上課",
      "登錄堂數",
      "業績與抽成核對",
      "會員續約",
      "館內考核"
     ],
     "items": [
      "commission",
      "sessionLog"
     ]
    },
    {
     "id": "nutrition",
     "label": "營養諮詢方案",
     "desc": "飲食規劃與追蹤的諮詢方案",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "初談",
      "飲食紀錄收集",
      "評估",
      "飲食計畫",
      "追蹤回報",
      "調整",
      "結案或續約"
     ],
     "items": [
      "assessForm",
      "dietLog",
      "trackSheet"
     ]
    },
    {
     "id": "online",
     "label": "線上課程與訂閱",
     "desc": "錄播課、線上陪跑或訂閱會員",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選題與市調",
      "預購或募資",
      "剪輯上架",
      "銷售推廣",
      "學員問答",
      "課程更新"
     ],
     "items": [
      "courseVideo",
      "subPlan",
      "studentList"
     ]
    },
    {
     "id": "care",
     "label": "照護與醫療受僱",
     "desc": "醫院、診所、機構的護理與照護",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "接班",
      "評估",
      "執行照護",
      "紀錄",
      "衛教",
      "交班與異常回報"
     ],
     "items": [
      "careRecord",
      "handover",
      "eduSheet"
     ]
    },
    {
     "id": "products",
     "label": "保健品與器材",
     "desc": "保健食品、運動器材銷售或經銷",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品",
      "推薦",
      "試用",
      "成交",
      "出貨",
      "使用追蹤",
      "回購"
     ],
     "items": [
      "productList",
      "orders",
      "inventory"
     ]
    }
   ],
   "dedupe": {
    "ptPlan": "pricing",
    "parq": "serviceSop",
    "assessForm": "serviceSop",
    "sessionLog": "purchases"
   }
  },
  {
   "id": "food",
   "label": "餐飲",
   "covers": "餐廳、咖啡甜點、手搖飲、加盟店、包裝食品",
   "tools": [
    "POS 點餐系統",
    "線上訂位",
    "外送平台後台",
    "LINE 官方帳號",
    "Google 商家評論",
    "試算表進銷存"
   ],
   "pain": "叫貨與庫存靠經驗、外送平台抽成對帳、排班與人力流動、總部稽核與權利金計算",
   "checklistLabels": {
    "catalog": "菜單",
    "pricing": "價目與套餐方案",
    "serviceSop": "備料與出餐 SOP",
    "clientList": "會員名單",
    "purchases": "消費紀錄與評論"
   },
   "incomes": [
    {
     "id": "dinein",
     "label": "內用營業",
     "desc": "店內用餐與外帶",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "訂位或候位",
      "帶位點餐",
      "備料",
      "出餐",
      "結帳",
      "收桌",
      "評論回覆",
      "會員回訪"
     ],
     "items": [
      "dailyReport"
     ]
    },
    {
     "id": "delivery",
     "label": "外送與外帶",
     "desc": "外送平台與電話、LINE 預訂外帶",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "平台上架",
      "接單",
      "備餐",
      "包裝",
      "交付外送員",
      "對帳",
      "評價處理"
     ],
     "items": [
      "deliveryReport",
      "packSpec"
     ]
    },
    {
     "id": "catering",
     "label": "團體訂製",
     "desc": "外燴、團膳、彌月或節慶禮盒",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "詢價",
      "菜單規劃",
      "報價與訂金",
      "備料",
      "製作",
      "配送",
      "收尾款"
     ],
     "items": [
      "groupOrder",
      "quote",
      "deliveryLog"
     ]
    },
    {
     "id": "franchise",
     "label": "加盟店經營",
     "desc": "加盟品牌門市，向總部進貨並繳權利金",
     "kind": "serve",
     "quizHint": {
      "report": "yes",
      "superior": "hq"
     },
     "flow": [
      "總部叫貨",
      "收貨驗收",
      "備料",
      "營業",
      "日結",
      "總部稽核",
      "月報與權利金"
     ],
     "items": [
      "franchiseContract",
      "purchaseLog",
      "auditLog",
      "royalty"
     ]
    },
    {
     "id": "packaged",
     "label": "包裝食品網購",
     "desc": "常溫或冷凍食品的網路販售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "研發",
      "包裝與標示",
      "上架",
      "接單",
      "出貨",
      "售後"
     ],
     "items": [
      "productList",
      "foodLabel",
      "orders",
      "shipping"
     ]
    },
    {
     "id": "employ",
     "label": "受僱內外場",
     "desc": "餐廳受僱人員",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "開店準備",
      "接待或備料",
      "出餐服務",
      "結帳交接",
      "收店清潔",
      "交班回報"
     ],
     "items": [
      "handover"
     ]
    }
   ]
  },
  {
   "id": "retail",
   "label": "零售電商",
   "covers": "門市、網路商店、蝦皮賣家、團購主、品牌代理",
   "tools": [
    "蝦皮賣家中心",
    "開店平台（SHOPLINE、91APP 等）",
    "LINE 社群與官方帳號",
    "超商與宅配物流",
    "金流服務",
    "試算表進銷存"
   ],
   "pain": "多平台訂單與庫存不同步、出貨與退換貨耗時、團購對帳分潤、經銷帳款追蹤",
   "checklistLabels": {
    "catalog": "商品型錄",
    "pricing": "價目表與優惠方案",
    "serviceSop": "出貨與售後流程",
    "clientList": "會員名單",
    "purchases": "訂單紀錄"
   },
   "incomes": [
    {
     "id": "store",
     "label": "門市銷售",
     "desc": "實體店面零售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "進貨",
      "陳列",
      "接待介紹",
      "試用",
      "結帳",
      "包裝",
      "售後",
      "會員回購"
     ],
     "items": [
      "productList",
      "inventory",
      "salesReport"
     ]
    },
    {
     "id": "online",
     "label": "網路商店",
     "desc": "官網、蝦皮等平台販售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品進貨",
      "商品上架",
      "廣告與貼文",
      "接單",
      "撿貨包裝",
      "出貨物流",
      "退換貨",
      "對帳"
     ],
     "items": [
      "productList",
      "inventory",
      "orders",
      "shipping",
      "salesReport"
     ]
    },
    {
     "id": "groupbuy",
     "label": "團購開團",
     "desc": "向廠商取得團購價，向粉絲或社群開團",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品與洽談",
      "試用",
      "開團貼文",
      "收單",
      "結單",
      "出貨或分貨",
      "對帳分潤",
      "售後"
     ],
     "items": [
      "supplierContract",
      "orders",
      "profitShare",
      "productList",
      "shipping"
     ]
    },
    {
     "id": "agency",
     "label": "品牌代理批發",
     "desc": "取得品牌代理權並供貨給經銷或門市",
     "kind": "serve",
     "quizHint": {
      "report": "yes",
      "superior": "hq"
     },
     "flow": [
      "品牌洽談",
      "代理合約",
      "進口或進貨",
      "開發通路",
      "經銷下單",
      "出貨",
      "帳款",
      "經銷教育訓練"
     ],
     "items": [
      "agencyContract",
      "dealerPrice",
      "dealerList",
      "stockFlow"
     ]
    },
    {
     "id": "live",
     "label": "直播銷售",
     "desc": "直播中介紹商品並喊單成交",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品",
      "開播預告",
      "直播",
      "喊單登記",
      "結單",
      "出貨",
      "對帳"
     ],
     "items": [
      "liveSchedule",
      "liveOrders",
      "orders"
     ]
    },
    {
     "id": "employ",
     "label": "門市受僱",
     "desc": "門市或專櫃受僱人員",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "開店",
      "接待",
      "銷售",
      "結帳登錄",
      "盤點",
      "交班",
      "業績回報"
     ],
     "items": [
      "handover",
      "commission"
     ]
    }
   ],
   "dedupe": {
    "productList": "catalog",
    "orders": "purchases"
   }
  },
  {
   "id": "consult",
   "label": "顧問諮詢",
   "covers": "管理顧問、婚禮顧問、活動企劃、事務所（律師、會計師、代書）",
   "tools": [
    "Google 日曆",
    "線上預約",
    "Notion",
    "試算表",
    "LINE",
    "會計或記帳軟體"
   ],
   "pain": "範圍蔓延與追加需求、工時難以計價、廠商協調靠群組、結案報告格式不一",
   "checklistLabels": {
    "catalog": "服務方案",
    "pricing": "報價單與提案範本",
    "serviceSop": "時程表與廠商協調紀錄",
    "clientList": "客戶名單",
    "purchases": "案件紀錄"
   },
   "incomes": [
    {
     "id": "project",
     "label": "專案顧問",
     "desc": "依專案範圍報價的顧問服務",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "初談",
      "需求診斷",
      "提案報價",
      "簽約與訂金",
      "資料收集",
      "執行與會議",
      "期中報告",
      "結案報告",
      "尾款"
     ],
     "items": [
      "diagnosis",
      "quote",
      "collabContract",
      "projReport"
     ]
    },
    {
     "id": "session",
     "label": "單次諮詢",
     "desc": "依次或依時數收費的諮詢",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "預約",
      "填寫諮詢單",
      "收費",
      "諮詢",
      "建議摘要",
      "追蹤",
      "轉為方案"
     ],
     "items": [
      "intakeForm",
      "summary"
     ]
    },
    {
     "id": "retainer",
     "label": "顧問月費",
     "desc": "長期顧問、常年法律或記帳委任",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "簽約",
      "月度會議",
      "任務執行",
      "月報",
      "請款",
      "續約"
     ],
     "items": [
      "collabContract",
      "clientMeeting",
      "monthlyReport"
     ]
    },
    {
     "id": "event",
     "label": "活動與婚禮籌辦",
     "desc": "婚禮、活動、展覽的企劃執行",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "諮詢",
      "報價與簽約",
      "企劃與預算",
      "廠商發包",
      "彩排",
      "活動執行",
      "結算",
      "回饋"
     ],
     "items": [
      "vendorList",
      "budget",
      "rundown"
     ]
    },
    {
     "id": "course",
     "label": "課程與講座",
     "desc": "專業主題課程或講座",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招生公告",
      "諮詢與報名",
      "課前準備",
      "上課實作",
      "作業回饋",
      "結案與回饋"
     ],
     "items": [
      "courseOutline",
      "trainerProfile",
      "studentList"
     ]
    },
    {
     "id": "employ",
     "label": "事務所受僱",
     "desc": "事務所或公司內部受僱",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "收案",
      "分案",
      "處理",
      "主管覆核",
      "交付客戶",
      "工時與請款"
     ],
     "items": [
      "timesheet"
     ]
    }
   ],
   "dedupe": {
    "quote": "pricing"
   }
  },
  {
   "id": "finance",
   "label": "金融保險",
   "covers": "保險業務、保險經紀、理財顧問、銀行理專",
   "tools": [
    "公司行動投保系統",
    "保單健診或試算工具",
    "公司 CRM",
    "LINE",
    "試算表保單整理",
    "日曆提醒"
   ],
   "pain": "名單與約訪靠記憶、保單整理與繳費提醒人工、續期服務與理賠耗時、增員帶組與合規文件繁瑣",
   "checklistLabels": {
    "catalog": "商品 DM",
    "pricing": "費率表與建議書範本",
    "serviceSop": "需求分析表與交付清單",
    "clientList": "客戶名單",
    "purchases": "保單整理表或商品紀錄"
   },
   "incomes": [
    {
     "id": "newbiz",
     "label": "新契約佣金",
     "desc": "新保單成交的首年佣金",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "名單開發",
      "約訪",
      "需求分析",
      "建議書",
      "締約與投保",
      "核保與照會",
      "保單遞送",
      "轉介紹"
     ],
     "items": [
      "prospects",
      "needs",
      "proposalTpl",
      "policyTable"
     ]
    },
    {
     "id": "renewal",
     "label": "續期與服務",
     "desc": "續期佣金與售後服務",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "保單整理",
      "年度檢視",
      "繳費與生日提醒",
      "理賠協助",
      "契約變更",
      "加保或轉介"
     ],
     "items": [
      "paymentReminder",
      "claims",
      "serviceLog"
     ]
    },
    {
     "id": "recruit",
     "label": "增員與組織津貼",
     "desc": "增員、育成與組織業績津貼",
     "kind": "serve",
     "quizHint": {
      "lead": "yes"
     },
     "flow": [
      "增員名單",
      "說明會",
      "面談",
      "考照",
      "新人訓練",
      "陪同展業",
      "業績追蹤",
      "晉升"
     ],
     "items": [
      "recruitList",
      "orgPerf",
      "allowance"
     ]
    },
    {
     "id": "wealth",
     "label": "理財手續費",
     "desc": "基金、投資型商品的手續費與管理費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "客戶分級",
      "風險屬性評估",
      "資產配置建議",
      "下單與文件",
      "合規覆核",
      "定期檢視",
      "調整"
     ],
     "items": [
      "kyc",
      "allocation",
      "tierList",
      "compliance"
     ]
    },
    {
     "id": "employ",
     "label": "受僱底薪與業績",
     "desc": "銀行或公司受僱，依業績領獎金",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "分派名單",
      "約訪或臨櫃接待",
      "銷售",
      "合規文件",
      "業績登錄",
      "主管檢討"
     ],
     "items": [
      "compliance",
      "commission"
     ]
    }
   ],
   "dedupe": {
    "proposalTpl": "pricing",
    "needs": "serviceSop",
    "policyTable": "purchases"
   }
  },
  {
   "id": "property",
   "label": "不動產",
   "covers": "房仲、代銷、租賃代管",
   "tools": [
    "公司物件系統",
    "房屋刊登平台",
    "LINE",
    "試算表客戶表",
    "實價登錄",
    "電子簽約"
   ],
   "pain": "客戶與物件資料分散、帶看後追蹤不及、服務費與獎金核對、交屋文件多",
   "checklistLabels": {
    "catalog": "物件清單",
    "pricing": "行情表與服務費方案",
    "serviceSop": "帶看與交屋檢查表",
    "clientList": "客戶名單",
    "purchases": "成交紀錄"
   },
   "incomes": [
    {
     "id": "broker",
     "label": "仲介服務費",
     "desc": "房仲買賣成交的服務費業績",
     "kind": "serve",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "開發物件",
      "簽委託",
      "物件建檔與廣告",
      "買方配對",
      "帶看",
      "斡旋議價",
      "簽約",
      "用印完稅",
      "交屋"
     ],
     "items": [
      "listings",
      "mandate",
      "viewingLog",
      "buyerList",
      "dealLog"
     ]
    },
    {
     "id": "presale",
     "label": "代銷案場獎金",
     "desc": "預售或新成屋案場的銷售獎金",
     "kind": "serve",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "案場教育",
      "廣告來人",
      "接待介紹",
      "回籠追蹤",
      "收訂",
      "簽約",
      "對保與客變",
      "交屋"
     ],
     "items": [
      "siteScript",
      "priceTable",
      "visitorLog",
      "changeLog"
     ]
    },
    {
     "id": "rental",
     "label": "租賃代管",
     "desc": "出租媒合與代管服務費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招租",
      "帶看",
      "審核房客",
      "簽約",
      "點交",
      "收租",
      "報修",
      "退租點交"
     ],
     "items": [
      "leaseTpl",
      "handoverList",
      "rentLedger",
      "repairLog"
     ]
    }
   ],
   "dedupe": {
    "listings": "catalog",
    "dealLog": "purchases",
    "buyerList": "clientList"
   }
  },
  {
   "id": "auto",
   "label": "汽車銷售",
   "covers": "新車與中古車業務、周邊貸款保險佣金",
   "tools": [
    "DMS 系統",
    "汽車刊登平台",
    "LINE",
    "試算表客戶表",
    "試乘預約表"
   ],
   "pain": "試乘後追蹤不及、報價與配備版本多、貸款保險送件來回、交車文件多",
   "checklistLabels": {
    "catalog": "車款清單",
    "pricing": "車款價目與方案",
    "serviceSop": "試乘與交車檢查表",
    "clientList": "客戶名單",
    "purchases": "成交紀錄"
   },
   "incomes": [
    {
     "id": "car",
     "label": "汽車銷售獎金",
     "desc": "新車或中古車成交獎金",
     "kind": "serve",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "來店或名單",
      "需求了解",
      "試乘",
      "報價與配備",
      "貸款與保險",
      "簽約下訂",
      "領牌交車",
      "定保提醒與轉介"
     ],
     "items": [
      "carSpec",
      "quote",
      "testDrive",
      "pdi"
     ]
    },
    {
     "id": "addon",
     "label": "周邊佣金",
     "desc": "貸款、保險、配件等附加佣金",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "需求確認",
      "方案介紹",
      "方案比較",
      "送件審核",
      "核准或生效",
      "佣金核對"
     ],
     "items": [
      "partnerPlans",
      "commission"
     ]
    },
    {
     "id": "employ",
     "label": "受僱底薪與業績",
     "desc": "營業所受僱，依成交領業績獎金",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "名單分派或來店接待",
      "需求了解",
      "試乘",
      "報價",
      "成交登錄",
      "業績核對",
      "主管檢討"
     ],
     "items": [
      "commission",
      "salesReport"
     ]
    }
   ],
   "dedupe": {
    "carSpec": "catalog",
    "quote": "pricing",
    "pdi": "serviceSop"
   }
  },
  {
   "id": "media",
   "label": "自媒體",
   "covers": "網紅、直播主、部落客、Podcast、YouTuber",
   "tools": [
    "IG／YouTube／TikTok 後台",
    "Threads",
    "Canva",
    "CapCut",
    "Podcast 託管平台",
    "直播平台",
    "LINE",
    "試算表收入表"
   ],
   "pain": "合作邀約散在私訊、報價與檔期靠記憶、業配與團購對帳、多平台收入難彙整、內容排程與數據檢討沒有固定節奏",
   "checklistLabels": {
    "catalog": "合作方案",
    "pricing": "報價單",
    "serviceSop": "合作執行流程",
    "clientList": "合作品牌名單",
    "purchases": "合作與收入紀錄"
   },
   "incomes": [
    {
     "id": "sponsor",
     "label": "業配合作",
     "desc": "品牌付費委託的內容合作",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "收到邀約",
      "媒體資料卡與報價",
      "確認腳本與檔期",
      "簽約",
      "拍攝製作",
      "品牌審稿",
      "發布",
      "結案報告",
      "請款"
     ],
     "items": [
      "mediaKit",
      "quote",
      "collabContract",
      "brief",
      "caseReport"
     ]
    },
    {
     "id": "groupbuy",
     "label": "團購與代理商品",
     "desc": "向廠商取得團購價或代理權，向粉絲銷售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "選品與洽談",
      "試用",
      "議價與分潤",
      "開團預告",
      "開團",
      "結單",
      "出貨與客服",
      "對帳分潤"
     ],
     "items": [
      "supplierContract",
      "orders",
      "profitShare",
      "productList",
      "shipping"
     ]
    },
    {
     "id": "ownproduct",
     "label": "自有商品",
     "desc": "自創品牌商品的開發與販售",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "商品企劃",
      "找工廠打樣",
      "定價",
      "預購",
      "生產",
      "出貨",
      "售後",
      "回購"
     ],
     "items": [
      "productPlan",
      "factory",
      "costPrice",
      "orders"
     ]
    },
    {
     "id": "course",
     "label": "課程或訂閱",
     "desc": "線上課程、付費社群或訂閱會員",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "主題企劃",
      "預購",
      "錄製",
      "上架",
      "推廣",
      "學員經營",
      "更新與續訂"
     ],
     "items": [
      "courseOutline",
      "courseVideo",
      "studentList",
      "subPlan"
     ]
    },
    {
     "id": "platform",
     "label": "平台分潤與打賞",
     "desc": "廣告分潤、直播斗內、Podcast 廣告與贊助",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "內容企劃",
      "製作",
      "發布或開播",
      "互動與打賞",
      "數據檢視",
      "平台結算",
      "提領與報稅"
     ],
     "items": [
      "platformReport",
      "liveSchedule",
      "platformContract"
     ]
    },
    {
     "id": "ambassador",
     "label": "品牌大使與代言",
     "desc": "長期代言、品牌大使或出席活動",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "洽談",
      "合約與權利範圍",
      "年度排程",
      "出席與拍攝",
      "社群發布",
      "成效回報",
      "續約"
     ],
     "items": [
      "endorseContract",
      "annualPlan",
      "exposure"
     ]
    },
    {
     "id": "affiliate",
     "label": "聯盟導購",
     "desc": "專屬連結或折扣碼的成交佣金",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "申請計畫或折扣碼",
      "選品",
      "內容嵌入連結",
      "發布",
      "成效追蹤",
      "佣金結算"
     ],
     "items": [
      "affLinks",
      "commission"
     ]
    }
   ],
   "hideServe": [
    "catalog",
    "pricing",
    "serviceSop",
    "purchases",
    "contract",
    "reception"
   ],
   "hidePerform": [
    "sponsorship",
    "media",
    "condition"
   ],
   "impliedModules": [
    "perform",
    "brand"
   ]
  },
  {
   "id": "network",
   "label": "直銷經銷",
   "covers": "多層次傳銷、品牌經銷、分潤推薦制度",
   "tools": [
    "公司會員後台",
    "LINE 群組與社群",
    "Google 表單",
    "試算表顧客表",
    "公司 App"
   ],
   "pain": "顧客回購提醒靠人工、組織業績與獎金資格難追、新人啟動與陪跑內容不一、叫貨與帳款零散",
   "checklistLabels": {
    "catalog": "產品手冊",
    "pricing": "價目與優惠方案",
    "serviceSop": "產品使用與售後流程",
    "clientList": "顧客名單",
    "purchases": "顧客訂購紀錄"
   },
   "incomes": [
    {
     "id": "retail",
     "label": "零售價差",
     "desc": "以會員價進貨、建議售價賣給顧客",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "使用分享",
      "試用",
      "下單",
      "交貨",
      "使用追蹤",
      "回購提醒"
     ],
     "items": [
      "productManual",
      "orders"
     ]
    },
    {
     "id": "org",
     "label": "組織獎金",
     "desc": "推薦與組織業績帶來的獎金",
     "kind": "serve",
     "quizHint": {
      "lead": "yes",
      "report": "yes",
      "superior": "upline"
     },
     "flow": [
      "名單整理",
      "邀約說明會",
      "推薦加入",
      "新人啟動",
      "教育訓練",
      "陪跑",
      "業績達成",
      "晉升"
     ],
     "items": [
      "bonusPlan",
      "orgChart",
      "partnerList"
     ]
    },
    {
     "id": "autoship",
     "label": "定期購回購",
     "desc": "顧客或夥伴的定期購與自用回購",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "方案介紹",
      "設定定期購",
      "扣款",
      "出貨",
      "使用追蹤",
      "方案調整"
     ],
     "items": [
      "autoshipList"
     ]
    },
    {
     "id": "dealer",
     "label": "經銷進貨價差",
     "desc": "區域或等級經銷的進貨與出貨",
     "kind": "serve",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "簽經銷合約",
      "進貨",
      "庫存管理",
      "下線叫貨",
      "出貨",
      "收款",
      "達標獎勵"
     ],
     "items": [
      "dealerContract",
      "purchasePrice",
      "inventory",
      "downlineOrders"
     ]
    }
   ],
   "dedupe": {
    "productManual": "catalog",
    "orders": "purchases"
   }
  },
  {
   "id": "perform",
   "label": "運動與表演",
   "covers": "運動選手、舞者、歌手與樂手、演員、主持",
   "tools": [
    "訓練或穿戴裝置 App",
    "Google 日曆",
    "LINE",
    "試算表訓練表",
    "社群後台",
    "經紀或通告群組"
   ],
   "pain": "賽程與通告分散、訓練與身體狀態紀錄斷續、贊助與演出合約條件難比較、收入不穩定",
   "checklistLabels": {
    "catalog": "演出或教學項目",
    "pricing": "報價表",
    "serviceSop": "演出或課程流程",
    "clientList": "合作單位名單",
    "purchases": "合作紀錄"
   },
   "incomes": [
    {
     "id": "prize",
     "label": "比賽獎金",
     "desc": "賽事獎金、排名獎勵",
     "kind": "perform",
     "quizHint": null,
     "flow": [
      "年度賽程規劃",
      "週期訓練",
      "身體管理",
      "報名與交通",
      "參賽",
      "檢討",
      "成績與獎金登錄"
     ],
     "items": [
      "season"
     ]
    },
    {
     "id": "salary",
     "label": "隊伍或團體薪資",
     "desc": "球隊、舞團、樂團的固定薪資",
     "kind": "perform",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "簽約",
      "集訓或排練",
      "出賽或演出",
      "訓練回報",
      "考核",
      "續約"
     ],
     "items": [
      "teamContract",
      "trainingReport"
     ]
    },
    {
     "id": "sponsor",
     "label": "贊助與代言",
     "desc": "器材、品牌贊助或代言",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "提案",
      "洽談",
      "簽約",
      "曝光執行",
      "成效回報",
      "續約"
     ],
     "items": [
      "sponsorPitch",
      "endorseContract",
      "exposure"
     ]
    },
    {
     "id": "gig",
     "label": "演出與通告費",
     "desc": "商演、婚禮、活動、主持通告",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "邀約",
      "檔期與報價",
      "簽約與訂金",
      "排練",
      "彩排",
      "演出",
      "請款",
      "宣傳回顧"
     ],
     "items": [
      "gigQuote",
      "collabContract",
      "techRider"
     ]
    },
    {
     "id": "teach",
     "label": "教學與營隊",
     "desc": "專長教學、營隊、私人課",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "招生",
      "報名繳費",
      "課程規劃",
      "上課",
      "學員回饋",
      "續報"
     ],
     "items": [
      "courseOutline",
      "studentList"
     ]
    },
    {
     "id": "grant",
     "label": "補助與獎助",
     "desc": "政府或基金會補助、獎助金",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "公告查詢",
      "計畫書",
      "申請送件",
      "審查",
      "執行",
      "核銷結案"
     ],
     "items": [
      "grantPlan",
      "reimburse"
     ]
    }
   ],
   "hideServe": [
    "purchases"
   ],
   "impliedModules": [
    "perform"
   ],
   "dedupe": {
    "gigQuote": "pricing"
   }
  },
  {
   "id": "other",
   "label": "其他",
   "covers": "行政助理、物流以外的服務業與上列以外的工作",
   "tools": [
    "LINE",
    "Google 試算表",
    "Google 雲端硬碟",
    "公司內部系統"
   ],
   "pain": "依實際工作於諮詢中補充",
   "checklistLabels": {},
   "incomes": [
    {
     "id": "service",
     "label": "服務收費",
     "desc": "提供服務並向客人收費",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "被發現",
      "詢問",
      "報價",
      "預約或下單",
      "服務前準備",
      "服務交付",
      "收款",
      "售後",
      "回購轉介"
     ],
     "items": []
    },
    {
     "id": "product",
     "label": "商品銷售",
     "desc": "販售商品",
     "kind": "serve",
     "quizHint": null,
     "flow": [
      "進貨",
      "上架或陳列",
      "詢問",
      "下單",
      "出貨或交貨",
      "收款",
      "售後"
     ],
     "items": [
      "productList",
      "orders"
     ]
    },
    {
     "id": "employ",
     "label": "受僱薪資",
     "desc": "受僱於公司或單位",
     "kind": "employ",
     "quizHint": {
      "report": "yes"
     },
     "flow": [
      "接收任務",
      "執行",
      "進度回報",
      "交接",
      "考核",
      "薪資核對"
     ],
     "items": []
    }
   ]
  }
 ],
 "flowTemplates": {
  "teamFlow": {
   "label": "團隊流程",
   "icon": "team",
   "stages": [
    "招募",
    "面試錄用",
    "教育訓練",
    "排班",
    "派工",
    "交接回報",
    "考核",
    "薪資計算"
   ],
   "termReplace": {
    "upline": {
     "員工": "夥伴",
     "招募": "增員",
     "薪資計算": "獎金計算"
    }
   }
  },
  "collabFlow": {
   "label": "協作流程",
   "icon": "handshake",
   "stages": [
    "接收任務",
    "執行",
    "進度回報",
    "交接",
    "考核"
   ],
   "superiorExtra": {
    "hq": [
     "總部稽核"
    ],
    "upline": [
     "業績回報"
    ],
    "coach": [
     "訓練回報"
    ],
    "agent": [
     "通告確認"
    ]
   },
   "headFields": [
    {
     "id": "selfDecide",
     "label": "自行處理",
     "type": "list",
     "placeholder": "例：9 折以內折扣、排班調整"
    },
    {
     "id": "needApproval",
     "label": "需要核准",
     "type": "list",
     "placeholder": "例：退費、合約修改、採購"
    },
    {
     "id": "systems",
     "label": "使用系統",
     "type": "multiselect",
     "options": [
      "POS",
      "CRM",
      "ERP",
      "排班系統",
      "LINE 群組",
      "Google 試算表",
      "紙本"
     ],
     "otherField": "systemsOther"
    }
   ],
   "headGroupLabel": "權限範圍"
  },
  "performFlow": {
   "label": "訓練與表現流程",
   "icon": "trophy",
   "stages": {
    "sport": [
     "訓練規劃",
     "訓練執行",
     "身體管理",
     "賽事",
     "檢討",
     "贊助與曝光"
    ],
    "stage": [
     "練習規劃",
     "排練",
     "身體與嗓音管理",
     "演出",
     "檢討",
     "通告與曝光"
    ],
    "create": [
     "創作規劃",
     "製作",
     "狀態管理",
     "發布",
     "數據檢討",
     "合作與曝光"
    ]
   }
  }
 },
 "legacyRoleMap": {
  "owner": {
   "modules": [
    "serve",
    "lead",
    "brand"
   ]
  },
  "manager": {
   "modules": [
    "serve",
    "lead",
    "report"
   ],
   "superior": "boss"
  },
  "employee": {
   "modules": [
    "serve",
    "report"
   ],
   "superior": "boss"
  },
  "freelancer": {
   "modules": [
    "serve",
    "brand"
   ]
  },
  "reseller": {
   "modules": [
    "serve",
    "brand",
    "report"
   ],
   "superior": "upline",
   "leadIf": "role.hasDownline=yes"
  }
 },
 "legacyCategoryToChecklist": {
  "brand": [
   "identity",
   "portfolio"
  ],
  "reception": [
   "reception"
  ],
  "sales": [
   "catalog",
   "pricing",
   "scripts",
   "contract"
  ],
  "marketing": [
   "marketing"
  ],
  "delivery": [
   "serviceSop"
  ],
  "crm": [
   "clientList",
   "purchases"
  ],
  "rules": [
   "rules"
  ],
  "team": [
   "roles",
   "shifts",
   "payroll",
   "appraisal"
  ],
  "training": [
   "trainingMaterials"
  ],
  "meetings": [
   "meetings"
  ],
  "misc": []
 },
 "checklistGroups": [
  "主要收入",
  "其他收入",
  "客人與服務",
  "品牌",
  "團隊",
  "上級規範",
  "個人表現"
 ],
 /* ------------------------------------------------------------------------------------------------
  * 3.1 作業結構（2026.11.01 確認稿 work-final/front.html）：身分資料 → 經營項目 → 職務內容 → 實際步驟 → 權限規則 → 資源清單 → 放入資料
  * 行業採主計總處「行業統計分類」第 12 次修正 20 大類（A–T）＋常見小類（只當背景，不決定後面區塊）；收入來源為各行各業通用 12 項。
  * 所有 id 為穩定 ASCII；畫面文字（label／desc／example）由前後台直接取用。
  * ---------------------------------------------------------------------------------------------- */
 "v31": {
  "version": "3.1.0",
  "pages": [
   { "id": "intro", "label": "作業說明", "short": "閱讀說明" },
   { "id": "identity", "label": "身分資料", "short": "核對帳號" },
   { "id": "business", "label": "經營項目", "short": "項目與收入" },
   { "id": "duties", "label": "職務內容", "short": "一週工作" },
   { "id": "steps", "label": "實際步驟", "short": "案例步驟" },
   { "id": "authority", "label": "權限規則", "short": "決定方式" },
   { "id": "resources", "label": "資源清單", "short": "點亮已有" },
   { "id": "place", "label": "放入資料", "short": "放入並送出" },
   { "id": "done", "label": "完成畫面", "short": "典藏票" }
  ],
  "industries": [
   { "code": "A", "label": "農、林、漁、牧業", "subs": ["農作物栽培", "畜牧養殖", "水產養殖", "花卉園藝", "休閒農場"] },
   { "code": "B", "label": "礦業及土石採取業", "subs": ["砂石採取", "石材開採", "礦物開採"] },
   { "code": "C", "label": "製造業", "subs": ["食品加工", "保養品與化妝品製造", "服飾與紡織", "電子零組件", "機械設備", "手作與文創商品"] },
   { "code": "D", "label": "電力及燃氣供應業", "subs": ["電力供應", "太陽能與綠能", "燃氣供應"] },
   { "code": "E", "label": "用水供應及污染整治業", "subs": ["用水供應", "污水處理", "廢棄物清運", "資源回收"] },
   { "code": "F", "label": "營建工程業", "subs": ["建築工程", "室內裝修", "水電工程", "土木工程", "冷氣空調工程"] },
   { "code": "G", "label": "批發及零售業", "subs": ["電商", "門市", "代理經銷", "直銷", "汽車銷售", "進出口貿易"] },
   { "code": "H", "label": "運輸及倉儲業", "subs": ["倉儲管理", "報關與貨運承攬", "客運交通", "航空與航運"] },
   { "code": "I", "label": "住宿及餐飲業", "subs": ["餐廳", "咖啡廳與飲料店", "烘焙甜點", "民宿與旅宿", "外燴與餐車"] },
   { "code": "J", "label": "出版及影音等內容傳播業", "subs": ["自媒體與內容創作", "直播", "影音製作", "出版與編輯", "廣播與 Podcast"] },
   { "code": "K", "label": "電信及資訊服務業", "subs": ["網站與軟體工程", "App 開發", "資訊系統顧問", "雲端與資料服務", "電信服務"] },
   { "code": "L", "label": "金融及保險業", "subs": ["保險業務", "理財顧問", "銀行理專", "證券期貨", "融資與貸款"] },
   { "code": "M", "label": "不動產業", "subs": ["房仲", "代銷", "租賃代管", "不動產開發"] },
   { "code": "N", "label": "專業、科學及技術服務業", "subs": ["管理顧問", "會計與記帳", "法律服務", "平面與室內設計", "廣告與行銷", "攝影", "翻譯"] },
   { "code": "O", "label": "支援服務業", "subs": ["旅行社與導遊", "人力仲介", "活動企劃", "清潔服務", "保全", "設備租賃"] },
   { "code": "P", "label": "公共行政及國防；強制性社會安全", "subs": ["公務人員", "軍警消", "社會保險行政"] },
   { "code": "Q", "label": "教育業", "subs": ["補習班與才藝教室", "家教", "學校教師", "語言教學", "線上課程講師", "幼兒教育"] },
   { "code": "R", "label": "醫療保健及社會工作服務業", "subs": ["醫師與護理師", "牙醫", "中醫", "復健與物理治療", "心理諮商", "長期照顧", "醫美診所"] },
   { "code": "S", "label": "藝術、娛樂及休閒服務業", "subs": ["運動選手", "運動教練", "表演者", "藝術創作", "健身場館", "休閒娛樂場館"] },
   { "code": "T", "label": "其他服務業", "subs": ["美容美髮", "美甲美睫", "婚禮顧問", "寵物美容", "按摩與芳療", "汽機車維修", "洗衣與修改"] }
  ],
  "industryOther": { "code": "X", "label": "其他", "hint": "找不到時自填" },
  "stages": [
   { "id": "planning", "label": "規劃中" },
   { "id": "starting", "label": "剛起步" },
   { "id": "stable", "label": "穩定經營" },
   { "id": "expanding", "label": "擴大經營" }
  ],
  "incomes": [
   { "id": "service", "label": "服務收費", "desc": "美容、諮詢、設計、維修等服務" },
   { "id": "goods", "label": "商品銷售", "desc": "自有商品或代理商品" },
   { "id": "course", "label": "課程教學", "desc": "課程、家教、講座" },
   { "id": "plan", "label": "方案或會員", "desc": "儲值、套組、會員、訂閱" },
   { "id": "commission", "label": "佣金或獎金", "desc": "保險佣金、房仲服務費、銷售獎金" },
   { "id": "network", "label": "分潤或組織獎金", "desc": "直銷、經銷、團隊分潤" },
   { "id": "ads", "label": "廣告與業配", "desc": "業配、廣告、品牌合作" },
   { "id": "platform", "label": "平台分潤", "desc": "YouTube、直播打賞、聯盟導購" },
   { "id": "project", "label": "專案接案", "desc": "網站、設計、工程等專案" },
   { "id": "salary", "label": "薪資或底薪", "desc": "受僱領取的固定薪資" },
   { "id": "none", "label": "尚未有收入", "desc": "目前仍在規劃或試做", "notMain": true },
   { "id": "other", "label": "其他", "desc": "可自填", "custom": true }
  ],
  "duties": [
   { "id": "reply", "label": "訊息回覆" },
   { "id": "reception", "label": "客人接待" },
   { "id": "quote", "label": "方案介紹與報價" },
   { "id": "closing", "label": "成交簽約" },
   { "id": "delivery", "label": "服務交付" },
   { "id": "billing", "label": "收款對帳" },
   { "id": "aftercare", "label": "售後回訪" },
   { "id": "content", "label": "內容製作" },
   { "id": "filming", "label": "拍攝剪輯" },
   { "id": "stock", "label": "進貨庫存" },
   { "id": "shipping", "label": "出貨" },
   { "id": "training", "label": "新人培訓" },
   { "id": "delegate", "label": "工作交辦" },
   { "id": "meeting", "label": "會議" },
   { "id": "report", "label": "報表製作" }
  ],
  "dutiesMaxHandover": 3,
  "cases": [
   { "id": "receive", "label": "接待客人", "sub": "顧客、學員、案主與合作廠商", "noneLabel": "目前沒有接待客人", "hint": "請學姐以最近一位成交的客人為例，整理從認識到成交的步驟。客人包含顧客、學員、案主與合作廠商。",
     "pool": ["回答問題", "提供方案", "預約時間", "安排體驗", "帶看或試乘", "見面洽談", "報價", "簽約下訂", "收款", "交付服務", "出貨", "售後關心", "續約或續費", "邀請回購"],
     "sources": ["IG", "FB", "LINE 官方帳號", "YouTube", "TikTok", "官網", "電商賣場", "朋友介紹", "舊客回購", "實體店面", "活動或展覽", "公司分配"],
     "channels": ["LINE 官方帳號", "LINE 個人", "IG 私訊", "電話", "官網下單", "電商賣場", "現場"],
     "cycles": [{ "id": "day", "label": "當天" }, { "id": "week", "label": "一週內" }, { "id": "month", "label": "一個月內" }, { "id": "longer", "label": "一個月以上" }] },
   { "id": "lead", "label": "帶領團隊", "sub": "交代工作或培訓新人", "noneLabel": "目前沒有帶領團隊", "hint": "請學姐以最近一次交代工作或培訓新人為例，整理帶人的步驟。",
     "roleLabel": "對象職位", "roleHint": "例如：新進美睫師、業務新人、助理",
     "pool": ["說明任務", "示範操作", "提供資料", "追蹤進度", "檢查成果", "給予回饋"] },
   { "id": "task", "label": "執行任務", "sub": "從開始到完成的一項任務", "noneLabel": "目前沒有其他固定任務", "hint": "請學姐以經營項目中最近一項從開始到完成的任務為例，整理執行的步驟。",
     "nameLabel": "任務名稱", "nameHint": "例如：完成一份報價、上架一項商品、發布一支影片、準備開店、建立第一份價目表",
     "pool": [], "tools": ["Canva", "剪輯 App", "AI 工具", "Google 試算表", "Excel", "電商後台", "公司系統"] }
  ],
  "stepLimits": { "maxStages": 30, "maxNameLength": 40, "maxTools": 10, "maxToolLength": 30, "maxChips": 20 },
  "authority": {
   "items": [
    { "id": "pricing", "label": "價格與折扣" },
    { "id": "refund", "label": "退款與取消" },
    { "id": "intake", "label": "接案接客" },
    { "id": "schedule", "label": "排班休假" },
    { "id": "promo", "label": "宣傳內容" },
    { "id": "purchase", "label": "進貨採購" },
    { "id": "staffing", "label": "人員安排" },
    { "id": "contract", "label": "合作簽約" },
    { "id": "customerData", "label": "客戶資料" }
   ],
   "modes": [
    { "id": "self", "label": "自行決定" },
    { "id": "ask", "label": "需要請示" },
    { "id": "none", "label": "不經手" }
   ],
   "askTargets": ["主管或公司", "品牌總部", "上線", "教練或球團", "經紀人", "合夥人", "其他"],
   "maxItems": 30
  },
  "resources": {
   "sourceOptions": [{ "id": "self", "label": "自行整理" }, { "id": "company", "label": "公司提供" }],
   "anyFormatNote": "任何格式都可以：例如照片、影片、PDF、Word、Excel、PPT、Google 文件、截圖、手寫拍照。",
   "data": [
    { "id": "serviceGoods", "label": "服務與商品", "items": [
     { "id": "catalog", "label": "服務或商品目錄", "example": "PDF 型錄、目錄截圖" },
     { "id": "photos", "label": "商品或作品照片", "example": "商品照、成品照、環境照" },
     { "id": "serviceFlow", "label": "服務流程說明", "example": "流程圖、文件、步驟照片" },
     { "id": "faq", "label": "常見問答", "example": "" },
     { "id": "reception", "label": "接待與預約說明", "example": "預約方式、自動回覆、諮詢單" },
     { "id": "aftercare", "label": "售後說明", "example": "保養須知、售後服務內容" } ] },
    { "id": "pricing", "label": "價格與方案", "items": [
     { "id": "priceList", "label": "價目表", "example": "照片、Excel、圖卡" },
     { "id": "plans", "label": "方案說明", "example": "套組、療程、會員或課程方案" },
     { "id": "quoteTemplate", "label": "報價單範本", "example": "" },
     { "id": "promotions", "label": "優惠辦法", "example": "" } ] },
    { "id": "closing", "label": "成交與合約", "items": [
     { "id": "scripts", "label": "常用話術", "example": "文字檔、截圖" },
     { "id": "contracts", "label": "合約或同意書", "example": "" },
     { "id": "cases", "label": "成交案例", "example": "" } ] },
    { "id": "customers", "label": "客戶紀錄", "items": [
     { "id": "customerList", "label": "客戶名單", "example": "" },
     { "id": "orders", "label": "消費或訂單紀錄", "example": "" },
     { "id": "followUps", "label": "回訪紀錄", "example": "" } ] },
    { "id": "projects", "label": "專案與作業", "items": [
     { "id": "specs", "label": "需求或規格文件", "example": "" },
     { "id": "schedules", "label": "進度或排程表", "example": "" },
     { "id": "qa", "label": "驗收或品檢紀錄", "example": "" } ] },
    { "id": "team", "label": "團隊與分工", "items": [
     { "id": "roles", "label": "職位說明", "example": "" },
     { "id": "shifts", "label": "排班或派工表", "example": "" },
     { "id": "payroll", "label": "薪資或分潤計算", "example": "" },
     { "id": "trainingMaterials", "label": "培訓教材", "example": "PPT、影片、講義、操作示範" },
     { "id": "meetings", "label": "會議記錄", "example": "" } ] },
    { "id": "hq", "label": "公司或總部", "items": [
     { "id": "policy", "label": "公司規範", "example": "" },
     { "id": "sop", "label": "作業手冊", "example": "" },
     { "id": "hqCourses", "label": "教學手冊與課程", "example": "PPT、影片、講義" },
     { "id": "productInfo", "label": "商品資料", "example": "" },
     { "id": "systemGuide", "label": "系統操作說明", "example": "含操作影片" },
     { "id": "permissions", "label": "權限文件", "example": "" } ] },
    { "id": "vendors", "label": "合作廠商", "items": [
     { "id": "vendorList", "label": "供應商或廠商名單", "example": "" },
     { "id": "vendorContracts", "label": "合作合約", "example": "" },
     { "id": "purchases", "label": "進貨紀錄", "example": "" } ] },
    { "id": "brand", "label": "品牌與行銷", "items": [
     { "id": "brandIntro", "label": "品牌介紹", "example": "含 Logo" },
     { "id": "copy", "label": "文案", "example": "貼文、商品介紹、廣告" },
     { "id": "socialAssets", "label": "社群素材", "example": "圖片、短影音、直播片段" },
     { "id": "mediaKit", "label": "媒體資料卡", "example": "業配報價、粉絲數據、合作案例" },
     { "id": "campaigns", "label": "活動企劃", "example": "" },
     { "id": "reviews", "label": "客戶評價", "example": "" } ] },
    { "id": "courses", "label": "課程與教學", "items": [
     { "id": "syllabus", "label": "課程大綱", "example": "" },
     { "id": "courseVideos", "label": "課程或教學影片", "example": "" },
     { "id": "handouts", "label": "講義或簡報", "example": "" } ] },
    { "id": "results", "label": "成果與作品", "items": [
     { "id": "portfolio", "label": "作品集", "example": "" },
     { "id": "credentials", "label": "成績或證照", "example": "" },
     { "id": "salesReports", "label": "業績報表", "example": "" } ] },
    { "id": "dialog", "label": "對話紀錄", "items": [
     { "id": "chatShots", "label": "客人對話截圖", "example": "截圖中的姓名與電話可先遮蔽" } ] },
    { "id": "planning", "label": "規劃資料", "items": [
     { "id": "wireframe", "label": "網站或系統線框圖", "example": "手繪、簡報、Figma 連結" },
     { "id": "designDraft", "label": "設計稿", "example": "版面設計、Logo 草稿、圖卡" },
     { "id": "requirements", "label": "功能需求", "example": "文件、清單、對話整理" },
     { "id": "vendorQuote", "label": "廠商報價或提案", "example": "報價單、提案簡報" },
     { "id": "referenceSites", "label": "參考網站", "example": "網址、截圖" } ] },
    /* 3.2.5 制度與權益（所有學姐皆顯示；資料夾編號接在既有分類之後） */
    { "id": "rules", "label": "制度與權益", "items": [
     { "id": "rules_promotion", "label": "組織晉升規範", "example": "權益表、升級方案、晉升與資格維持" },
     { "id": "rules_bonus", "label": "獎金或分潤制度", "example": "獎金制度文件、分潤計算表" },
     { "id": "rules_dealer", "label": "經銷等級與進貨價", "example": "經銷合約、各等級進貨價表" } ] },
    /* 3.2.5 品牌標誌：只在經營項目選「有自己的品牌」或填品牌名稱時出現（when:brand）；必填，可改選「還沒有設計」；
       group id 不用 brand（已為「品牌與行銷」）；資料夾編號依既有規則接在最後，畫面與摘要以 pinTop 置頂 */
    { "id": "logo", "label": "品牌標誌", "when": "brand", "pinTop": true, "required": true, "items": [
     { "id": "brand_logo", "label": "品牌標誌", "example": "PNG（透明背景）、JPG、SVG、PDF、AI；可放橫式、直式、單色等多個版本，也可貼網址", "pendingLabel": "還沒有設計" } ] }
   ],
   "brand": {
    "label": "自有品牌",
    "hint": "店家品牌、個人品牌或經銷的自有品牌皆算",
    "options": [{ "id": "yes", "label": "有自己的品牌" }, { "id": "no", "label": "沒有" }],
    "nameLabel": "品牌名稱",
    "nameMax": 40,
    "namePlaceholder": "例如：店名、品牌名、個人品牌名稱"
   },
   "maxCustomData": 20,
   "sites": {
    "platforms": ["官網", "IG", "FB", "LINE 官方帳號", "YouTube", "TikTok", "電商賣場", "其他"],
    "owners": [{ "id": "self", "label": "個人" }, { "id": "company", "label": "公司或總部" }],
    "uses": ["曝光宣傳", "客人詢問", "預約", "下單購買"],
    "max": 20
   },
   "statuses": [
    { "id": "active", "label": "使用中" },
    { "id": "building", "label": "建置中" },
    { "id": "planning", "label": "規劃中" }
   ],
   "plannedOwners": [
    { "id": "self", "label": "自己" },
    { "id": "vendor", "label": "外包廠商" },
    { "id": "company", "label": "公司" }
   ],
   "plannedFields": [
    { "id": "plannedUse", "label": "預計用途", "maxLength": 60 },
    { "id": "progress", "label": "目前進度", "maxLength": 60 },
    { "id": "owner", "label": "負責對象" }
   ],
   "tools": [
    { "id": "contact", "label": "接待與溝通", "items": ["LINE 官方帳號", "LINE 個人", "IG 私訊", "電話", "Email"] },
    { "id": "booking", "label": "預約與排程", "items": ["預約系統", "Google 日曆", "紙本預約簿"] },
    { "id": "billing", "label": "報價收款與記帳", "items": ["報價單範本", "刷卡機或行動支付", "記帳 App", "發票系統"] },
    { "id": "records", "label": "客戶與訂單資料", "items": ["Google 試算表", "Excel", "CRM", "電商後台", "POS"] },
    { "id": "marketing", "label": "內容與行銷", "items": ["Canva", "剪輯 App", "AI 工具", "排程發文工具"] },
    { "id": "team", "label": "團隊與協作", "items": ["LINE 群組", "Google 雲端硬碟", "Notion", "打卡排班系統"] },
    { "id": "company", "label": "公司系統", "items": ["公司內部系統", "公司 App", "公司報表"], "systemNameLabel": "系統名稱" },
    { "id": "experience", "label": "行銷與體驗", "items": ["IG 限動互動", "測驗", "體驗活動", "試用表單", "預約連結", "商品介紹頁"], "upload": true, "maxCustom": 10 }
   ],
   "toolSourceOptions": [{ "id": "self", "label": "自行使用" }, { "id": "company", "label": "公司提供" }],
   "maxCustomTools": 20
  },
  "place": {
   "rootSuffix": "_諮詢資料",
   "minFilesPerItem": 1,
   "linkLabel": "貼上網址",
   "linkFileSuffix": "_連結",
   "maxLinksPerItem": 10,
   "noneLabel": "改為沒有",
   "sendNote": "送出後內容無法再修改；需補充時於諮詢中說明即可。"
  }
 }
};
});
