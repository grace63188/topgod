/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 01:03';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-CB8A6170.css","js/c-4JJG7TO6.js","js/c-MTKBEIZ7.js","js/c-FUQIXDCJ.js","js/c-7O24G5XA.js","js/c-D6A44KVS.js","js/c-OG4U4YXO.js","js/c-BRA5BMWR.js","js/c-75ARFMYM.js","js/c-ZGHJQTCS.js","js/c-YITCOXLP.js","js/c-SVQEG5MN.js","js/c-RF2O2WTA.js","js/c-UDUGC5TB.js","js/c-4RRXNBQ2.js","js/c-BUAC5QQY.js","js/c-BOKEUNOX.js","js/c-2HJZLZ6J.js","js/c-327WXN2O.js","js/c-2FC6DCYI.js","js/c-W6K7BDGK.js","js/c-UEJAQSJ7.js","js/c-EZQ6FZ33.js","js/c-OGFKZKDC.js","js/c-EYAU4DGA.js","js/c-ODX2NAKJ.js","js/c-P2UPRLMS.js","js/c-XWSWGX7X.js","js/c-CKMISEX4.js","js/c-BEDJEKTD.js","js/c-EFDLMYFV.js","js/c-SYR2QDIG.js","js/c-LUB4CLSC.js","js/c-4RM3XT2O.js","js/c-MMCPCHC4.js","js/c-NO67TE3D.js","js/c-E5DJUUXV.js","js/c-EJCLZ33H.js","js/c-O6ZZECOP.js","js/c-LUR7HVH3.js","js/c-2S55JKZA.js","js/c-VYXXJYJ4.js","js/c-FSFSG7VB.js","js/c-5N33DBRK.js","js/c-SZ7EBX4I.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-6JXWPVL2.js","js/c-BWO5B3XQ.js","js/c-APGJJCGA.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-DRDY73LY.js","js/c-QQA7CZHM.js","js/c-SPFTVGA2.js","js/c-UFY6YFWI.js","js/c-O2VXZ6HI.js","js/c-YKOAJHZP.js","js/c-3VWMOBMC.js","js/c-YYJY6JGW.js","js/c-A2KEIH3W.js","js/c-IIHLOUSG.js","js/c-Z7LRLIRY.js","js/c-YL4NMO5N.js","js/c-BHT2PBW5.js","js/c-6W2EBGBU.js","js/c-T4MKEMQJ.js","js/c-PMUOLHKP.js","js/c-SL5CW72D.js","js/c-TTC25EKJ.js","js/c-M7GWSNKT.js","js/c-ADNJX4JP.js","js/c-4H2237BT.js","js/c-YPY6ZWZ4.js","js/app-Y7CYP6JI.js","js/c-IE4YCROG.js","js/c-C76KZ4PA.js","js/c-HJHYWXBZ.js","js/c-J57KIPUT.js","js/c-FM645LO6.js","js/c-DUMVXOSO.js","js/c-5WVNV35V.js","js/c-XVW4DPRC.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-Y5TLEGQI.js","js/c-WU76XZN4.js","js/c-S7MS4PEA.js","js/c-XGMSQU37.js","js/c-NGNAWDRN.js","js/c-ESLGHVXB.js","js/c-4NZPED3D.js","js/c-6O4G3XTV.js","js/c-66AADXI3.js","js/c-OTCRAHVN.js","js/c-47IZQPTS.js","js/c-KTNYW5YH.js","js/c-6DDSK73O.js","js/c-KQW3FVGO.js","js/c-FQHIWK22.js","js/c-F36OPJPM.js","js/c-SJUIOUOM.js","js/c-3H6LKOSF.js","js/c-6FN4TXK2.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
