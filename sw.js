/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 14:54';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-E813B11F.css","js/c-27U5LUPY.js","js/c-2SEHFS3A.js","js/c-6IEKS2NF.js","js/c-X3LYRHEB.js","js/c-LDKU253S.js","js/c-5RQX6YT7.js","js/c-BHSWGS6P.js","js/c-6BBX5RLP.js","js/c-3IFI3WJI.js","js/c-TBYQM5IK.js","js/c-VSV4CA2Y.js","js/c-6GDI2JML.js","js/c-4RRXNBQ2.js","js/c-TYQREJNT.js","js/c-ND4DLMMJ.js","js/c-5CASNOBU.js","js/c-PRCTBA4T.js","js/c-LVDBFAVE.js","js/c-LRXX7SP4.js","js/c-4TC6SRSQ.js","js/c-CZ2UV4V7.js","js/c-V3NKNLIV.js","js/c-CIGAGRP5.js","js/c-TBWLHQ3K.js","js/c-KLKCRSKD.js","js/c-L5TMGUF4.js","js/c-XQBP5YI7.js","js/c-NLRNCUSV.js","js/c-UJSCA7D3.js","js/c-IDYIB23M.js","js/c-J5IEHSO3.js","js/c-TALHLWHI.js","js/c-KBRQYDUC.js","js/c-7LX5GHIQ.js","js/c-UT4DAJSL.js","js/c-ZE7V3T5P.js","js/c-4ORVSFVH.js","js/c-L4XSIAFL.js","js/c-2E3BB56N.js","js/c-K6QAN2WD.js","js/c-6Z76EEJB.js","js/c-JLHB4SBV.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-5YLVHP2B.js","js/c-PGUYXDGN.js","js/c-PNAEROGY.js","js/c-SJAHW7HT.js","js/c-T5PWVDIX.js","js/c-TIMJOGBH.js","js/c-CD2A7HSN.js","js/c-QIUJPN4I.js","js/c-I4RGTHK6.js","js/c-TYUMT2GR.js","js/c-F36OPJPM.js","js/c-R4NYVEKA.js","js/c-I532NZ7Z.js","js/c-D4LDJHIG.js","js/c-XIRCTMJF.js","js/c-YBDU2CP4.js","js/c-KABYCBIC.js","js/c-Q4UMBBKG.js","js/c-ICEGA7HA.js","js/c-P3ZGXK4O.js","js/c-XMJ4ENVE.js","js/c-F226VWH3.js","js/c-ARPWHF2R.js","js/c-2GNWFDQR.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-AJY3U7E5.js","js/c-GW2TPRDU.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-CQTE2MIZ.js","js/c-VJECMEHS.js","js/c-G6NZTCIA.js","js/c-Z4KSF3VN.js","js/c-NY3MS7QJ.js","js/c-SBIVOV6C.js","js/c-TCT775YM.js","js/c-5QCRTPJ5.js","js/c-6ZLPDIB4.js","js/c-AGHSH5IU.js","js/c-U2RZQMI7.js","js/c-JR5KFRIU.js","js/c-OI45OITK.js","js/c-IIHLOUSG.js","js/c-XIZGWBQD.js","js/c-WJLTJNCS.js","js/c-EW6WZC63.js","js/c-L2TNZXVG.js","js/c-OXRXHXCH.js","js/c-C72PXTH6.js","js/c-PJTLAQZS.js","js/c-WB5L5A6M.js","js/c-7OK4GEFG.js","js/c-BHM2CWUJ.js","js/c-DGYNSXM3.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-IJKFU5CU.js","js/c-MT7QHEFU.js","js/c-LGMAQ5QT.js","js/c-3H6LKOSF.js","js/c-BMAF5DNB.js","js/c-BWO5B3XQ.js","js/c-6YJYL5KL.js","js/c-VEETH7BS.js","js/c-FX5F6BP2.js","js/c-YXK7FL5G.js","js/c-D2XYQHGB.js","js/c-K3FVXS2I.js","js/c-GFHQZVVG.js","js/c-MBKKXRLV.js","js/c-PREJ3BD4.js","js/c-ECH5PL3Y.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-IRKPLJLN.js","js/c-ZOD3TC5J.js","js/app-NYVDEFMW.js","js/c-HXXI4UHX.js","js/c-6TNPC22U.js","js/c-KUJ2BWMJ.js","js/c-EB6DGTWD.js","js/c-4HHON6F3.js","js/c-NVGNMFRJ.js","js/c-DUMVXOSO.js","js/c-FLICVJBG.js","js/c-CWYOONNX.js","js/c-KXJ2JPDE.js","js/c-4EUG445U.js","js/c-YPBV4SOC.js","js/c-KFCWGGHM.js","js/c-L56RXXRE.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-NOE6G6K2.js","js/c-O3J3ZOTF.js","js/c-FQHIWK22.js","js/c-F47HTUV2.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-PIHM4XLR.js","js/c-OV757FYW.js","js/c-S7MS4PEA.js","js/c-PYNK6ESG.js","js/c-HWO6N47Q.js","js/c-YB6JGBY7.js","js/c-GM2HPAYW.js","js/c-KQW3FVGO.js","js/c-JG5FYKFK.js","js/c-GV3FKSAK.js","js/c-ZHCQMO5N.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  let olds = [];
  const ready = (async () => {
    olds = (await caches.keys()).filter((k) => k.indexOf('grace-shell-') === 0);
    for (const k of olds) await caches.delete(k);
    await self.clients.claim();
  })();
  e.waitUntil(ready);
  /* 從舊版（攔截請求）升級：已開的視窗重新載入，改由網路取得新版頁面（不再經過 Service Worker）。
   *  不放進 waitUntil：導覽要等本版啟用完成，在 waitUntil 裡等導覽會互相卡住 */
  ready.then(async () => {
    if (!olds.length) return;
    const list = await self.clients.matchAll({ type: 'window' });
    for (const c of list) { try { const u = new URL(c.url); u.searchParams.set('v', BUILD.replace(/\D/g, '')); c.navigate(u.toString()).catch(() => {}); } catch (er) { /* 不支援 navigate：頁面自己的新版檢查會接手 */ } }
  }).catch(() => {});
});
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'skip') self.skipWaiting();
  if (d.type === 'build' && e.ports && e.ports[0]) e.ports[0].postMessage({ type: 'build', build: BUILD });
});
/* 刻意沒有 fetch 處理器（見檔頭 v74.1） */

/* ── 推播 ── */
function idb() {
  return new Promise((ok, no) => { const q = indexedDB.open('grace-sw', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
}
async function kv(key, val) {
  const db = await idb();
  return new Promise((ok, no) => { const t = db.transaction('kv', val === undefined ? 'readonly' : 'readwrite'), s = t.objectStore('kv'), q = val === undefined ? s.get(key) : s.put(val, key); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
}
async function pull(cfg, extra) {
  const r = await fetch(cfg.gas, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: 'lms_push_pull', sid: cfg.sid, key: cfg.key }, extra || {})) });
  const j = await r.json();
  if (!j || !j.ok) throw new Error((j && j.error) || '取回失敗');
  return (j.data && j.data.items) || [];
}
const ICON = 'assets/pwa/icon-192.png?v=20261115', BADGE = 'assets/pwa/badge-96.png';
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [];
    try { const cfg = await kv('push'); if (cfg && cfg.sid) items = await pull(cfg); } catch (er) { items = []; }
    /* iOS：每次推播都必須顯示通知；取不到內容時顯示一則通用通知（同一個 tag 會覆蓋） */
    if (!items.length) items = [{ id: 'generic', title: 'G.R.A.C.E 學院管理', body: '有新的通知，點開查看', url: '#/home/today', at: new Date().toISOString(), tag: 'grace-generic' }];
    for (const it of items) {
      await self.registration.showNotification(it.title || 'G.R.A.C.E 學院管理', { body: it.body || '', tag: it.tag || ('g:' + it.id).slice(0, 64), icon: ICON, badge: BADGE, timestamp: Date.parse(it.at) || Date.now(), data: { url: it.url || '#/home/today', at: it.at || '' } });
    }
    try { if (self.navigator.setAppBadge) { const n = (await self.registration.getNotifications()).length; if (n) await self.navigator.setAppBadge(n); } } catch (er) { /* ignore */ }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {}, hash = /^#\//.test(d.url || '') ? d.url : '#/home/today', at = d.at || new Date().toISOString();
  e.waitUntil((async () => {
    try { if (self.navigator.clearAppBadge && !(await self.registration.getNotifications()).length) await self.navigator.clearAppBadge(); } catch (er) { /* ignore */ }
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = list.find((x) => x.url.indexOf(SCOPE.href) === 0);
    if (c) { try { await c.focus(); } catch (er) { /* ignore */ } c.postMessage({ type: 'push-open', hash, at }); return; }
    await self.clients.openWindow(SCOPE.href + '?pn=' + encodeURIComponent(at) + hash);
  })());
});
/* 推播服務換了訂閱（到期或重設）：以同一組 VAPID 公鑰重新訂閱，並用取回金鑰把新網址交給資料中心 */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const cfg = await kv('push'); if (!cfg || !cfg.pub) return;
    const key = Uint8Array.from(atob(cfg.pub.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - cfg.pub.length % 4) % 4)), (c) => c.charCodeAt(0));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await pull(cfg, { renew: { endpoint: sub.endpoint }, peek: true });
  })());
});
