/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-23 18:48';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-7071A68E.css","js/c-2JQYFHTM.js","js/c-XFYE3HVV.js","js/c-RZN7GVUH.js","js/c-ZGLQTVSL.js","js/c-27EBAB2A.js","js/c-ROBYSBFQ.js","js/c-BAH5I3DO.js","js/c-4RRXNBQ2.js","js/c-GBR3XB3B.js","js/c-D2WXD5EM.js","js/c-AH3DWGJX.js","js/c-AO7BWCHI.js","js/c-OYKGXIE2.js","js/c-SCGFHTUO.js","js/c-CDFH4POH.js","js/c-7KPHTEMZ.js","js/c-VGJ7AD3J.js","js/c-OAZKRQUZ.js","js/c-L6UAVSE2.js","js/c-7Z6S2H6A.js","js/c-IVSHP42P.js","js/c-THEBN3XG.js","js/c-WFR6JMIZ.js","js/c-3HIORKRH.js","js/c-VYXXJYJ4.js","js/c-NOQV254G.js","js/c-VQYQRJXV.js","js/c-4KHKLTBH.js","js/c-TVECYQUF.js","js/c-PUZI33JJ.js","js/c-44KBOJBY.js","js/c-IGFNACS3.js","js/c-AMVKGILZ.js","js/c-U5UWQMRE.js","js/c-CK6ST377.js","js/c-SWHXJZS5.js","js/c-P2UPRLMS.js","js/c-4UD36AZV.js","js/c-WLB5J2IT.js","js/c-KDUBHOTE.js","js/c-ATRLKBM2.js","js/c-4VQ4IORD.js","js/c-XNGESPLQ.js","js/c-IUU7WMRN.js","js/c-D4INPUTE.js","js/c-IIHLOUSG.js","js/c-DNBWELEN.js","js/c-4B7B3FDG.js","js/c-L5DA75CS.js","js/c-IRUVGLPB.js","js/c-2B7W5Y27.js","js/c-H5J4CANN.js","js/c-XHVZ2OM6.js","js/c-ZA7QO254.js","js/c-SYR2QDIG.js","js/c-PLKLHEZJ.js","js/c-U5AEO4UU.js","js/c-OVUFJZVF.js","js/c-WDMS3N4L.js","js/c-FLLF3EYX.js","js/c-3R7URMH6.js","js/c-REUKM32Z.js","js/c-RWGYGCTU.js","js/c-MEXK5XKV.js","js/c-SL5CW72D.js","js/c-Q5CJEVXX.js","js/c-VO663HRK.js","js/c-EQ5AZXBQ.js","js/c-RER52QMS.js","js/app-642XBOST.js","js/c-ECUYYAYW.js","js/c-OSMTCYHC.js","js/c-NXGFOGLW.js","js/c-6DSJ34AU.js","js/c-IRZ352AW.js","js/c-DUMVXOSO.js","js/c-DDVVPD45.js","js/c-ABYBAHRB.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-MRNRMQLD.js","js/c-H5KOPGQD.js","js/c-S7MS4PEA.js","js/c-DHMR57P6.js","js/c-UJTOJVXP.js","js/c-ESLGHVXB.js","js/c-SUE4ZTYK.js","js/c-6O4G3XTV.js","js/c-MQDRQLS2.js","js/c-3ZZOH2DY.js","js/c-47IZQPTS.js","js/c-KTNYW5YH.js","js/c-6DDSK73O.js","js/c-KQW3FVGO.js","js/c-FQHIWK22.js","js/c-F36OPJPM.js","js/c-SJUIOUOM.js","js/c-EXESAOHE.js","js/c-TOZC6FM4.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
