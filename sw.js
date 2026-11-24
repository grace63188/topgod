/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 15:26';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-2838427A.css","js/c-CDTASPVK.js","js/c-QTNOJWHO.js","js/c-M55KM5IB.js","js/c-DA3IJBOK.js","js/c-OZOWCJ76.js","js/c-6XHA36WQ.js","js/c-X5LVP675.js","js/c-5EPCI35Y.js","js/c-H5J3FNOQ.js","js/c-FMK4NN4L.js","js/c-ARZE5PI2.js","js/c-NLSCUI63.js","js/c-4RRXNBQ2.js","js/c-ZWNMEHGH.js","js/c-M5EDPP6U.js","js/c-RXFOQ6ZA.js","js/c-ZRMWRO5G.js","js/c-WBOXC4UD.js","js/c-NJQX5VH7.js","js/c-L7B62MCJ.js","js/c-HYDIXA66.js","js/c-IRSWMHID.js","js/c-VO22XANB.js","js/c-3XAUXYSW.js","js/c-6XMHVIIV.js","js/c-PK7HYSWZ.js","js/c-6SF4XG73.js","js/c-33PFFF6T.js","js/c-X2HS3KCP.js","js/c-TNKJJ47V.js","js/c-JVI5ORUQ.js","js/c-ENX353GO.js","js/c-6RMQKWRR.js","js/c-ESBWIELF.js","js/c-XDJ2HEGG.js","js/c-S3TYRMLI.js","js/c-FT5QBMQP.js","js/c-BN652GY7.js","js/c-BIWCNUVA.js","js/c-2EITIPRV.js","js/c-CYMBEWAT.js","js/c-2IM6B6ID.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-AOYWVHQZ.js","js/c-7WRTAVO3.js","js/c-VQQNNYQG.js","js/c-QJU6S4AO.js","js/c-RCKT5H7M.js","js/c-TR7AI6NE.js","js/c-LG3RCQHW.js","js/c-HYNA7MQJ.js","js/c-JVZH45LA.js","js/c-H4WIUZAB.js","js/c-F36OPJPM.js","js/c-XRKAYXPQ.js","js/c-WXG7GMR2.js","js/c-S7D5UYRA.js","js/c-B2HIORJP.js","js/c-H2KBTKCP.js","js/c-KABYCBIC.js","js/c-XVO2ETXF.js","js/c-7XYZZZUB.js","js/c-SCNGC6SR.js","js/c-6FEI5SDC.js","js/c-JSU2OCTT.js","js/c-F35LDPUR.js","js/c-47WX2Z3C.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-ZRZ5RWGM.js","js/c-GW2TPRDU.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-PBNUAGXE.js","js/c-EGGMAA7R.js","js/c-A6SDWEGM.js","js/c-HSAIQZ37.js","js/c-5KKU7IDB.js","js/c-UELAINDC.js","js/c-DMSPWH5Q.js","js/c-HD7A2KIE.js","js/c-3HPVTCMO.js","js/c-APPUEOWC.js","js/c-U2RZQMI7.js","js/c-SDRONSTR.js","js/c-SVAHDUB6.js","js/c-IIHLOUSG.js","js/c-Z3JD7JNP.js","js/c-WJLTJNCS.js","js/c-RGNAHL7T.js","js/c-J3KYPTP4.js","js/c-SJRBGRXG.js","js/c-VIMRZQVZ.js","js/c-PHTZBYMQ.js","js/c-NVTJ4WPF.js","js/c-XF4DACBN.js","js/c-YEBSH26Z.js","js/c-YCFVKL6Z.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-V74A2ACY.js","js/c-2YX4E44Z.js","js/c-NXQGYAXA.js","js/c-3H6LKOSF.js","js/c-YKHC2IWD.js","js/c-BWO5B3XQ.js","js/c-BIUPYBIR.js","js/c-QWFANKLU.js","js/c-LI6W7CTG.js","js/c-OKP4MIKD.js","js/c-E32VT7V6.js","js/c-QEP2FCQB.js","js/c-CLAUYSDJ.js","js/c-MBKKXRLV.js","js/c-PREJ3BD4.js","js/c-7SOUYAIO.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-6JASLVNP.js","js/c-RYT5UKEL.js","js/app-YT6NX5EI.js","js/c-DZQDZXVO.js","js/c-OOBY52OS.js","js/c-RY2UCGWR.js","js/c-XQO3SBIZ.js","js/c-EB6DGTWD.js","js/c-2LGJ5KX7.js","js/c-ILEFCL6O.js","js/c-DUMVXOSO.js","js/c-XTFQBETJ.js","js/c-CWYOONNX.js","js/c-KXJ2JPDE.js","js/c-4EUG445U.js","js/c-RQCDXOJV.js","js/c-62VVR5MD.js","js/c-CBBOK7YR.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-KTUBVICW.js","js/c-OHHSVEWM.js","js/c-ZXPH7DKO.js","js/c-IWJGNRSK.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-A4OYLTS6.js","js/c-A4BIL4SX.js","js/c-S7MS4PEA.js","js/c-MYUA5E4V.js","js/c-HWO6N47Q.js","js/c-YB6JGBY7.js","js/c-GM2HPAYW.js","js/c-KQW3FVGO.js","js/c-JG5FYKFK.js","js/c-GV3FKSAK.js","js/c-ZHCQMO5N.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
