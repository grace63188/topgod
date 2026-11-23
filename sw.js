/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 03:10';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-F0DFCBF1.css","js/c-P77JI2LO.js","js/c-ZLVX2JTB.js","js/c-6AGYNSLL.js","js/c-LXEFWGL2.js","js/c-I7SOGENB.js","js/c-5GJGSBFC.js","js/c-4F3YEB25.js","js/c-JPJO4BX2.js","js/c-DR7MAHMU.js","js/c-MKN66EVP.js","js/c-GDH2KE6Y.js","js/c-TJEAHR7B.js","js/c-OL52A2PR.js","js/c-4RRXNBQ2.js","js/c-FFOO5EM6.js","js/c-ZMEPDXQF.js","js/c-ZMIOZ6QO.js","js/c-NMT6YGQJ.js","js/c-VP7WGG7S.js","js/c-MCDGA6MX.js","js/c-I4E5ABS5.js","js/c-HJ66NOQZ.js","js/c-FWQIEISL.js","js/c-5LXGGTZ4.js","js/c-3R6YEFDH.js","js/c-P2UPRLMS.js","js/c-AFU6EEXA.js","js/c-RUOQQLXR.js","js/c-66L2KGVQ.js","js/c-YXDASBVO.js","js/c-SYR2QDIG.js","js/c-EYKHMAYE.js","js/c-R7FAABJW.js","js/c-S2VZEIQL.js","js/c-AUEF36XD.js","js/c-4JCPPWIO.js","js/c-CXFS7OAK.js","js/c-VN65ZT7A.js","js/c-PSFRMQYU.js","js/c-64QPGMFQ.js","js/c-VYXXJYJ4.js","js/c-EOJFAHVZ.js","js/c-ALBQKFYQ.js","js/c-AIXG2IG5.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-XK7G4JV7.js","js/c-BWO5B3XQ.js","js/c-6XJEILNX.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-SPADPM46.js","js/c-YHVAAWGM.js","js/c-ELJ2XN2H.js","js/c-BHTL7QJF.js","js/c-ZCTB2OIO.js","js/c-ACLOI3UV.js","js/c-2PC46J4H.js","js/c-FOTZTQWE.js","js/c-U6N6ARFW.js","js/c-IIHLOUSG.js","js/c-FX3KX7OR.js","js/c-7TYS7GVI.js","js/c-F2JKKFHY.js","js/c-PGPAZZGX.js","js/c-46TUTOWM.js","js/c-GZ4BWBNK.js","js/c-SL5CW72D.js","js/c-O3X65WMX.js","js/c-YR4FKFD6.js","js/c-PJXZXURI.js","js/c-M25NWNC3.js","js/c-YPY6ZWZ4.js","js/app-2TOQTVSS.js","js/c-QID7GHKK.js","js/c-Q4HL6QQS.js","js/c-BHUFG4N3.js","js/c-A2MEQIDD.js","js/c-VO22GBWW.js","js/c-746U7FNQ.js","js/c-DUMVXOSO.js","js/c-5DCYFZOR.js","js/c-VYNILRS6.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-23AOQ53X.js","js/c-SFPJXVDG.js","js/c-S7MS4PEA.js","js/c-RX3PDLEE.js","js/c-JEUFGMBJ.js","js/c-ESLGHVXB.js","js/c-KISZDM5R.js","js/c-6O4G3XTV.js","js/c-37HDBGD4.js","js/c-X34VOLVA.js","js/c-47IZQPTS.js","js/c-KTNYW5YH.js","js/c-6DDSK73O.js","js/c-KQW3FVGO.js","js/c-FQHIWK22.js","js/c-F36OPJPM.js","js/c-SJUIOUOM.js","js/c-3H6LKOSF.js","js/c-6FN4TXK2.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
