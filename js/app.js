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

/* PWA：注册 Service Worker（离线可用），仅 https/localhost 生效 */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* 不支持的环境静默跳过 */ });
  });
}

document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>{
    // 录入/编辑有未保存修改时，切走前先确认（点当前 tab 本身不提示）
    if(formDirty && !$('#tab-entry').classList.contains('hidden') && b.dataset.tab!=='entry'){
      if(!confirm('当前录入/编辑有未保存的修改，切换将丢失。\n仍要切换？')) return;
      formDirty=false;
    }
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['entry','dashboard','list','config','export','monthly'].forEach(t=>$('#tab-'+t).classList.add('hidden'));
    $('#tab-'+b.dataset.tab).classList.remove('hidden');
    if(b.dataset.tab==='entry'){
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
/* 逾期提醒：打开页面时若有逾期未完成，提示 */
(function(){
  const overdue=tasks.filter(t=>{
    if(String(t.values['完成状态']||'')==='Closed')return false;
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    return d && todayStr()>toInputDate(d);
  }).length;
  if(overdue>0) setTimeout(()=>toast(`有 ${overdue} 条任务逾期未完成，可到「任务列表」查看处理`),1500);
})();
