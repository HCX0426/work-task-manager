/* ============ 每日录入（entry.js） ============ */
/* 自动计算开发天数：开发日期~结案日期（含首尾）；两个日期任一为空则不动 */
function autoFillDays(){
  const dev=$('#entryForm').querySelector('[name="开发日期"]');
  const close=$('#entryForm').querySelector('[name="结案日期"]');
  const days=$('#entryForm').querySelector('[name="开发天数"]');
  if(!dev||!close||!days)return;
  const d1=parseDateAny(dev.value), d2=parseDateAny(close.value);
  if(d1&&d2){
    const diff=Math.round((d2-d1)/86400000)+1;
    if(diff>=1) days.value=diff+'天';
  }
}
function renderEntry(prefill){
  const f=$('#entryForm'); f.innerHTML='';
  const t=todayStr();
  const useDate = prefill ? prefill.entryDate : t;
  $('#entryDate').value = toInputDate(useDate)||t;
  $('#entryDateLabel').textContent = (editingId && prefill) ? ('正在编辑（原录入于 '+prefill.entryDate+'）') : '新增任务（录入日期如上，可改）';
  schema.forEach(col=>{
    if(col.type==='auto')return;
    const wrap=document.createElement('div');
    wrap.className='field';
    const hasVal = prefill ? (prefill[col.name]!=null && prefill[col.name]!=='') : (col.def && col.def!=='{{today}}' ? true : col.def==='{{today}}');
    let inner=`<span class="lab">${esc(col.name)}${hasVal?' <span class="badge">预填</span>':''}</span>`;
    let val='';
    if(prefill){ val=prefill[col.name]||''; }
    else {
      if(col.type==='date'){ val = col.def==='{{today}}' ? t : toInputDate(col.def); }
      else { val = col.def||''; }
    }
    if(col.type==='dropdown'){
      const opts=(dropdowns[col.name]||[]).map(o=>`<option>${esc(o)}</option>`).join('');
      inner+=`<div class="dd-inline"><select name="${esc(col.name)}"><option value="">请选择</option>${opts}</select><button type="button" class="btn sec sm dd-add-opt" title="为「${esc(col.name)}」新增选项">+ 新增</button></div>`;
    }else if(col.type==='date'){
      inner+=`<input type="date" name="${esc(col.name)}" value="${esc(val)}">`;
    }else if(col.type==='textarea'){
      inner+=`<textarea name="${esc(col.name)}" placeholder="可多行，如：08/20 完成，等待测试">${esc(val)}</textarea>`;
      inner+=`<div class="muted" style="margin-top:-2px">格式如「08/20 完成，等待测试」，多行可用换行</div>`;
    }else{
      inner+=`<input type="text" name="${esc(col.name)}" value="${esc(val)}">`;
    }
    wrap.innerHTML=inner; f.appendChild(wrap);
    const err=document.createElement('div'); err.className='field-err'; wrap.appendChild(err);
    if(col.type==='dropdown'){
      const el=wrap.querySelector('select'); el.value=val;
      wrap.querySelector('.dd-add-opt').onclick=()=>{
        const name=col.name;
        const arr=dropdowns[name]=dropdowns[name]||[];
        const v=(prompt('为「'+name+'」新增选项：')||'').trim();
        if(!v)return;
        if(!arr.includes(v)){ arr.push(v); save(LS_DROPDOWNS,dropdowns); }
        // 保存当前表单数据，避免重新渲染时丢失用户已填内容
        const currentVals={};
        schema.forEach(c=>{
          if(c.type==='auto')return;
          const inp=$('#entryForm').querySelector(`[name="${CSS.escape(c.name)}"]`);
          if(inp) currentVals[c.name]=inp.value;
        });
        const currentDate=$('#entryDate').value;
        // 重新渲染
        renderEntry(prefill);
        // 恢复用户之前填写的数据
        Object.keys(currentVals).forEach(nm=>{
          const inp=$('#entryForm').querySelector(`[name="${CSS.escape(nm)}"]`);
          if(inp) inp.value=currentVals[nm];
        });
        $('#entryDate').value=currentDate;
        // 设置新添加的选项为选中值
        const sel=$('#entryForm').querySelector(`[name="${CSS.escape(name)}"]`);
        if(sel)sel.value=v;
      };
    }
    const input=wrap.querySelector('input,select,textarea');
    if(input) input.addEventListener('input',()=>validateField(col.name));
  });

  // 字段级实时校验
  function validateField(name){
    const el=$('#entryForm').querySelector(`[name="${CSS.escape(name)}"]`);
    const field=el?el.closest('.field'):null;
    if(!el||!field)return;
    const err=field.querySelector('.field-err');
    const val=el.value.trim();
    let msg='';
    if(name==='专案名称' && !val) msg='「专案名称」不能为空（月报汇总依赖它）';
    if(msg) field.classList.add('invalid'); else field.classList.remove('invalid');
    if(err) err.textContent=msg;
  }

  // 日期逻辑校验：横向比较多个日期字段
  function validateDates(){
    const map={};
    ['提出日期','开发日期','测试日期','结案日期'].forEach(n=>{
      const el=$('#entryForm').querySelector(`[name="${CSS.escape(n)}"]`);
      if(el) map[n]={el,val:parseDateAny(el.value),field:el.closest('.field')};
    });
    const checks=[
      ['开发日期','提出日期','早于提出日期'],
      ['测试日期','开发日期','早于开发日期'],
      ['结案日期','开发日期','早于开发日期']
    ];
    checks.forEach(([later,earlier,msg])=>{
      const L=map[later],E=map[earlier];
      if(!L||!L.field)return;
      const bad=(L&&L.val&&E&&E.val&&L.val<E.val);
      L.field.classList.toggle('invalid',!!bad);
      const err=L.field.querySelector('.field-err');
      if(err) err.textContent=bad?later+' '+msg:'';
    });
  }
  ['提出日期','开发日期','测试日期','结案日期'].forEach(n=>{
    const el=$('#entryForm').querySelector(`[name="${CSS.escape(n)}"]`);
    if(el){ el.addEventListener('change',validateDates); el.addEventListener('change',autoFillDays); }
  });
  $('#saveEntry').textContent = (editingId && prefill) ? '保存修改' : '保存任务';
  $('#cancelEdit').style.display = (editingId && prefill) ? 'inline-block' : 'none';
}

/* C. 字段级校验 */
function validateEntry(values, ed){
  // 专案名称为空 -> 硬拦截
  if(!String(values['专案名称']||'').trim()){ return {ok:false, msg:'「专案名称」不能为空（月报汇总依赖它）'}; }
  const pd=parseDateAny(values['提出日期']), dd=parseDateAny(values['开发日期']);
  const td=parseDateAny(values['测试日期']), cd=parseDateAny(values['结案日期']);
  const warns=[];
  if(pd&&dd&&dd<pd) warns.push('开发日期早于提出日期');
  if(td&&dd&&td<dd) warns.push('测试日期早于开发日期');
  if(cd&&dd&&cd<dd) warns.push('结案日期早于开发日期');
  if(warns.length && !confirm('日期逻辑可能有误：\n'+warns.join('\n')+'\n仍要保存吗？')) return {ok:false, msg:''};
  return {ok:true, msg:''};
}

$('#saveEntry').onclick=()=>{
  const form=$('#entryForm');
  const values={};
  schema.forEach(col=>{
    if(col.type==='auto')return;
    const el=form.querySelector(`[name="${CSS.escape(col.name)}"]`);
    values[col.name]=el?el.value.trim():'';
  });
  const ed=$('#entryDate').value||todayStr();
  // 保存前先跑一遍实时校验，若有标红字段则聚焦第一个错误项
  const firstErr=form.querySelector('.field.invalid [name]');
  if(firstErr){ firstErr.focus(); firstErr.scrollIntoView({behavior:'smooth',block:'center'}); toast('请先修正标红的字段'); return; }
  const v=validateEntry(values, ed);
  if(!v.ok){ if(v.msg)toast(v.msg); return; }
  if(editingId){
    const tk=tasks.find(x=>x.id===editingId);
    if(tk){ tk.values=values; tk.entryDate=ed; save(LS_TASKS,tasks); editingId=null; toast('已更新任务'); }
    else { editingId=null; toast('原任务已被删除，已作为新任务保存'); tasks.push({id:uid(),entryDate:ed,values,exported:false}); save(LS_TASKS,tasks); }
  }else{
    tasks.push({id:uid(),entryDate:ed,values,exported:false});
    save(LS_TASKS,tasks); toast('已保存，可在「任务列表」查看');
  }
  renderEntry(null);
};
$('#cancelEdit').onclick=()=>{ editingId=null; renderEntry(null); toast('已取消编辑'); };
$('#cloneLast').onclick=()=>{
  if(!tasks.length){toast('还没有可克隆的任务');return;}
  const last=tasks[tasks.length-1];
  const vals={...last.values};
  editingId=null;
  renderEntry({...vals, entryDate:todayStr()});
  toast('已克隆上条，改完再保存');
};
$('#toggleBulk').onclick=()=>{
  const p=$('#bulkPanel'); const hidden=p.classList.contains('hidden');
  p.classList.toggle('hidden');
  $('#toggleBulk').textContent = hidden ? '批量录入 ▴' : '批量录入 ▾';
};
$('#bulkSave').onclick=()=>{
  const lines=$('#bulkText').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!lines.length){toast('没有内容');return;}
  // 校验：统计缺少专案名称的行数（月报汇总依赖专案名称）
  let noName=0;
  lines.forEach(line=>{ const i=line.indexOf('|'); if(i<0 || !line.slice(0,i).trim()) noName++; });
  if(noName>0 && !confirm(`有 ${noName} 行缺少「专案名称」（月报汇总依赖它，缺了将无法在月报中统计）。\n仍要保存吗？`)){ return; }
  const d=$('#entryDate').value||todayStr();
  let n=0;
  lines.forEach(line=>{
    const values={};
    schema.forEach(col=>{
      if(col.type==='auto')return;
      if(col.type==='date'){ values[col.name]=col.def==='{{today}}'?d:toInputDate(col.def); }
      else { values[col.name]=col.def||''; }
    });
    if(line.includes('|')){ const i=line.indexOf('|'); values['专案名称']=line.slice(0,i).trim(); values['需求说明']=line.slice(i+1).trim(); }
    else { values['需求说明']=line; }
    tasks.push({id:uid(),entryDate:d,values,exported:false}); n++;
  });
  save(LS_TASKS,tasks); $('#bulkText').value=''; $('#bulkMsg').textContent='已批量保存 '+n+' 条'; renderEntry(null); toast('批量保存 '+n+' 条');
};

/* G. 录入快捷键：Enter 保存（textarea 内换行，Ctrl+Enter 保存） */
$('#entryForm').addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    if(e.target.tagName==='TEXTAREA' && !e.ctrlKey) return;
    e.preventDefault(); $('#saveEntry').click();
  }
});
