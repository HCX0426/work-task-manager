/* #A/#B 修复回归：用真实 ExcelJS + 真实 store/export/list 源码，通过 DOM 桩驱动验证
   #A：导出日期按列 dateFmt 输出（提出日期 ymd → yyyy/MM/dd；开发/测试/结案日期 md → MM/DD）
   #B：全量备份含 colMapping 且导入能还原到 LS_MAPPING（不再丢手动列映射）
   用法：node _fix_ab_reg.js */
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(PROJ, 'js/export.js'), 'utf8');
const listSrc  = fs.readFileSync(path.join(PROJ, 'js/list.js'),  'utf8');

/* ---------- DOM / 浏览器环境桩（带元素缓存，可触发 onclick/onchange） ---------- */
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
const _els = {};
function el(key){ if(!_els[key]) _els[key]=makeEl(); return _els[key]; }
/* 先加载 exceljs（必须在设置 window/document 桩之前，否则其 UMD 浏览器分支会触发非法 instanceof） */
let E;
try { E = require(path.join(PROJ, 'exceljs.min.js')); } catch(e){ console.error('require exceljs 失败:', e.message); process.exit(1); }
global.ExcelJS = (E && E.Workbook) ? E : (E.default || E);
global.window = { crypto: null, scrollTo(){} };
global.localStorage = (()=>{ const m={}; return {
  getItem:k=> (k in m)?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}
}; })();
global.document = {
  querySelector:(s)=>el(s), getElementById:(id)=>el('#'+id), createElement:()=>makeEl(),
  body:{ appendChild(){} }, addEventListener(){}
};
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch in harness'));
global.FileReader = class { readAsText(f){ this.result=f.__text; if(this.onload) this.onload(); } };

/* 真实默认 schema（含 dateFmt） */
const INIT_SCHEMA = [
  {name:'项次',type:'auto',def:''},{name:'厂区',type:'dropdown',def:'东莞'},
  {name:'提出日期',type:'date',def:'{{today}}',dateFmt:'ymd'},{name:'提出部门',type:'dropdown',def:'仓库'},
  {name:'客户',type:'dropdown',def:''},{name:'专案名称',type:'text',def:''},
  {name:'需求说明',type:'text',def:''},{name:'负责人',type:'text',def:''},
  {name:'开发进度',type:'textarea',def:''},{name:'完成状态',type:'dropdown',def:'Ongoing'},
  {name:'开发日期',type:'date',def:'{{today}}',dateFmt:'md'},{name:'测试日期',type:'date',def:'',dateFmt:'md'},
  {name:'开发天数',type:'text',def:'1天'},{name:'结案日期',type:'date',def:'',dateFmt:'md'},{name:'备注',type:'text',def:''}
];
INIT_SCHEMA.forEach(c=>{ if(!c.id) c.id='col_'+c.name; });
const MANUAL_MAP = { '提出日期（周报）':'提出日期', '开发日期（周报）':'开发日期', '专案名称':'专案名称' };

/* #B 初始状态：在 eval 之前注入，bridge 会套用到闭包变量 */
globalThis.__init = {
  tasks: [
    {id:'b1', entryDate:'2026-08-06', values:{ '提出日期':'2026-08-06','客户':'A','专案名称':'B1','完成状态':'Ongoing','开发日期':'2026-08-18' }, exported:false, exportedNew:false, subtasks:[], history:[]},
    {id:'b2', entryDate:'2026-08-07', values:{ '提出日期':'2026-08-07','客户':'B','专案名称':'B2','完成状态':'Closed','开发日期':'2026-08-19' }, exported:false, exportedNew:false, subtasks:[], history:[]}
  ],
  trash: [{id:'x1', entryDate:'2026-08-01', values:{'专案名称':'已删'}, exported:false, exportedNew:false, subtasks:[], history:[]}],
  schema: INIT_SCHEMA,
  dropdowns: { '客户':['A','B'], '完成状态':['Ongoing','Closed'] },
  colMapping: MANUAL_MAP
};

const bridge = `
globalThis.__api = { appendToEnd, insertGrouped, writeRowVals, mapTaskToRow, getRangeTasks,
  buildNewWorkbook, validateExportStructure, loadSchema, doExportInner, effMap };
globalThis.__cfg = {
  setExcel(o){ if('book' in o)excelBook=o.book; if('sheet' in o)excelSheet=o.sheet; if('headers' in o)excelHeaders=o.headers; if('hr' in o)excelHeaderRow=o.hr; if('mapping' in o)colMapping=o.mapping; if('name' in o)excelSheetName=o.name; },
  setTasks(t){ tasks = t; },
  setMap(m){ colMapping = m; },
  setSchema(s){ schema = s; },
  setGroup(){ appendMode=()=>'group'; },
  setEnd(){ appendMode=()=>'end'; },
  setRangeTasks(t){ getRangeTasks=()=>t; },
  styleOn(){ copyRowStyleOn=()=>true; },
  styleOff(){ copyRowStyleOn=()=>false; },
  get state(){ return { schema, tasks, colMapping, excelHeaders, excelHeaderRow, excelBook, excelSheet }; }
};
globalThis.__cap = { payload:null, name:null };
globalThis.downloadJSON = (obj,name)=>{ globalThis.__cap.payload=obj; globalThis.__cap.name=name; };
globalThis.renderEntry = ()=>{};
globalThis.uiPrompt = async ()=>null;
if(globalThis.__init){
  if(globalThis.__init.tasks) tasks = globalThis.__init.tasks;
  if(globalThis.__init.trash) trash = globalThis.__init.trash;
  if(globalThis.__init.schema) schema = globalThis.__init.schema;
  if(globalThis.__init.dropdowns) dropdowns = globalThis.__init.dropdowns;
  if(globalThis.__init.colMapping) colMapping = globalThis.__init.colMapping;
}`;
try {
  (0, eval)(storeSrc + '\n' + exportSrc + '\n' + listSrc + '\n' + bridge);
} catch (e) {
  console.error('eval 合并源码失败:', e.stack); process.exit(1);
}
const api = globalThis.__api, cfg = globalThis.__cfg;

/* ---------- 断言工具 ---------- */
let pass=0, fail=0, warns=0; const fails=[];
function ok(cond, msg){ if(cond){pass++;} else {fail++; fails.push(msg); console.log('  ✗ FAIL:', msg);} }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), msg+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }
function warn(msg){ warns++; console.log('  ⚠ WARN:', msg); }

(async()=>{
/* === #A-1：mapTaskToRow 按列 dateFmt 输出（单元）=== */
console.log('\n=== #A-1：mapTaskToRow 按列 dateFmt 输出 ===');
{
  cfg.setSchema(INIT_SCHEMA);
  const H = ['提出日期','开发日期','结案日期','专案名称'];
  const M = {'提出日期':'提出日期','开发日期':'开发日期','结案日期':'结案日期','专案名称':'专案名称'};
  cfg.setMap(M);
  cfg.setExcel({ book:null, sheet:null, headers:H, hr:1, name:null });
  const task = { id:'t1', entryDate:'2026-08-06', values:{ '提出日期':'2026-08-06', '开发日期':'2026-08-21', '结案日期':'2026-08-21', '专案名称':'T-A' } };
  const row = api.mapTaskToRow(task);
  eq(row['提出日期'], '2026/08/06', '#A 提出日期(dateFmt=ymd) 应输出 yyyy/MM/dd');
  eq(row['开发日期'], '08/21',      '#A 开发日期(dateFmt=md) 应输出 MM/DD（无年）');
  eq(row['结案日期'], '08/21',      '#A 结案日期(dateFmt=md) 应输出 MM/DD');
  eq(row['专案名称'], 'T-A',        '#A 文本列原样输出');
}

/* === #A-2：appendToEnd 写入工作表后日期单元格按列格式（集成）=== */
console.log('\n=== #A-2：appendToEnd 写入工作表后日期单元格按列格式 ===');
{
  cfg.setSchema(INIT_SCHEMA);
  const H = ['提出日期','开发日期','结案日期','专案名称'];
  const M = {'提出日期':'提出日期','开发日期':'开发日期','结案日期':'结案日期','专案名称':'专案名称'};
  cfg.setMap(M);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('周报');
  H.forEach((h,i)=>{ ws.getRow(1).getCell(i+1).value = h; });
  cfg.setExcel({ book:wb, sheet:ws, headers:H, hr:1, name:'周报' });
  const task = { id:'t2', entryDate:'2026-08-06', values:{ '提出日期':'2026-08-06', '开发日期':'2026-08-21', '结案日期':'2026-08-21', '专案名称':'T-B' }, exported:false, exportedNew:false };
  api.appendToEnd(ws, [task], 1);
  eq(ws.getRow(2).getCell(1).value, '2026/08/06', '#A 写入后 提出日期 单元格 = yyyy/MM/dd');
  eq(ws.getRow(2).getCell(2).value, '08/21',      '#A 写入后 开发日期 单元格 = MM/DD');
  eq(ws.getRow(2).getCell(3).value, '08/21',      '#A 写入后 结案日期 单元格 = MM/DD');
}

/* === #A-3：loadSchema 对旧配置（无 dateFmt）补默认 === */
console.log('\n=== #A-3：loadSchema 旧配置补 dateFmt ===');
{
  global.localStorage.setItem('wb_schema', JSON.stringify([
    {name:'提出日期', type:'date', def:'{{today}}'},
    {name:'开发日期', type:'date', def:'{{today}}'}
  ]));
  const migrated = api.loadSchema();
  const tj = migrated.find(c=>c.name==='提出日期');
  const kf = migrated.find(c=>c.name==='开发日期');
  eq(tj.dateFmt, 'ymd', '#A 旧「提出日期」应补 dateFmt=ymd');
  eq(kf.dateFmt, 'md',  '#A 旧「开发日期」应补 dateFmt=md（按默认 schema 名匹配）');
  global.localStorage.removeItem('wb_schema');
}

/* === #B-1：exportAll 备份对象含 colMapping/settings/全量字段 === */
console.log('\n=== #B-1：exportAll 备份对象含 colMapping + settings ===');
{
  // 还原为 #B 初始 colMapping（#A 已将其改为 M），并确认 tasks/trash 来自 __init
  cfg.setMap(MANUAL_MAP);
  document.querySelector('#exportAll').onclick();
  const p = globalThis.__cap.payload;
  ok(p && p.type==='wb_full', '#B exportAll 产出 type=wb_full');
  ok(p && typeof p.colMapping==='object' && !Array.isArray(p.colMapping), '#B 备份含 colMapping（对象）');
  eq(p.colMapping, MANUAL_MAP, '#B 备份 colMapping 与内存一致');
  ok(p && Array.isArray(p.tasks) && p.tasks.length===2, '#B 备份含 tasks(2 条)');
  ok(p && Array.isArray(p.trash) && p.trash.length===1, '#B 备份含 trash(1 条)');
  ok(p && Array.isArray(p.schema) && p.schema.length>0, '#B 备份含 schema');
  ok(p && typeof p.settings==='object' && p.settings!==null, '#B 备份含 settings');
  ok(p && typeof p.dropdowns==='object', '#B 备份含 dropdowns');
}

/* === #B-2：importAll 还原 colMapping 到 LS_MAPPING（往返）=== */
console.log('\n=== #B-2：importAll 还原 colMapping（往返一致）===');
{
  const p = globalThis.__cap.payload;
  ok(!!p, '#B-2 前置：#B-1 已捕获 payload');
  // 触发 importAllFile 的 onchange，喂回 payload JSON（importAll 内部会把 d.colMapping 写回 LS_MAPPING）
  const fileStub = { __text: JSON.stringify(p) };
  document.querySelector('#importAllFile').onchange({ target:{ files:[fileStub], value:'' } });
  const restored = JSON.parse(global.localStorage.getItem('wb_mapping') || 'null');
  eq(restored, MANUAL_MAP, '#B 导入后 LS_MAPPING 还原为原 colMapping（修复前此处会丢失手动映射）');
  const restoredTasks = JSON.parse(global.localStorage.getItem('wb_tasks') || '[]');
  eq(restoredTasks.length, 2, '#B 导入后 LS_TASKS 还原为 2 条');
  const restoredSchema = cfg.state.schema;
  eq((restoredSchema.find(c=>c.name==='开发日期')||{}).dateFmt, 'md', '#B 全量备份导入后 schema 开发日期 保留 dateFmt=md（顺带修复 importAll 同款丢失）');
  eq((restoredSchema.find(c=>c.name==='提出日期')||{}).dateFmt, 'ymd', '#B 全量备份导入后 提出日期 保留 dateFmt=ymd');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== #A/#B 修复回归结果：PASS=${pass}  FAIL=${fail}  WARN=${warns} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('✓ #A（按列日期格式）与 #B（备份含并还原 colMapping）均验证通过');
})();
