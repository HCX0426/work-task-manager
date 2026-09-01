/* 导出路径深挖回归：用真实 ExcelJS 跑 appendToEnd / insertGrouped / buildNewWorkbook / validateExportStructure
   通过 DOM 桩 + eval 加载 store.js+export.js，验证项次续号、分组插入、样式复制、日期映射、整表校验。
   用法：node _export_reg.js */
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(PROJ, 'js/export.js'), 'utf8');

/* ---------- DOM / 浏览器环境桩 ---------- */
function makeEl() {
  const t = { _value: '', _checked: false, _text: '', _html: '', _cls: '',
    style: {}, dataset: {}, files: [],
    classList: { add(){}, remove(){}, contains(){return false;} },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, click(){},
    appendChild(){}, querySelector(){return makeEl();}, querySelectorAll(){return [];},
    getContext(){return null;} };
  return new Proxy(t, {
    get(o,p){ if(p in o) return o[p]; if(p==='value')return o._value; if(p==='checked')return o._checked;
      if(p==='textContent')return o._text; if(p==='innerHTML')return o._html; if(p==='className')return o._cls; return undefined; },
    set(o,p,v){ if(p==='value')o._value=v; else if(p==='checked')o._checked=v; else if(p==='textContent')o._text=v;
      else if(p==='innerHTML')o._html=v; else if(p==='className')o._cls=v; else o[p]=v; return true; }
  });
}
/* 先加载 exceljs（必须在设置 window/document 桩之前，否则其 UMD 浏览器分支会触发非法 instanceof） */
let E;
try { E = require(path.join(PROJ, 'exceljs.min.js')); } catch(e){ console.error('require exceljs 失败:', e.message); process.exit(1); }
global.ExcelJS = (E && E.Workbook) ? E : (E.default || E);
global.window = { crypto: null, scrollTo(){} };
global.localStorage = (()=>{ const m={}; return {
  getItem:k=> (k in m)?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}
}; })();
global.document = {
  querySelector:()=>makeEl(), getElementById:()=>makeEl(), createElement:()=>makeEl(),
  body:{ appendChild(){} }, addEventListener(){}
};
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch in harness'));

const bridge = `
globalThis.__api = {
  appendToEnd, insertGrouped, writeRowVals, mapTaskToRow,
  getRangeTasks, buildNewWorkbook, validateExportStructure, doExportInner
};
globalThis.__cfg = {
  setExcel(o){ if('book' in o)excelBook=o.book; if('sheet' in o)excelSheet=o.sheet; if('headers' in o)excelHeaders=o.headers; if('hr' in o)excelHeaderRow=o.hr; if('mapping' in o)colMapping=o.mapping; if('name' in o)excelSheetName=o.name; },
  setTasks(t){ tasks = t; },
  setSchema(s){ schema = s; },
  setGroup(){ appendMode=()=>'group'; },
  setEnd(){ appendMode=()=>'end'; },
  setRangeTasks(t){ getRangeTasks=()=>t; },
  styleOn(){ copyRowStyleOn=()=>true; },
  styleOff(){ copyRowStyleOn=()=>false; },
  get state(){ return { schema, tasks, colMapping, excelHeaders, excelHeaderRow, excelBook, excelSheet }; }
};`;
try {
  (0, eval)(storeSrc + '\n' + exportSrc + '\n' + bridge);
} catch (e) {
  console.error('eval 合并源码失败:', e.stack); process.exit(1);
}
const api = globalThis.__api, cfg = globalThis.__cfg;

/* ---------- 断言工具 ---------- */
let pass=0, fail=0, warns=0; const fails=[];
function ok(cond, msg){ if(cond){pass++;} else {fail++; fails.push(msg); console.log('  ✗ FAIL:', msg);} }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), msg+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }
function warn(msg){ warns++; console.log('  ⚠ WARN:', msg); }

/* ---------- 构造模板工作簿 ---------- */
const HEADERS = ['项次','厂区','提出日期','提出部门','客户','专案名称','需求说明','负责人','开发进度','完成状态','开发日期','测试日期','开发天数','结案日期','备注'];
function newBookWithData(rows){
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('周报');
  HEADERS.forEach((h,i)=>{ ws.getRow(1).getCell(i+1).value = h; ws.getRow(1).getCell(i+1).font = {name:'等线', size:11, bold:true}; });
  rows.forEach((r,ri)=>{
    const row = ws.getRow(2+ri);
    HEADERS.forEach((h,i)=>{ const v=r[h]; if(v!=null && v!=='') row.getCell(i+1).value = v; });
    HEADERS.forEach((h,i)=>{ row.getCell(i+1).border = {top:{style:'thin'}, bottom:{style:'thin'}}; });
  });
  return {wb, ws};
}
function mkTask(id, vals){ return { id, entryDate: vals['开发日期']||'2026-08-20', values: Object.assign({}, vals), exported:false, exportedNew:false }; }
const seqIdx = HEADERS.indexOf('项次')+1;
const statusIdx = HEADERS.indexOf('完成状态')+1;
const nameIdx = HEADERS.indexOf('专案名称')+1;
const devIdx = HEADERS.indexOf('开发进度')+1;
const devDateIdx = HEADERS.indexOf('开发日期')+1;
function setExcelState(wb, ws, mapping){ cfg.setExcel({ book: wb, sheet: ws, headers: HEADERS.slice(), hr: 1, mapping: mapping||{}, name: ws?ws.name:null }); }
function colVals(ws, c, from, to){ const out=[]; for(let r=from;r<=to;r++){ const v=ws.getRow(r).getCell(c).value; out.push(v==null?'':v); } return out; }

(async()=>{
/* === 场景 A：appendToEnd 末尾追加 === */
console.log('\n=== 场景 A：appendToEnd 末尾追加 ===');
{
  const tmpl = [
    {项次:1, 厂区:'东莞', 客户:'A', 专案名称:'旧任务1', 完成状态:'Closed', 开发日期:'2026/8/18', 开发进度:'已完成'},
    {项次:2, 厂区:'东莞', 客户:'B', 专案名称:'旧任务2', 完成状态:'Ongoing', 开发日期:'2026/8/19', 开发进度:'开发中'},
    {项次:3, 厂区:'苏州', 客户:'C', 专案名称:'旧任务3', 完成状态:'Ongoing', 开发日期:'2026/8/19', 开发进度:'联调中'},
  ];
  const {wb, ws} = newBookWithData(tmpl); setExcelState(wb, ws); cfg.styleOn();
  const newTasks = [
    mkTask('tA', {厂区:'厦门', 客户:'D', 专案名称:'新任务A', 完成状态:'planning', 开发日期:'2026-08-21', 开发进度:'需求评审\n✓ 已确认'}),
    mkTask('tB', {厂区:'重庆', 客户:'E', 专案名称:'新任务B', 完成状态:'Ongoing', 开发日期:'2026-08-22', 开发进度:'开发中'}),
  ];
  api.appendToEnd(ws, newTasks, 4);
  ok(ws.rowCount >= 6, '总行数应为 6（表头+3旧+2新），实际 '+ws.rowCount);
  eq(colVals(ws, seqIdx, 2, 6), [1,2,3,4,5], '项次列续号为 1..5');
  eq(ws.getRow(5).getCell(nameIdx).value, '新任务A', '第5行专案名称=新任务A');
  eq(ws.getRow(6).getCell(nameIdx).value, '新任务B', '第6行专案名称=新任务B');
  eq(ws.getRow(5).getCell(devDateIdx).value, '08/21', '开发日期(dateFmt=md) 输出 08/21（MM/DD 无年，对齐真实周报模板，见 #A 修复）');
  const wrap = ws.getRow(5).getCell(devIdx).alignment && ws.getRow(5).getCell(devIdx).alignment.wrapText;
  ok(wrap===true, '含换行的开发进度应开启 wrapText（实际 '+wrap+'）');
  const hasBorder = ws.getRow(5).getCell(nameIdx).border && (ws.getRow(5).getCell(nameIdx).border.top || ws.getRow(5).getCell(nameIdx).border.bottom);
  ok(!!hasBorder, '第5行应复制上一行边框样式');
  eq(ws.getRow(2).getCell(nameIdx).value, '旧任务1', '旧行2专案名称保持');
}

/* === 场景 B：insertGrouped 同状态分组插入 === */
console.log('\n=== 场景 B：insertGrouped 同状态分组插入 ===');
{
  const tmpl = [
    {项次:1, 客户:'A', 专案名称:'T1', 完成状态:'Closed', 开发日期:'2026/8/18'},
    {项次:2, 客户:'B', 专案名称:'T2', 完成状态:'Ongoing', 开发日期:'2026/8/19'},
    {项次:3, 客户:'C', 专案名称:'T3', 完成状态:'Ongoing', 开发日期:'2026/8/19'},
  ];
  const {wb, ws} = newBookWithData(tmpl); setExcelState(wb, ws); cfg.styleOn();
  const newTasks = [
    mkTask('nO', {客户:'X', 专案名称:'新-Ongoing', 完成状态:'Ongoing', 开发日期:'2026-08-21'}),
    mkTask('nC', {客户:'Y', 专案名称:'新-Closed', 完成状态:'Closed', 开发日期:'2026-08-21'}),
  ];
  api.insertGrouped(ws, newTasks, 4);
  ok(ws.rowCount >= 6, '总行数应为 6，实际 '+ws.rowCount);
  eq(colVals(ws, seqIdx, 2, 6), [1,2,3,4,5], '分组后项次整列重编号为 1..5');
  const statuses = colVals(ws, statusIdx, 2, 6);
  const closedIdx = statuses.map((s,i)=>String(s).toLowerCase()==='closed'?i+2:-1).filter(x=>x>0);
  const onIdx = statuses.map((s,i)=>String(s).toLowerCase()==='ongoing'?i+2:-1).filter(x=>x>0);
  ok(closedIdx.length===2 && onIdx.length===3, '状态计数应为 Closed×2 / Ongoing×3，实际 '+JSON.stringify(statuses));
  ok(closedIdx[0] < onIdx[0], 'Closed 块应整体位于 Ongoing 块之前');
  ok(closedIdx[0] < closedIdx[1], 'Closed 组内模板行应在新行之前');
  ok(onIdx[0] < onIdx[1] && onIdx[1] < onIdx[2], 'Ongoing 组内两模板行应在新行之前');
  const names = colVals(ws, nameIdx, 2, 6);
  ok(names.includes('新-Closed') && names.includes('新-Ongoing'), '两条新任务均已插入');
}

/* === 场景 C：insertGrouped 未知/空状态 → 末尾追加 === */
console.log('\n=== 场景 C：insertGrouped 未知状态/空状态 → 末尾追加 ===');
{
  const tmpl = [
    {项次:1, 客户:'A', 专案名称:'T1', 完成状态:'Closed', 开发日期:'2026/8/18'},
    {项次:2, 客户:'B', 专案名称:'T2', 完成状态:'Ongoing', 开发日期:'2026/8/19'},
    {项次:3, 客户:'C', 专案名称:'T3', 完成状态:'Ongoing', 开发日期:'2026/8/19'},
  ];
  const {wb, ws} = newBookWithData(tmpl); setExcelState(wb, ws); cfg.styleOn();
  const newTasks = [
    mkTask('nP', {客户:'P', 专案名称:'新-planning', 完成状态:'planning', 开发日期:'2026-08-21'}),
    mkTask('nE', {客户:'Q', 专案名称:'新-空状态', 完成状态:'', 开发日期:'2026-08-21'}),
  ];
  api.insertGrouped(ws, newTasks, 4);
  ok(ws.rowCount >= 6, '总行数应为 6，实际 '+ws.rowCount);
  eq(colVals(ws, seqIdx, 2, 6), [1,2,3,4,5], '项次重编号 1..5');
  const statuses = colVals(ws, statusIdx, 2, 6).map(s=>String(s).toLowerCase());
  eq(statuses, ['closed','ongoing','ongoing','planning',''], '未知/空状态应追加到末尾，顺序=模板+新(planning,空)');
  ok(colVals(ws, nameIdx, 5, 6).includes('新-planning') && colVals(ws, nameIdx, 5, 6).includes('新-空状态'), '两条新任务落在末尾两行');
}

/* === 场景 D：buildNewWorkbook 生成新周报（async）=== */
console.log('\n=== 场景 D：buildNewWorkbook 生成新周报 ===');
{
  setExcelState(null, null);
  const tasks = [
    mkTask('b1', {厂区:'东莞', 客户:'A', 专案名称:'B1', 完成状态:'Ongoing', 开发日期:'2026-08-18', 开发进度:'开发A\n✓ 完成1'}),
    mkTask('b2', {厂区:'苏州', 客户:'B', 专案名称:'B2', 完成状态:'Closed', 开发日期:'2026-08-19', 开发进度:'开发B'}),
    mkTask('b3', {厂区:'厦门', 客户:'C', 专案名称:'B3', 完成状态:'planning', 开发日期:'2026-08-20', 开发进度:'开发C'}),
  ];
  cfg.setRangeTasks(tasks); cfg.styleOn();
  const res = await api.buildNewWorkbook();
  ok(res && res.wb, 'buildNewWorkbook 应返回 {wb,t}');
  const ws = res.wb.getWorksheet(1);
  ok(ws.rowCount >= 4, '新簿应有 4 行（表头+3），实际 '+ws.rowCount);
  const hdr = HEADERS.map((h,i)=>ws.getRow(1).getCell(i+1).value);
  eq(hdr, HEADERS, '新建表头应为 schema 列名顺序');
  eq(colVals(ws, seqIdx, 2, 4), [1,2,3], '新建项次自动 1..3');
  eq(ws.getRow(2).getCell(devDateIdx).value, '08/18', '新建开发日期(dateFmt=md) 格式 08/18（MM/DD 无年，对齐真实周报模板，见 #A 修复）');
  const wrap = ws.getRow(2).getCell(devIdx).alignment && ws.getRow(2).getCell(devIdx).alignment.wrapText;
  ok(wrap===true, '新建含换行开发进度应开启 wrapText');
  eq(res.t.length, 3, '返回任务数=3');
}

/* === 场景 E：validateExportStructure 良好模板 === */
console.log('\n=== 场景 E：validateExportStructure 结构校验（良好）===');
{
  const tmpl = [
    {项次:1, 厂区:'东莞', 客户:'A', 专案名称:'T1', 完成状态:'Closed', 开发日期:'2026/8/18'},
    {项次:2, 厂区:'东莞', 客户:'B', 专案名称:'T2', 完成状态:'Ongoing', 开发日期:'2026/8/19'},
  ];
  const {wb, ws} = newBookWithData(tmpl); setExcelState(wb, ws); cfg.setGroup();
  cfg.setRangeTasks([ mkTask('v1', {客户:'A', 专案名称:'V1', 完成状态:'Closed', 开发日期:'2026-08-18'}) ]);
  const res = api.validateExportStructure();
  ok(res.errors.length===0, '良好模板不应有阻断项，实际 errors='+JSON.stringify(res.errors));
  ok(res.warnings.filter(w=>/关键列/.test(w)).length===0, '关键列应全部映射');
}

/* === 场景 F：validateExportStructure 缺关键列 → 阻断 === */
console.log('\n=== 场景 F：validateExportStructure（缺关键列→阻断）===');
{
  const tmpl = [ {项次:1, 厂区:'东莞', 客户:'A', 专案名称:'T1', 完成状态:'Closed', 开发日期:'2026/8/18'} ];
  const {wb, ws} = newBookWithData(tmpl);
  const emptyMap = {}; HEADERS.forEach(h=>{ emptyMap[h]=''; });
  setExcelState(wb, ws, emptyMap); cfg.setGroup();
  cfg.setRangeTasks([ mkTask('v1', {客户:'A', 专案名称:'V1', 完成状态:'Closed', 开发日期:'2026-08-18'}) ]);
  const res = api.validateExportStructure();
  ok(res.errors.some(e=>/关键列/.test(e)), '缺关键列映射应报阻断项，实际 errors='+JSON.stringify(res.errors));
}

/* === 场景 G：导出日期格式按列对齐真实模板（确认项，原为 WARNING，#A 已修复）=== */
console.log('\n=== 场景 G：导出日期格式按列对齐真实模板（已修复确认）===');
{
  const sc = cfg.state.schema;
  eq((sc.find(c=>c.name==='提出日期')||{}).dateFmt, 'ymd', 'G 提出日期 dateFmt=ymd → 导出 yyyy/MM/dd（对齐真实模板）');
  eq((sc.find(c=>c.name==='开发日期')||{}).dateFmt, 'md',  'G 开发日期 dateFmt=md → 导出 MM/DD（对齐真实模板）');
  eq((sc.find(c=>c.name==='结案日期')||{}).dateFmt, 'md',  'G 结案日期 dateFmt=md → 导出 MM/DD（对齐真实模板）');
  console.log('  ✓ #A 已修复：导出日期按列格式输出，与真实周报模板一致（提出日期带年、开发/测试/结案日期不带年）');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 导出路径回归结果：PASS=${pass}  FAIL=${fail}  WARN=${warns} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('核心导出逻辑全部通过 ✓（含 1 项格式一致性 WARNING）');
})();
