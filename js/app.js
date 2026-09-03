/* ============ 初始化与 Tab 切换（app.js） ============ */
const SW_PATH='sw.js'; // Service Worker 注册路径（与仓库根 sw.js 一致；避免散落裸写相对路径）
/* 全局错误捕获（#30）：PWA 离线场景下用户侧异常不可见，统一收集到内存队列，便于排查 */
const ERROR_LOG=[];
function pushError(msg, src){
  try{ ERROR_LOG.push({t:new Date().toISOString(), msg:String(msg||''), src:src||''}); if(ERROR_LOG.length>50) ERROR_LOG.shift(); }catch(e){}
}
window.addEventListener('error', e=>{
  const m=e&&e.error?(e.error.stack||e.error.message):(e.message||'未知错误');
  pushError(m, e.filename?(e.filename+':'+e.lineno):'window.error');
  if(typeof toast==='function') toast('出现异常（已记录，可到配置页查看）');
});
window.addEventListener('unhandledrejection', e=>{
  const r=e&&e.reason;
  pushError(r&&(r.stack||r.message)?(r.stack||r.message):String(r||'未处理的 Promise 拒绝'), 'unhandledrejection');
  if(typeof toast==='function') toast('操作未完成（已记录异常）');
});
window.ERROR_LOG=ERROR_LOG;
/* 深色模式：存 localStorage，切换立即生效（键名统一用 store.js 的 LS_THEME 单一事实来源） */
function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  const btn=$('#themeToggle');
  if(btn) btn.textContent = dark ? '☀️ 浅色' : '🌙 深色';
  save(LS_THEME, dark?'dark':'light');
}
(function(){
  const saved=load(LS_THEME,'');
  const dark = saved==='dark' || (saved!=='light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark);
  const btn=$('#themeToggle');
  if(btn) btn.onclick=()=>{ applyTheme(document.documentElement.getAttribute('data-theme')!=='dark'); };
})();

/* 全局快捷键映射（便于将来做键位设置）：key → 动作。
   tab=切到某 tab；view=切换列表视图；focus=聚焦某输入框；help=开关帮助层 */
const HOTKEY_MAP={
  n:{tab:'entry'},
  f:{tab:'list', focus:'#listSearch'},
  g:{tab:'list', view:'gantt'},
  k:{tab:'list', view:'kanban'},
  c:{tab:'list', view:'calendar'},
  h:{help:true}
};
function switchTabByName(t){ const b=document.querySelector('nav button[data-tab="'+t+'"]'); if(b) b.click(); }
/* 全局快捷键：N 录入 / F 搜索 / G 甘特 / K 看板 / C 日历 / H 帮助（输入框内不触发） */
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const tag=e.target&&e.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  const act=HOTKEY_MAP[e.key.toLowerCase()];
  if(!act) return;
  e.preventDefault();
  if(act.help){ const ov=$('#helpOverlay'); if(ov.classList.contains('hidden')) openHelp(); else closeHelp(); return; }
  if(act.tab) switchTabByName(act.tab);
  if(act.view) switchView(act.view);
  if(act.focus){ setTimeout(()=>{ const s=$(act.focus); if(s){ s.focus(); s.select(); } },0); }
});

/* PWA：注册 Service Worker（离线可用），仅 https/localhost 生效 */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register(SW_PATH).catch(()=>{ /* 不支持的环境静默跳过 */ });
  });
  /* 已被旧 SW 控制的页面：新版本激活接管（controllerchange）时自动刷新，让开了很久的旧标签页也强制拿到最新代码。
     首次访问（无旧控制器）不触发，避免多刷新一次。 */
  if(navigator.serviceWorker.controller){
    navigator.serviceWorker.addEventListener('controllerchange', ()=>location.reload());
  }
}

document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>{
    const wasOnEntry=!$('#tab-entry').classList.contains('hidden');
    // 录入/编辑有未保存修改时，切走前先确认（点当前 tab 本身不提示）
    if(formDirty && wasOnEntry && b.dataset.tab!=='entry'){
      if(!confirm('当前录入/编辑有未保存的修改，切换将丢失。\n仍要切换？')) return;
      formDirty=false;
    }
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('nav button[data-tab]').forEach(b=>{ const el=$('#tab-'+b.dataset.tab); if(el) el.classList.add('hidden'); });
    $('#tab-'+b.dataset.tab).classList.remove('hidden');
    if(b.dataset.tab==='entry'){
      // 已在录入页且表单有未保存修改时，再点「每日录入」先确认，避免误丢
      if(wasOnEntry && formDirty && !confirm('录入页有未保存的修改，重载将丢弃。\n仍要重载？')) return;
      if(editingId){ const tk=tasks.find(x=>x.id===editingId); if(tk)renderEntry({...tk.values, entryDate:tk.entryDate}); else { editingId=null; renderEntry(null); toast('编辑的任务已不存在，已新建'); } }
      else renderEntry(null);
    }
    if(b.dataset.tab==='dashboard')renderDashboard();
    if(b.dataset.tab==='list')renderList();
    if(b.dataset.tab==='config')renderConfig();
    if(b.dataset.tab==='export'){ if(!$('#rangeStart').value)setDefaultRange(); renderPreview(); }
    if(b.dataset.tab==='monthly'){ if(!$('#monthPick').value)setMonthDefault(); renderMonthly(); }
  };
});

/* 初始化 */
renderEntry(null);
checkBackupReminder();
/* 待办提醒：打开页面时提示今日待推进与逾期数量（直接复用 todayTasks，避免重复口径逻辑） */
(function(){
  const {todo, overdue}=todayTasks();
  if(todo.length>0||overdue.length>0) setTimeout(()=>toast(`今日待推进 ${todo.length} 条，逾期未完成 ${overdue.length} 条（详见「每日录入 → 今日待办」）`),BOOT_TOAST_DELAY_MS);
})();
