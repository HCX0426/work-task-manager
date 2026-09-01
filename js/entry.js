/* ============ 每日录入（entry.js） ============ */
/* 表单脏状态跟踪（切换 Tab 时提示未保存修改） */
let formBaseline=null, formDirty=false;
function snapshotForm(){
  const vals={};
  schema.forEach(c=>{ if(c.type==='auto')return; const el=$('#entryForm').querySelector(`[name="${CSS.escape(c.name)}"]`); if(el) vals[c.name]=el.value; });
  return JSON.stringify({vals, date:$('#entryDate').value});
}
function markBaseline(){ formBaseline=snapshotForm(); formDirty=false; }
function checkDirty(){ formDirty = (snapshotForm()!==formBaseline); }

/* ============ 草稿自动保存（防误关/刷新丢失） ============ */
const LS_DRAFT='wb_draft';
let draftTimer=null;
function saveDraft(){
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{
    const form=$('#entryForm'); if(!form) return;
    const values={};
    schema.forEach(col=>{
      if(col.type==='auto')return;
      const el=form.querySelector(`[name="${CSS.escape(col.name)}"]`);
      if(el) values[col.name]=el.value;
    });
    const date=$('#entryDate').value||todayStr();
    const hasContent=Object.values(values).some(v=>String(v).trim()!=='')||date!==todayStr();
    if(hasContent){ save(LS_DRAFT,{values, date, ts:Date.now()}); }
    else { localStorage.removeItem(LS_DRAFT); }
    updateDraftBar();
  },800);
}
function clearDraft(){
  clearTimeout(draftTimer);
  localStorage.removeItem(LS_DRAFT);
  updateDraftBar();
}
function updateDraftBar(){
  const bar=$('#draftBar'); if(!bar) return;
  const d=load(LS_DRAFT,null);
  const has=d&&d.values&&Object.values(d.values).some(v=>String(v).trim()!=='');
  if(!has){ bar.classList.add('hidden'); bar.style.display='none'; return; }
  const t=new Date(d.ts||Date.now());
  const hh=String(t.getHours()).padStart(2,'0'), mm=String(t.getMinutes()).padStart(2,'0');
  const info=bar.querySelector('.draft-info');
  if(info) info.textContent='检测到自动保存的草稿（'+hh+':'+mm+'），可恢复继续编辑';
  bar.classList.remove('hidden');
  bar.style.display='flex';
}
function restoreDraft(){
  const d=load(LS_DRAFT,null);
  if(!d||!d.values){ toast('没有可恢复的草稿'); return; }
  const form=$('#entryForm');
  if(form){
    Object.keys(d.values).forEach(nm=>{
      const el=form.querySelector(`[name="${CSS.escape(nm)}"]`);
      if(el) el.value=d.values[nm];
    });
  }
  if(d.date) $('#entryDate').value=d.date;
  clearDraft();
  markBaseline();
  toast('已恢复草稿，可继续编辑');
}
$('#draftRestore').onclick=restoreDraft;
$('#draftDiscard').onclick=()=>{ clearDraft(); toast('已丢弃草稿'); };

/* 自动计算开发天数：开发日期~结案日期（含首尾）；两个日期任一为空则不动 */
function autoFillDays(){
  const dev=$('#entryForm').querySelector('[name="开发日期"]');
  const close=$('#entryForm').querySelector('[name="结案日期"]');
  const days=$('#entryForm').querySelector('[name="开发天数"]');
  if(!dev||!close||!days)return;
  const n=calcDevDays(parseDateAny(dev.value), parseDateAny(close.value));
  if(n!=null) days.value=n+'天';
}
function renderEntry(prefill){
  const f=$('#entryForm'); f.innerHTML='';
  const legend=document.createElement('div');
  legend.className='muted';
  legend.style.gridColumn='1 / -1';
  legend.style.marginBottom='2px';
  legend.innerHTML='<b style="color:var(--del)">*</b> 为必填项';
  f.appendChild(legend);
  const t=todayStr();
  const useDate = prefill ? prefill.entryDate : t;
  $('#entryDate').value = toInputDate(useDate)||t;
  $('#entryDateLabel').textContent = (editingId && prefill) ? ('正在编辑（原录入于 '+prefill.entryDate+'）') : '新增任务（录入日期如上，可改）';
  schema.forEach(col=>{
    if(col.type==='auto')return;
    const wrap=document.createElement('div');
    wrap.className='field';
    const hasVal = prefill ? (prefill[col.name]!=null && prefill[col.name]!=='') : (col.def && col.def!=='{{today}}' ? true : col.def==='{{today}}');
    // 必填列（专案名称/完成状态）在标签右上角标红星
    const req=(col.name==='专案名称'||col.name==='完成状态');
    let inner=`<span class="lab">${esc(col.name)}${req?'<sup class="req-star" style="color:var(--del);font-weight:700;margin-left:2px">*</sup>':''}${hasVal?' <span class="badge">预填</span>':''}</span>`;
    let val='';
    if(prefill){ val = col.type==='date' ? (toInputDate(prefill[col.name])||'') : (prefill[col.name]||''); }
    else {
      if(col.type==='date'){ val = col.def==='{{today}}' ? t : toInputDate(col.def); }
      else { val = col.def||''; }
    }
    if(col.type==='dropdown'){
      const arr=dropdowns[col.name]||[];
      let opts=arr.map(o=>`<option>${esc(o)}</option>`).join('');
      // 任务已有值但该选项已被从配置删除时，追加占位选项，避免编辑后字段被清空
      if(val && !arr.includes(val)) opts+=`<option selected>${esc(val)}</option>`;
      inner+=`<div class="dd-inline"><select name="${esc(col.name)}"><option value="">请选择</option>${opts}</select><button type="button" class="btn sec sm dd-add-opt" title="为「${esc(col.name)}」新增选项">+ 新增</button></div>`;
    }else if(col.type==='date'){
      inner+=`<input type="date" name="${esc(col.name)}" value="${esc(val)}">`;
    }else if(col.type==='textarea'){
      inner+=`<textarea name="${esc(col.name)}" placeholder="可多行，如：08/20 完成，等待测试">${esc(val)}</textarea>`;
      if(col.name==='开发进度'){
        inner+=`<div class="row" style="margin-top:6px;gap:8px"><button type="button" class="btn sec sm ai-polish-btn">AI 润色</button><button type="button" class="btn sec sm voice-btn" title="语音转文字填入（Chrome 浏览器支持）">🎤 语音</button><span class="muted ai-polish-msg"></span><span class="muted voice-status"></span></div>`;
        inner+=`<div class="phrase-row row" style="margin-top:6px;gap:6px;flex-wrap:wrap"></div>`;
        inner+=`<div class="subtask-progress hidden dev-progress" style="margin-top:6px"><span class="sp-bar"><i style="width:0%"></i></span><span class="sp-txt"></span><span class="muted" style="font-size:11px">每行一个推进节点，行首加「✓ 」表示已完成，进度自动统计</span></div>`;
      }
      inner+=`<div class="muted" style="margin-top:-2px">格式如「08/20 完成，等待测试」；拆行的每行会被算作一个推进节点</div>`;
    }else{
      inner+=`<input type="text" name="${esc(col.name)}" value="${esc(val)}">`;
    }
    wrap.innerHTML=inner; f.appendChild(wrap);
    // 「开发进度」内容较多（AI/短语/进度条），独占整行，避免把左右字段的行高撑出大片空白
    if(col.name==='开发进度') wrap.style.gridColumn='1 / -1';
    if(col.name==='开发进度'){ renderPhraseRow(wrap); updateDevProgress(wrap); }
    const err=document.createElement('div'); err.className='field-err'; wrap.appendChild(err);
    if(col.type==='dropdown'){
      const el=wrap.querySelector('select'); el.value=val;
      wrap.querySelector('.dd-add-opt').onclick=async ()=>{
        const name=col.name;
        const arr=dropdowns[name]=dropdowns[name]||[];
        const v=(await uiPrompt('为「'+name+'」新增选项：')||'').trim();
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
    if(input){ input.addEventListener('input',()=>validateField(col.name)); input.addEventListener('input',saveDraft); input.addEventListener('change',saveDraft); if(col.name==='开发进度'){ input.addEventListener('input',()=>updateDevProgress(wrap)); input.addEventListener('change',()=>updateDevProgress(wrap)); } }
    const aiBtn=wrap.querySelector('.ai-polish-btn');
    if(aiBtn) aiBtn.onclick=()=>aiPolishField(wrap, col.name);
    const voiceBtn=wrap.querySelector('.voice-btn');
    if(voiceBtn) voiceBtn.onclick=()=>startVoiceInput(wrap, voiceBtn);
  });

  // 字段级实时校验
  function validateField(name){
    // 完成状态与备注联动：状态必填；改为「暂停/取消」时必须填备注
    const stEl=$('#entryForm').querySelector('[name="完成状态"]');
    const noteEl=$('#entryForm').querySelector('[name="备注"]');
    const stField=stEl?stEl.closest('.field'):null;
    const noteField=noteEl?noteEl.closest('.field'):null;
    const stV=stEl?stEl.value.trim():'';
    const noteV=noteEl?noteEl.value.trim():'';
    const needNote=(stV===STATUS_PAUSE||stV===STATUS_CANCEL);
    const stMsg = !stV ? '请选择「完成状态」（不能为空）' : (needNote && !noteV ? '选择「'+stV+'」需先填写「备注」' : '');
    const noteMsg = needNote && !noteV ? '「'+stV+'」状态需填写「备注」' : '';
    if(stField){ const err=stField.querySelector('.field-err'); stField.classList.toggle('invalid',!!stMsg); if(err) err.textContent=stMsg; }
    if(noteField){ const err=noteField.querySelector('.field-err'); noteField.classList.toggle('invalid',!!noteMsg); if(err) err.textContent=noteMsg; }
    // 常规字段校验
    if(name!=='完成状态' && name!=='备注'){
      const el=$('#entryForm').querySelector(`[name="${CSS.escape(name)}"]`);
      const field=el?el.closest('.field'):null;
      if(!el||!field)return;
      const err=field.querySelector('.field-err');
      const val=el.value.trim();
      const msg=name==='专案名称' && !val ? '「专案名称」不能为空（月报汇总依赖它）' : '';
      field.classList.toggle('invalid',!!msg);
      if(err) err.textContent=msg;
    }
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
  // 脏状态跟踪：记录初始值并监听变化（#35：先移除再绑定，避免持久节点 #entryForm/#entryDate 上监听器随每次渲染累积）
  markBaseline();
  f.removeEventListener('input',checkDirty); f.removeEventListener('change',checkDirty);
  $('#entryDate').removeEventListener('input',checkDirty); $('#entryDate').removeEventListener('change',checkDirty);
  $('#entryDate').removeEventListener('input',saveDraft); $('#entryDate').removeEventListener('change',saveDraft);
  f.addEventListener('input',checkDirty); f.addEventListener('change',checkDirty);
  $('#entryDate').addEventListener('input',checkDirty); $('#entryDate').addEventListener('change',checkDirty);
  $('#entryDate').addEventListener('input',saveDraft); $('#entryDate').addEventListener('change',saveDraft);
  renderTodayPanel();
}

/* 语音录入：Web Speech API 转文字填入「开发进度」（Chrome 浏览器支持，识别在本地进行） */
function startVoiceInput(wrap, btn){
  const ta=wrap.querySelector('textarea');
  const status=wrap.querySelector('.voice-status');
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ toast('当前浏览器不支持语音识别（请用 Chrome）'); return; }
  if(btn.dataset.on==='1'){
    btn.dataset.on=''; btn.textContent='🎤 语音'; btn.classList.remove('active');
    if(window.__rec){ try{window.__rec.stop();}catch(e){} }
    if(status) status.textContent='';
    return;
  }
  const rec=new SR();
  window.__rec=rec;
  rec.lang='zh-CN';
  rec.interimResults=true;
  rec.continuous=true;
  rec.onstart=()=>{ btn.dataset.on='1'; btn.textContent='⏹ 停止'; btn.classList.add('active'); if(status) status.textContent='正在听…'; };
  rec.onresult=e=>{
    let text='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      text+=e.results[i][0].transcript;
    }
    ta.value=(ta.value||'')+text;
    if(status) status.textContent='已听到，点击「停止」结束';
    checkDirty();
  };
  rec.onerror=e=>{
    btn.dataset.on=''; btn.textContent='🎤 语音'; btn.classList.remove('active');
    if(status) status.textContent='';
    toast('语音识别失败：'+(e.error==='not-allowed'?'未授权麦克风':e.error));
  };
  rec.onend=()=>{
    if(btn.dataset.on==='1'){ // 自动结束后自动重启（continuous），用户点击停止才真正结束
      try{ rec.start(); }catch(err){ btn.dataset.on=''; btn.textContent='🎤 语音'; }
    }else{
      btn.textContent='🎤 语音';
    }
  };
  try{ rec.start(); }catch(err){ toast('启动语音识别失败'); }
}

/* BYOK AI 润色：把「开发进度」草稿润色成周报话术（数据只发用户自己配置的服务商） */
async function aiPolishField(wrap, name){
  const ta=wrap.querySelector('textarea');
  const btn=wrap.querySelector('.ai-polish-btn');
  const msgEl=wrap.querySelector('.ai-polish-msg');
  const text=(ta.value||'').trim();
  if(!text){ toast('请先填写「'+name+'」内容'); ta.focus(); return; }
  const st=loadSettings();
  if(!st.aiKey){ toast('请先在「配置中心 → AI 润色」填写 API Key'); return; }
  if(btn){ btn.disabled=true; btn.textContent='润色中…'; }
  if(msgEl) msgEl.textContent='正在请求 AI（约几秒）…';
  try{
    const sys='你是周报助手。把用户给的开发进度草稿润色成正式简练的周报话术：每行一条；保留日期、关键节点和数据；突出已完成成果与进行中状态；不要编造内容；直接输出润色后的文本，不要任何解释。'+(st.aiReq?('补充要求：'+st.aiReq):'');
    const out=await aiChat([
      {role:'system', content:sys},
      {role:'user', content:'请润色以下「'+name+'」：\n'+text}
    ]);
    if(!out.trim()) throw new Error('AI 返回内容为空');
    ta.value=out.trim();
    checkDirty();
    if(msgEl) msgEl.textContent='已润色，可继续手动修改';
    toast('AI 润色完成');
  }catch(err){
    if(msgEl) msgEl.textContent='';
    toast('润色失败：'+err.message);
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='AI 润色'; }
  }
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
  // 状态与备注校验（放在红标拦截之前，提示更明确）
  const st=String(values['完成状态']||'').trim();
  const note=String(values['备注']||'').trim();
  const pn=String(values['专案名称']||'').trim();
  if(!st){
    toast('请选择「完成状态」（不能为空）');
    const el=form.querySelector('[name="完成状态"]'); if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  if(!pn){
    toast('请填写「专案名称」（不能为空）');
    const el=form.querySelector('[name="专案名称"]'); if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  if((st===STATUS_PAUSE || st===STATUS_CANCEL) && !note){
    toast('改状态为「'+st+'」前请先填写「备注」说明原因');
    const el=form.querySelector('[name="备注"]'); if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
    return;
  }
  // 结案后补全结案日期（为空则自动填今天）
  if(st===STATUS_DONE && !String(values['结案日期']||'').trim()) values['结案日期']=todayStr();
  // 保存前先跑一遍实时校验，若有标红字段则聚焦第一个错误项
  const firstErr=form.querySelector('.field.invalid [name]');
  if(firstErr){ firstErr.focus(); firstErr.scrollIntoView({behavior:'smooth',block:'center'}); toast('请先修正标红的字段'); return; }
  const v=validateEntry(values, ed);
  if(!v.ok){ if(v.msg)toast(v.msg); return; }
  // 重复专案检测：与已有任务同名（排除当前编辑的）时提示，防重复录入
  if(pn){
    const dupCount=tasks.filter(t=>t.id!==editingId && String(t.values['专案名称']||'').trim()===pn).length;
    if(dupCount>0 && !confirm(`「${pn}」已存在 ${dupCount} 条记录，可能是同名不同任务，仍要保存吗？`)) return;
  }
  if(editingId){
    const tk=tasks.find(x=>x.id===editingId);
    if(tk){
      // 记录本次变更了哪些字段（如完成状态/开发进度/备注等），写入历史
      const changes=[];
      schema.forEach(col=>{ if(col.type==='auto')return; const o=String(tk.values[col.name]||''), n=String(values[col.name]||''); if(o!==n) changes.push(col.name); });
      // 先构建下一版数据并保存，成功后才替换内存（失败时表单与数据保持原样，可安全重试）
      const updated=Object.assign({}, tk, {values:Object.assign({}, values), entryDate:ed});
      if(changes.length){ updated.history=(updated.history||[]).slice(); addHistory(updated,'编辑更新',changes.join('、')); }
      const next=tasks.map(t=>t.id===tk.id?updated:t);
      if(!save(LS_TASKS,next)) return;
      tasks=next; editingId=null; toast('已更新任务');
    }
    else {
      // 原任务已被删除：作为新任务保存
      const nt={id:uid(),entryDate:ed,values:Object.assign({}, values),exported:false, exportedNew:false};
      const next=tasks.concat(nt);
      editingId=null;
      if(!save(LS_TASKS,next)) return;
      tasks=next; toast('原任务已被删除，已作为新任务保存');
    }
  }else{
    const nt={id:uid(),entryDate:ed,values:Object.assign({}, values),exported:false, exportedNew:false};
    const next=tasks.concat(nt);
    if(!save(LS_TASKS,next)) return;
    tasks=next; toast('已保存，可在「任务列表」查看');
  }
  clearDraft();
  renderEntry(null);
};
$('#cancelEdit').onclick=()=>{ editingId=null; clearDraft(); renderEntry(null); toast('已取消编辑'); };
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
  // 重复专案检测：本次新增中与现有任务同名的行数
  const existing=new Set(tasks.map(t=>String(t.values['专案名称']||'').trim()).filter(Boolean));
  let dupCount=0;
  lines.forEach(line=>{ const i=line.indexOf('|'); const nm=(i>=0?line.slice(0,i):'').trim(); if(nm && existing.has(nm)) dupCount++; });
  if(dupCount>0 && !confirm(`有 ${dupCount} 行专案名称与现有任务重复（可能同名不同任务）。\n仍要保存吗？`)){ return; }
  const d=$('#entryDate').value||todayStr();
  const newTasks=[];
  lines.forEach(line=>{
    const values={};
    schema.forEach(col=>{
      if(col.type==='auto')return;
      if(col.type==='date'){ values[col.name]=col.def==='{{today}}'?d:toInputDate(col.def); }
      else { values[col.name]=col.def||''; }
    });
    if(line.includes('|')){ const i=line.indexOf('|'); values['专案名称']=line.slice(0,i).trim(); values['需求说明']=line.slice(i+1).trim(); }
    else { values['需求说明']=line; }
    // 状态必填：批量录入默认取「完成状态」下拉第一项（通常为 Ongoing），避免产生无状态任务
    if(!String(values['完成状态']||'').trim()){
      const stArr=dropdowns['完成状态']||[];
      if(stArr.length) values['完成状态']=stArr[0];
    }
    newTasks.push({id:uid(),entryDate:d,values,exported:false, exportedNew:false});
  });
  // 先保存（快照数组），成功后再并入内存；失败保留文本框内容以便重试
  const next=tasks.concat(newTasks);
  if(!save(LS_TASKS,next)) return;
  tasks=next;
  $('#bulkText').value=''; $('#bulkMsg').textContent='已批量保存 '+newTasks.length+' 条'; clearDraft(); renderEntry(null); toast('批量保存 '+newTasks.length+' 条');
};

/* 初始化：检测是否有未保存的草稿（页面加载时显示恢复提示） */
updateDraftBar();

/* G. 录入快捷键：Enter 保存（textarea 内换行，Ctrl+Enter 保存） */
$('#entryForm').addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    if(e.target.tagName==='TEXTAREA' && !e.ctrlKey) return;
    e.preventDefault(); $('#saveEntry').click();
  }
});

/* 开发进度预览：每行一个推进节点，行首「✓ 」= 已完成，实时统计（替代原独立子任务框） */
function updateDevProgress(wrap){
  const bar=wrap.querySelector('.dev-progress');
  if(!bar)return;
  const ta=wrap.querySelector('textarea');
  const v=ta?ta.value:'';
  const arr=parseSubtasks(v);
  const done=arr.filter(x=>x.done).length;
  bar.classList.toggle('hidden', !arr.length);
  if(!arr.length)return;
  const pct=Math.round(done/arr.length*100);
  const iEl=bar.querySelector('i'), txt=bar.querySelector('.sp-txt');
  if(iEl)iEl.style.width=pct+'%';
  if(txt)txt.textContent=done+'/'+arr.length+'（'+pct+'%）';
}

/* 常用短语行：开发进度一键插入（配置中心可管理，录入页可「+ 新增」） */
function renderPhraseRow(wrap){
  const row=wrap.querySelector('.phrase-row');
  if(!row) return;
  const ph=loadSettings().phrases||[];
  row.innerHTML='<span class="muted" style="font-size:12px">常用：</span>'
    +ph.map(p=>`<button type="button" class="btn sec sm" data-p="${esc(p)}" title="点击插入">${esc(p)}</button>`).join('')
    +'<button type="button" class="btn sec sm phrase-add" title="新增常用短语">+ 新增</button>';
  row.querySelectorAll('[data-p]').forEach(b=>{
    b.onclick=()=>{
      const ta=wrap.querySelector('textarea');
      if(!ta) return;
      const v=ta.value.trim();
      ta.value = v ? v+'\n'+b.dataset.p : b.dataset.p;
      checkDirty(); saveDraft();
      ta.focus();
    };
  });
  row.querySelector('.phrase-add').onclick=async ()=>{
    const v=(await uiPrompt('新增常用短语（用于「开发进度」一键插入）：')||'').trim();
    if(!v) return;
    const a=loadSettings().phrases||[];
    if(!a.includes(v)){
      a.push(v);
      const cfg=load(LS_EXPORTCFG,{})||{};
      cfg.phrases=a; save(LS_EXPORTCFG,cfg);
    }
    renderPhraseRow(wrap);
    toast('已新增短语');
  };
}

/* ============ 今日待办 + 到期提醒（页面顶部面板） ============ */
function todayTasks(){
  const today=todayStr();
  const todo=[], overdue=[];
  tasks.forEach(t=>{
    // 结案/取消/暂停都不进今日与逾期（暂停=暂停，不催）
    if(isTaskDone(t) || String(t.values['完成状态']||'').trim()===STATUS_PAUSE)return;
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    if(!d)return;
    const ds=toInputDate(d);
    if(ds===today) todo.push(t);
    else if(ds<today) overdue.push(t);
  });
  const byDev=(a,b)=>String(a.values['开发日期']||'').localeCompare(String(b.values['开发日期']||''));
  todo.sort(byDev); overdue.sort(byDev);
  return {todo, overdue};
}
function todayItemHtml(t){
  const name=String(t.values['专案名称']||'').trim()||'未命名任务';
  const st=String(t.values['完成状态']||'').trim();
  const dev=String(t.values['开发日期']||'').trim();
  const tail=[t.values['客户']||'', st, dev].filter(Boolean).join(' · ');
  return `<div class="today-item" data-id="${t.id}" title="点击编辑：${esc(name)}">
    <span class="ti-name">${esc(name)}</span>
    <span class="ti-cust">${esc(tail)}</span>
  </div>`;
}
function renderTodayPanel(){
  const panel=$('#todayPanel');
  if(!panel)return;
  const {todo, overdue}=todayTasks();
  const MAX=12;
  const cnt=$('#todayCount'); if(cnt)cnt.textContent=todo.length;
  const ocnt=$('#todayOverdueCount'); if(ocnt)ocnt.textContent=overdue.length;
  $('#todayTodo').innerHTML=todo.length
    ? todo.slice(0,MAX).map(todayItemHtml).join('')+(todo.length>MAX?`<div class="today-empty">…还有 ${todo.length-MAX} 条</div>`:'')
    : '<div class="today-empty">今天没有待推进任务 ✓</div>';
  $('#todayOverdue').innerHTML=overdue.length
    ? overdue.slice(0,MAX).map(todayItemHtml).join('')+(overdue.length>MAX?`<div class="today-empty">…还有 ${overdue.length-MAX} 条</div>`:'')
    : '<div class="today-empty">没有逾期任务 ✓</div>';
  renderWeekCheck();
  panel.querySelectorAll('.today-item').forEach(el=>{
    el.onclick=()=>{
      if(formDirty && !confirm('当前表单有未保存的修改，载入该任务将丢弃这些修改。\n仍要继续？'))return;
      formDirty=false; // 已确认丢弃，避免跳转时二次弹窗
      openTaskEdit(el.dataset.id);
      toast('已载入任务，可补录进度/状态后保存');
    };
  });
}

/* 本周已录（周一~周日）自查，防漏录 */
function renderWeekCheck(){
  const {start, end, startStr, endStr}=weekRange();
  const monS=startStr, sunS=endStr;
  const list=tasks.filter(t=>{
    const d=parseDateAny(t.entryDate);
    const ds=toInputDate(d);
    return d && ds>=monS && ds<=sunS;
  }).sort((a,b)=>String(a.entryDate).localeCompare(String(b.entryDate)));
  const cnt=$('#weekCount'); if(cnt)cnt.textContent=list.length;
  const MAXS=15;
  const wrap=$('#weekList');
  if(!wrap)return;
  wrap.innerHTML=list.length
    ? list.slice(0,MAXS).map(t=>{
        const name=String(t.values['专案名称']||'').trim()||'未命名任务';
        const st=String(t.values['完成状态']||'').trim();
        return `<div class="week-item"><span class="wi-date">${esc(String(t.entryDate||'').slice(5))}</span><span class="wi-name">${esc(name)}</span><span class="wi-st">${esc(st)}</span></div>`;
      }).join('')
      +(list.length>MAXS?`<div class="today-empty">…共 ${list.length} 条</div>`:'')
    : `<div class="today-empty">本周（${(start.getMonth()+1)}/${start.getDate()} ~ ${end.getMonth()+1}/${end.getDate()}）还没有录入记录</div>`;
}
