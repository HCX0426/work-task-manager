/* ============ 导出追加（export.js，基于 ExcelJS 写样式） ============ */
/* 样式：等线 11 字体；进度列含换行时自动换行（SheetJS 社区版不写样式，故换 ExcelJS） */
let excelFileName = ''; // 保存上传的文件名
let lastExportedIds = []; // 最近一次导出追加/生成新周报涉及的任务 id，供「撤销本次追加」

function styleCell(cell, wrap){
  const st=loadSettings();
  const font={};
  if(st.exportFontName) font.name=st.exportFontName;
  if(st.exportFontSize) font.size=Number(st.exportFontSize)||undefined;
  if(Object.keys(font).length) cell.font=font; // 空配置=不设置字体/字号（沿用默认或模板）
  cell.alignment = wrap ? {wrapText:true,vertical:'top',horizontal:'left'} : {vertical:'top'};
}

/* ============ 导出样式（字体/字号/背景色，默认空=不设置） ============ */
/* 颜色归一化统一走 store.js 的 normalizeHex（合并了原先 export.js 的 toArgb 与 config.js 的 toHex
   两份近似实现）；此处仅保留「非法输入 → null」的 ExcelJS 语义封装。 */
function toArgb(hex){ return normalizeHex(hex, true) || null; }
/* 表头单元格：基础样式 + 配置的表头背景色 */
function styleHeader(cell){ styleCell(cell); const bg=toArgb(loadSettings().exportHeaderBg); if(bg) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}}; }
/* 状态列背景色：按任务「完成状态」取值查配置映射，命中则返回 fill，否则 null */
function statusBgFill(status){
  const map=loadSettings().exportStatusBg||{};
  const argb=toArgb(map[String(status||'')]);
  return argb ? {type:'pattern',pattern:'solid',fgColor:{argb}} : null;
}

/* ============ 导出文件名：前缀 + 日期范围（按配置日期格式） ============ */
function fmtFileDate(d){
  const fmt=loadSettings().exportFileDateFormat||'YYYYMMDD';
  const dt=parseDateAny(d); if(!dt) return '';
  const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,'0'), day=String(dt.getDate()).padStart(2,'0');
  if(fmt==='MMDD') return m+day;
  if(fmt==='YYYY-MM-DD') return y+'-'+m+'-'+day;
  if(fmt==='YYYY/MM/DD') return y+'/'+m+'/'+day;
  return ''+y+m+day; // 默认 YYYYMMDD
}
function buildFileName(s,e){
  const pre=(loadSettings().exportFilePrefix||'').trim();
  const a=fmtFileDate(s), b=fmtFileDate(e);
  return pre + (a&&b ? (a+'-'+b) : (a||b||'周报'));
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
  // 统一走 store.js 的上传校验：扩展名 + 大小上限（旧实现只校验扩展名，超大文件解析时会长时间阻塞主线程）
  const chk=checkUploadFile(f);
  if(!chk.ok){ toast(chk.msg); e.target.value=''; return; }
  excelFileName = f.name;
  $('#excelName').textContent=f.name;
  try{
    const buf=await f.arrayBuffer();
    await loadExcelJS(); const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.getWorksheet(1);
    // 行数上限前置拦截（避免超大清单读进内存阻塞主线程）
    const rc=checkUploadRows(ws); if(!rc.ok){ toast(rc.msg); e.target.value=''; return; }
    // 表头识别统一走 store.js 的 findHeaderRow/readHeaders（原三处各写一份，阈值也各写一遍）
    const hr=findHeaderRow(ws);
    if(!hr){ toast('未能识别表头行（需至少'+MIN_HEADER_CELLS+'个非空单元格）'); return; }
    excelHeaderRow=hr;
    excelBook=wb; excelSheet=ws; excelSheetName=ws.name;
    excelHeaders=readHeaders(ws, hr);
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
    if(!key || key===COL.SEQ) return;
    if(task.values[key]!=null && task.values[key]!==''){
      let v=task.values[key];
      const colDef=schema.find(c=>c.name===key);
      if(colDef&&colDef.type==='date'){ const dt=parseDateAny(v); if(dt) v=(colDef.dateFmt==='md')?fmtDateMD(dt):fmtDateCN(dt); }
      row[h]=v;
    }
  });
  return row;
}

function setDefaultRange(){
  const {start}=weekRange();
  const fri=new Date(start); fri.setDate(start.getDate()+4);
  $('#rangeStart').value=toInputDate(start);
  $('#rangeEnd').value=toInputDate(fri);
}
$('#thisWeek').onclick=setDefaultRange;
$('#thisWeekToToday').onclick=()=>{ setDefaultRange(); $('#rangeEnd').value=todayStr(); };

function skipExportedChecked(){const el=$('#skipExported');return el&&el.checked;}
/* 取任务的筛选日期：按范围日期类型（录入/提出/开发）。
   取值统一走 DATE_BY 并经 normalizeDateBy 归一（旧配置可能残留 'entryDate'，与「录入日期」是同一含义的两个值）；
   「录入日期」是任务字段 entryDate 而非 schema 列，故单独分支；其余直接按列名取值，扩展新依据只需在 DATE_BY 加一项。 */
function taskRangeDate(t){
  const by=normalizeDateBy(($('#rangeBy') && $('#rangeBy').value) || DATE_BY.DEV);
  if(by===DATE_BY.ENTRY) return t.entryDate;
  return t.values[by];
}

/* ============ 导出排序（可配置，导出/追加/生成新周报统一生效） ============ */
/* 排序依据：导出页下拉优先，否则用配置中心默认（exportSortBy）。
   可选：录入日期 / 提出日期 / 开发日期（以后扩展只需在 store.js 的 DATE_BY 加一项）。 */
function exportSortByVal(){
  const el=$('#exportSortBy'); const v=normalizeDateBy(el&&el.value); if(v) return v;
  return normalizeDateBy(loadSettings().exportSortBy)||DATE_BY.DEV;
}
function exportSortDirVal(){
  const el=$('#exportSortDir'); const v=el&&el.value; if(v) return v;
  return (loadSettings().exportSortDir)||SORT_ASC;
}
/* 取单条排序键：返回时间戳（毫秒）；空日期置为 null（排序时排最后） */
function exportSortKey(t){
  const by=exportSortByVal();
  const raw = (by===DATE_BY.ENTRY) ? t.entryDate : t.values[by];
  const d=parseDateAny(raw);
  return d ? d.getTime() : null;
}
/* 稳定排序（原数组原地排序并返回）：空日期永远排最后；同键保持原有相对顺序 */
function sortExportTasks(arr){
  const dir=(exportSortDirVal()===SORT_DESC) ? -1 : 1;
  arr.sort((a,b)=>{
    const ka=exportSortKey(a), kb=exportSortKey(b);
    const ea=ka==null, eb=kb==null;
    if(ea&&eb) return 0;
    if(ea) return 1;   // 空日期排最后
    if(eb) return -1;
    return (ka-kb)*dir;
  });
  return arr;
}

function getRangeTasks(skipAppend){
  if(skipAppend===undefined) skipAppend=skipExportedChecked(); // 追加通道默认尊重「跳过已追加」；生成新周报传 false（新文件应包含全部）
  const s=$('#rangeStart').value, e=$('#rangeEnd').value;
  if(!s||!e)return [];
  const st=parseDateAny(s), en=parseDateAny(e);
  if(!st||!en){ toast('日期格式无效'); return []; }
  st.setHours(0,0,0,0); en.setHours(23,59,59,999);
  const arr=tasks.filter(t=>{const d=parseDateAny(taskRangeDate(t));return d&&d>=st&&d<=en && (!skipAppend||!t.exported);});
  sortExportTasks(arr); // 按配置的导出排序依据+方向稳定排序（空日期置尾）
  return arr;
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
      if(key===COL.SEQ)return '（自动续号）';
      if(!key)return '';
      let v=task.values[key]||'';
      const cd=schema.find(c=>c.name===key);
      if(cd&&cd.type==='date'){const dt=parseDateAny(v);v=dt?(cd.dateFmt==='md'?fmtDateMD(dt):fmtDateCN(dt)):v;} // m1 修复：预览也按列 dateFmt，与真实导出一致
      return v;
    };
  }else{
    headers=schema.filter(c=>c.type!=='auto').map(c=>({name:c.name,key:c.name}));
    // P6 修复：无 excel 模板时预览也按列 dateFmt 输出（与有模板分支 m1 一致，避免日期格式两套口径）
    valOf=(task,c)=>{
      const cd=schema.find(col=>col.name===c);
      let v=task.values[c]||'';
      if(cd&&cd.type==='date'){ const dt=parseDateAny(v); v=dt?(cd.dateFmt==='md'?fmtDateMD(dt):fmtDateCN(dt)):v; }
      return v;
    };
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
/* 关键列常量统一在 store.js 的 CRITICAL_COLS 定义（避免两处各写一份后漂移） */
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
  if(!excelHeaders.some(h=>effMap(h)===COL.SEQ)){
    warnings.push('未找到「项次」列，导出行将不带自动续号（若模板本无此列可忽略）。');
  }

  // 4) 重复映射（数据碰撞）
  const bySchema={};
  excelHeaders.forEach(h=>{ const k=effMap(h); if(k) (bySchema[k]=bySchema[k]||[]).push(h); });
  Object.keys(bySchema).forEach(k=>{ if(bySchema[k].length>1) errors.push(`列「${k}」被多个 excel 表头映射（${bySchema[k].join('、')}），写入会互相覆盖，请只保留一个。`); });

  // 5) 映射到空白表头的列
  excelHeaders.forEach(h=>{ if(String(h).trim()==='' && effMap(h)) warnings.push(`存在空白表头却已映射到「${effMap(h)}」，请将其映射改为「（不导出）」。`); });

  // 6) 项次列非数字检查
  const seqHd=excelHeaders.find(h=>effMap(h)===COL.SEQ);
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
  if(appendMode()==='group' && !excelHeaders.some(h=>effMap(h)===COL.STATUS)){
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
  await doExportInner(getRangeTasks()); // 复用校验阶段已算好的列表，避免同一次导出重复筛选+排序
};

function appendMode(){ const el=$('#appendMode'); return el?el.value:'group'; }
function copyRowStyleOn(){ const el=$('#copyRowStyle'); return el?el.checked:true; }

/* 初始化导出页「追加模式 / 对齐样式 / 范围日期类型 / 排序依据 / 排序方向」为配置中心默认值（导出页仍可临时调整单次）
   日期类型经 normalizeDateBy 归一，避免旧配置残留的 'entryDate' 与下拉选项值（录入日期）对不上导致下拉显示空白 */
(function(){
  const st=loadSettings();
  const m=$('#appendMode'); if(m) m.value=st.appendMode;
  const c=$('#copyRowStyle'); if(c) c.checked=!!st.copyRowStyle;
  const r=$('#rangeBy'); if(r) r.value=normalizeDateBy(st.rangeBy);
  const sb=$('#exportSortBy'); if(sb) sb.value=normalizeDateBy(st.exportSortBy);
  const sd=$('#exportSortDir'); if(sd) sd.value=st.exportSortDir;
})();

/* 复制源行样式（行高 + 各单元格边框/填充/字体/对齐/数字格式）到目标行。
   遍历全部列（含「有样式但值空」的单元格，如测试/结案日期、备注等），确保整行视觉对齐 */
function copyRowStyle(ws, target, source){
  const src=ws.getRow(source), tgt=ws.getRow(target);
  tgt.height=src.height;
  // P11 修复：去掉硬编码的 20 列下限，列数以「源行实际单元格数」与「模板表头数」取大为准，避免多列模板(>20)漏拷样式、或少列模板(<=20)误生成多余边框
  const cols=Math.max(src.cellCount||0, excelHeaders.length);
  for(let c=1;c<=cols;c++){
    const sc=src.getCell(c);
    if(sc.style && Object.keys(sc.style).length>0){
      // m5 修复：浅拷贝 style 即可（嵌套 font/border/fill 只读；writeRowVals 仅对目标单元格重设 alignment，不回写源），避免逐格 JSON 深拷贝开销
      tgt.getCell(c).style=Object.assign({}, sc.style);
    }
  }
}

/* 向指定行写入一个任务（seqVal 为 null 表示项次列暂不填，由调用方统一处理） */
function writeRowVals(ws, rowNum, task, seqVal){
  const newRow=ws.getRow(rowNum);
  const row=mapTaskToRow(task);
  const copyStyle=copyRowStyleOn();
  // 对齐上一行样式（默认开启）：复制行高与单元格样式，使新行与模板视觉一致。
  // 边界：模板无任何数据行时 rowNum-1 就是表头行，此时不能把表头样式复制到数据行。
  if(copyStyle && rowNum>excelHeaderRow+1) copyRowStyle(ws, rowNum, rowNum-1);
  excelHeaders.forEach((h,c)=>{
    const col=c+1;
    let val='';
    if(seqVal!=null && effMap(h)===COL.SEQ){ val=seqVal; }
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
      // 关闭对齐：insertRow 会自动继承模板列样式（边框/底色），显式清除以真正不对齐
      cell.border=undefined; cell.fill=undefined;
    }
    // 状态列背景色：按「完成状态」取值查配置映射（空映射/未命中则不染色）
    if(effMap(h)===COL.STATUS){ const f=statusBgFill(String(val)); if(f) cell.fill=f; }
  });
}

/* 末尾追加（现有模式）：按项次续号，从最后数据行之后追加 */
function appendToEnd(ws, t, lastDataRow){
  const seqHd=excelHeaders.find(h=>effMap(h)===COL.SEQ);
  const seqCol=seqHd?excelHeaders.indexOf(seqHd)+1:0;
  let lastSeq=0;
  if(seqCol){ for(let r=excelHeaderRow+1;r<=lastDataRow;r++){ const v=ws.getRow(r).getCell(seqCol).value; const n=(typeof v==='number')?v:((typeof v==='string'&&/^\d+$/.test(String(v).trim()))?parseInt(v,10):0); if(n>lastSeq)lastSeq=n; } }
  let nextR=lastDataRow+1;
  t.forEach((task,idx)=>{ writeRowVals(ws, nextR, task, lastSeq+idx+1); nextR++; });
}

/* 按状态分组插入：每个任务插入到模板中同状态组的最后一条之后，后续行自动后移；项次整列重新编号。
   未知状态 / 空状态追加到整个表格末尾。 */
function insertGrouped(ws, t, lastDataRow){
  const stHd=excelHeaders.find(h=>effMap(h)===COL.STATUS);
  if(!stHd) return; // 校验阶段已拦截
  const stCol=excelHeaders.indexOf(stHd)+1;
  // 扫描数据区，记录每个状态值「最后一条」所在行号（大小写不敏感）
  const lastRowOf={};
  for(let r=excelHeaderRow+1;r<=lastDataRow;r++){
    const cell=ws.getRow(r).getCell(stCol);
    const v=(cell.value!=null)?String(cell.value).trim().toLowerCase():'';
    lastRowOf[v]=r;
  }
  // 计算每个任务的插入锚点：模板有该状态→用该状态最后行；否则用表格末尾
  const items=t.map(task=>{
    const st=String(task.values[COL.STATUS]||'').trim().toLowerCase();
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
  const seqHd=excelHeaders.find(h=>effMap(h)===COL.SEQ);
  if(seqHd){
    const seqCol=excelHeaders.indexOf(seqHd)+1;
    let n=1;
    const finalLast=lastDataRow+items.length;
    for(let r=excelHeaderRow+1;r<=finalLast;r++){ ws.getRow(r).getCell(seqCol).value=n++; }
  }
}

/* t 可由调用方传入（doExport 复用校验阶段的结果，避免重复筛选+排序）；不传则自行计算 */
async function doExportInner(t){
  const ws=excelSheet;
  // 找到最后一个非空数据行（模板底部可能预留空白行，避免追加后夹空行、续号基准不准）
  let lastDataRow=excelHeaderRow;
  for(let r=excelHeaderRow+1;r<=ws.rowCount;r++){
    let has=false;
    ws.getRow(r).eachCell(()=>{ has=true; });
    if(has)lastDataRow=r;
  }
  if(t===undefined) t=getRangeTasks();
  if(!t.length){ toast('请先设置时间范围'); return; }
  if(appendMode()==='group') insertGrouped(ws, t, lastDataRow);
  else appendToEnd(ws, t, lastDataRow);
  const out=await excelBook.xlsx.writeBuffer();
  /* 追加产物命名：配置了文件名前缀 → 套用「前缀+日期范围」口径（与生成新周报一致）；
     未配置前缀 → 沿用「原模板名_已追加」，保留模板辨识度（旧行为）。
     旧实现两条通道各写各的，用户配了前缀却对追加无效。 */
  const base=(excelFileName||'周报').replace(/\.xlsx?$/i,'');
  const pre=(loadSettings().exportFilePrefix||'').trim();
  const fname=(pre?buildFileName($('#rangeStart').value, $('#rangeEnd').value):base)+'_已追加.xlsx';
  downloadBlob(new Blob([out],{type:'application/octet-stream'}), fname);
  t.forEach(x=>{x.exported=true;}); save(LS_TASKS,tasks);
  lastExportedIds=t.map(x=>x.id); // 记录本次，供「撤销本次追加」
  $('#exportMsg').textContent=`已追加 ${t.length} 条，另存为「${fname}」（已标记防重复）`;
  renderPreview();
  toast('生成成功，已下载');
}

/* ============ 生成新周报（新建文件，按配置中心列顺序，不依赖模板） ============ */
async function buildNewWorkbook(){
  const t=getRangeTasks(false); // 新文件：包含范围内全部任务（含已追加的，因是全新文件）
  if(!t.length) return null;
  await loadExcelJS(); // 按需注入 ExcelJS（懒加载；未加载即引用会 ReferenceError——线上 v1.0.5 实测踩坑）
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('周报');
  const cols=schema; // 配置中心顺序（含 auto 项次）
  const hrow=ws.getRow(1);
  cols.forEach((c,i)=>{ const cell=hrow.getCell(i+1); cell.value=c.name; styleHeader(cell); }); // 表头：基础样式 + 配置背景色
  t.forEach((task,idx)=>{
    const values=cols.map(c=>{
      if(c.type==='auto') return idx+1; // 项次自动续号，从 1 起
      let v=task.values[c.name]||'';
      if(c.type==='date'){ const dt=parseDateAny(v); if(dt) v=(c.dateFmt==='md')?fmtDateMD(dt):fmtDateCN(dt); }
      return v;
    });
    const row=ws.addRow(values);
    cols.forEach((c,i)=>{
      const cell=row.getCell(i+1);
      if(/进度/.test(c.name)&&typeof cell.value==='string'&&cell.value.includes('\n')) styleCell(cell,true); else styleCell(cell);
      if(c.name===COL.STATUS){ const f=statusBgFill(String(task.values[COL.STATUS]||'')); if(f) cell.fill=f; } // 状态列背景色
    });
  });
  return {wb,t};
}
$('#genNew').onclick=async ()=>{
  let res;
  try{ res=await buildNewWorkbook(); }catch(err){ toast('生成失败：'+err.message); return; } // ExcelJS 懒加载失败等给明确提示
  if(!res){ toast('该时间范围内没有任务，无法生成新周报'); return; }
  const {wb,t}=res;
  const s=$('#rangeStart').value, e=$('#rangeEnd').value;
  const out=await wb.xlsx.writeBuffer();
  const fname=buildFileName(s,e)+'.xlsx';
  downloadBlob(new Blob([out],{type:'application/octet-stream'}), fname);
  t.forEach(x=>{ x.exportedNew=true; }); save(LS_TASKS,tasks);
  lastExportedIds=t.map(x=>x.id); // 记录本次，供「撤销本次追加」
  $('#genNewMsg').textContent=`已生成 ${t.length} 条，另存为「${fname}」（已标记防重复）`;
  toast('已生成新周报');
};
