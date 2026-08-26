/* ============ 导出追加（export.js，基于 ExcelJS 写样式） ============ */
/* 样式：等线 11 字体；进度列含换行时自动换行（SheetJS 社区版不写样式，故换 ExcelJS） */
let excelFileName = ''; // 保存上传的文件名

function styleCell(cell, wrap){
  cell.font=EXCEL_FONT;
  cell.alignment = wrap ? {wrapText:true,vertical:'top',horizontal:'left'} : {vertical:'top'};
}

$('#excelDrop').onclick=()=>{$('#excelFile').click();};
const dropEl=document.getElementById('excelDrop');
if(dropEl){
  dropEl.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();dropEl.style.borderColor='var(--blue)';});
  dropEl.addEventListener('dragleave',()=>{dropEl.style.borderColor='';});
  dropEl.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();
    dropEl.style.borderColor='';
    if(e.dataTransfer.files.length){
      const dt=new DataTransfer();
      for(const file of e.dataTransfer.files) dt.items.add(file);
      const el=$('#excelFile');
      el.files=dt.files;
      el.dispatchEvent(new Event('change'));
    }
  });
}

$('#excelFile').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  if(!/\.xlsx$/i.test(f.name)){ toast('仅支持 .xlsx 文件（旧版 .xls 请先在 Excel 里另存为 .xlsx）'); e.target.value=''; return; }
  excelFileName = f.name;
  $('#excelName').textContent=f.name;
  try{
    const buf=await f.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.getWorksheet(1);
    // 找表头行：首个非空单元格>=3 的行（1-based）
    let hr=1; let foundHeader=false;
    for(;hr<=ws.rowCount;hr++){ let n=0; ws.getRow(hr).eachCell(()=>{n++;}); if(n>=3){foundHeader=true;break;} }
    if(!foundHeader){ toast('未能识别表头行（需至少3个非空单元格）'); return; }
    excelHeaderRow=hr;
    excelBook=wb; excelSheet=ws; excelSheetName=ws.name;
    const maxCol=Math.max(ws.getRow(hr).cellCount||0, ws.columnCount||0);
    excelHeaders=[];
    for(let c=1;c<=maxCol;c++){ const v=ws.getRow(hr).getCell(c).value; excelHeaders.push(v!=null?String(v).trim():''); }
    const savedMap=load(LS_MAPPING,{});
    colMapping={}; excelHeaders.forEach(h=>{ const saved=(h in savedMap)?savedMap[h]:''; colMapping[h]=(saved&&schema.some(c=>c.name===saved))?saved:(matchCol(h)||''); });
    save(LS_MAPPING,colMapping);
    $('#excelInfo').textContent=`已读取：${f.name} · 工作表「${excelSheetName}」· 表头在第${hr}行 · 识别列：${excelHeaders.filter(Boolean).join(' / ')}`;
    renderColMap(); renderPreview();
  }catch(err){toast('读取失败：'+err.message);}
};

function renderColMap(){
  const wrap=$('#colMap');
  if(!excelBook){wrap.innerHTML='';return;}
  let h='<div class="hint" style="margin-top:14px">列名映射：左为 excel 表头，右为对应到本工具的列。灰色自动识别；可改选或选「（不导出）」。绿色=已匹配，红色=未匹配。下次上传同结构文件会自动套用。</div><div class="col-map-grid">';
  excelHeaders.forEach(hd=>{
    const cur=colMapping[hd]||matchCol(hd)||'';
    const opts=schema.map(c=>`<option value="${esc(c.name)}"${c.name===cur?' selected':''}>${esc(c.name)}</option>`).join('');
    const cls = cur ? 'mapped' : (hd?'unmatched':'');
    h+=`<div class="cm-row ${cls}"><span class="cm-src" title="${esc(hd)}">${esc(hd)||'（空表头）'}</span><select data-h="${esc(hd)}"><option value="">（不导出）</option>${opts}</select></div>`;
  });
  h+='</div>'; wrap.innerHTML=h;
  wrap.querySelectorAll('select').forEach(s=>s.onchange=()=>{colMapping[s.dataset.h]=s.value; save(LS_MAPPING,colMapping); renderPreview();});
}

function mapTaskToRow(task){
  const row={};
  excelHeaders.forEach(h=>{
    const key=effMap(h)||'';
    if(!key || key==='项次') return;
    if(task.values[key]!=null && task.values[key]!==''){
      let v=task.values[key];
      const colDef=schema.find(c=>c.name===key);
      if(colDef&&colDef.type==='date'){ const dt=parseDateAny(v); v=dt?fmtDateCN(dt):v; }
      row[h]=v;
    }
  });
  return row;
}

function setDefaultRange(){
  const now=new Date();
  const day=now.getDay();
  const diff=(day===0?-6:1-day);
  const mon=new Date(now);mon.setDate(now.getDate()+diff);
  const fri=new Date(mon);fri.setDate(mon.getDate()+4);
  $('#rangeStart').value=toInputDate(mon);
  $('#rangeEnd').value=toInputDate(fri);
}
$('#thisWeek').onclick=setDefaultRange;
$('#thisWeekToToday').onclick=()=>{ setDefaultRange(); $('#rangeEnd').value=todayStr(); };

function skipExportedChecked(){const el=$('#skipExported');return el&&el.checked;}
function getRangeTasks(){
  const s=$('#rangeStart').value, e=$('#rangeEnd').value;
  if(!s||!e)return [];
  const st=parseDateAny(s), en=parseDateAny(e);
  if(!st||!en){ toast('日期格式无效'); return []; }
  st.setHours(0,0,0,0); en.setHours(23,59,59,999);
  return tasks.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d>=st&&d<=en && (!skipExportedChecked()||!t.exported);});
}
function renderPreview(){
  const t=getRangeTasks();
  $('#previewCount').textContent='（范围内 '+t.length+' 条'+(skipExportedChecked()?'，已隐藏已追加':'')+'）';
  const wrap=$('#previewTable');
  if(!t.length){wrap.innerHTML='<p class="muted">该时间范围内没有任务。</p>';return;}
  let headers, valOf;
  if(excelBook){
    headers=excelHeaders.map(h=>({name:h, key:effMap(h)||''}));
    valOf=(task,hd)=>{
      const key=effMap(hd)||'';
      if(key==='项次')return '（自动续号）';
      if(!key)return '';
      let v=task.values[key]||'';
      const cd=schema.find(c=>c.name===key);
      if(cd&&cd.type==='date'){const dt=parseDateAny(v);v=dt?fmtDateCN(dt):v;}
      return v;
    };
  }else{
    headers=schema.filter(c=>c.type!=='auto').map(c=>({name:c.name,key:c.name}));
    valOf=(task,c)=>task.values[c]||'';
  }
  let h='<table><thead><tr>'+(excelBook?'<th>录入日期</th>':'')+headers.map(x=>`<th>${esc(x.name)}</th>`).join('')+'</tr></thead><tbody>';
  t.forEach(task=>{
    h+='<tr>'+(excelBook?`<td>${task.entryDate}</td>`:'');
    headers.forEach(x=>{let v=valOf(task,x.name); h+=`<td>${esc(String(v)).replace(/\n/g,'<br>')||'—'}</td>`;});
    h+='</tr>';
  });
  h+='</tbody></table>';wrap.innerHTML=h;
}

/* ============ 导出前整表结构校验 ============ */
const CRITICAL_COLS=['专案名称','客户','负责人','完成状态','提出日期','开发日期'];
function looksLikeValue(s){
  if(!s)return false;
  s=String(s).trim(); if(s==='')return false;
  return /^[\d.,+\-]+$/.test(s)
      || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)
      || /^\d{1,2}[-/]\d{1,2}$/.test(s);
}
function validateExportStructure(){
  const errors=[], warnings=[];
  if(!excelBook){ errors.push('尚未选择 excel 文件，无法校验，请先上传周报模板。'); return {errors,warnings}; }
  if(!excelHeaders.length){ errors.push('未能读取到任何表头列，文件可能已损坏或为空。'); return {errors,warnings}; }

  const nonBlank=excelHeaders.filter(h=>String(h).trim()!=='');
  const matched=excelHeaders.filter(h=>matchCol(h));
  const valueLike=nonBlank.filter(h=>looksLikeValue(h));

  // 1) 表头行识别合理性
  if(matched.length===0){
    errors.push(`未识别到任何已知列名，表头可能识别错误（当前检测在第 ${excelHeaderRow} 行）。请确认上传的是周报模板，或在「列名映射」中手动指定每列对应。`);
  } else if(nonBlank.length && valueLike.length > nonBlank.length*0.5){
    errors.push(`表头行疑似被识别为数据行：超过半数的表头单元格像是数值/日期（检测在第 ${excelHeaderRow} 行）。请检查表头行识别是否正确。`);
  } else if(matched.length < nonBlank.length*0.5){
    warnings.push(`表头仅匹配到 ${matched.length}/${nonBlank.length} 个已知列名，可能存在列名差异，请核对「列名映射」。`);
  }
  if(excelHeaderRow!==1){
    warnings.push(`表头不在第 1 行（检测在第 ${excelHeaderRow} 行）；若文件顶部有标题行属正常，否则请确认识别无误。`);
  }

  // 2) schema 列映射完整性（数据丢失风险）
  schema.forEach(c=>{
    if(c.type==='auto')return;
    const mapped=excelHeaders.some(h=>effMap(h)===c.name);
    if(!mapped){
      if(CRITICAL_COLS.includes(c.name)) errors.push(`关键列「${c.name}」未映射到任何 excel 列，导出后该列数据将丢失。`);
      else warnings.push(`列「${c.name}」未映射，导出后该列留空（如需写入请在映射中指定）。`);
    }
  });

  // 3) 项次列
  if(!excelHeaders.some(h=>effMap(h)==='项次')){
    warnings.push('未找到「项次」列，导出行将不带自动续号（若模板本无此列可忽略）。');
  }

  // 4) 重复映射（数据碰撞）
  const bySchema={};
  excelHeaders.forEach(h=>{ const k=effMap(h); if(k) (bySchema[k]=bySchema[k]||[]).push(h); });
  Object.keys(bySchema).forEach(k=>{ if(bySchema[k].length>1) errors.push(`列「${k}」被多个 excel 表头映射（${bySchema[k].join('、')}），写入会互相覆盖，请只保留一个。`); });

  // 5) 映射到空白表头的列
  excelHeaders.forEach(h=>{ if(String(h).trim()==='' && effMap(h)) warnings.push(`存在空白表头却已映射到「${effMap(h)}」，请将其映射改为「（不导出）」。`); });

  // 6) 项次列非数字检查
  const seqHd=excelHeaders.find(h=>effMap(h)==='项次');
  if(seqHd){
    const seqCol=excelHeaders.indexOf(seqHd)+1; // 1-based
    const ws=excelSheet;
    let bad=0;
    for(let r=excelHeaderRow+1;r<=ws.rowCount;r++){ const v=ws.getRow(r).getCell(seqCol).value; if(v!==''&&v!=null&&isNaN(Number(v))) bad++; }
    if(bad>0) warnings.push(`项次列存在 ${bad} 个非数字单元格，自动续号基准可能不准确。`);
  }

  // 7) 范围任务数
  const t=getRangeTasks();
  if(!t.length) errors.push('当前时间范围内没有可追加的任务（或全部已追加且勾选了跳过）。');

  // 8) 分组插入模式需映射「完成状态」列
  if(appendMode()==='group' && !excelHeaders.some(h=>effMap(h)==='完成状态')){
    errors.push('「按状态分组插入」模式需要将「完成状态」列映射到本工具的完成状态列，请在上方「列名映射」中为对应表头选择「完成状态」。');
  }

  return {errors,warnings};
}
function renderValidateReport(res){
  const el=$('#validateReport'); if(!el)return;
  const {errors,warnings}=res;
  if(!errors.length && !warnings.length){
    el.className='val-report ok';
    el.innerHTML='<b>✓ 结构校验通过</b>：表头识别、关键列映射、重复映射、项次连续性、范围任务数均正常，可放心导出。';
    return;
  }
  let h='';
  if(errors.length) h+='<div class="val-sec"><b>✕ 阻断项（需处理，否则无法导出）</b><ul>'+errors.map(e=>`<li>${esc(e)}</li>`).join('')+'</ul></div>';
  if(warnings.length) h+='<div class="val-sec"><b>⚠ 警告项（确认无误后仍可导出）</b><ul>'+warnings.map(w=>`<li>${esc(w)}</li>`).join('')+'</ul></div>';
  el.className='val-report '+(errors.length?'has-err':'has-warn');
  el.innerHTML=h;
}

$('#validateBtn').onclick=()=>{
  const res=validateExportStructure();
  renderValidateReport(res);
  if(!res.errors.length && !res.warnings.length) toast('结构校验通过');
  else if(res.errors.length) toast('校验发现阻断项，见报告');
  else toast('校验有警告，见报告');
};

$('#doExport').onclick=async ()=>{
  const res=validateExportStructure();
  renderValidateReport(res);
  if(res.errors.length){ toast('结构校验未通过，见下方报告'); return; }
  if(res.warnings.length){
    if(!confirm(`校验发现 ${res.warnings.length} 项警告（见下方报告）。\n仍要导出？`)){ toast('已取消导出'); return; }
  }
  await doExportInner();
};

function appendMode(){ const el=$('#appendMode'); return el?el.value:'group'; }
function copyRowStyleOn(){ const el=$('#copyRowStyle'); return el?el.checked:true; }

/* 初始化导出页「对齐上一行样式 / 追加模式」为配置中心的默认值（导出页仍可临时调整单次） */
(function(){
  const cfg=load(LS_EXPORTCFG,{})||{};
  const m=$('#appendMode'); if(m && cfg.appendMode) m.value=cfg.appendMode;
  const c=$('#copyRowStyle'); if(c && cfg.copyRowStyle!==undefined) c.checked=cfg.copyRowStyle;
})();

/* 复制源行样式（行高 + 各单元格边框/填充/字体/对齐/数字格式）到目标行。
   遍历全部列（含「有样式但值空」的单元格，如测试/结案日期、备注等），确保整行视觉对齐 */
function copyRowStyle(ws, target, source){
  const src=ws.getRow(source), tgt=ws.getRow(target);
  tgt.height=src.height;
  const cols=Math.max(src.cellCount||0, excelHeaders.length, 20);
  for(let c=1;c<=cols;c++){
    const sc=src.getCell(c);
    if(sc.style && Object.keys(sc.style).length>0){
      tgt.getCell(c).style=JSON.parse(JSON.stringify(sc.style));
    }
  }
}

/* 向指定行写入一个任务（seqVal 为 null 表示项次列暂不填，由调用方统一处理） */
function writeRowVals(ws, rowNum, task, seqVal){
  const newRow=ws.getRow(rowNum);
  const row=mapTaskToRow(task);
  const copyStyle=copyRowStyleOn();
  // 对齐上一行样式（默认开启）：复制行高与单元格样式，使新行与模板视觉一致
  if(copyStyle && rowNum>1) copyRowStyle(ws, rowNum, rowNum-1);
  excelHeaders.forEach((h,c)=>{
    const col=c+1;
    let val='';
    if(seqVal!=null && effMap(h)==='项次'){ val=seqVal; }
    else if(h in row){ val=row[h]; }
    const cell=newRow.getCell(col);
    cell.value=val;
    if(copyStyle){
      // 已复制上一行样式：保留模板字体/边框/底色，仅对含换行的进度列补充自动换行
      if(/进度/.test(h)&&String(val).includes('\n')){
        const a=Object.assign({},cell.alignment||{}); a.wrapText=true; a.vertical='top'; a.horizontal='left'; cell.alignment=a;
      }
    }else{
      if(/进度/.test(h)&&String(val).includes('\n')) styleCell(cell,true); else styleCell(cell);
    }
  });
}

/* 末尾追加（现有模式）：按项次续号，从最后数据行之后追加 */
function appendToEnd(ws, t, lastDataRow){
  const seqHd=excelHeaders.find(h=>effMap(h)==='项次');
  const seqCol=seqHd?excelHeaders.indexOf(seqHd)+1:0;
  let lastSeq=0;
  if(seqCol){ for(let r=excelHeaderRow+1;r<=lastDataRow;r++){ const v=ws.getRow(r).getCell(seqCol).value; const n=(typeof v==='number')?v:((typeof v==='string'&&/^\d+$/.test(String(v).trim()))?parseInt(v,10):0); if(n>lastSeq)lastSeq=n; } }
  let nextR=lastDataRow+1;
  t.forEach((task,idx)=>{ writeRowVals(ws, nextR, task, lastSeq+idx+1); nextR++; });
}

/* 按状态分组插入：每个任务插入到模板中同状态组的最后一条之后，后续行自动后移；项次整列重新编号。
   未知状态 / 空状态追加到整个表格末尾。 */
function insertGrouped(ws, t, lastDataRow){
  const stHd=excelHeaders.find(h=>effMap(h)==='完成状态');
  if(!stHd) return; // 校验阶段已拦截
  const stCol=excelHeaders.indexOf(stHd)+1;
  // 扫描数据区，记录每个状态值「最后一条」所在行号
  const lastRowOf={};
  for(let r=excelHeaderRow+1;r<=lastDataRow;r++){
    const cell=ws.getRow(r).getCell(stCol);
    const v=(cell.value!=null)?String(cell.value).trim():'';
    lastRowOf[v]=r;
  }
  // 计算每个任务的插入锚点：模板有该状态→用该状态最后行；否则用表格末尾
  const items=t.map(task=>{
    const st=String(task.values['完成状态']||'').trim();
    return {task, anchor:(lastRowOf[st]!=null?lastRowOf[st]:lastDataRow)};
  });
  // 按锚点降序稳定排序（从下往上插：下方插入不影响上方锚点行号；同锚点保持录入顺序）
  items.sort((a,b)=>b.anchor-a.anchor);
  const cnt={}; // 每个锚点已插条数（同一状态组内连续插入，位置依次 +1）
  items.forEach(({task,anchor})=>{
    cnt[anchor]=(cnt[anchor]||0)+1;
    const pos=anchor+cnt[anchor];
    ws.insertRow(pos, []);
    writeRowVals(ws, pos, task, null);
  });
  // 项次整列重新编号（表头下第一行到末尾）
  const seqHd=excelHeaders.find(h=>effMap(h)==='项次');
  if(seqHd){
    const seqCol=excelHeaders.indexOf(seqHd)+1;
    let n=1;
    const finalLast=lastDataRow+items.length;
    for(let r=excelHeaderRow+1;r<=finalLast;r++){ ws.getRow(r).getCell(seqCol).value=n++; }
  }
}

async function doExportInner(){
  const ws=excelSheet;
  // 找到最后一个非空数据行（模板底部可能预留空白行，避免追加后夹空行、续号基准不准）
  let lastDataRow=excelHeaderRow;
  for(let r=excelHeaderRow+1;r<=ws.rowCount;r++){
    let has=false;
    ws.getRow(r).eachCell(()=>{ has=true; });
    if(has)lastDataRow=r;
  }
  const t=getRangeTasks();
  if(!t.length) return;
  if(appendMode()==='group') insertGrouped(ws, t, lastDataRow);
  else appendToEnd(ws, t, lastDataRow);
  const out=await excelBook.xlsx.writeBuffer();
  const base=(excelFileName||'周报').replace(/\.xlsx?$/i,'');
  downloadBlob(new Blob([out],{type:'application/octet-stream'}), base+'_已追加.xlsx');
  t.forEach(x=>{x.exported=true;}); save(LS_TASKS,tasks);
  $('#exportMsg').textContent=`已追加 ${t.length} 条，另存为「${base}_已追加.xlsx」（已标记防重复）`;
  renderPreview();
  toast('生成成功，已下载');
}

/* ============ 生成新周报（新建文件，按配置中心列顺序，不依赖模板） ============ */
async function buildNewWorkbook(){
  const t=getRangeTasks();
  if(!t.length) return null;
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('周报');
  const cols=schema; // 配置中心顺序（含 auto 项次）
  const hrow=ws.getRow(1);
  cols.forEach((c,i)=>{ const cell=hrow.getCell(i+1); cell.value=c.name; styleCell(cell); });
  t.forEach((task,idx)=>{
    const values=cols.map(c=>{
      if(c.type==='auto') return idx+1; // 项次自动续号，从 1 起
      let v=task.values[c.name]||'';
      if(c.type==='date'){ const dt=parseDateAny(v); v=dt?fmtDateCN(dt):v; }
      return v;
    });
    const row=ws.addRow(values);
    cols.forEach((c,i)=>{
      const cell=row.getCell(i+1);
      if(/进度/.test(c.name)&&typeof cell.value==='string'&&cell.value.includes('\n')) styleCell(cell,true); else styleCell(cell);
    });
  });
  return {wb,t};
}
$('#genNew').onclick=async ()=>{
  const res=await buildNewWorkbook();
  if(!res){ toast('该时间范围内没有任务，无法生成新周报'); return; }
  const {wb,t}=res;
  const s=$('#rangeStart').value, e=$('#rangeEnd').value;
  const out=await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([out],{type:'application/octet-stream'}), `周报_${s}_${e}.xlsx`);
  t.forEach(x=>{ x.exported=true; }); save(LS_TASKS,tasks);
  $('#genNewMsg').textContent=`已生成 ${t.length} 条，另存为「周报_${s}_${e}.xlsx」（已标记防重复）`;
  toast('已生成新周报');
};
