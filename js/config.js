/* ============ 配置中心（config.js） ============ */
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
      <span class="today-cell">${isDate?`<input type="checkbox" class="ctoday" ${todayChecked?'checked':''}>` : '<span class="muted">—</span>'}</span>
      <span class="col-del-wrap">
        <button class="btn sec sm col-up" title="上移">▲</button>
        <button class="btn sec sm col-down" title="下移">▼</button>
        <button class="btn del sm cdel">删除</button>
      </span>`;
    list.appendChild(div);
    const ctype=div.querySelector('.ctype'), cdef=div.querySelector('.cdef'), ctoday=div.querySelector('.ctoday');
    div.querySelector('.cdel').onclick=()=>{ schema=schema.filter((_,j)=>j!==i); renderConfig(); };
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
}
$('#addCol').onclick=()=>{ schema.push({name:'新列',type:'text',def:''}); renderConfig(); };

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
    cb.onchange=()=>{ const fields=[...document.querySelectorAll('.cfgWk:checked')].map(x=>x.value); saveCfg({weeklyFields:fields}); };
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
  const ns=rows.map(r=>{
    const name=r.querySelector('.cname').value.trim();
    const type=r.querySelector('.ctype').value;
    const ctoday=r.querySelector('.ctoday');
    let def=r.querySelector('.cdef').value;
    if(type==='date' && ctoday && ctoday.checked) def='{{today}}';
    return {name, type, def};
  });
  if(ns.some(c=>!c.name)){toast('列名不能为空');return;}
  const seen=new Set();
  for(const c of ns){ if(seen.has(c.name)){ toast('列名不能重复：'+c.name); return; } seen.add(c.name); }
  const kept=ns.map(c=>c.name);
  Object.keys(dropdowns).forEach(k=>{ if(!kept.includes(k)) delete dropdowns[k]; });
  schema=ns; save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns);
  // 保持编辑上下文：如果正在编辑任务，重新加载任务数据
  if(editingId){ const tk=tasks.find(x=>x.id===editingId); if(tk)renderEntry({...tk.values, entryDate:tk.entryDate}); else renderEntry(null); }
  else renderEntry(null);
  toast('列配置已保存');
};
$('#resetColCfg').onclick=()=>{ if(confirm('恢复默认15列表结构？当前列配置会被覆盖。')){schema=DEFAULT_SCHEMA.map(c=>({...c}));const names=schema.map(c=>c.name);Object.keys(dropdowns).forEach(k=>{if(!names.includes(k))delete dropdowns[k];});save(LS_SCHEMA,schema);save(LS_DROPDOWNS,dropdowns);renderConfig();if(editingId){const tk=tasks.find(x=>x.id===editingId);if(tk)renderEntry({...tk.values,entryDate:tk.entryDate});else renderEntry(null);}else renderEntry(null);toast('已恢复');} };
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
        return {name:String(c.name).trim(), type, def:String(c.def||'')};
      });
      // 验证 dropdowns 结构
      let validDropdowns={};
      if(d.dropdowns && typeof d.dropdowns==='object'){
        Object.entries(d.dropdowns).forEach(([k,v])=>{
          if(Array.isArray(v)) validDropdowns[String(k)]=v.map(String).filter(Boolean);
        });
      }
      schema=validSchema;dropdowns=validDropdowns;
      save(LS_SCHEMA,schema);save(LS_DROPDOWNS,dropdowns);
      renderConfig();
      if(editingId){const tk=tasks.find(x=>x.id===editingId);if(tk)renderEntry({...tk.values,entryDate:tk.entryDate});else renderEntry(null);}
      else renderEntry(null);
      toast('配置已导入');
    }catch(err){toast('导入失败：'+err.message);}
  };
  r.readAsText(f);e.target.value='';
};
