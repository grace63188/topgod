/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 09:50';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-836D794F.css","js/c-QWQX5DL4.js","js/c-N7GRUNQK.js","js/c-ATRY5TMB.js","js/c-QRULKNYH.js","js/c-X2VAC73V.js","js/c-W7MOIVJ6.js","js/c-MKPVJB4G.js","js/c-7T4MACJE.js","js/c-PK7YSCRX.js","js/c-JAHESMP5.js","js/c-HW5ORX7R.js","js/c-4RRXNBQ2.js","js/c-GXWKDUAA.js","js/c-WGEQOMTU.js","js/c-NUFRQSVS.js","js/c-QKQP5VIS.js","js/c-BACY75RD.js","js/c-IMWXGZXV.js","js/c-A2WNAUBZ.js","js/c-GF6CETBU.js","js/c-BE6LD6B3.js","js/c-NJD3YOCY.js","js/c-F57A222J.js","js/c-BROEMQLV.js","js/c-W52CVP5K.js","js/c-Z4SQYNGS.js","js/c-SOMB56EV.js","js/c-IQGXMFMR.js","js/c-KF4CVLNI.js","js/c-DZMY6HWP.js","js/c-T5IRURWG.js","js/c-G77YBJEM.js","js/c-MUFSEKEN.js","js/c-SOQTEYUY.js","js/c-ZGOVOK37.js","js/c-F36OPJPM.js","js/c-BXS4LNQ4.js","js/c-5PAUMRSG.js","js/c-TUXDRRU6.js","js/c-E7U7JQWN.js","js/c-B6G7PLFC.js","js/c-ITD2SUHY.js","js/c-CQMZW666.js","js/c-LOB7E66M.js","js/c-CFTZ3UEV.js","js/c-B7ABLEX2.js","js/c-5E2275XK.js","js/c-K344ZRYL.js","js/c-HWQAKT3C.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-SDH65CYH.js","js/c-42BV6XQG.js","js/c-6WAV27I2.js","js/c-J72C5F77.js","js/c-C7J2YWRS.js","js/c-NCVJ3URA.js","js/c-CCR5UJHM.js","js/c-KP23DS6D.js","js/c-5RB54PAA.js","js/c-J7LAX2GU.js","js/c-OCPDZICW.js","js/c-SK5UTAD6.js","js/c-REMWWZAN.js","js/c-VAUDH3JB.js","js/c-YCW7EWWR.js","js/c-WJLTJNCS.js","js/c-NWGGRBV4.js","js/c-DY4R6QHM.js","js/c-6CJ3AOQ6.js","js/c-VWCHGNOV.js","js/c-BQOIJNWN.js","js/c-6JVTYPPL.js","js/c-E722EM5Q.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-VBYQVBGP.js","js/c-NTK3QEKG.js","js/c-TIDXDNEF.js","js/c-VYXXJYJ4.js","js/c-IIHLOUSG.js","js/c-QABSGQ2M.js","js/c-T3DQKNZA.js","js/c-RPFKXXAU.js","js/c-RLD4V5IP.js","js/c-CJ46NHUE.js","js/c-3H6LKOSF.js","js/c-IHOH5UCT.js","js/c-BWO5B3XQ.js","js/c-2RH6ZW5C.js","js/c-TRJY663E.js","js/c-WQYD46VP.js","js/c-QMQZDD7T.js","js/c-UMNFPE3E.js","js/c-Q57S2IHT.js","js/c-JEBFP2FQ.js","js/c-4EEL3TBC.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-BCSP76XN.js","js/c-UL5VLC6Y.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/app-FOCXVNSQ.js","js/c-I6GCD3FY.js","js/c-4FILFCZ2.js","js/c-K3A5VF7F.js","js/c-NXXUMW55.js","js/c-3A4QSLGF.js","js/c-DUMVXOSO.js","js/c-XQU3463L.js","js/c-S63HXQI4.js","js/c-IOSTSW7P.js","js/c-O7LE53LP.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-NNUXZ52L.js","js/c-KQJQ75OS.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-6N7UTPFR.js","js/c-IA4VZ46H.js","js/c-S7MS4PEA.js","js/c-NYTDV547.js","js/c-HWO6N47Q.js","js/c-DM5LCX3G.js","js/c-HY2JRDK4.js","js/c-JG5FYKFK.js","js/c-FIZ2UWKJ.js","js/c-2GSFCPEF.js","js/c-35WSQG65.js","js/c-ABU43UBV.js","js/c-FQHIWK22.js","js/c-KQW3FVGO.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
