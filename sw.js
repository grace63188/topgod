/* 學院學習管理 Service Worker（v74.1 熱修）：只處理推播，不攔截任何請求
 *  v74.1：拿掉 fetch 處理器——iOS（Safari 與主畫面 App）頁面受「有 fetch 處理器」的 Service Worker 控制時，所有請求（含資料中心 script.google.com
 *         與其 302 轉到 script.googleusercontent.com）都先送進 Service Worker 行程再退回網路；Service Worker 行程被系統暫停／終止後，
 *         資料中心呼叫回「Load failed」或一直沒有回應（登入停在「正在向資料中心驗證」）。沒有 fetch 處理器 → 瀏覽器完全不經過 Service Worker
 *  不快取任何東西：上一版的靜態殼快取（grace-shell-*）在啟用時刪除
 *  新版：install 立即 skipWaiting、activate clients.claim；從有 fetch 處理器的舊版升級時（還有 grace-shell-* 快取）→ 已開的視窗重新載入一次，直接改用新版
 *  v67 主畫面 App：push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 */
const BUILD = '2026-11-24 13:35';
/* 本版靜態檔清單：不快取，只給 scripts/publish-copy.mjs 下次發布時保留本版檔案（GitHub Pages index.html 有 10 分鐘快取） */
const PRECACHE = ["index.html","app-7A0979EC.css","js/c-3V56G3ZR.js","js/c-6EH7V3DP.js","js/c-VUZS3YX5.js","js/c-7VTRVE2E.js","js/c-VOOJUJWS.js","js/c-TNQQ5Y57.js","js/c-PLDYEUIE.js","js/c-4RRXNBQ2.js","js/c-I4OSRTBA.js","js/c-333NMUFO.js","js/c-RK3KPCJS.js","js/c-KOIJG7AG.js","js/c-KCUJD5X3.js","js/c-A7LQ6SKR.js","js/c-YMKIJRR4.js","js/c-PB4A7WVK.js","js/c-ICIMXCLQ.js","js/c-7FGYG6MR.js","js/c-CVC3MMMA.js","js/c-HIHLKDFQ.js","js/c-6CZSQQBT.js","js/c-F44WX3FN.js","js/c-LUKMNZXM.js","js/c-BY7PCAZU.js","js/c-FCHAG4DA.js","js/c-TJ55LPHY.js","js/c-NZE73OIA.js","js/c-BZ2UFQ5L.js","js/c-6OC3MZ6U.js","js/c-YEX7HNDQ.js","js/c-HTI6YQUO.js","js/c-HQQC6PCN.js","js/c-3GYW2Z4W.js","js/c-MKPVJB4G.js","js/c-GXWKDUAA.js","js/c-5M44MUXZ.js","js/c-7W54S4DR.js","js/c-HBKRA7LX.js","js/c-P5GMC2DF.js","js/c-AVMNBRS2.js","js/c-5OMKS4HP.js","js/c-Q2IRK43Q.js","js/c-ELVNGHMQ.js","js/c-ATMF3VEK.js","js/c-F36OPJPM.js","js/c-CYF4WYML.js","js/c-DFA7PHFS.js","js/c-BKAP7XL2.js","js/c-3HI4LB75.js","js/c-V7QARWEK.js","js/c-V34WRTUC.js","js/c-SCLRDVUM.js","js/c-RY3O5RRC.js","js/c-LOM63B6T.js","js/c-SFFDIBSL.js","js/c-EIEGNOCA.js","js/c-5RZSGPVO.js","js/c-SYR2QDIG.js","js/c-SJUIOUOM.js","js/c-MXHE5IMG.js","js/c-QI6HZYW6.js","js/c-263KFUCS.js","js/c-OMUFHA65.js","js/c-EKL7IUXQ.js","js/c-NGVOMGDF.js","js/c-KABYCBIC.js","js/c-LCFN57ZM.js","js/c-PUWQ7DO7.js","js/c-SYYJ3BCS.js","js/c-M7PUKXSY.js","js/c-7ZFL35FE.js","js/c-BNPCVS4L.js","js/c-EC4MQ6ZZ.js","js/c-KJPOQWHV.js","js/c-5WMZGRKE.js","js/c-N3MJFEYM.js","js/c-6MJ6IIPH.js","js/c-KY64VAPQ.js","js/c-WJLTJNCS.js","js/c-4QJUIPZE.js","js/c-IFL4OY4L.js","js/c-72CSIHQV.js","js/c-DMCACHDN.js","js/c-LD4TLPI3.js","js/c-2ECQP5QZ.js","js/c-KHBKK4BQ.js","js/c-ESLGHVXB.js","js/c-SL5CW72D.js","js/c-NKL3JXTD.js","js/c-GVUEYOLM.js","js/c-KYOZ654C.js","js/c-U2RZQMI7.js","js/c-IIHLOUSG.js","js/c-EEEEAVPX.js","js/c-GJFJVD7L.js","js/c-ZID2SO45.js","js/c-3H6LKOSF.js","js/c-GW6ZC7TM.js","js/c-BWO5B3XQ.js","js/c-VVGBVG3G.js","js/c-HAZHV55X.js","js/c-XJMV46YZ.js","js/c-WW4YUVMN.js","js/c-3UTS7UDY.js","js/c-SIPOTMNZ.js","js/c-AWVEIOMI.js","js/c-MBKKXRLV.js","js/c-PREJ3BD4.js","js/c-XRPD5YKT.js","js/c-6FN4TXK2.js","js/c-YPY6ZWZ4.js","js/c-KJVN3JSD.js","js/c-IJU7J6Y7.js","js/c-GMSNXUAT.js","js/c-KFGQJBUO.js","js/app-L2BP5HZG.js","js/c-VC4FXCGE.js","js/c-7MNPLB4E.js","js/c-3S7RJAB4.js","js/c-EB6DGTWD.js","js/c-FX4CBSC6.js","js/c-7GBQ66R5.js","js/c-DUMVXOSO.js","js/c-RXLA43PA.js","js/c-S63HXQI4.js","js/c-3AHSH2W3.js","js/c-K4DUPB6O.js","js/c-6O4G3XTV.js","js/c-KAQ32LQI.js","js/c-JZAQKIYW.js","js/c-PLYG53LW.js","js/c-QVUPWITT.js","js/c-AC4IJY6P.js","js/c-KTDQ3GYA.js","js/c-4GDJKYF7.js","js/c-QLQEJPJ3.js","js/c-S7MS4PEA.js","js/c-LHKMO7TL.js","js/c-HWO6N47Q.js","js/c-DM5LCX3G.js","js/c-HY2JRDK4.js","js/c-JG5FYKFK.js","js/c-GV3FKSAK.js","js/c-ZHCQMO5N.js","js/c-2AYG3SKD.js","js/c-65VUPB6C.js","js/c-C6SQEWZW.js","js/c-ZVTW4B6V.js","js/c-FQHIWK22.js","js/c-KQW3FVGO.js","js/c-QXULUDTG.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
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
