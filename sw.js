/* ============ 工作任务管理 Service Worker（离线缓存） ============ */
const CACHE='wb-v1';
const ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './exceljs.min.js',
  './js/store.js',
  './js/entry.js',
  './js/list.js',
  './js/config.js',
  './js/export.js',
  './js/monthly.js',
  './js/dashboard.js',
  './js/app.js'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // 只缓存同源静态资源，不缓存接口/跨域
  if(url.origin!==location.origin)return;
  e.respondWith(
    caches.match(req).then(hit=>{
      if(hit)return hit;
      return fetch(req).then(res=>{
        const copy=res.clone();
        if(res.ok && url.pathname.indexOf('sw.js')<0){
          caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>{
        // 断网时首页兜底
        if(url.pathname.endsWith('/')||url.pathname.endsWith('index.html'))return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
