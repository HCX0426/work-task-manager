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
  // m12 修复：复用 store.aggregateTasks，避免与数据看板/今日待办统计口径漂移
  const agg=aggregateTasks(tasks);
  const exported=tasks.filter(t=>t.exported).length;
  $('#statsStrip').innerHTML=`
    <div class="stat"><div class="num">${agg.total}</div><div class="lab">任务总数</div></div>
    <div class="stat"><div class="num">${agg.monthTasks.length}</div><div class="lab">本月任务</div></div>
    <div class="stat"><div class="num">${agg.rate}%</div><div class="lab">本月完成率</div></div>
    <div class="stat${agg.overdueCount?' warn':''}"><div class="num">${agg.overdueCount}</div><div class="lab">逾期未完成</div></div>
    <div class="stat"><div class="num">${exported}</div><div class="lab">已追加</div></div>
    <div class="stat"><div class="num">${trash.length}</div><div class="lab">回收站</div></div>`;
  // 同步顶部「回收站 (N)」按钮计数（删除/恢复后立即刷新，无需展开面板）
  $('#trashCount').textContent=trash.length;
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
  list.sort((a,b)=>{
    const ka=sortKey(a), kb=sortKey(b);
    const ea=ka==='', eb=kb==='';
    if(ea&&eb) return 0;
    if(ea) return 1;   // 空值永远排最后
    if(eb) return -1;
    const r=ka.localeCompare(kb);
    return sortDir==='desc'?-r:r;
  });
  if(q)list=list.filter(t=>Object.values(t.values).some(v=>String(v).toLowerCase().includes(q)));
  if(cf)list=list.filter(t=>(t.values['客户']||'')===cf);
  if(sf==='__not_closed')list=list.filter(t=>!isTaskDone(t)); // 未完成=未结案且未取消
  else if(sf)list=list.filter(t=>(t.values['完成状态']||'')===sf);
  if(ef==='exported')list=list.filter(t=>t.exported);
  else if(ef==='new')list=list.filter(t=>t.exportedNew);
  else if(ef==='not_exported')list=list.filter(t=>!t.exported && !t.exportedNew);
  $('#listCount').textContent='（共 '+tasks.length+' 条'+( (q||cf||sf||ef)?'，筛选后 '+list.length+' 条':'')+'）';
  const wrap=$('#taskTableWrap');
  const batchOn = $('#batchToggle') && $('#batchToggle').classList.contains('active');
  if(!list.length){wrap.innerHTML='<p class="muted">没有任务（'+(tasks.length?'没有匹配的':'去「每日录入」添加')+'）。</p>';return;}
  const cols=schema.filter(c=>c.type!=='auto').map(c=>c.name);
  let h='<div class="task-list'+(batchOn?' list-batch':'')+'">';
  list.forEach(t=>{
    const done=String(t.values['完成状态']||'')===STATUS_DONE;
    const overdue=isTaskOverdue(t);
    const checked=window.__batchSel && window.__batchSel.has(t.id)?'checked':'';
    h+=`<div class="task-card${done?' done':''}" data-id="${t.id}">
      ${batchOn?`<label class="tcheck-wrap"><input type="checkbox" class="tcheck" data-id="${t.id}" ${checked}></label>`:''}
      <div class="tc-date"><span class="tc-pill">📅 ${esc(t.entryDate)}${(t.exported?'<span class="tc-exported">已追加</span>':(t.exportedNew?'<span class="tc-exported">已生成新周报</span>':''))}${overdue?'<span class="tc-exported" style="color:var(--del)">⏰ 逾期</span>':''}</span>
        <span class="tc-actions">
          <button class="btn sec sm" data-edit="${t.id}">编辑</button>
          <button class="btn del sm" data-del="${t.id}">删除</button>
        </span>
      </div>
      <div class="tc-fields">`;
    const filled=cols.filter(c=>String(t.values[c]||'').trim()!=='');
    if(filled.length){
      filled.forEach(c=>{
        h+=`<div class="tc-row"><span class="tc-k">${esc(c)}</span><span class="tc-v">${esc(t.values[c]).replace(/\n/g,'<br>')}</span></div>`;
      });
    }else{
      h+=`<div class="tc-row"><span class="tc-k">内容</span><span class="tc-v empty">未填</span></div>`;
    }
    h+='</div>';
    const prog=devProgressOf(t);
    if(prog) h+=`<div class="tc-progress"><span class="sp-bar"><i style="width:${prog.pct}%"></i></span><span class="sp-txt">${prog.done}/${prog.total}</span></div>`;
    if(Array.isArray(t.history)&&t.history.length){
      h+=`<details class="tc-history"><summary>🕘 历史（${t.history.length}）</summary>`
        +t.history.slice().reverse().slice(0,15).map(x=>{
          return `<div class="th-item"><span class="th-time">${fmtHistoryTime(x.ts)}</span><span>${esc(x.a)}${x.d?('：'+esc(x.d)):''}</span></div>`;
        }).join('')
        +(t.history.length>15?'<div class="muted">…仅显示最近 15 条</div>':'')
        +'</details>';
    }
    h+='</div>';
  });
  h+='</div>';
  const _st = wrap.scrollTop; // P13：重建前记录滚动位置
  wrap.innerHTML=h;
  wrap.scrollTop=_st; // P13：重建后恢复，避免长列表编辑/删除后跳回顶部
  wrap.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
    if(!confirm('删除这条任务？将移入回收站（可恢复）。'))return;
    const i=tasks.findIndex(t=>t.id===b.dataset.del);
    if(i<0) return;
    // P2：统一走 moveToTrash（先写回收站再删任务库，任一步失败均回滚）
    if(!moveToTrash(tasks[i].id)) return;
    renderList(); toast('已移入回收站');
  });
  wrap.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openTaskEdit(b.dataset.edit));
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
      if(c.type==='date'){ const dt=parseDateAny(v); if(dt) v=(c.dateFmt==='md')?fmtDateMD(dt):fmtDateCN(dt); }
      return v;
    });
    const row=ws.addRow(values);
    row.eachCell(cell=>{ styleCell(cell); });
  });
  const out=await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([out],{type:'application/octet-stream'}),'选中任务_'+todayStr()+'.xlsx');
  toast('已导出选中 '+sel.length+' 条');
};
/* P2 修复：把任务移入回收站（单条/批量共用，顺带消除两处重复实现）。
   写入顺序：先「回收站」(安全侧·新增) 再「任务库」(风险侧·删除)；
   任一步失败都回滚已写成功的键，彻底避免 m8 遗留的
   「磁盘已删 + 内存未删 + 回收站没有」→ 刷新后任务永久丢失。
   返回实际移入条数（0 表示未生效）。 */
function moveToTrash(ids){
  const idset=(ids instanceof Set)?ids:new Set(Array.isArray(ids)?ids:[ids]);
  if(!idset.size) return 0;
  const nt=tasks.filter(t=>!idset.has(t.id));
  const moved=tasks.length-nt.length;
  if(!moved) return 0;
  const ntr=trash.slice();
  tasks.forEach(t=>{ if(idset.has(t.id)) ntr.push(t); });
  if(ntr.length>TRASH_CAP) ntr.splice(0,ntr.length-TRASH_CAP);
  if(!save(LS_TRASH,ntr)){ toast('保存失败（回收站写入失败），删除未生效'); return 0; }
  if(!save(LS_TASKS,nt)){
    save(LS_TRASH,trash); // 回滚：任务库没删成，回收站也退回原样
    toast('保存失败（任务库写入失败），已回滚，删除未生效');
    return 0;
  }
  tasks=nt; trash=ntr;
  return moved;
}
$('#batchDelete').onclick=()=>{
  const ids=[...document.querySelectorAll('.tcheck:checked')].map(c=>c.dataset.id);
  if(!ids.length){toast('请先勾选任务');return;}
  if(!confirm('将选中的 '+ids.length+' 条移入回收站？'))return;
  const moved=moveToTrash(ids);
  if(!moved) return;
  window.__batchSel=new Set(); renderList(); toast('已移入回收站 '+moved+' 条');
};
/* 批量补录结案日期后，联动回填开发天数（开发日期~结案日期含首尾） */
function autoCalcDays(t){
  const n=calcDevDays(parseDateAny(t.values['开发日期']), parseDateAny(t.values['结案日期']));
  if(n!=null) t.values['开发天数']=n+'天';
}
$('#batchApply').onclick=async ()=>{
  const ids=[...document.querySelectorAll('.tcheck:checked')].map(c=>c.dataset.id);
  if(!ids.length){toast('请先勾选任务');return;}
  const test=$('#batchTest').value, close=$('#batchClose').value, st=$('#batchStatus').value;
  if(!test && !close && !st){toast('请填写要补的日期或状态');return;}
  // 批量改为「暂停/取消」时必须填备注（一条备注应用到全部选中任务）
  let note='';
  if(st===STATUS_PAUSE || st===STATUS_CANCEL){
    note=(await uiPrompt('改状态为「'+st+'」需填写备注（必填）——将应用到全部选中任务，说明原因：')||'').trim();
    if(!note){ toast('已取消：改状态为「'+st+'」需先填写「备注」'); return; }
  }
  const parts=[]; if(test)parts.push('测试日期='+test); if(close)parts.push('结案日期='+close); if(st)parts.push('状态='+st);
  // 构建改动后的任务副本并整体保存，成功后才替换内存（存储失败时列表与数据保持不变）
  const next=tasks.map(t2=>{
    if(!ids.includes(t2.id)) return t2;
    const nv=Object.assign({}, t2.values);
    if(test) nv['测试日期']=test;
    if(close) nv['结案日期']=close;
    if(st===STATUS_DONE){
      nv['完成状态']=st;
      if(!String(nv['结案日期']||'').trim()) nv['结案日期']=close||todayStr();
    }else if(st){
      nv['完成状态']=st;
      if(st===STATUS_PAUSE || st===STATUS_CANCEL) nv['备注']=note;
    }
    const nt=Object.assign({}, t2, {values:nv});
    if(nv['结案日期']!==(t2.values['结案日期']||'')) autoCalcDays(nt);
    nt.history=(nt.history||[]).slice();
    addHistory(nt,'批量补录',parts.join('、'));
    return nt;
  });
  if(!save(LS_TASKS,next)) return;
  tasks=next;
  renderList();toast('已批量补录 '+ids.length+' 条');
};

/* E. 回收站（软删除恢复） */
$('#toggleTrash').onclick=()=>{
  const p=$('#trashPanel'); p.classList.toggle('hidden');
  $('#toggleTrash').classList.toggle('active', !p.classList.contains('hidden'));
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
      <div class="tc-date"><span class="tc-pill">📅 ${esc(t.entryDate)} <span class="tc-exported">已删除</span></span>
        <span class="tc-actions">
          <button class="btn sec sm" data-restore="${t.id}">恢复</button>
          <button class="btn del sm" data-purge="${t.id}">彻底删除</button>
        </span>
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

$('#listSearch').oninput=debounce(renderList,200); // m4 修复：搜索输入防抖，避免每次按键全量重渲染
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
  save(LS_TASKS,tasks); lastExportedIds=[]; renderList();
  toast('已清除 '+n+' 条的「已追加」标记——下次导出会重新包含它们。注意：之前下载的 Excel 文件不会被改动，请删掉旧文件避免重复。');
};
$('#undoExported').onclick=()=>{
  const n=tasks.filter(t=>t.exported).length;
  if(!n){toast('当前没有已标记「已追加」的任务');return;}
  if(!confirm('将清除 '+n+' 条任务的「已追加」标记。\n注意：已下载到磁盘的 Excel 文件不会被改动（仍在），清除后重新导出会生成新文件并重新包含这些任务。\n仍要清除？'))return;
  tasks.forEach(t=>{t.exported=false;});
  save(LS_TASKS,tasks); renderList(); toast('已清除 '+n+' 条「已追加」标记（已下载的 Excel 文件不变）');
};
/* 一键全量备份：任务库+回收站+列配置+下拉+导出默认设置 */
$('#exportAll').onclick=()=>{
  // P3 修复：settings 剔除 aiKey（明文 API Key 不随备份文件外泄）
  downloadJSON({type:'wb_full', tasks, trash, schema, dropdowns, colMapping, settings:settingsForBackup()}, '周报全量备份_'+todayStr()+'.json');
  markBackup(); toast('已导出全量备份');
};
/* P1 修复：统一的备份恢复写入（全量备份 / 加密备份共用）。
   顺序：先构造新值 → 顺序落盘 → 任一失败即回滚已写成功的键 → 全部成功才改内存。
   原实现「先全量改内存 + 不检查 save 返回值 + 无条件成功提示」，
   配额不足时会留下「新列配置 + 旧任务库」的混合态，且界面仍假报「已恢复」。 */
function restoreAll(d, okMsg){
  const nTasks=d.tasks.filter(t=>t&&typeof t==='object').map(t=>({id:String(t.id), entryDate:String(t.entryDate), values:(t.values&&typeof t.values==='object')?t.values:{}, exported:!!t.exported, exportedNew:!!t.exportedNew, subtasks:Array.isArray(t.subtasks)?t.subtasks:[], history:Array.isArray(t.history)?t.history:[]}));
  const nTrash=Array.isArray(d.trash)?d.trash:[];
  const nSchema=d.schema.map(c=>({name:String(c.name), type:String(c.type||'text'), def:String(c.def||''), id:(c.id||('col_'+String(c.name))), dateFmt:(String(c.type||'text')==='date'?(c.dateFmt==='md'?'md':'ymd'):undefined)}));
  const nDropdowns=(d.dropdowns&&typeof d.dropdowns==='object')?d.dropdowns:{};
  const nMap=(d.colMapping&&typeof d.colMapping==='object'&&!Array.isArray(d.colMapping))?d.colMapping:null;
  const nSettings=(d.settings&&typeof d.settings==='object')?d.settings:null;
  const origCfg=load(LS_EXPORTCFG,null); // 回滚快照（解析后的对象，null 表示原本没有）
  const curKey=(origCfg&&typeof origCfg==='object')?origCfg.aiKey:undefined; // 当前 AI Key（BYOK），恢复时不应被备份覆盖清空
  const plan=[[LS_TASKS,nTasks,tasks],[LS_TRASH,nTrash,trash],[LS_SCHEMA,nSchema,schema],[LS_DROPDOWNS,nDropdowns,dropdowns]];
  if(nMap) plan.push([LS_MAPPING,nMap,colMapping]);
  if(nSettings){
    if(nSettings.aiKey==null && curKey!=null) nSettings.aiKey=curKey; // ② 修复：备份无 Key 时沿用当前 Key，避免静默丢失
    plan.push([LS_EXPORTCFG,nSettings,origCfg]);
  }
  const done=[]; let failedKey=null;
  for(const [k,v,orig] of plan){
    if(!save(k,v)){ failedKey=k; break; }
    done.push([k,orig]);
  }
  if(failedKey){
    // 逆序回滚已写成功的键，恢复到恢复操作之前的磁盘状态
    for(let i=done.length-1;i>=0;i--){
      const [k,orig]=done[i];
      if(orig===null||orig===undefined) localStorage.removeItem(k); else save(k,orig);
    }
    toast('恢复失败：写入「'+failedKey+'」失败（可能是存储空间不足），已回滚，当前数据未改动');
    return false;
  }
  tasks=nTasks; trash=nTrash; schema=nSchema; dropdowns=nDropdowns;
  if(nMap) colMapping=nMap;
  renderList(); renderEntry(null); toast(okMsg);
  return true;
}
$('#importAll').onclick=()=>$('#importAllFile').click();
$('#importAllFile').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(d.type!=='wb_full' || !Array.isArray(d.tasks)) throw new Error('不是有效的全量备份文件');
      if(!Array.isArray(d.schema) || !d.schema.length) throw new Error('备份缺少列配置');
      if(!confirm('将恢复备份中的全部数据（任务库/回收站/列配置/下拉/导出设置），当前数据会被覆盖。\n建议先「全量备份」当前数据。\n仍要恢复？')) return;
      restoreAll(d,'已恢复全量备份'); // P1：原子写入 + 失败回滚 + 按结果提示
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
  const obj={type:'wb_full', tasks, trash, schema, dropdowns, colMapping, settings:settingsForBackup()}; // P3：同样剔除 aiKey
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
      restoreAll(d,'已恢复加密备份'); // P1：与全量恢复共用同一原子写入逻辑
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
          exported:!!t.exported,
          subtasks:Array.isArray(t.subtasks)?t.subtasks.map(s=>({text:String(s&&s.text!=null?s.text:''), done:!!(s&&s.done)})):[],
          history:Array.isArray(t.history)?t.history:[]
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

/* ============ 从 Excel 导入任务库（历史周报反向导入，表头自动映射到列名） ============ */
$('#importExcelBtn').onclick=()=>$('#importExcelFile').click();
$('#importExcelFile').onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  if(!/\.xlsx$/i.test(f.name)){ toast('仅支持 .xlsx（旧版 .xls 请先另存为 .xlsx）'); e.target.value=''; return; }
  try{
    const buf=await f.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.getWorksheet(1);
    // 找表头行：首个非空单元格>=3 的行
    let hr=1, found=false;
    for(;hr<=ws.rowCount;hr++){ let n=0; ws.getRow(hr).eachCell(()=>{n++;}); if(n>=3){found=true;break;} }
    if(!found){ toast('未能识别表头行（需至少3个非空单元格）'); e.target.value=''; return; }
    const maxCol=Math.max(ws.getRow(hr).cellCount||0, ws.columnCount||0);
    const headers=[];
    for(let c=1;c<=maxCol;c++){ const v=ws.getRow(hr).getCell(c).value; headers.push(v!=null?String(v).trim():''); }
    // 映射：表头 -> 列名（复用 matchCol）
    const mapTo=headers.map(h=>matchCol(h)||'');
    // 收集数据行
    const newTasks=[];
    let noDate=0; // m7 修复：记录缺录入日期的行数，便于提示
    for(let r=hr+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r);
      if(!row.cellCount) continue;
      // 跳过空行
      let hasAny=false;
      row.eachCell(c=>{ if(c.value!=null && String(c.value).trim()!=='') hasAny=true; });
      if(!hasAny) continue;
      const values={};
      mapTo.forEach((key,ci)=>{
        if(!key || key==='项次') return;
        let v=row.getCell(ci+1).value;
        if(v==null) v='';
        else if(v instanceof Date) v=toInputDate(v);
        else v=String(v).trim();
        if(v!=='') values[key]=v;
      });
      // 没有匹配到任何列的跳过
      if(!Object.keys(values).length) continue;
      // 录入日期：用提出日期或开发日期；两者皆空则兜底为今天（m7 修复：空 entryDate 会让任务在日历/月报/本周里"消失"）
      const entry=values['提出日期']||values['开发日期']||todayStr();
      if(!values['提出日期'] && !values['开发日期']) noDate++;
      newTasks.push({id:uid(), entryDate:entry, values, exported:false, exportedNew:false});
    }
    if(!newTasks.length){ toast('表格里没有可导入的数据行'); e.target.value=''; return; }
    const merged=confirm(`读取到 ${newTasks.length} 条任务。\n「确定」= 合并进现有任务库（当前 ${tasks.length} 条）；\n「取消」= 不导入。`);
    if(!merged){ e.target.value=''; return; }
    tasks=tasks.concat(newTasks);
    save(LS_TASKS,tasks);
    renderList();
    toast(`已从 Excel 导入 ${newTasks.length} 条任务，现有 ${tasks.length} 条`+(noDate?`（其中 ${noDate} 条缺录入日期，已按今天录入，可在日历里改）`:''));
  }catch(err){ toast('导入失败：'+err.message); }
  e.target.value='';
};

/* ============ 甘特图视图 ============ */
let currentView = 'card';

function switchView(view){
  currentView = view;
  const map={card:{btn:'viewCard',ctr:'viewCardContainer'},gantt:{btn:'viewGantt',ctr:'viewGanttContainer'},kanban:{btn:'viewKanban',ctr:'viewKanbanContainer'},calendar:{btn:'viewCalendar',ctr:'viewCalendarContainer'}};
  Object.values(map).forEach(({btn,ctr})=>{
    const b=$('#'+btn); if(b) b.classList.remove('active');
    const c=$('#'+ctr); if(c) c.classList.add('hidden');
  });
  const m=map[view]; if(!m)return;
  const b=$('#'+m.btn); if(b) b.classList.add('active');
  const c=$('#'+m.ctr); if(c) c.classList.remove('hidden');
  if(view==='gantt') renderGantt();
  else if(view==='kanban') renderKanban();
  else if(view==='calendar') renderCalendar();
  else renderList();
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
    // M1 修复：用 reduce 求最值，避免 Math.min(...dates) 在任务多时因参数展开触发栈溢出
    minDate = new Date(dates.reduce((a,b)=>a<b?a:b));
    maxDate = new Date(dates.reduce((a,b)=>a>b?a:b));
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

  const span = maxDate - minDate; // M4 修复：跨度（毫秒），用于百分比与除零兜底
  const totalDays = Math.ceil(span / 86400000) + 1;
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
  const todayPos = span>0 ? ((today - minDate) / span) * 100 : 0; // M4 修复：span=0 时记为 0，避免 NaN
  
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
        if(status === STATUS_DONE) end = start; // 已完成但无结案日期，用开始日期
        else end = new Date(today.getTime() + 7 * 86400000); // 未完成，预估7天
      }
      
      // 裁剪到显示范围
      const displayStart = start < minDate ? minDate : start;
      const displayEnd = end > maxDate ? maxDate : end;
      
      // 计算位置和宽度
      const denom = span || 1; // M4 修复：span=0 时除零兜底（单任务同日期间不至于 NaN）
      const left = ((displayStart - minDate) / denom) * 100;
      const width = Math.max(((displayEnd - displayStart) / denom) * 100, 1);
      
      // 状态颜色：逾期（未结案/未取消且日期已过）优先红色，其次按状态
      let statusClass = 'status_other';
      const statusLower = status.toLowerCase();
      const overdueEarly = (start < today && statusLower !== 'closed' && statusLower !== STATUS_CANCEL && statusLower !== STATUS_PAUSE);
      if(statusLower === 'closed') statusClass = 'status_closed';
      else if(overdueEarly) statusClass = 'status_overdue';
      else if(statusLower === 'ongoing') statusClass = 'status_ongoing';
      else if(statusLower === STATUS_PAUSE) statusClass = 'status_pause';
      else if(statusLower === STATUS_CANCEL) statusClass = 'status_cancel';
      else if(statusLower === 'planning') statusClass = 'status_planning';
      
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
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#b7791f"></span>暂停</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#888"></span>已取消</div>
    <div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#b9bfc7"></span>其他</div>
  </div>`;
  
  const _gst = chart.scrollTop; // P13：重建前记录滚动位置
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
    b.onclick = () => openTaskEdit(b.dataset.edit);
  });
  chart.scrollTop = _gst; // P13：重建后恢复滚动位置
}

/* ============ 看板视图：按完成状态分列，拖动卡片直接改状态 ============ */
function kanbanColumns(){
  const cfg=dropdowns['完成状态']||[];
  const priority=['planning','Ongoing','Closed'];
  const cols=[];
  // 状态已必填，默认不显示「未填」列；仅当存在历史空状态任务时才保留，避免列堆叠
  const hasEmpty=tasks.some(t=>!String(t.values['完成状态']||'').trim());
  if(hasEmpty) cols.push({key:'',label:'未填'});
  cfg.slice().sort((a,b)=>{
    const ia=priority.indexOf(a), ib=priority.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib) || String(a).localeCompare(String(b));
  }).forEach(s=>{ if(!cols.some(c=>c.key===s)) cols.push({key:s,label:s}); });
  // 配置里没有但数据里存在的自定义状态，追加在最后
  tasks.forEach(t=>{ const s=String(t.values['完成状态']||'').trim(); if(s && !cols.some(c=>c.key===s)) cols.push({key:s,label:s}); });
  return cols;
}
function renderKanban(){
  const board=$('#kanbanBoard');
  if(!board)return;
  const q=$('#listSearch').value.trim().toLowerCase();
  const cf=$('#listCustFilter').value;
  let list=tasks.slice();
  if(q)list=list.filter(t=>Object.values(t.values).some(v=>String(v).toLowerCase().includes(q)));
  if(cf)list=list.filter(t=>(t.values['客户']||'')===cf);
  if(!tasks.length){ board.innerHTML='<p class="muted">没有任务（去「每日录入」添加）。</p>'; return; }
  const cols=kanbanColumns();
  const bySt={};
  cols.forEach(c=>bySt[c.key]=[]);
  list.forEach(t=>{
    const s=String(t.values['完成状态']||'').trim();
    const key=cols.some(c=>c.key===s)?s:'';
    bySt[key].push(t);
  });
  board.innerHTML=cols.map(c=>{
    const items=bySt[c.key]||[];
    return `<div class="kanban-col" data-status="${esc(c.key)}" data-label="${esc(c.label)}">
      <div class="kanban-head">${esc(c.label||'未填')}<span class="kcnt">${items.length}</span></div>
      <div class="kanban-cards">${
        items.length?items.map(t=>{
          const name=String(t.values['专案名称']||'').trim()||'未命名任务';
          const desc=String(t.values['需求说明']||'').trim();
          const dev=String(t.values['开发日期']||'').trim();
          const cust=String(t.values['客户']||'').trim();
          const done=String(t.values['完成状态']||'').trim()===STATUS_DONE;
          const overdue=isTaskOverdue(t);
          const prog=devProgressOf(t);
          return `<div class="kanban-card${done?' done':''}${overdue?' overdue':''}" draggable="true" data-id="${t.id}" title="点击编辑：${esc(name)}">
            <span class="kc-name">${esc(name)}</span>
            ${prog?`<div class="tc-progress" style="margin:0"><span class="sp-bar"><i style="width:${prog.pct}%"></i></span><span class="sp-txt">${prog.done}/${prog.total}</span></div>`:''}
            ${desc?`<span class="kc-desc">${esc(desc)}</span>`:''}
            <span class="kc-meta">${dev?`<span class="kc-date">📅 ${esc(dev)}</span>`:''}${cust?`<span>${esc(cust)}</span>`:''}${overdue?`<span style="color:var(--del)">⏰ 逾期</span>`:''}</span>
          </div>`;
        }).join(''):'<div class="kanban-empty">拖到这里</div>'
      }</div>
    </div>`;
  }).join('');
  board.querySelectorAll('.kanban-card').forEach(card=>{
    card.onclick=()=>openTaskEdit(card.dataset.id);
    card.ondragstart=e=>{
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed='move';
    };
    card.ondragend=()=>card.classList.remove('dragging');
  });
}
/* 看板拖拽：丢到列即改「完成状态」；绑定一次，渲染时列/卡片重画不影响 */
(function(){
  const board=document.getElementById('kanbanBoard');
  if(!board)return;
  board.addEventListener('dragover',e=>{
    const col=e.target.closest('.kanban-col');
    if(!col)return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    board.querySelectorAll('.kanban-col.drag-over').forEach(c=>{ if(c!==col)c.classList.remove('drag-over'); });
    col.classList.add('drag-over');
  });
  board.addEventListener('dragleave',e=>{
    const col=e.target.closest('.kanban-col');
    if(col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });
  board.addEventListener('drop', async e=>{
    e.preventDefault();
    const col=e.target.closest('.kanban-col');
    if(!col)return;
    col.classList.remove('drag-over');
    const id=e.dataTransfer.getData('text/plain');
    if(!id)return;
    const t=tasks.find(x=>x.id===id);
    if(!t)return;
    const ns=col.dataset.status;
    const oldSt=(String(t.values['完成状态']||'').trim()||'未填');
    if(oldSt===ns){ toast('状态未变化'); return; }
    // 拖到「暂停/取消」：必须先填备注（弹窗输入，取消则本次回退）
    let note='';
    if(ns===STATUS_PAUSE || ns===STATUS_CANCEL){
      note=(await uiPrompt('改状态为「'+ns+'」需填写备注（必填）——说明原因：')||'').trim();
      if(!note){ toast('已取消：改状态为「'+ns+'」需先填写「备注」'); return; }
    }
    // 构建改动后的任务副本并整体保存，成功后才替换内存（存储失败时看板与数据保持不变）
    const nv=Object.assign({}, t.values, {'完成状态':ns});
    if(ns===STATUS_PAUSE || ns===STATUS_CANCEL) nv['备注']=note;
    if(ns===STATUS_DONE && !String(nv['结案日期']||'').trim()) nv['结案日期']=todayStr();
    const nt=Object.assign({}, t, {values:nv});
    if(nv['结案日期']!==t.values['结案日期']) autoCalcDays(nt);
    nt.history=(nt.history||[]).slice();
    addHistory(nt,'状态变更',oldSt+' → '+(col.dataset.label||'未填'));
    const next=tasks.map(x=>x.id===id?nt:x);
    if(!save(LS_TASKS,next)) return;
    tasks=next;
    renderKanban();
    renderStats();
    toast('已更新状态 →「'+(col.dataset.label||'未填')+'」');
  });
})();

// 视图切换事件绑定
$('#viewCard').onclick = () => switchView('card');
$('#viewGantt').onclick = () => switchView('gantt');
$('#viewKanban').onclick = () => switchView('kanban');
$('#viewCalendar').onclick = () => switchView('calendar');
$('#ganttGroupBy').onchange = renderGantt;
$('#ganttRange').onchange = renderGantt;

/* ============ 日历视图：按录入日期回看 + 补录跳转 ============ */
let calY=new Date().getFullYear(), calM=new Date().getMonth();
function calItemHtml(t){
  const name=String(t.values['专案名称']||'').trim()||'未命名';
  const closed=String(t.values['完成状态']||'').trim()===STATUS_DONE;
  return `<span class="cal-item${closed?' closed':''}" data-id="${t.id}" title="${esc(name)}（点击编辑）">${esc(name)}</span>`;
}
function renderCalendar(){
  const grid=$('#calGrid'); if(!grid) return;
  const p=n=>String(n).padStart(2,'0');
  const y=calY, m=calM;
  const dim=new Date(y,m+1,0).getDate();
  const offset=(new Date(y,m,1).getDay()+6)%7; // 周一=0
  const byDate={};
  tasks.forEach(t=>{
    const d=parseDateAny(t.entryDate);
    if(d){ const k=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); (byDate[k]=byDate[k]||[]).push(t); }
  });
  const todayK=todayStr();
  const monthCount=tasks.filter(t=>{ const d=parseDateAny(t.entryDate); return d&&d.getFullYear()===calY&&d.getMonth()===calM; }).length;
  $('#calTitle').textContent=y+'年'+(m+1)+'月'+(monthCount?`　·　本月收录 ${monthCount} 条`:'');
  let h='';
  ['周一','周二','周三','周四','周五','周六','周日'].forEach(w=>h+=`<div class="cal-head">${w}</div>`);
  const prev=new Date(y,m,0);
  const prevDim=prev.getDate();
  const prevY=prev.getFullYear(), prevM=prev.getMonth();
  for(let i=offset-1;i>=0;i--){
    const d=prevDim-i;
    const k=prevY+'-'+p(prevM+1)+'-'+p(d);
    const list=byDate[k]||[];
    h+=`<div class="cal-cell other-month"><div class="cal-day"><span class="cal-num">${d}</span></div>${list.slice(0,3).map(calItemHtml).join('')}</div>`;
  }
  for(let d=1;d<=dim;d++){
    const k=y+'-'+p(m+1)+'-'+p(d);
    const list=byDate[k]||[];
    h+=`<div class="cal-cell${k===todayK?' today':''}">
      <div class="cal-day"><span class="cal-num">${d}</span><span class="cal-add" data-add="${k}" title="补录该天：打开录入页并把录入日期设为这一天">补录</span></div>
      ${list.slice(0,4).map(calItemHtml).join('')}
      ${list.length>4?`<span class="cal-more">…还有 ${list.length-4} 条</span>`:''}
    </div>`;
  }
  const used=offset+dim;
  const tail=Math.max(0, 42-used); // 补齐到 6 行(42 格)；used 最大 37，tail 恒为正，原 if(tail<0) 死分支已移除（#35）
  for(let d=1;d<=tail;d++){
    const nd=new Date(y,m+1,d);
    const k=nd.getFullYear()+'-'+p(nd.getMonth()+1)+'-'+p(nd.getDate());
    const list=byDate[k]||[];
    h+=`<div class="cal-cell other-month"><div class="cal-day"><span class="cal-num">${d}</span></div>${list.slice(0,3).map(calItemHtml).join('')}</div>`;
  }
  grid.innerHTML=h;
  grid.querySelectorAll('.cal-item').forEach(el=>{
    el.onclick=()=>openTaskEdit(el.dataset.id);
  });
  grid.querySelectorAll('[data-add]').forEach(el=>{
    el.onclick=()=>{
      document.querySelector('nav button[data-tab="entry"]').click();
      $('#entryDate').value=el.dataset.add;
      markBaseline();
      toast('录入日期已设为 '+el.dataset.add+'，填完提交即可补录');
    };
  });
}
$('#calPrev').onclick=()=>{ calM--; if(calM<0){ calM=11; calY--; } renderCalendar(); };
$('#calNext').onclick=()=>{ calM++; if(calM>11){ calM=0; calY++; } renderCalendar(); };
$('#calToday').onclick=()=>{ calY=new Date().getFullYear(); calM=new Date().getMonth(); renderCalendar(); };

// 默认显示卡片视图
$('#viewCard').classList.add('active');
