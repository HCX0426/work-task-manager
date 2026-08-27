/* ============ 初始化与 Tab 切换（app.js） ============ */
/* 深色模式：存 localStorage，切换立即生效 */
function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  const btn=$('#themeToggle');
  if(btn) btn.textContent = dark ? '☀️ 浅色' : '🌙 深色';
  save('wb_theme', dark?'dark':'light');
}
(function(){
  const saved=load('wb_theme','');
  const dark = saved==='dark' || (saved!=='light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark);
  const btn=$('#themeToggle');
  if(btn) btn.onclick=()=>{ applyTheme(document.documentElement.getAttribute('data-theme')!=='dark'); };
})();

/* 全局快捷键：N 录入 / F 搜索 / G 甘特 / K 看板 / C 日历 / H 帮助（输入框内不触发） */
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const tag=e.target&&e.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  const k=e.key.toLowerCase();
  const tab=t=>{ const b=document.querySelector('nav button[data-tab="'+t+'"]'); if(b) b.click(); };
  let handled=true;
  if(k==='n') tab('entry');
  else if(k==='f'){ tab('list'); setTimeout(()=>{ const s=$('#listSearch'); if(s){ s.focus(); s.select(); } },0); }
  else if(k==='g'){ tab('list'); switchView('gantt'); }
  else if(k==='k'){ tab('list'); switchView('kanban'); }
  else if(k==='c'){ tab('list'); switchView('calendar'); }
  else if(k==='h'){ const ov=$('#helpOverlay'); if(ov.classList.contains('hidden')) openHelp(); else closeHelp(); }
  else handled=false;
  if(handled) e.preventDefault();
});

/* PWA：注册 Service Worker（离线可用），仅 https/localhost 生效 */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* 不支持的环境静默跳过 */ });
  });
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
    ['entry','dashboard','list','config','export','monthly'].forEach(t=>$('#tab-'+t).classList.add('hidden'));
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
  if(todo.length>0||overdue.length>0) setTimeout(()=>toast(`今日待推进 ${todo.length} 条，逾期未完成 ${overdue.length} 条（详见「每日录入 → 今日待办」）`),1500);
})();
