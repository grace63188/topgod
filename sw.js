/* 學院學習管理 Service Worker（v73 速度架構）：建置時填入版本與預載清單（scripts/build.mjs）
 *  用途只有一個：把本站靜態殼（index.html、js/、樣式、標誌）放在裝置上，重新開啟不必等網路
 *  快取名稱帶建置版本：新版＝新快取，舊快取在新版啟用時刪除
 *  不經手：資料中心（script.google.com）、Google 登入、字型與其他網域一律不攔截——資料照舊由頁面的 SWR 快取處理，這裡不會把舊回應當新的；
 *          version.json、sw.js、go.html、assets/cards（LINE 圖卡素材）、vendor/、帶 nosw 參數、Range 請求、非 GET 一律直接走網路
 *  新版：install 預載新版殼；不自動接手，等頁面確認沒有編輯中（buildwatch）送 {type:'skip'} 才 skipWaiting；導覽網址 ?v= 不是本版 → 走網路
 *  v67 主畫面 App：同一個 Service Worker 也處理推播——push 不帶內容 → 以取回金鑰（IndexedDB grace-sw/kv push）呼叫資料中心 lms_push_pull 取回通知顯示；點通知 → 開啟對應頁（#/…）
 *          資料中心的回應只拿來顯示通知，一律不放進快取；manifest.webmanifest、啟動畫面直接走網路
 */
const BUILD = '2026-11-12 01:57';
const SHELL = 'grace-shell-' + BUILD;
const PRECACHE = ["index.html","app-791ABEEC.css","js/c-WPL5XZBY.js","js/c-JFHJRIZV.js","js/c-Y6QV37QF.js","js/c-LIHS5RBX.js","js/c-BNSEQERT.js","js/c-LDJAXA2S.js","js/c-CHXJGZFH.js","js/c-UGH5V5CW.js","js/c-2OYXIWNZ.js","js/c-T72VFSVW.js","js/c-WGLV4AJN.js","js/c-NGDGL474.js","js/c-GU33IU5M.js","js/c-YHKCXJEH.js","js/c-24EGR466.js","js/c-7FLDHDCM.js","js/c-4JNK6H4U.js","js/c-GKW6ZBES.js","js/c-KOUJ2AEB.js","js/c-RZYLHW4K.js","js/c-GDTKAC3M.js","js/c-U3F7UL5Y.js","js/c-WGES3WCR.js","js/c-UQSYYOCQ.js","js/c-BGLAIJXY.js","js/c-5H7TJSBT.js","js/c-SDDMM46I.js","js/c-7QPCJ5GU.js","js/c-M7B6VF55.js","js/c-YH4BDR5B.js","js/c-FH6K6ADK.js","js/c-TB5J5VQW.js","js/c-L6ALISFU.js","js/app-PTQCP77N.js","js/c-YF3JB6A5.js","js/c-FVBPJXR2.js","js/c-TBM7GWVJ.js","js/c-LZJLUCLU.js","js/c-2SOR5DM6.js","js/c-J4TTJQKQ.js","js/c-2ZQORSPQ.js","js/c-EPHHOPM3.js","js/c-OYAM7O5E.js","js/c-PHLMKXJK.js","js/c-K2LO5R3Y.js","js/c-2LYVJFDH.js","js/c-IIHLOUSG.js","js/c-QAY2UZHR.js","js/c-6EX5SOLG.js","js/c-RMRSBM7K.js","js/c-LMQHIZMG.js","js/c-N42MWTBS.js","js/c-GVJQRIBR.js","js/c-JXXK3WCU.js","js/c-SL5CW72D.js","js/c-4PKRTJQU.js","js/c-R47OTGJF.js","js/c-4UNZSDDS.js","js/c-M6HUE74W.js","js/c-RLZJW5D6.js","js/c-SRDEBZ2K.js","js/c-WDAMQX27.js","js/c-TVBTFTQ2.js","js/c-ZOQ6OHE3.js","js/c-6O4G3XTV.js","js/c-SOZDSHOT.js","js/c-6ZDK5XPD.js","assets/ui/a/logo.png","assets/logo.png","assets/pwa/icon-192.png","assets/pwa/badge-96.png"];
const PASS = /^(version\.json|sw\.js|go\.html|robots\.txt|manifest\.webmanifest)$|^assets\/cards\/|^vendor\/|^assets\/pwa\/splash-/;
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* 帶雜湊的檔（內容不變）先從上一版快取搬過來，不重新下載 */
    const olds = (await caches.keys()).filter((k) => k.indexOf('grace-shell-') === 0 && k !== SHELL);
    const reuse = async (u) => { if (!/-[0-9A-Z]{8}\.(js|css)$/.test(u)) return null; for (const k of olds) { const hit = await (await caches.open(k)).match(u); if (hit) return hit; } return null; };
    const one = async (u) => {
      let r = await reuse(u);
      if (!r) r = await fetch(new Request(u, { cache: 'reload' }));
      /* index.html 必須是本版（CDN 尚未更新時再取一次；仍不是 → 安裝失敗，瀏覽器之後再試，舊版照常運作） */
      if (u === 'index.html') {
        let t = r.ok ? await r.clone().text() : '';
        if (t.indexOf(BUILD) < 0) { await new Promise((ok) => setTimeout(ok, 3000)); r = await fetch(new Request(u + '?nosw=' + Date.now(), { cache: 'reload' })); t = r.ok ? await r.clone().text() : ''; }
        if (t.indexOf(BUILD) < 0) throw new Error('index.html 尚未更新到 ' + BUILD);
      }
      if (!r.ok) throw new Error('預載失敗 ' + u + ' HTTP ' + r.status);
      await c.put(u, r);
    };
    /* 一次 6 個，不把連線佔滿 */
    const q = PRECACHE.slice(); const run = async () => { while (q.length) await one(q.shift()); };
    await Promise.all([run(), run(), run(), run(), run(), run()]);
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.indexOf('grace-shell-') === 0 && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'skip') self.skipWaiting();
  if (d.type === 'build' && e.ports && e.ports[0]) e.ports[0].postMessage({ type: 'build', build: BUILD });
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== SCOPE.origin || u.pathname.indexOf(SCOPE.pathname) !== 0) return;
  const rel = u.pathname.slice(SCOPE.pathname.length);
  if (PASS.test(rel) || u.searchParams.has('nosw')) return;
  if (r.mode === 'navigate') { if (rel === '' || rel === 'index.html') e.respondWith(nav(r, u)); return; }
  if (/^js\/[\w-]+\.js$/.test(rel) || /^app-[0-9A-Z]{8}\.css$/.test(rel) || /^assets\/(ui|lms)\//.test(rel) || rel === 'assets/logo.png' || /^assets\/pwa\/(icon-192|badge-96)\.png$/.test(rel)) e.respondWith(shell(r, rel));
});
/** 導覽：本版殼（不等網路）；網址指定其他版本（新版接手）→ 走網路 */
async function nav(req, u) {
  const v = u.searchParams.get('v');
  if (v && v !== BUILD.replace(/\D/g, '')) { try { return await fetch(req); } catch (e) { /* 離線：退回本版 */ } }
  const hit = await caches.match('index.html', { cacheName: SHELL });
  if (hit) return hit;
  return fetch(req);
}
/** 靜態檔：本版快取優先；沒有 → 網路並存入本版快取 */
async function shell(req, rel) {
  const c = await caches.open(SHELL), hit = await c.match(rel);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic') c.put(rel, r.clone()).catch(() => {});
  return r;
}

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
const ICON = 'assets/pwa/icon-192.png', BADGE = 'assets/pwa/badge-96.png';
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
