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
}

function renderList(){
  populateCustFilter();
  populateStatusFilter();
  renderStats();
  const q=$('#listSearch').value.trim().toLowerCase();
  const cf=$('#listCustFilter').value;
  const sf=$('#listStatusFilter').value;
  const ef=$('#listExportFilter').value;
  const sort=$('#listSort') ? $('#listSort').value : 'dateDesc';
  let list=tasks.slice();
  // 排序（dateDesc=最新在前，与原 reverse 行为一致）
  if(sort==='dateAsc') list.sort((a,b)=>String(a.entryDate).localeCompare(String(b.entryDate)));
  else if(sort==='dateDesc') list.sort((a,b)=>String(b.entryDate).localeCompare(String(a.entryDate)));
  else if(sort==='status') list.sort((a,b)=>String(a.values['完成状态']||'').localeCompare(String(b.values['完成状态']||'')));
  else if(sort==='cust') list.sort((a,b)=>String(a.values['客户']||'').localeCompare(String(b.values['客户']||'')));
  else if(sort==='devDate') list.sort((a,b)=>String(a.values['开发日期']||'').localeCompare(String(b.values['开发日期']||'')));
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
$('#listSort').onchange=renderList;
/* 初始化列表排序为配置中心默认值 */
(function(){ const st=loadSettings(); const el=$('#listSort'); if(el) el.value=st.listSort; })();
$('#clearTasks').onclick=()=>{ if(confirm('确定清空全部任务库和回收站？建议先导出备份。')){tasks=[];trash=[];save(LS_TASKS,tasks);save(LS_TRASH,trash);renderList();toast('已清空');} };
$('#undoExported').onclick=()=>{
  const n=tasks.filter(t=>t.exported).length;
  if(!n){toast('当前没有已标记「已追加」的任务');return;}
  if(!confirm('将撤销 '+n+' 条任务的「已追加」标记，之后导出追加会重新包含它们。继续？'))return;
  tasks.forEach(t=>{t.exported=false;});
  save(LS_TASKS,tasks); renderList(); toast('已撤销 '+n+' 条「已追加」标记');
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
