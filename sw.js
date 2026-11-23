/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-23 16:28';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-D792B1F1.css","js/c-SSBOWPXH.js","js/c-5UIEEYLG.js","js/c-2LBXPI2W.js","js/c-JZK2BVDU.js","js/c-U6RR2JXE.js","js/c-WN5KPU7Q.js","js/c-ZX6IWEZE.js","js/c-4RRXNBQ2.js","js/c-4PAEAKBK.js","js/c-UXO3J3HS.js","js/c-PM6GQKB6.js","js/c-GSS6QVZA.js","js/c-MLAGETWE.js","js/c-HBVBQNOH.js","js/c-OTHPTJ2O.js","js/c-FTE4OHCR.js","js/c-PUT4YXTS.js","js/c-DPXNCK6A.js","js/c-RGKWI7IN.js","js/c-424U3IVD.js","js/c-HOIDPK4X.js","js/c-6KMUUKAF.js","js/c-GMONIU5R.js","js/c-6BDMAG74.js","js/c-VYXXJYJ4.js","js/c-EPVHMCJR.js","js/c-IQ54XJDC.js","js/c-4KHKLTBH.js","js/c-TVECYQUF.js","js/c-476VQSXN.js","js/c-LACLLXFL.js","js/c-K2UZUSVO.js","js/c-O55RGKYZ.js","js/c-GK3U5V76.js","js/c-LXOOXGMN.js","js/c-E2AOQ2EN.js","js/c-N6C4V7AZ.js","js/c-43BHS3V5.js","js/c-L7DVSQDR.js","js/c-ETEAOFXU.js","js/c-HLAX2PT7.js","js/c-6UTDCKQ3.js","js/c-QAKTBEQ3.js","js/c-WKQPKTLB.js","js/c-YKM6G5BO.js","js/c-IIHLOUSG.js","js/c-IVVHHZRH.js","js/c-45UREFCA.js","js/c-H5E42C2M.js","js/c-QQHK7FYG.js","js/c-6X4IDYAK.js","js/c-J66FRKKR.js","js/c-F42YHYXX.js","js/c-3ZT6JHPT.js","js/c-SYR2QDIG.js","js/c-S7ACT2BM.js","js/c-3AD4F6HI.js","js/c-DNRDXM3B.js","js/c-Z5IROVGI.js","js/c-JBWJBLDL.js","js/c-KHBSU2QL.js","js/c-3HGR7SGE.js","js/c-AKI42EHS.js","js/c-7QOW2NOT.js","js/c-SL5CW72D.js","js/c-4W54TDDI.js","js/c-HBECWMZB.js","js/c-JAKS4KAK.js","js/c-BDDJHHLQ.js","js/app-YGMY7K3T.js","js/c-Z75YJFVV.js","js/c-QJEGPRXO.js","js/c-QCL2AKXB.js","js/c-MIWNLQHI.js","js/c-DUMVXOSO.js","js/c-DDVVPD45.js","js/c-W6PJSLQF.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-2AOQF5ED.js","js/c-NQVABKA6.js","js/c-S7MS4PEA.js","js/c-QWUFRKUU.js","js/c-3LSKDFXK.js","js/c-ESLGHVXB.js","js/c-OWK2KZOC.js","js/c-6O4G3XTV.js","js/c-OFBMGSUQ.js","js/c-2FJU75FR.js","js/c-RT6NDBJD.js","js/c-URLFZC5U.js","js/c-Z42QDD7M.js","js/c-KQW3FVGO.js","js/c-FQHIWK22.js","js/c-F36OPJPM.js","js/c-SJUIOUOM.js","js/c-EXESAOHE.js","js/c-TOZC6FM4.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
