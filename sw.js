/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 18:17';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-57E77A45.css","js/c-MXATANOO.js","js/c-VGOAM5KJ.js","js/c-UUZUHAXN.js","js/c-NK2MZNZO.js","js/c-6OR4ZPBZ.js","js/c-IVDG3JND.js","js/c-OTD4WG6P.js","js/c-IORDT7V5.js","js/c-FMJ5ZNQ3.js","js/c-HAR4KSZQ.js","js/c-DCHJ3U25.js","js/c-AF4NQPH2.js","js/c-3MTYRXGW.js","js/c-TVDRRTCI.js","js/c-4RRXNBQ2.js","js/c-X6GH46QR.js","js/c-5YZOA3QG.js","js/c-YBEFTTQ2.js","js/c-N6DD3TLU.js","js/c-Z2E2OCFC.js","js/c-WXDSRTCK.js","js/c-HJG7BTMP.js","js/c-ZD7SNLQQ.js","js/c-KKHDTNVI.js","js/c-53CQZ25D.js","js/c-QDUGGEUN.js","js/c-3RSSJKA5.js","js/c-YWRG5GPX.js","js/c-PJ2T35CW.js","js/c-6T65YFYK.js","js/c-T2LDCJIS.js","js/c-U4M3AQ5H.js","js/c-DQPRAEV4.js","js/c-TWSAGFU2.js","js/c-5Y4Z22FX.js","js/c-IMPK4PAQ.js","js/c-GHPCMEAE.js","js/c-UZ3OUN5E.js","js/c-YTVT6ELB.js","js/c-MMRW5WKX.js","js/c-K7JNEWX7.js","js/c-2XOU62J4.js","js/c-BSSINKHI.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-ZYSVAUAP.js","js/c-WV6INSS6.js","js/c-FH5WZ5US.js","js/c-J2VTDOEI.js","js/c-RNF37BG7.js","js/c-2GYB5A3Z.js","js/c-Z6Q2YC3H.js","js/c-OAUJQRJA.js","js/c-QGKCLJKS.js","js/c-F5E2SEFI.js","js/c-F36OPJPM.js","js/c-WTY4VBHJ.js","js/c-CLQORYIR.js","js/c-3E22HKFN.js","js/c-ARCLGFVA.js","js/c-DQGGNAZY.js","js/c-JKMX6T46.js","js/c-4376HHUX.js","js/c-2DM7Q54Q.js","js/c-LBJ462T2.js","js/c-PAUMPZTT.js","js/c-SR2PTF2W.js","js/c-WHD72C3S.js","js/c-QZGVNFCZ.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-YU4ULN6C.js","js/c-XQ2BKOBU.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/c-3U3S5TBY.js","js/c-N3HYISJE.js","js/c-UMDZ7A2B.js","js/c-WRJJH7XZ.js","js/c-B4RSYKB5.js","js/c-WJGVVA2Y.js","js/c-LXOBKL7Y.js","js/c-BWPU4HX7.js","js/c-DG4H2FUN.js","js/c-K4XX64GN.js","js/c-UWIPWYUX.js","js/c-EDSIKFVP.js","js/c-4CJ7LVVB.js","js/c-IIHLOUSG.js","js/c-2R7S7URR.js","js/c-WJLTJNCS.js","js/c-LLXGVYBB.js","js/c-5VGBIEMD.js","js/c-FQJBXFLC.js","js/c-AAKXFS55.js","js/c-ZHRVXX5R.js","js/c-BNLCMBRX.js","js/c-C3GDBFLY.js","js/c-EK66LCHY.js","js/c-OQX7VROJ.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-O2GCEGV2.js","js/c-LA4DNT3J.js","js/c-WXFYX77A.js","js/c-3H6LKOSF.js","js/c-QJ2ZYVBD.js","js/c-BWO5B3XQ.js","js/c-H6EUB4NE.js","js/c-X6HHNTHF.js","js/c-Z2C7S3JM.js","js/c-ZABRMQIT.js","js/c-G5KC456L.js","js/c-OXZ2KIFW.js","js/c-YKTIGQNN.js","js/c-FPEYEXDP.js","js/c-FTUAUB5L.js","js/c-7U4ADGWA.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-EGLKSMB7.js","js/c-EUSV3M5N.js","js/app-7O2M6FL5.js","js/c-DZQDZXVO.js","js/c-ZKYEOCYY.js","js/c-G6CEU5TI.js","js/c-FKMCKRUO.js","js/c-CWAYTNFF.js","js/c-H5MCCNVV.js","js/c-MNPPYNFO.js","js/c-G47OYCOS.js","js/c-NBUJPGHA.js","js/c-EHSY4JA6.js","js/c-4EUG445U.js","js/c-RQCDXOJV.js","js/c-64AKKXIY.js","js/c-4PJAZDOW.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-QRLSI3AV.js","js/c-FKPJJQB5.js","js/c-ZXPH7DKO.js","js/c-5SHE4DNI.js","js/c-MV2XLUXZ.js","js/c-Z7OJIVGC.js","js/c-KTDQ3GYA.js","js/c-JA27UZAS.js","js/c-QUZFQO6R.js","js/c-NIMHG6P4.js","js/c-S7MS4PEA.js","js/c-R5GVRMXO.js","js/c-HWO6N47Q.js","js/c-S6HE7U45.js","js/c-K3CBBAPW.js","js/c-6JXTN7IX.js","js/c-QY466KUD.js","js/c-JG5FYKFK.js","js/c-GV3FKSAK.js","js/c-ZHCQMO5N.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
