/* 學院學習管理 Service Worker（v73 速度架構）：建置時填入版本與預載清單（scripts/build.mjs）
 *  用途只有一個：把本站靜態殼（index.html、js/、樣式、標誌）放在裝置上，重新開啟不必等網路
 *  快取名稱帶建置版本：新版＝新快取，舊快取在新版啟用時刪除
 *  不經手：資料中心（script.google.com）、Google 登入、字型與其他網域一律不攔截——資料照舊由頁面的 SWR 快取處理，這裡不會把舊回應當新的；
 *          version.json、sw.js、go.html、assets/cards（LINE 圖卡素材）、vendor/、帶 nosw 參數、Range 請求、非 GET 一律直接走網路
 *  新版：install 預載新版殼；不自動接手，等頁面確認沒有編輯中（buildwatch）送 {type:'skip'} 才 skipWaiting；導覽網址 ?v= 不是本版 → 走網路
 *  沒有安裝提示、沒有 manifest、沒有推播
 */
const BUILD = '2026-11-11 21:42';
const SHELL = 'grace-shell-' + BUILD;
const PRECACHE = ["index.html","app-C360926C.css","js/c-QC2B2PCF.js","js/c-O3ULNC4N.js","js/c-SW462NSK.js","js/c-6KYM6TBV.js","js/c-XCLO7X5Y.js","js/c-URAABQIF.js","js/c-A637NC57.js","js/c-5D5EYHKX.js","js/c-FHZWNCQB.js","js/c-XAIDLCUD.js","js/c-2UXSASPL.js","js/c-AQYI7ZKQ.js","js/c-4BCKBZCA.js","js/c-O4EXKAPU.js","js/c-P2GE7NT2.js","js/c-R6XMFPUC.js","js/c-UEM4NDQC.js","js/c-6GOGO7P2.js","js/c-Z72SGQ5M.js","js/c-BJ55KBGI.js","js/c-MA7XELUQ.js","js/c-ZPVTGGU3.js","js/c-4J5C25IY.js","js/c-PGY4YKF5.js","js/c-R42YS2MZ.js","js/c-6WRAD25A.js","js/c-76VKJZQJ.js","js/c-37R4IOPP.js","js/c-JWJXC57O.js","js/c-QUMEJHCE.js","js/c-465J3BFN.js","js/c-4YAYOUPK.js","js/app-G4VKO676.js","js/c-5WRG2OMF.js","js/c-FVBPJXR2.js","js/c-TBM7GWVJ.js","js/c-FR4DJEY3.js","js/c-EZHE7XYL.js","js/c-UJ5XG3HG.js","js/c-FNLWKS4G.js","js/c-RX6YSC6R.js","js/c-NGAV5RMC.js","js/c-7GLYVICV.js","js/c-H2GO6LDY.js","js/c-IIHLOUSG.js","js/c-NON2J2C7.js","js/c-6EX5SOLG.js","js/c-FX2O4IB5.js","js/c-K7JI4ZJR.js","js/c-KYAVALQM.js","js/c-KTYYS34K.js","js/c-JXXK3WCU.js","js/c-SL5CW72D.js","js/c-J57MANPW.js","js/c-LMMZC7TI.js","js/c-L3SRK7NQ.js","js/c-FHNABLHK.js","js/c-ICR5TPHB.js","js/c-VC7P5AMR.js","js/c-KES27VBP.js","js/c-V6577M23.js","js/c-IBBGFP5D.js","js/c-6O4G3XTV.js","js/c-EUFGHZRB.js","js/c-6ZDK5XPD.js","assets/ui/a/logo.png","assets/logo.png"];
const PASS = /^(version\.json|sw\.js|go\.html|robots\.txt)$|^assets\/cards\/|^vendor\//;
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
  if (/^js\/[\w-]+\.js$/.test(rel) || /^app-[0-9A-Z]{8}\.css$/.test(rel) || /^assets\/(ui|lms)\//.test(rel) || rel === 'assets/logo.png') e.respondWith(shell(r, rel));
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
