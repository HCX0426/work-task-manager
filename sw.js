/* ============ 工作任务管理 Service Worker（离线 + 自动更新） ============ */
/* 更新策略：
   - 业务资源（index.html + js/*）→ 网络优先（绕过HTTP缓存强制走网络）：每次打开都拉最新代码，自动更新生效；断网回退缓存
   - 大文件/静态资源（exceljs.min.js、manifest、icon）→ 缓存优先：避免每次下载拖慢启动 */
/* 版本单一事实来源：sw 缓存键、manifest.json version、CHANGELOG 三处须与本常量保持一致（无构建步骤，写死一处供引用） */
const APP_VERSION='1.0.7';
const CACHE='wb-'+APP_VERSION;
/* 资源清单：须与 index.html 底部 <script defer> 列表保持一致，新增/重命名 js 须同步此处，否则离线时该文件 404 */
const ASSETS=[
  './',
  './index.html',
  './styles.css',
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
  './js/help.js',
  './js/app.js'
];
/* 网络优先的业务资源（经常更新，绕过 HTTP 缓存强制取最新） */
function isAppCode(pathname, req){
  // 页面导航请求统一走网络优先（覆盖 GitHub Pages 根路径 /work-task-manager/ 这类带路径的裸 URL）
  if(req && req.mode==='navigate') return true;
  // /js/*.js 用正则而非从 ASSETS 推导（刻意取舍）：正则让「新增 js 忘记登记 ASSETS」的文件仍走网络优先并在成功后回填缓存；
  //  若改为推导式，漏登记文件会被降级为 stale-while-revalidate，离线兜底反而变弱
  return pathname==='/' || pathname.endsWith('index.html') || /\/js\/[^/]+\.js$/.test(pathname);
}
/* 缓存优先的资源（大文件/极少变） */
function isHeavyStatic(pathname){
  return pathname.endsWith('exceljs.min.js') || pathname.endsWith('manifest.json') || pathname.endsWith('icon.svg');
}
/* 统一缓存写入：克隆响应落盘，失败仅告警不静默 */
function putCache(req, res){
  if(!res || !res.ok) return Promise.resolve();
  return caches.open(CACHE).then(c=>c.put(req, res.clone())).catch(err=>console.warn('[SW] 缓存写入失败', req.url, err));
}
self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // 逐个请求并绕过 HTTP 缓存，确保预缓存的是最新文件
    await Promise.all(ASSETS.map(async url=>{
      try{
        const res=await fetch(url,{cache:'reload'});
        if(res.ok) await cache.put(url,res.clone());
      }catch(err){ console.warn('[SW] 预缓存失败（离线时该资源将不可用）', url, err); }
    }));
  })().then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  const path=url.pathname;
  if(isAppCode(path, req)){
    // 网络优先：绕过HTTP缓存强制拿最新，失败回退缓存
    e.respondWith(
      fetch(req,{cache:'reload'}).then(res=>{
        const copy=res.clone();
        if(res.ok){ putCache(req,copy); }
        return res;
      }).catch(()=>{
        // HTML 导航（含带 query）统一兜底到 index.html；js 兜底到自身缓存
        const isHtml=path==='/'||path.endsWith('index.html')||(req.headers.get('accept')||'').indexOf('text/html')>=0;
        return (isHtml?caches.match('./index.html'):caches.match(req)).then(hit=>hit||(isHtml?Response.error():caches.match('./index.html')));
      })
    );
    return;
  }
  if(isHeavyStatic(path)){
    // 缓存优先：命中直接返回，未命中再请求并缓存
    e.respondWith(
      caches.match(req).then(hit=>hit||fetch(req).then(res=>{
        const copy=res.clone();
        if(res.ok){ putCache(req,copy); }
        return res;
      }))
    );
    return;
  }
  // 其他同源资源：stale-while-revalidate
  e.respondWith(
    caches.match(req).then(hit=>{
      const net=fetch(req,{cache:'reload'}).then(res=>{
        const copy=res.clone();
        if(res.ok){ putCache(req,copy); }
        return res;
      }).catch(()=>hit);
      return hit||net;
    })
  );
});
