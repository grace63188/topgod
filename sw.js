/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 18:00';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-57E77A45.css","js/c-4AY6JZLM.js","js/c-ECCLA5MQ.js","js/c-L6IBDE4W.js","js/c-PBUPOK5U.js","js/c-S3A2NRVH.js","js/c-HZMBSNL3.js","js/c-QZMZ5WAQ.js","js/c-IORDT7V5.js","js/c-NFLIE73Q.js","js/c-AYWMUICZ.js","js/c-DCHJ3U25.js","js/c-4LW67QAJ.js","js/c-3MTYRXGW.js","js/c-GXMYYOWJ.js","js/c-4RRXNBQ2.js","js/c-3P3FPMBY.js","js/c-QKELSSU2.js","js/c-FS3TQI5X.js","js/c-WD7BWUFU.js","js/c-MW6IMQWU.js","js/c-LWHHWEDJ.js","js/c-P5NI5D4V.js","js/c-GTXBIGNE.js","js/c-ISDDT6KK.js","js/c-26HK2WJF.js","js/c-FG5MWKCF.js","js/c-3T6QEND2.js","js/c-XOTQGULD.js","js/c-AYNDNNUQ.js","js/c-Z3O47A5Z.js","js/c-VZ77KBCT.js","js/c-535IMMEZ.js","js/c-BEANS7U6.js","js/c-PGZ5Y2TP.js","js/c-FRBMT4ZH.js","js/c-SDEUJM7R.js","js/c-VRA5J4XE.js","js/c-D4SIO37V.js","js/c-DO5TKILH.js","js/c-OQBQMXIM.js","js/c-YSDEQJXQ.js","js/c-TNL6E2CX.js","js/c-TBU22QEZ.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-5M4ZIAON.js","js/c-G33IPJ2O.js","js/c-VDHIUAAW.js","js/c-4VDQYBIG.js","js/c-QFXFDVAD.js","js/c-XWJZ2I44.js","js/c-Q6SDIU6V.js","js/c-GDTHTP55.js","js/c-JPJ5AIZU.js","js/c-TEIKLHU6.js","js/c-F36OPJPM.js","js/c-DVPJ5YY3.js","js/c-VNRTF53Z.js","js/c-6IPQCB4U.js","js/c-VMXXGL34.js","js/c-KDTDF4AY.js","js/c-KABYCBIC.js","js/c-52WH2H4V.js","js/c-OOXSAQCL.js","js/c-VAMP45FZ.js","js/c-COAD7DLY.js","js/c-KGTB4JKV.js","js/c-BXYPZRGT.js","js/c-MPN43G6W.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-FXISS53H.js","js/c-GW2TPRDU.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-3U3S5TBY.js","js/c-K2IDL52Z.js","js/c-DTQRHH4E.js","js/c-RDEKOC6M.js","js/c-KA3NX4O4.js","js/c-OGIVXSOI.js","js/c-R2YM3KIP.js","js/c-Q2QYNQL6.js","js/c-W3F3SJPZ.js","js/c-53YFEQ5P.js","js/c-U2RZQMI7.js","js/c-TXTDMCMI.js","js/c-NE7YMBH5.js","js/c-IIHLOUSG.js","js/c-54X4B2XG.js","js/c-WJLTJNCS.js","js/c-PS24NDKZ.js","js/c-7PPDM72J.js","js/c-A7J7J7ZV.js","js/c-IFHTG2SW.js","js/c-K5HSL242.js","js/c-TRO24I4K.js","js/c-C3GDBFLY.js","js/c-TOQARLCD.js","js/c-OQX7VROJ.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-V74A2ACY.js","js/c-2YX4E44Z.js","js/c-OTVVIHMT.js","js/c-3H6LKOSF.js","js/c-POOMZ7JD.js","js/c-BWO5B3XQ.js","js/c-RW6RLHQW.js","js/c-33H4APTL.js","js/c-VUC4XCMX.js","js/c-S5GUJMUW.js","js/c-5T4QDHNC.js","js/c-2NTN3GPT.js","js/c-2VGMHKCR.js","js/c-MBKKXRLV.js","js/c-PREJ3BD4.js","js/c-GDRVS7KE.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-GFWKDP65.js","js/c-GGJLFTH3.js","js/app-HFUHD4RN.js","js/c-DZQDZXVO.js","js/c-TIJTWBHZ.js","js/c-QFXLUTLT.js","js/c-FKMCKRUO.js","js/c-EB6DGTWD.js","js/c-H5MCCNVV.js","js/c-5RM3IIEX.js","js/c-DUMVXOSO.js","js/c-W7NIFG6F.js","js/c-CWYOONNX.js","js/c-KXJ2JPDE.js","js/c-4EUG445U.js","js/c-RQCDXOJV.js","js/c-64AKKXIY.js","js/c-IRT4TYRH.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-QRLSI3AV.js","js/c-FKPJJQB5.js","js/c-ZXPH7DKO.js","js/c-5SHE4DNI.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-CN5PYK2A.js","js/c-ZH4CN6VS.js","js/c-S7MS4PEA.js","js/c-R5GVRMXO.js","js/c-HWO6N47Q.js","js/c-YB6JGBY7.js","js/c-GM2HPAYW.js","js/c-KQW3FVGO.js","js/c-JG5FYKFK.js","js/c-GV3FKSAK.js","js/c-ZHCQMO5N.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
