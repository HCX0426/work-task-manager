/* ============ 任务列表（list.js） ============ */
function populateCustFilter(){
  const sel=$('#listCustFilter'); if(!sel)return;
  const opts=new Set((dropdowns['客户']||[]));
  tasks.forEach(t=>{ if(t.values['客户'])opts.add(t.values['客户']); });
  const cur=sel.value;
  sel.innerHTML='<option value="">全部客户</option>'+[...opts].map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
  sel.value=cur;
}

function populateStatusFilter(){
  const sel=$('#listStatusFilter'); if(!sel)return;
  const known=new Set((dropdowns['完成状态']||[]));
  tasks.forEach(t=>{ const v=String(t.values['完成状态']||'').trim(); if(v)known.add(v); });
  const cur=sel.value;
  sel.innerHTML='<option value="">全部状态</option><option value="__not_closed">未完成</option>'
    +[...known].map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
  sel.value=cur;
}

/* F. 统计看板 */
function renderStats(){
  const total=tasks.length;
  const now=new Date(); const y=now.getFullYear(),m=now.getMonth()+1;
  const today=todayStr();
  const monthTasks=tasks.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d.getFullYear()===y&&d.getMonth()+1===m;});
  const closed=monthTasks.filter(t=>String(t.values['完成状态']||'')==='Closed').length;
  const rate=monthTasks.length?Math.round(closed/monthTasks.length*100):0;
  const exported=tasks.filter(t=>t.exported).length;
  // 逾期未完成：有提出/开发日期且早于今天，且完成状态不是 Closed
  const overdue=tasks.filter(t=>{
    if(String(t.values['完成状态']||'')==='Closed')return false;
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    return d && todayStr()>toInputDate(d);
  }).length;
  // 按客户分组完成率
  const byCust={};
  tasks.forEach(t=>{
    const c=(t.values['客户']||'').trim()||'未填';
    (byCust[c]=byCust[c]||{total:0,closed:0});
    byCust[c].total++;
    if(String(t.values['完成状态']||'')==='Closed')byCust[c].closed++;
  });
  const custRows=Object.keys(byCust).sort().map(c=>{
    const {total,closed}=byCust[c];
    const r=Math.round(closed/total*100);
    return `<div class="cust-row"><span class="cust-name">${esc(c)}</span><div class="cust-bar"><i style="width:${r}%"></i></div><span class="cust-rate">${r}%</span><span class="cust-n muted">${closed}/${total}</span></div>`;
  }).join('');
  $('#statsStrip').innerHTML=`
    <div class="stat"><div class="num">${total}</div><div class="lab">任务总数</div></div>
    <div class="stat"><div class="num">${monthTasks.length}</div><div class="lab">本月任务</div></div>
    <div class="stat"><div class="num">${rate}%</div><div class="lab">本月完成率</div></div>
    <div class="stat${overdue?' warn':''}"><div class="num">${overdue}</div><div class="lab">逾期未完成</div></div>
    <div class="stat"><div class="num">${exported}</div><div class="lab">已追加</div></div>
    <div class="stat"><div class="num">${trash.length}</div><div class="lab">回收站</div></div>`;
  // 同步顶部「回收站 (N)」按钮计数（删除/恢复后立即刷新，无需展开面板）
  $('#trashCount').textContent=trash.length;
  $('#custStats').innerHTML = custRows?`<div class="cust-title muted">按客户完成率</div>${custRows}`:'';
  // 状态分布条
  const dist={};
  tasks.forEach(t=>{ const s=String(t.values['完成状态']||'').trim()||'未填'; dist[s]=(dist[s]||0)+1; });
  const distTotal=tasks.length||1;
  const distHtml=Object.keys(dist).map(s=>{
    const n=dist[s], pct=Math.round(n/distTotal*100);
    return `<div class="dist-row"><span class="dist-name">${esc(s)}</span><div class="dist-bar"><i style="width:${pct}%"></i></div><span class="dist-n">${n}（${pct}%）</span></div>`;
  }).join('');
  $('#statusDist').innerHTML = tasks.length?`<div class="cust-title muted">按完成状态分布</div>${distHtml}`:'';
}

function renderList(){
  populateCustFilter();
  populateStatusFilter();
  renderStats();
  const q=$('#listSearch').value.trim().toLowerCase();
  const cf=$('#listCustFilter').value;
  const sf=$('#listStatusFilter').value;
  const ef=$('#listExportFilter').value;
  const sortBy=$('#listSortBy') ? $('#listSortBy').value : 'devDate';
  const sortDir=$('#listSortDir') ? $('#listSortDir').value : 'desc';
  let list=tasks.slice();
  // 排序：依据 + 方向（空值排最后）
  const sortKey=t=>{
    if(sortBy==='status') return String(t.values['完成状态']||'');
    if(sortBy==='cust') return String(t.values['客户']||'');
    if(sortBy==='devDate') return String(t.values['开发日期']||'');
    return String(t.entryDate||'');
  };
  list.sort((a,b)=>{ const r=sortKey(a).localeCompare(sortKey(b)); return sortDir==='desc'?-r:r; });
  if(q)list=list.filter(t=>Object.values(t.values).some(v=>String(v).toLowerCase().includes(q)));
  if(cf)list=list.filter(t=>(t.values['客户']||'')===cf);
  if(sf==='__not_closed')list=list.filter(t=>String(t.values['完成状态']||'')!=='Closed');
  else if(sf)list=list.filter(t=>(t.values['完成状态']||'')===sf);
  if(ef==='exported')list=list.filter(t=>t.exported);
  else if(ef==='not_exported')list=list.filter(t=>!t.exported);
  $('#listCount').textContent='（共 '+tasks.length+' 条'+( (q||cf||sf||ef)?'，筛选后 '+list.length+' 条':'')+'）';
  const wrap=$('#taskTableWrap');
  const batchOn = $('#batchToggle') && $('#batchToggle').classList.contains('active');
  if(!list.length){wrap.innerHTML='<p class="muted">没有任务（'+(tasks.length?'没有匹配的':'去「每日录入」添加')+'）。</p>';return;}
  const cols=schema.filter(c=>c.type!=='auto').map(c=>c.name);
  let h='<div class="task-list'+(batchOn?' list-batch':'')+'">';
  list.forEach(t=>{
    const done=String(t.values['完成状态']||'')==='Closed';
    const checked=window.__batchSel && window.__batchSel.has(t.id)?'checked':'';
    h+=`<div class="task-card${done?' done':''}" data-id="${t.id}">
      ${batchOn?`<label class="tcheck-wrap"><input type="checkbox" class="tcheck" data-id="${t.id}" ${checked}></label>`:''}
      <div class="tc-date">📅 ${t.entryDate}${t.exported?'<span class="tc-exported">已追加</span>':''}</div>
      <div class="tc-actions">
        <button class="btn sec sm" data-edit="${t.id}">编辑</button>
        <button class="btn del sm" data-del="${t.id}">删除</button>
      </div>
      <div class="tc-fields">`;
    cols.forEach(c=>{
      let v=t.values[c]||'';
      const empty=!String(v).trim();
      h+=`<div class="tc-row"><span class="tc-k">${esc(c)}</span><span class="tc-v${empty?' empty':''}">${empty?'未填':esc(v).replace(/\n/g,'<br>')}</span></div>`;
    });
    h+='</div></div>';
  });
  h+='</div>';wrap.innerHTML=h;
  wrap.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
    if(!confirm('删除这条任务？将移入回收站（可恢复）。'))return;
    const i=tasks.findIndex(t=>t.id===b.dataset.del);
    if(i>=0){trash.push(tasks[i]);trimTrash();tasks.splice(i,1);save(LS_TASKS,tasks);save(LS_TRASH,trash);renderList();toast('已移入回收站');}
  });
  wrap.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const tk=tasks.find(x=>x.id===b.dataset.edit); if(!tk)return;
    editingId=tk.id;
    document.querySelector('nav button[data-tab="entry"]').click();
    renderEntry({...tk.values, entryDate:tk.entryDate});
    window.scrollTo(0,0);
  });
  wrap.querySelectorAll('.tcheck').forEach(c=>c.onchange=()=>{
    window.__batchSel=window.__batchSel||new Set();
    if(c.checked)window.__batchSel.add(c.dataset.id); else window.__batchSel.delete(c.dataset.id);
  });
}

/* D. 批量模式 */
$('#batchToggle').onclick=()=>{
  $('#batchToggle').classList.toggle('active');
  $('#batchBar').classList.toggle('hidden');
  if(!$('#batchToggle').classList.contains('active')) { window.__batchSel=new Set(); }
  renderList();
};
$('#batchAll').onclick=()=>{
  const on=$('#batchAll').textContent==='全选';
  document.querySelectorAll('.tcheck').forEach(c=>{c.checked=on;c.onchange();});
  $('#batchAll').textContent = on?'取消全选':'全选';
};
/* 批量导出选中任务为 Excel（按配置中心列顺序） */
$('#batchExport').onclick=async ()=>{
  const ids=[...document.querySelectorAll('.tcheck:checked')].map(c=>c.dataset.id);
  if(!ids.length){toast('请先勾选任务');return;}
  const sel=tasks.filter(t=>ids.includes(t.id));
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('选中任务');
  const cols=schema;
  const hrow=ws.getRow(1);
  cols.forEach((c,i)=>{ const cell=hrow.getCell(i+1); cell.value=c.name; styleCell(cell); });
  sel.forEach(t=>{
    const values=cols.map(c=>{
      if(c.type==='auto') return '';
      let v=t.values[c.name]||'';
      if(c.type==='date'){ const dt=parseDateAny(v); v=dt?fmtDateCN(dt):v; }
      return v;
    });
    const row=ws.addRow(values);
    row.eachCell(cell=>{ styleCell(cell); });
  });
  const out=await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([out],{type:'application/octet-stream'}),'选中任务_'+todayStr()+'.xlsx');
  toast('已导出选中 '+sel.length+' 条');
};
$('#batchDelete').onclick=()=>{
  const ids=[...document.querySelectorAll('.tcheck:checked')].map(c=>c.dataset.id);
  if(!ids.length){toast('请先勾选任务');return;}
  if(!confirm('将选中的 '+ids.length+' 条移入回收站？'))return;
  ids.forEach(id=>{const i=tasks.findIndex(t=>t.id===id);if(i>=0){trash.push(tasks[i]);tasks.splice(i,1);}});
  trimTrash();save(LS_TASKS,tasks);save(LS_TRASH,trash);window.__batchSel=new Set();renderList();toast('已移入回收站 '+ids.length+' 条');
};
/* 批量补录结案日期后，联动回填开发天数（开发日期~结案日期含首尾） */
function autoCalcDays(t){
  const d1=parseDateAny(t.values['开发日期']), d2=parseDateAny(t.values['结案日期']);
  if(d1&&d2){ const diff=Math.round((d2-d1)/86400000)+1; if(diff>=1) t.values['开发天数']=diff+'天'; }
}
$('#batchApply').onclick=()=>{
  const ids=[...document.querySelectorAll('.tcheck:checked')].map(c=>c.dataset.id);
  if(!ids.length){toast('请先勾选任务');return;}
  const test=$('#batchTest').value, close=$('#batchClose').value, st=$('#batchStatus').value;
  if(!test && !close && !st){toast('请填写要补的日期或状态');return;}
  ids.forEach(id=>{const t=tasks.find(x=>x.id===id);if(t){if(test)t.values['测试日期']=test;if(close){t.values['结案日期']=close;autoCalcDays(t);}if(st)t.values['完成状态']=st;}});
  save(LS_TASKS,tasks);renderList();toast('已批量补录 '+ids.length+' 条');
};

/* E. 回收站（软删除恢复） */
$('#toggleTrash').onclick=()=>{
  const p=$('#trashPanel'); p.classList.toggle('hidden');
  if(!p.classList.contains('hidden')) renderTrash();
};
$('#clearTrash').onclick=()=>{
  if(!trash.length){toast('回收站已空');return;}
  if(confirm('彻底清空回收站？不可恢复。')){ trash=[]; save(LS_TRASH,trash); renderTrash(); renderList(); toast('已清空回收站'); }
};
function renderTrash(){
  const wrap=$('#trashList');
  $('#trashCount').textContent=trash.length;
  if(!trash.length){wrap.innerHTML='<p class="muted">回收站为空。</p>';return;}
  let h='<div class="task-list">';
  trash.slice().reverse().forEach(t=>{
    h+=`<div class="task-card" data-id="${t.id}">
      <div class="tc-date">📅 ${t.entryDate} <span class="tc-exported">已删除</span></div>
      <div class="tc-actions">
        <button class="btn sec sm" data-restore="${t.id}">恢复</button>
        <button class="btn del sm" data-purge="${t.id}">彻底删除</button>
      </div>
      <div class="tc-fields">
        <div class="tc-row"><span class="tc-k">专案</span><span class="tc-v">${esc(t.values['专案名称']||'未填')}</span></div>
        <div class="tc-row"><span class="tc-k">需求</span><span class="tc-v">${esc(t.values['需求说明']||'').replace(/\n/g,'<br>')}</span></div>
      </div></div>`;
  });
  h+='</div>';wrap.innerHTML=h;
  wrap.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{
    const i=trash.findIndex(x=>x.id===b.dataset.restore);
    if(i>=0){tasks.push(trash[i]);trash.splice(i,1);save(LS_TASKS,tasks);save(LS_TRASH,trash);renderTrash();renderList();toast('已恢复');}
  });
  wrap.querySelectorAll('[data-purge]').forEach(b=>b.onclick=()=>{
    if(confirm('彻底删除，不可恢复？')){trash=trash.filter(x=>x.id!==b.dataset.purge);save(LS_TRASH,trash);renderTrash();renderList();toast('已彻底删除');}
  });
}

$('#listSearch').oninput=renderList;
$('#listCustFilter').onchange=renderList;
$('#listStatusFilter').onchange=renderList;
$('#listExportFilter').onchange=renderList;
$('#listSortBy').onchange=renderList;
$('#listSortDir').onchange=renderList;
/* 初始化列表排序（依据/方向）为配置中心默认值 */
(function(){ const st=loadSettings(); const b=$('#listSortBy'); if(b) b.value=st.listSortBy; const d=$('#listSortDir'); if(d) d.value=st.listSortDir; })();
$('#clearTasks').onclick=()=>{ if(confirm('确定清空全部任务库和回收站？建议先导出备份。')){tasks=[];trash=[];save(LS_TASKS,tasks);save(LS_TRASH,trash);renderList();toast('已清空');} };
$('#undoLastExport').onclick=()=>{
  if(!lastExportedIds.length){toast('当前没有可撤销的「本次追加」记录');return;}
  const n=lastExportedIds.length;
  tasks.forEach(t=>{ if(lastExportedIds.includes(t.id)) t.exported=false; });
  save(LS_TASKS,tasks); lastExportedIds=[]; renderList(); toast('已撤销本次追加 '+n+' 条');
};
$('#undoExported').onclick=()=>{
  const n=tasks.filter(t=>t.exported).length;
  if(!n){toast('当前没有已标记「已追加」的任务');return;}
  if(!confirm('将撤销 '+n+' 条任务的「已追加」标记，之后导出追加会重新包含它们。继续？'))return;
  tasks.forEach(t=>{t.exported=false;});
  save(LS_TASKS,tasks); renderList(); toast('已撤销 '+n+' 条「已追加」标记');
};
/* 一键全量备份：任务库+回收站+列配置+下拉+导出默认设置 */
$('#exportAll').onclick=()=>{
  downloadJSON({type:'wb_full', tasks, trash, schema, dropdowns, settings:loadSettings()}, '周报全量备份_'+todayStr()+'.json');
  markBackup(); toast('已导出全量备份');
};
$('#importAll').onclick=()=>$('#importAllFile').click();
$('#importAllFile').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(d.type!=='wb_full' || !Array.isArray(d.tasks)) throw new Error('不是有效的全量备份文件');
      if(!Array.isArray(d.schema) || !d.schema.length) throw new Error('备份缺少列配置');
      if(!confirm('将恢复备份中的全部数据（任务库/回收站/列配置/下拉/导出设置），当前数据会被覆盖。\n建议先「全量备份」当前数据。\n仍要恢复？')) return;
      tasks=d.tasks.filter(t=>t&&typeof t==='object').map(t=>({id:String(t.id), entryDate:String(t.entryDate), values:(t.values&&typeof t.values==='object')?t.values:{}, exported:!!t.exported}));
      trash=Array.isArray(d.trash)?d.trash:[];
      schema=d.schema.map(c=>({name:String(c.name), type:String(c.type||'text'), def:String(c.def||'')}));
      dropdowns=(d.dropdowns&&typeof d.dropdowns==='object')?d.dropdowns:{};
      save(LS_TASKS,tasks); save(LS_TRASH,trash); save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns);
      if(d.settings && typeof d.settings==='object') save(LS_EXPORTCFG,d.settings);
      renderList(); renderEntry(null); toast('已恢复全量备份');
    }catch(err){ toast('恢复失败：'+err.message); }
  };
  r.readAsText(f); e.target.value='';
};
/* 一键加密备份 / 恢复（AES-256 本地加密，密码不落盘） */
$('#encryptBackup').onclick=async ()=>{
  if(!cryptoAvailable()){ toast('当前环境不支持加密（需 https 或 localhost）'); return; }
  const pwd=await uiPrompt('设置加密备份的密码（用于以后恢复，请牢记）：');
  if(pwd==null) return;
  if(!pwd.trim()){ toast('密码不能为空'); return; }
  const pwd2=await uiPrompt('再次输入密码确认：');
  if(pwd2!==pwd){ toast('两次密码不一致，已取消'); return; }
  const obj={type:'wb_full', tasks, trash, schema, dropdowns, settings:loadSettings()};
  try{
    const enc=await encryptBackupJSON(obj, pwd);
    downloadBlob(new Blob([enc],{type:'application/json'}), '周报加密备份_'+todayStr()+'.wbe');
    markBackup(); toast('已导出加密备份（.wbe）');
  }catch(err){ toast('加密失败：'+err.message); }
};
$('#restoreEncBackup').onclick=()=>$('#restoreEncFile').click();
$('#restoreEncFile').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=async ()=>{
    const pwd=await uiPrompt('输入该加密备份的密码：');
    if(pwd==null){ e.target.value=''; return; }
    try{
      if(!cryptoAvailable()) throw new Error('当前环境不支持解密（需 https 或 localhost）');
      const d=await decryptBackupJSON(r.result, pwd);
      if(d.type!=='wb_full' || !Array.isArray(d.tasks)) throw new Error('不是有效的全量备份');
      if(!Array.isArray(d.schema) || !d.schema.length) throw new Error('备份缺少列配置');
      if(!confirm('将恢复加密备份中的全部数据（任务库/回收站/列配置/下拉/导出设置），当前数据会被覆盖。\n建议先「全量备份」当前数据。\n仍要恢复？')) return;
      tasks=d.tasks.filter(t=>t&&typeof t==='object').map(t=>({id:String(t.id), entryDate:String(t.entryDate), values:(t.values&&typeof t.values==='object')?t.values:{}, exported:!!t.exported}));
      trash=Array.isArray(d.trash)?d.trash:[];
      schema=d.schema.map(c=>({name:String(c.name), type:String(c.type||'text'), def:String(c.def||'')}));
      dropdowns=(d.dropdowns&&typeof d.dropdowns==='object')?d.dropdowns:{};
      save(LS_TASKS,tasks); save(LS_TRASH,trash); save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns);
      if(d.settings && typeof d.settings==='object') save(LS_EXPORTCFG,d.settings);
      renderList(); renderEntry(null); toast('已恢复加密备份');
    }catch(err){ toast('恢复失败：'+err.message); }
  };
  r.readAsText(f); e.target.value='';
};
$('#exportTasks').onclick=()=>{ downloadJSON({tasks},'周报任务库备份.json'); markBackup(); toast('任务库已备份'); };
/* 导出 CSV：带表头 + BOM（防中文乱码），Excel/WPS 可直接打开 */
$('#exportCsv').onclick=()=>{
  if(!tasks.length){toast('没有任务可导出');return;}
  const cols=schema.filter(c=>c.type!=='auto').map(c=>c.name);
  const escCsv=s=>{ s=String(s==null?'':s); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const rows=[['录入日期',...cols].join(',')];
  tasks.forEach(t=>{ rows.push([escCsv(t.entryDate),...cols.map(c=>escCsv(t.values[c]||''))].join(',')); });
  const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  downloadBlob(blob,'周报任务库_'+todayStr()+'.csv');
  toast('已导出CSV');
};
let importMode='overwrite';
$('#importTasks').onclick=()=>{ importMode='overwrite'; $('#importTasksFile').click(); };
$('#mergeTasks').onclick=()=>{ importMode='merge'; $('#importTasksFile').click(); };
$('#importTasksFile').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d.tasks || !Array.isArray(d.tasks)) throw new Error('缺少有效的 tasks 数组');
      // 验证每个任务的结构
      const validTasks = d.tasks.map(t=>{
        if(typeof t!=='object' || !t.id) throw new Error('任务缺少 id 字段');
        if(typeof t!=='object' || !t.entryDate) throw new Error('任务缺少 entryDate 字段');
        const values={};
        if(t.values && typeof t.values==='object'){
          Object.entries(t.values).forEach(([k,v])=>{
            values[String(k)]=String(v||'');
          });
        }
        return {
          id:String(t.id),
          entryDate:String(t.entryDate),
          values,
          exported:!!t.exported
        };
      });
      if(importMode==='merge'){
        // 合并：备份中有而本地没有的任务加入；两边都有的保留本地
        const map=new Map(tasks.map(t=>[t.id,t]));
        validTasks.forEach(t=>{ if(!map.has(t.id)) map.set(t.id,t); });
        tasks=[...map.values()];
        save(LS_TASKS,tasks);renderList();toast('合并导入完成，现有 '+tasks.length+' 条');
      }else{
        if(confirm(`导入将覆盖当前全部 ${tasks.length} 条任务数据，且不可撤销。\n建议先「导出任务库(备份)」。\n仍要导入？`)){
          tasks=validTasks;save(LS_TASKS,tasks);renderList();toast('任务库已导入');
        }
      }
    }catch(err){toast('导入失败：'+err.message);}
  };
  r.readAsText(f);e.target.value='';
};

/* ============ 甘特图视图 ============ */
let currentView = 'card';

function switchView(view){
  currentView = view;
  const cardBtn = $('#viewCard');
  const ganttBtn = $('#viewGantt');
  const cardContainer = $('#viewCardContainer');
  const ganttContainer = $('#viewGanttContainer');
  
  if(view === 'gantt'){
    cardBtn.classList.remove('active');
    ganttBtn.classList.add('active');
    cardContainer.classList.add('hidden');
    ganttContainer.classList.remove('hidden');
    renderGantt();
  } else {
    ganttBtn.classList.remove('active');
    cardBtn.classList.add('active');
    ganttContainer.classList.add('hidden');
    cardContainer.classList.remove('hidden');
    renderList();
  }
}

function renderGantt(){
  const chart = $('#ganttChart');
  if(!tasks.length){
    chart.innerHTML = '<div class="gantt-empty">暂无任务数据</div>';
    return;
  }
  
  // 计算日期范围
  const rangeSel = $('#ganttRange').value;
  const today = new Date();
  let minDate, maxDate;
  
  if(rangeSel === 'all'){
    const dates = [];
    tasks.forEach(t => {
      const start = parseDateAny(t.values['开发日期']) || parseDateAny(t.values['提出日期']);
      const end = parseDateAny(t.values['结案日期']) || start;
      if(start) dates.push(start);
      if(end) dates.push(end);
    });
    if(!dates.length){ dates.push(today); }
    minDate = new Date(Math.min(...dates));
    maxDate = new Date(Math.max(...dates));
  } else if(rangeSel === '30'){
    minDate = new Date(today.getTime() - 15 * 86400000);
    maxDate = new Date(today.getTime() + 45 * 86400000);
  } else if(rangeSel === '90'){
    minDate = new Date(today.getTime() - 30 * 86400000);
    maxDate = new Date(today.getTime() + 60 * 86400000);
  } else { // year
    const y = today.getFullYear();
    minDate = new Date(y, 0, 1);
    maxDate = new Date(y, 11, 31);
  }
  
  // 扩展范围确保显示完整
  minDate = new Date(minDate.getTime() - 3 * 86400000);
  maxDate = new Date(maxDate.getTime() + 3 * 86400000);
  
  const totalDays = Math.ceil((maxDate - minDate) / 86400000) + 1;
  const dayWidth = 14; // 每天14px
  const timelineWidth = totalDays * dayWidth;
  
  // 构建时间轴表头（按周分组）
  let headerHtml = '<div class="gantt-header-row"><div class="gantt-label-col">任务 / 日期</div><div class="gantt-timeline">';
  let weekStart = new Date(minDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // 周一
  let cursor = new Date(weekStart);
  while(cursor <= maxDate){
    const weekEnd = new Date(cursor.getTime() + 6 * 86400000);
    const wStart = cursor < minDate ? minDate : cursor;
    const wEnd = weekEnd > maxDate ? maxDate : weekEnd;
    const wDays = Math.ceil((wEnd - wStart) / 86400000) + 1;
    const pct = (wDays / totalDays) * 100;
    const weekLabel = `${wStart.getMonth()+1}/${wStart.getDate()}-${wEnd.getMonth()+1}/${wEnd.getDate()}`;
    headerHtml += `<div class="gantt-week-col" style="flex:${wDays} 1 0">${weekLabel}</div>`;
    cursor = new Date(weekEnd.getTime() + 86400000);
  }
  headerHtml += '</div></div>';
  
  // 今天线位置
  const todayPos = ((today - minDate) / (maxDate - minDate)) * 100;
  
  // 分组逻辑
  const groupBy = $('#ganttGroupBy').value;
  const groups = {};
  
  tasks.forEach(t => {
    // 筛选有日期的任务
    const start = parseDateAny(t.values['开发日期']) || parseDateAny(t.values['提出日期']);
    if(!start) return;
    
    let groupKey;
    if(groupBy === 'owner') groupKey = (t.values['负责人'] || '未分配').trim() || '未分配';
    else if(groupBy === 'cust') groupKey = (t.values['客户'] || '未分配').trim() || '未分配';
    else groupKey = (t.values['完成状态'] || '未填').trim() || '未填';
    
    if(!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(t);
  });
  
  // 生成甘特行
  let bodyHtml = '';
  Object.keys(groups).sort().forEach(gk => {
    const groupTasks = groups[gk];
    bodyHtml += `<div class="gantt-group"><div class="gantt-group-title">${esc(gk)} <span class="gcount">(${groupTasks.length})</span></div>`;
    
    groupTasks.forEach(t => {
      const name = t.values['专案名称'] || '未命名任务';
      const meta = `${t.values['客户'] || ''} · ${t.values['负责人'] || ''}`.trim() || '—';
      const status = String(t.values['完成状态'] || '').trim();
      
      // 计算起止日期
      let start = parseDateAny(t.values['开发日期']) || parseDateAny(t.values['提出日期']) || minDate;
      let end = parseDateAny(t.values['结案日期']);
      if(!end){
        if(status === 'Closed') end = start; // 已完成但无结案日期，用开始日期
        else end = new Date(today.getTime() + 7 * 86400000); // 未完成，预估7天
      }
      
      // 裁剪到显示范围
      const displayStart = start < minDate ? minDate : start;
      const displayEnd = end > maxDate ? maxDate : end;
      
      // 计算位置和宽度
      const left = ((displayStart - minDate) / (maxDate - minDate)) * 100;
      const width = Math.max(((displayEnd - displayStart) / (maxDate - minDate)) * 100, 1);
      
      // 状态颜色
      let statusClass = 'status_other';
      const statusLower = status.toLowerCase();
      if(statusLower === 'closed') statusClass = 'status_closed';
      else if(statusLower === 'ongoing') statusClass = 'status_ongoing';
      else if(statusLower === 'planning') statusClass = 'status_planning';
      else if(start < today && statusLower !== 'closed') statusClass = 'status_overdue';
      
      const dateRange = `${toInputDate(start)} ~ ${toInputDate(end)}`;
      
      bodyHtml += `<div class="gantt-row">
        <div class="gantt-label">
          <span class="gt-name" title="${esc(name)}">${esc(name)}</span>
          <span class="gt-meta">${esc(meta)}</span>
        </div>
        <div class="gantt-bar-col">
          <div class="gantt-bar ${statusClass}" style="left:${left}%;width:${width}%" 
               title="${esc(name)}\n${dateRange}\n状态: ${esc(status || '未填')}"
               data-edit="${t.id}">
            <span class="bar-label">${esc(name)}</span>
          </div>
        </div>
      </div>`;
    });
    bodyHtml += '</div>';
  });
  
  if(!bodyHtml){
    chart.innerHTML = '<div class="gantt-empty">没有符合条件的任务（需有开发日期或提出日期）</div>';
    return;
  }
  
  // 添加图例
  const legendHtml = `<div class="gantt-legend">
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:var(--ok)"></span>已完成</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:var(--blue)"></span>进行中</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:var(--warn)"></span>规划中</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:var(--del)"></span>逾期</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#888"></span>其他</div>
  </div>`;
  
  chart.innerHTML = headerHtml + bodyHtml + legendHtml;
  
  // 设置今天线位置
  if(todayPos >= 0 && todayPos <= 100){
    const barCol = chart.querySelectorAll('.gantt-bar-col');
    barCol.forEach(c => {
      c.style.setProperty('--today-pos', todayPos + '%');
    });
    chart.querySelectorAll('.gantt-bar-col').forEach(col => {
      const line = document.createElement('div');
      line.style.cssText = `position:absolute;top:-32px;bottom:0;width:2px;background:var(--del);left:${todayPos}%;z-index:3;pointer-events:none`;
      col.appendChild(line);
    });
  }
  
  // 绑定点击编辑
  chart.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => {
      const tk = tasks.find(x => x.id === b.dataset.edit);
      if(!tk) return;
      editingId = tk.id;
      document.querySelector('nav button[data-tab="entry"]').click();
      renderEntry({...tk.values, entryDate:tk.entryDate});
      window.scrollTo(0,0);
    };
  });
}

// 视图切换事件绑定
$('#viewCard').onclick = () => switchView('card');
$('#viewGantt').onclick = () => switchView('gantt');
$('#ganttGroupBy').onchange = renderGantt;
$('#ganttRange').onchange = renderGantt;

// 默认显示卡片视图
$('#viewCard').classList.add('active');
