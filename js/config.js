/* ============ 配置中心（config.js） ============ */
/* 列模板：切换后 schema/dropdowns/导出映射 全站跟随 */
function refreshColTemplateSel(){
  const sel=$('#colTemplate'); if(!sel) return;
  const data=loadColTemplates();
  const names=Object.keys(data.list||{});
  sel.innerHTML='<option value="">（使用当前工作列结构）</option>'
    + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const active = data.active && names.includes(data.active) ? data.active : '';
  sel.value = active;
  const del=$('#colTemplateDel'); if(del) del.disabled = !active;
}

$('#colTemplateSave').onclick=async ()=>{
  const name=(await uiPrompt('模板名称（如：N客户 / 太白山 / 通用周报）：')||'').trim();
  if(!name) return;
  const data=loadColTemplates();
  data.list=data.list||{};
  data.list[name]={schema:JSON.parse(JSON.stringify(schema)), dropdowns:JSON.parse(JSON.stringify(dropdowns)), mapping:(typeof colMapping==='object'?JSON.parse(JSON.stringify(colMapping)):{})};
  data.active=name;
  saveColTemplates(data);
  refreshColTemplateSel();
  toast('已保存列模板「'+name+'」');
};
$('#colTemplateDel').onclick=()=>{
  const name=$('#colTemplate').value;
  if(!name){ toast('当前没有生效的模板可删除'); return; }
  if(!confirm('删除列模板「'+name+'」？不影响当前列结构。')) return;
  const data=loadColTemplates();
  delete data.list[name];
  if(data.active===name) data.active='';
  saveColTemplates(data);
  refreshColTemplateSel();
  toast('已删除模板「'+name+'」');
};
$('#colTemplate').onchange=()=>{
  const name=$('#colTemplate').value;
  const data=loadColTemplates();
  if(name && data.list && data.list[name]){
    if(!confirm(`切换到列模板「${name}」？\n录入页字段、下拉选项、导出映射将按此模板变更；现有任务数据保留（字段仍在，界面按新模板显示）。`)) { refreshColTemplateSel(); return; }
    try{
      applyColTemplate(data.list[name]);
      data.active=name;
      saveColTemplates(data);
      renderConfig(); renderEntry(null);
      if(typeof renderPreview==='function') renderPreview();
      refreshColTemplateSel();
      toast('已切换到模板「'+name+'」');
    }catch(err){ toast('切换失败：'+err.message); }
  }else{
    refreshColTemplateSel();
  }
};
/* 从已有周报 excel 读取表头列名，一键生成列模板 */
$('#colTemplateImport').onclick=()=>$('#colTemplateFile').click();
$('#colTemplateFile').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  if(!/\.xlsx$/i.test(f.name)){ toast('仅支持 .xlsx'); e.target.value=''; return; }
  try{
    const buf=await f.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.getWorksheet(1);
    let hr=1, found=false;
    for(;hr<=ws.rowCount;hr++){ let n=0; ws.getRow(hr).eachCell(()=>{n++;}); if(n>=3){found=true;break;} }
    if(!found){ toast('未能识别表头行（需至少3个非空单元格）'); e.target.value=''; return; }
    const maxCol=Math.max(ws.getRow(hr).cellCount||0, ws.columnCount||0);
    const headers=[];
    for(let c=1;c<=maxCol;c++){ const v=ws.getRow(hr).getCell(c).value; const h=String(v!=null?v:'').trim(); if(h && !headers.includes(h)) headers.push(h); }
    if(!headers.length){ toast('未读取到任何列名'); e.target.value=''; return; }
    const name=(await uiPrompt('读取到 '+headers.length+' 列：\n'+headers.join('、')+'\n\n模板名称：')||'').trim();
    if(!name){ e.target.value=''; return; }
    const ns=headers.map(h=>({name:h, type:guessType(h), def:''}));
    // 预置已知下拉列的默认选项（客户/完成状态），避免导入后是空下拉
    const dd={};
    ns.forEach(c=>{ if(c.type==='dropdown' && DEFAULT_DROPDOWNS[c.name]) dd[c.name]=DEFAULT_DROPDOWNS[c.name].slice(); });
    const data=loadColTemplates();
    data.list=data.list||{};
    data.list[name]={schema:ns, dropdowns:dd, mapping:{}};
    data.active=name;
    saveColTemplates(data);
    applyColTemplate(data.list[name]);
    renderConfig(); renderEntry(null);
    if(typeof renderPreview==='function') renderPreview();
    refreshColTemplateSel();
    toast('已从 excel 导入列模板「'+name+'」');
  }catch(err){ toast('导入失败：'+err.message); }
  e.target.value='';
};
/* 初始化时填充模板下拉 */
refreshColTemplateSel();

function moveCol(i,dir){
  const j=i+dir; if(j<0||j>=schema.length)return;
  const tmp=schema[i]; schema[i]=schema[j]; schema[j]=tmp;
  save(LS_SCHEMA,schema); renderConfig();
}
function renderConfig(){
  const list=$('#colCfgList'); list.innerHTML='';
  const head=document.createElement('div');head.className='col-grid-head';
  head.innerHTML=`<span>序</span><span>列名</span><span>类型</span><span>默认值</span><span>默认今天</span><span>操作</span>`;
  list.appendChild(head);
  schema.forEach((col,i)=>{
    const div=document.createElement('div');div.className='col-grid';
    const isDate=col.type==='date';
    const todayChecked=isDate && col.def==='{{today}}';
    div.innerHTML=`
      <span class="idx">${i+1}</span>
      <input class="cname" value="${esc(col.name)}" placeholder="列名">
      <select class="ctype">
        <option value="text"${col.type==='text'?' selected':''}>文本</option>
        <option value="dropdown"${col.type==='dropdown'?' selected':''}>下拉</option>
        <option value="date"${col.type==='date'?' selected':''}>日期</option>
        <option value="textarea"${col.type==='textarea'?' selected':''}>多行</option>
        <option value="auto"${col.type==='auto'?' selected':''}>续号</option>
      </select>
      <input class="cdef" placeholder="默认值(可空)" value="${todayChecked?'':esc(col.def)}" ${todayChecked?'disabled':''}>
      <span class="today-cell">${isDate?`<select class="cdatefmt" title="导出日期格式"><option value="ymd"${col.dateFmt!=='md'?' selected':''}>年-月-日</option><option value="md"${col.dateFmt==='md'?' selected':''}>月-日(无年)</option></select><input type="checkbox" class="ctoday" ${todayChecked?'checked':''}>` : '<span class="muted">—</span>'}</span>
      <span class="col-del-wrap">
        <button class="btn sec sm col-up" title="上移">▲</button>
        <button class="btn sec sm col-down" title="下移">▼</button>
        <button class="btn del sm cdel">删除</button>
      </span>`;
    list.appendChild(div);
    const ctype=div.querySelector('.ctype'), cdef=div.querySelector('.cdef'), ctoday=div.querySelector('.ctoday');
    div.querySelector('.cdel').onclick=()=>{
      const del=schema[i]; if(!del) return;
      // P7 修复：删除列同步清理 colMapping(指向该列)/dropdowns(该列选项)，并刷新录入页；
      // 先原子保存成功再 mutate 内存（含 colMapping/dropdowns 清理），避免「内存删了存储没删/只删一半」
      const ns=schema.filter((_,j)=>j!==i);
      const snapSchema=schema, snapDrop=JSON.parse(JSON.stringify(dropdowns)), snapMap=JSON.parse(JSON.stringify(colMapping));
      if(del.name in dropdowns) delete dropdowns[del.name];
      Object.keys(colMapping).forEach(k=>{ if(colMapping[k]===del.name) delete colMapping[k]; });
      if(saveAtomic([[LS_SCHEMA,ns],[LS_DROPDOWNS,dropdowns],[LS_MAPPING,colMapping]])){
        schema=ns; renderConfig(); renderEntry(null); toast('已删除列「'+del.name+'」');
      }else{
        schema=snapSchema; dropdowns=snapDrop; colMapping=snapMap; toast('删除列失败：本地存储可能已满');
      }
    };
    div.querySelector('.col-up').onclick=()=>moveCol(i,-1);
    div.querySelector('.col-down').onclick=()=>moveCol(i,1);
    if(ctoday){
      ctoday.onchange=()=>{ if(ctoday.checked){cdef.value='';cdef.disabled=true;} else {cdef.disabled=false;} };
    }
    ctype.onchange=()=>{
      col.type=ctype.value;
      save(LS_SCHEMA,schema);
      renderConfig();
    };
  });

  // 下拉选项（chip 标签式）——自动跟随列定义里类型为「下拉」的列
  const dd=$('#dropdownCfg'); dd.innerHTML='';
  const ddCols=schema.filter(c=>c.type==='dropdown').map(c=>c.name);
  if(!ddCols.length){ dd.innerHTML='<p class="muted">暂无下拉列。在上方「列定义」里把某列类型设为「下拉」，这里会自动出现对应管理区。</p>'; }
  ddCols.forEach(k=>{
    if(!dropdowns[k])dropdowns[k]=[];
    const box=document.createElement('div');box.className='dd-block';
    box.innerHTML=`<div class="dd-head">
        <span class="dd-name">${esc(k)}</span>
        <button class="btn sec sm dd-sort">去重排序</button>
        <button class="btn del sm dd-del">删除该下拉</button>
      </div>
      <div class="dd-chips" data-items></div>`;
    const itemsBox=box.querySelector('[data-items]');
    (dropdowns[k]||[]).forEach((opt,idx)=>{
      const chip=document.createElement('span');chip.className='dd-chip';
      chip.innerHTML=`<input value="${esc(opt)}" data-k="${esc(k)}" data-idx="${idx}"><span class="x" data-k="${esc(k)}" data-idx="${idx}">×</span>`;
      itemsBox.appendChild(chip);
    });
    const add=document.createElement('span');add.className='dd-add';add.textContent='+ 加选项';
    itemsBox.appendChild(add);
    const refreshDropdown=()=>{ renderConfig(); }; // 删除/修改后重新渲染，避免索引错位
    box.querySelectorAll('.x').forEach(x=>x.onclick=()=>{
      const k=dropdowns[x.dataset.k];
      if(k){ k.splice(parseInt(x.dataset.idx),1); save(LS_DROPDOWNS,dropdowns); refreshDropdown(); }
    });
    box.querySelectorAll('.dd-chip input').forEach(inp=>inp.onchange=()=>{
      const k=dropdowns[inp.dataset.k];
      if(k){ k[parseInt(inp.dataset.idx)]=inp.value; save(LS_DROPDOWNS,dropdowns); }
    });
    add.onclick=()=>{ dropdowns[k]=dropdowns[k]||[]; dropdowns[k].push('新选项'); save(LS_DROPDOWNS,dropdowns); refreshDropdown(); };
    box.querySelector('.dd-del').onclick=()=>{ delete dropdowns[k]; save(LS_DROPDOWNS,dropdowns); renderConfig(); };
    box.querySelector('.dd-sort').onclick=()=>{
      const arr=[...new Set((dropdowns[k]||[]).map(s=>s.trim()).filter(Boolean))];
      arr.sort((a,b)=>a.localeCompare(b,'zh'));
      dropdowns[k]=arr; save(LS_DROPDOWNS,dropdowns); renderConfig(); toast('已去重排序');
    };
    dd.appendChild(box);
  });

  renderPhraseCfg();
}
/* 常用短语：读取/保存（存于导出默认设置里） */
function savePhrases(arr){
  const cfg=load(LS_EXPORTCFG,{})||{};
  cfg.phrases=arr;
  save(LS_EXPORTCFG,cfg);
}
function renderPhraseCfg(){
  const box=$('#phraseChips'); if(!box) return;
  box.innerHTML='';
  (loadSettings().phrases||[]).slice().forEach((p,i)=>{
    const chip=document.createElement('span'); chip.className='dd-chip';
    chip.innerHTML=`<input value="${esc(p)}" data-i="${i}"><span class="x" data-i="${i}">×</span>`;
    box.appendChild(chip);
  });
  const add=document.createElement('span'); add.className='dd-add'; add.textContent='+ 加短语';
  box.appendChild(add);
  box.querySelectorAll('.x').forEach(x=>{ x.onclick=()=>{
    const a=(loadSettings().phrases||[]).slice(); a.splice(+x.dataset.i,1); savePhrases(a); renderPhraseCfg();
  }; });
  box.querySelectorAll('input').forEach(inp=>{ inp.onchange=()=>{
    const a=(loadSettings().phrases||[]).slice(); a[+inp.dataset.i]=inp.value.trim(); savePhrases(a.filter(Boolean));
  }; });
  add.onclick=async ()=>{
    const v=(await uiPrompt('新增常用短语（用于「开发进度」一键插入）：')||'').trim();
    if(!v) return;
    const a=(loadSettings().phrases||[]).slice();
    if(!a.includes(v)){ a.push(v); savePhrases(a); renderPhraseCfg(); }
  };
}
$('#phSort').onclick=()=>{
  const arr=[...new Set((loadSettings().phrases||[]).map(s=>s.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh'));
  savePhrases(arr); renderPhraseCfg(); toast('已去重排序');
};
$('#addCol').onclick=()=>{
  // P4 修复：生成唯一 id + 唯一列名（避免两列同名「新列」导致 computeRenames 退化为按位置匹配、id 冲突）；
  // 先 save 成功再 mutate 内存（save 失败不污染内存，避免刷新后丢列）
  const base='新列', used=new Set(schema.map(c=>c.name));
  let name=base, k=2; while(used.has(name)){ name=base+k; k++; }
  const ns=schema.concat([{id:'col_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8), name, type:'text', def:''}]);
  if(saveAtomic([[LS_SCHEMA,ns]])){ schema=ns; renderConfig(); }
  else toast('新增列失败：本地存储可能已满');
};

/* 默认设置（配置中心可改默认值，各页面临时可覆盖单次） */
(function(){
  const saveCfg=(patch)=>{ const cfg=load(LS_EXPORTCFG,{})||{}; Object.assign(cfg,patch); save(LS_EXPORTCFG,cfg); toast('默认设置已保存'); };
  const st=loadSettings();

  const copy=$('#cfgCopyRowStyle'); if(copy){
    copy.checked = !!st.copyRowStyle;
    copy.onchange=()=>saveCfg({copyRowStyle:copy.checked});
  }
  const mode=$('#cfgAppendMode'); if(mode){
    mode.value = st.appendMode;
    mode.onchange=()=>saveCfg({appendMode:mode.value});
  }
  const rangeBy=$('#cfgRangeBy'); if(rangeBy){
    rangeBy.value = st.rangeBy;
    rangeBy.onchange=()=>saveCfg({rangeBy:rangeBy.value});
  }
  const sortBy=$('#cfgListSortBy'); if(sortBy){
    sortBy.value = st.listSortBy;
    sortBy.onchange=()=>saveCfg({listSortBy:sortBy.value});
  }
  const sortDir=$('#cfgListSortDir'); if(sortDir){
    sortDir.value = st.listSortDir;
    sortDir.onchange=()=>saveCfg({listSortDir:sortDir.value});
  }
  const dedup=$('#cfgMonthDedup'); if(dedup){
    dedup.checked = !!st.monthDedup;
    dedup.onchange=()=>saveCfg({monthDedup:dedup.checked});
  }
  const aiKey=$('#cfgAiKey'); if(aiKey){
    aiKey.value = st.aiKey||'';
    aiKey.onchange=()=>saveCfg({aiKey:aiKey.value.trim()});
  }
  const aiBaseUrl=$('#cfgAiBaseUrl'); if(aiBaseUrl){
    aiBaseUrl.value = st.aiBaseUrl;
    aiBaseUrl.onchange=()=>saveCfg({aiBaseUrl:aiBaseUrl.value.trim()});
  }
  const aiModel=$('#cfgAiModel'); if(aiModel){
    aiModel.value = st.aiModel;
    aiModel.onchange=()=>saveCfg({aiModel:aiModel.value.trim()});
  }
  const aiReq=$('#cfgAiReq'); if(aiReq){
    aiReq.value = st.aiReq||'';
    aiReq.onchange=()=>saveCfg({aiReq:aiReq.value});
  }
  document.querySelectorAll('.cfgWk').forEach(cb=>{
    cb.checked = (st.weeklyFields||[]).includes(cb.value);
    cb.onchange=()=>{ const fields=[...document.querySelectorAll('.cfgWk:checked')].map(x=>x.value); saveCfg({weeklyFields:fields}); document.querySelectorAll('.wkField').forEach(w=>{ if(w.value) w.checked=fields.includes(w.value); }); };
  });
})();
/* AI 测试连接：发一条最小请求，验证 Key/地址/模型可用 */
$('#aiTestBtn').onclick=async ()=>{
  const msg=$('#aiTestMsg');
  if(!loadSettings().aiKey){ toast('请先填写 API Key'); return; }
  msg.textContent='测试中…';
  try{
    const out=await aiChat([{role:'user',content:'只回复两个字：正常'}]);
    msg.textContent = out.trim() ? '连接成功' : '连接失败：返回为空';
    if(out.trim()) toast('AI 连接成功');
  }catch(err){
    msg.textContent = '连接失败：'+err.message;
    toast('连接失败：'+err.message);
  }
};
$('#saveColCfg').onclick=()=>{
  const rows=[...document.querySelectorAll('#colCfgList .col-grid')];
  const oldSchema=schema.slice();
  const ns=rows.map((r,i)=>{
    const name=r.querySelector('.cname').value.trim();
    const type=r.querySelector('.ctype').value;
    const ctoday=r.querySelector('.ctoday');
    let def=r.querySelector('.cdef').value;
    if(type==='date' && ctoday && ctoday.checked) def='{{today}}';
    const base={name, type, def, id:(schema[i]&&schema[i].id)||('col_'+name)};
    if(type==='date'){ const fmtEl=r.querySelector('.cdatefmt'); base.dateFmt=(fmtEl?fmtEl.value:'ymd'); }
    return base;
  });
  if(ns.some(c=>!c.name)){toast('列名不能为空');return;}
  const seen=new Set();
  for(const c of ns){ if(seen.has(c.name)){ toast('列名不能重复：'+c.name); return; } seen.add(c.name); }
  // 改名迁移：配置中心改列名时，历史任务/下拉/映射的 key 跟着改名，避免失联
  const rn=computeRenames(oldSchema, ns);
  const snapSchema=oldSchema, snapDrop=JSON.parse(JSON.stringify(dropdowns)), snapMap=JSON.parse(JSON.stringify(colMapping)), snapTasks=JSON.parse(JSON.stringify(tasks));
  if(rn.length) applyRenames(rn);
  const kept=ns.map(c=>c.name);
  Object.keys(dropdowns).forEach(k=>{ if(!kept.includes(k)) delete dropdowns[k]; });
  // P7 联动：清理 colMapping 中指向已删列的项（避免导出时映射到不存在的列）
  Object.keys(colMapping).forEach(k=>{ if(colMapping[k] && !kept.includes(colMapping[k])) delete colMapping[k]; });
  // P8 修复：先原子保存（schema/dropdowns/colMapping 三键），失败则回滚内存；成功才 mutate schema
  if(saveAtomic([[LS_SCHEMA,ns],[LS_DROPDOWNS,dropdowns],[LS_MAPPING,colMapping]])){
    schema=ns;
    // 保持编辑上下文：如果正在编辑任务，重新加载任务数据
    if(editingId){ const tk=tasks.find(x=>x.id===editingId); if(tk)renderEntry({...tk.values, entryDate:tk.entryDate}); else renderEntry(null); }
    else renderEntry(null);
    toast('列配置已保存'+(rn.length?('，已迁移 '+rn.length+' 个改名列的历史数据'):''));
  }else{
    // 回滚内存（dropdowns/colMapping 已被 applyRenames+清理改动，tasks 也被 applyRenames 改过）
    schema=snapSchema; dropdowns=snapDrop; colMapping=snapMap; tasks=snapTasks;
    toast('保存失败：本地存储可能已满，未改动');
  }
};
$('#resetColCfg').onclick=()=>{
  if(!confirm('恢复默认15列表结构？当前列配置会被覆盖（改过名的列会自动把历史数据迁回默认列名）。')) return;
  const oldSchema=schema.slice();
  const ns=DEFAULT_SCHEMA.map(c=>({...c}));
  const rn=computeRenames(oldSchema, ns);
  const snapSchema=oldSchema, snapDrop=JSON.parse(JSON.stringify(dropdowns)), snapMap=JSON.parse(JSON.stringify(colMapping)), snapTasks=JSON.parse(JSON.stringify(tasks));
  if(rn.length) applyRenames(rn);
  const names=ns.map(c=>c.name);
  Object.keys(dropdowns).forEach(k=>{ if(!names.includes(k)) delete dropdowns[k]; });
  Object.keys(colMapping).forEach(k=>{ if(colMapping[k] && !names.includes(colMapping[k])) delete colMapping[k]; });
  // P8 联动：原子保存，失败回滚
  if(saveAtomic([[LS_SCHEMA,ns],[LS_DROPDOWNS,dropdowns],[LS_MAPPING,colMapping]])){
    schema=ns; renderConfig();
    if(editingId){ const tk=tasks.find(x=>x.id===editingId); if(tk)renderEntry({...tk.values,entryDate:tk.entryDate}); else renderEntry(null); } else renderEntry(null);
    toast('已恢复'+(rn.length?('，已迁移 '+rn.length+' 个改名列的历史数据'):''));
  }else{
    schema=snapSchema; dropdowns=snapDrop; colMapping=snapMap; tasks=snapTasks;
    toast('恢复失败：本地存储可能已满，未改动');
  }
};
$('#exportCfg').onclick=()=>{ downloadJSON({schema,dropdowns},'周报配置备份.json'); markBackup(); toast('配置已备份'); };
$('#importCfg').onclick=()=>$('#importCfgFile').click();
$('#importCfgFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d.schema || !Array.isArray(d.schema)) throw new Error('缺少有效的 schema 数组');
      // 验证 schema 结构
      const validSchema = d.schema.map(c=>{
        if(typeof c!=='object' || !c.name) throw new Error('列配置项缺少 name 字段');
        const validTypes=['text','dropdown','date','textarea','auto'];
        const type=validTypes.includes(c.type)?c.type:'text';
        const base={name:String(c.name).trim(), type, def:String(c.def||''), id:(c.id||('col_'+String(c.name).trim()))};
        if(type==='date') base.dateFmt=(c.dateFmt==='md')?'md':'ymd'; // #C1 保留按列日期格式
        return base;
      });
      // 验证 dropdowns 结构
      let validDropdowns={};
      if(d.dropdowns && typeof d.dropdowns==='object'){
        Object.entries(d.dropdowns).forEach(([k,v])=>{
          if(Array.isArray(v)) validDropdowns[String(k)]=v.map(String).filter(Boolean);
        });
      }
      const oldSchema=schema.slice();
      schema=validSchema.map(c=>({name:String(c.name), type:c.type, def:String(c.def||''), id:(c.id||('col_'+String(c.name))), dateFmt:(c.type==='date'?(c.dateFmt||'ymd'):undefined)}));
      const rn=computeRenames(oldSchema, schema); if(rn.length) applyRenames(rn);
      dropdowns=validDropdowns;
      save(LS_SCHEMA,schema);save(LS_DROPDOWNS,dropdowns);save(LS_MAPPING,colMapping);
      renderConfig();
      if(editingId){const tk=tasks.find(x=>x.id===editingId);if(tk)renderEntry({...tk.values,entryDate:tk.entryDate});else renderEntry(null);}
      else renderEntry(null);
      toast('配置已导入');
    }catch(err){toast('导入失败：'+err.message);}
  };
  r.readAsText(f);e.target.value='';
};
