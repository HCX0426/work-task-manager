/* 导出排序 + 结案依赖 回归：用 DOM 桩 + eval 加载 store.js+export.js，验证：
   1) sortExportTasks 按可配置依据（开发/提出/录入日期）+ 方向稳定排序，空日期置尾
   2) checkCloseDependency 双向依赖（填结案日期必须 Closed；选 Closed 必须填结案日期）
   用法：node _export_sort_dep_reg.js */
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(PROJ, 'js/export.js'), 'utf8');

/* ---------- DOM / 浏览器环境桩（仅满足加载所需，不依赖 ExcelJS） ---------- */
global.window = { crypto: null, scrollTo(){} };
global.localStorage = (()=>{ const m={}; return {
  getItem:k=>(k in m)?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}
}; })();
function makeEl(){
  const t={ _value:'', _checked:false, _text:'', _html:'', _cls:'', style:{}, dataset:{}, files:[],
    classList:{add(){},remove(){},contains(){return false;}}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, click(){}, appendChild(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];}, getContext(){return null;} };
  return new Proxy(t,{ get(o,p){ if(p in o)return o[p]; if(p==='value')return o._value; if(p==='checked')return o._checked; if(p==='textContent')return o._text; if(p==='innerHTML')return o._html; if(p==='className')return o._cls; return undefined; },
    set(o,p,v){ if(p==='value')o._value=v; else if(p==='checked')o._checked=v; else if(p==='textContent')o._text=v; else if(p==='innerHTML')o._html=v; else if(p==='className')o._cls=v; else o[p]=v; return true; } });
}
global.document = { querySelector:()=>makeEl(), getElementById:()=>makeEl(), createElement:()=>makeEl(), body:{appendChild(){}}, addEventListener(){} };
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch in harness'));
global.toast = ()=>{};

const bridge = `
globalThis.__api = {
  sortExportTasks, exportSortKey, getRangeTasks, checkCloseDependency, STATUS_DONE, loadSettings,
  setSettings(s){ const k='wb_exportcfg'; if(s) localStorage.setItem(k, JSON.stringify(s)); else localStorage.removeItem(k); }
};`;
try {
  (0, eval)(storeSrc + '\n' + exportSrc + '\n' + bridge);
} catch (e) {
  console.error('eval 合并源码失败:', e.stack); process.exit(1);
}
const api = globalThis.__api;

/* ---------- 断言工具 ---------- */
let pass=0, fail=0; const fails=[];
function ok(cond, msg){ if(cond){pass++;} else {fail++; fails.push(msg); console.log('  ✗ FAIL:', msg);} }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), msg+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }

function mkTask(id, vals){ return { id, entryDate: vals['录入日期']||vals['开发日期']||'2026-08-20', values: Object.assign({}, vals), exported:false, exportedNew:false }; }
/* 取排序后任务的某字段序列（用于断言顺序） */
function orderBy(tasks, key){ return tasks.map(t=>{ if(key==='开发日期')return t.values['开发日期']; if(key==='提出日期')return t.values['提出日期']; return t.entryDate; }); }

/* ---------- 场景 1：按开发日期排序（基准依据） ---------- */
console.log('\n=== 场景 1：sortExportTasks 按开发日期（默认依据）===');
{
  const base = [
    mkTask('a', {开发日期:'2026-08-22', 提出日期:'2026-08-20'}),
    mkTask('b', {开发日期:'2026-08-18', 提出日期:'2026-08-15'}),
    mkTask('c', {开发日期:'2026-08-20', 提出日期:'2026-08-16'}),
  ];
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'asc'});
  const asc = base.map(t=>({...t, values:{...t.values}}));
  api.sortExportTasks(asc);
  eq(asc.map(t=>t.id), ['b','c','a'], '开发日期升序应按 08-18,08-20,08-22 排列（b,c,a）');

  const desc = base.map(t=>({...t, values:{...t.values}}));
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'desc'});
  api.sortExportTasks(desc);
  eq(desc.map(t=>t.id), ['a','c','b'], '开发日期降序应按 08-22,08-20,08-18 排列（a,c,b）');
}

/* ---------- 场景 2：按提出日期排序（可扩展依据） ---------- */
console.log('\n=== 场景 2：sortExportTasks 按提出日期（扩展依据）===');
{
  const base = [
    mkTask('a', {开发日期:'2026-08-22', 提出日期:'2026-08-25'}),
    mkTask('b', {开发日期:'2026-08-18', 提出日期:'2026-08-10'}),
    mkTask('c', {开发日期:'2026-08-20', 提出日期:'2026-08-18'}),
  ];
  api.setSettings({exportSortBy:'提出日期', exportSortDir:'asc'});
  const arr = base.map(t=>({...t, values:{...t.values}}));
  api.sortExportTasks(arr);
  eq(arr.map(t=>t.id), ['b','c','a'], '提出日期升序应按 08-10,08-18,08-25 排列（b,c,a）');
}

/* ---------- 场景 3：按录入日期排序 ---------- */
console.log('\n=== 场景 3：sortExportTasks 按录入日期 ===');
{
  const base = [
    mkTask('a', {录入日期:'2026-08-22', 开发日期:'2026-08-01'}),
    mkTask('b', {录入日期:'2026-08-18', 开发日期:'2026-08-09'}),
    mkTask('c', {录入日期:'2026-08-20', 开发日期:'2026-08-05'}),
  ];
  api.setSettings({exportSortBy:'录入日期', exportSortDir:'asc'});
  const arr = base.map(t=>({...t, values:{...t.values}}));
  api.sortExportTasks(arr);
  eq(arr.map(t=>t.id), ['b','c','a'], '录入日期升序应按 08-18,08-20,08-22 排列（b,c,a）');
}

/* ---------- 场景 4：空日期置尾 + 稳定排序 ---------- */
console.log('\n=== 场景 4：空日期置尾（升序/降序都置尾）+ 同键稳定 ===');
{
  const base = [
    mkTask('a', {开发日期:'2026-08-22'}),
    mkTask('b', {开发日期:''}),            // 空开发日期
    mkTask('c', {开发日期:'2026-08-20'}),
    mkTask('d', {开发日期:''}),            // 空开发日期
  ];
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'asc'});
  const asc = base.map(t=>({...t, values:{...t.values}}));
  api.sortExportTasks(asc);
  eq(asc.map(t=>t.id), ['c','a','b','d'], '升序：有日期在前(c,a)，空日期置尾(b,d)且保持原相对顺序');

  const desc = base.map(t=>({...t, values:{...t.values}}));
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'desc'});
  api.sortExportTasks(desc);
  eq(desc.map(t=>t.id), ['a','c','b','d'], '降序：有日期降序(a,c)，空日期仍置尾(b,d)');
}

/* ---------- 场景 5：结案日期 ↔ 完成状态(Closed) 双向依赖 ---------- */
console.log('\n=== 场景 5：checkCloseDependency 双向依赖 ===');
{
  // 合法：Closed + 结案日期
  ok(api.checkCloseDependency({完成状态:'Closed', 结案日期:'2026-08-20'}).ok, 'Closed 且填结案日期 → 合法');
  // 合法：非 Closed + 无结案日期
  ok(api.checkCloseDependency({完成状态:'Ongoing', 结案日期:''}).ok, 'Ongoing 且无结案日期 → 合法');
  // 非法：填了结案日期但非 Closed
  const r1=api.checkCloseDependency({完成状态:'Ongoing', 结案日期:'2026-08-20'});
  ok(!r1.ok && /Closed/.test(r1.msg), '填了结案日期但非 Closed → 拦截（msg 含 Closed）');
  // 非法：Closed 但无结案日期
  const r2=api.checkCloseDependency({完成状态:'Closed', 结案日期:''});
  ok(!r2.ok && /结案日期/.test(r2.msg), '选 Closed 但无结案日期 → 拦截（msg 含 结案日期）');
  // 反向用例：取消状态可空结案日期（不受 Closed 依赖约束）
  ok(api.checkCloseDependency({完成状态:'取消', 结案日期:''}).ok, '取消状态空结案日期 → 合法（依赖只约束 Closed）');
  // 常量一致性确认
  eq(api.STATUS_DONE, 'Closed', 'STATUS_DONE 应为 Closed（与下拉值一致）');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 导出排序/结案依赖回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('导出排序（可配置依据+方向）与结案日期↔Closed 双向依赖全部通过 ✓');
