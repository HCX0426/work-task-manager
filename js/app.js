/* ============ 初始化与 Tab 切换（app.js） ============ */
document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>{
    // 录入/编辑有未保存修改时，切走前先确认（点当前 tab 本身不提示）
    if(formDirty && !$('#tab-entry').classList.contains('hidden') && b.dataset.tab!=='entry'){
      if(!confirm('当前录入/编辑有未保存的修改，切换将丢失。\n仍要切换？')) return;
      formDirty=false;
    }
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['entry','list','config','export','monthly'].forEach(t=>$('#tab-'+t).classList.add('hidden'));
    $('#tab-'+b.dataset.tab).classList.remove('hidden');
    if(b.dataset.tab==='entry'){
      if(editingId){ const tk=tasks.find(x=>x.id===editingId); if(tk)renderEntry({...tk.values, entryDate:tk.entryDate}); else { editingId=null; renderEntry(null); toast('编辑的任务已不存在，已新建'); } }
      else renderEntry(null);
    }
    if(b.dataset.tab==='list')renderList();
    if(b.dataset.tab==='config')renderConfig();
    if(b.dataset.tab==='export'){setDefaultRange();renderPreview();}
    if(b.dataset.tab==='monthly'){ setMonthDefault(); renderMonthly(); }
  };
});

/* 初始化 */
renderEntry(null);
checkBackupReminder();
