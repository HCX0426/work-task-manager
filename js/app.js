/* ============ 初始化与 Tab 切换（app.js） ============ */
document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['entry','list','config','export','monthly'].forEach(t=>$('#tab-'+t).classList.add('hidden'));
    $('#tab-'+b.dataset.tab).classList.remove('hidden');
    if(b.dataset.tab==='list')renderList();
    if(b.dataset.tab==='config')renderConfig();
    if(b.dataset.tab==='export'){setDefaultRange();renderPreview();}
    if(b.dataset.tab==='monthly'){ setMonthDefault(); renderMonthly(); }
  };
});

/* 初始化 */
renderEntry(null);
checkBackupReminder();
