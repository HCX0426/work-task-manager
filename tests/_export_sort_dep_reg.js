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
  sortExportTasks, exportSortKey, getRangeTasks, checkCloseDependency, STATUS_DONE, loadSettings, normalizeStatus, normalizeDateBy,
  DATE_BY, CRITICAL_COLS, COL, normalizeHex, setSettings(s){ const k='wb_exportcfg'; if(s) localStorage.setItem(k, JSON.stringify(s)); else localStorage.removeItem(k); }
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
  ok(api.checkCloseDependency({完成状态:'Cancelled', 结案日期:''}).ok, 'Cancelled 状态空结案日期 → 合法（依赖只约束 Closed）');
  ok(api.checkCloseDependency({完成状态:'Testing', 结案日期:''}).ok, 'Testing 状态空结案日期 → 合法（依赖只约束 Closed）');
  // 常量一致性确认
  eq(api.STATUS_DONE, 'Closed', 'STATUS_DONE 应为 Closed（与下拉值一致）');
}

  /* 状态值归一：大小写不敏感 + 旧值映射（导入/追加即时归一） */
  ok(api.normalizeStatus('planning')==='Planning', "normalizeStatus('planning') → Planning");
  ok(api.normalizeStatus('PLANNING')==='Planning', "normalizeStatus('PLANNING') → Planning（大写）");
  ok(api.normalizeStatus(' Planning ')==='Planning', "normalizeStatus(' Planning ') → Planning（去空格）");
  ok(api.normalizeStatus('暂停')==='Paused', "normalizeStatus('暂停') → Paused");
  ok(api.normalizeStatus('取消')==='Cancelled', "normalizeStatus('取消') → Cancelled");
  ok(api.normalizeStatus('Closed')==='Closed', "normalizeStatus('Closed') → 原样（已是权威值）");
  ok(api.normalizeStatus('自定义X')==='自定义X', "normalizeStatus('自定义X') → 保留自定义值（未命中映射表）");
  ok(api.normalizeStatus('')==='', "normalizeStatus('') → 空");
  /* 旧中文状态归一（审查项：原映射表只覆盖 暂停/取消，其余中文历史值无法归一） */
  ok(api.normalizeStatus('测试中')==='Testing', "normalizeStatus('测试中') → Testing（旧中文值归一）");
  ok(api.normalizeStatus('进行中')==='Ongoing', "normalizeStatus('进行中') → Ongoing（旧中文值归一）");
  ok(api.normalizeStatus('规划中')==='Planning', "normalizeStatus('规划中') → Planning（旧中文值归一）");
  ok(api.normalizeStatus('已结案')==='Closed', "normalizeStatus('已结案') → Closed（旧中文值归一）");
  ok(api.normalizeStatus('已完成')==='Closed', "normalizeStatus('已完成') → Closed（旧中文值归一）");
  ok(api.normalizeStatus('已暂停')==='Paused', "normalizeStatus('已暂停') → Paused（旧中文值归一）");
  ok(api.normalizeStatus('已取消')==='Cancelled', "normalizeStatus('已取消') → Cancelled（旧中文值归一）");
  /* 日期依据归一（审查项：rangeBy 曾存 'entryDate' 而 exportSortBy 存 '录入日期'，值域混用） */
  ok(api.normalizeDateBy('entryDate')==='录入日期', "normalizeDateBy('entryDate') → 录入日期（旧值归一）");
  ok(api.normalizeDateBy('开发日期')==='开发日期', "normalizeDateBy('开发日期') → 原样");
  ok(api.normalizeDateBy('')==='', "normalizeDateBy('') → 空");

/* ---------- 场景 6：状态导出优先级（exportStatusPriority，配置后分块导出） ---------- */
console.log('\n=== 场景 6：状态导出优先级（配置后分块，块内按排序依据）===');
{
  const base = [
    mkTask('a', {开发日期:'2026-08-22', 完成状态:'Closed'}),
    mkTask('b', {开发日期:'2026-08-18', 完成状态:'Ongoing'}),
    mkTask('c', {开发日期:'2026-08-20', 完成状态:'Closed'}),
    mkTask('d', {开发日期:'2026-08-19', 完成状态:'Ongoing'}),
    mkTask('e', {开发日期:'2026-08-21', 完成状态:'Planning'}),  // 未列入优先级 → 排最后
    mkTask('f', {开发日期:'2026-08-17', 完成状态:'ongoing'}),   // 小写 → 归一 Ongoing，进 Ongoing 块
  ];
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'asc', exportStatusPriority:'Ongoing,Closed'});
  const arr = base.map(t=>({...t, values:{...t.values}}));
  api.sortExportTasks(arr);
  eq(arr.map(t=>t.id), ['f','b','d','c','a','e'], '优先级 Ongoing,Closed：Ongoing块(f,b,d 按日期) → Closed块(c,a) → 未列入(e)');

  const arr2 = base.map(t=>({...t, values:{...t.values}}));
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'asc', exportStatusPriority:'进行中、已结案'});
  api.sortExportTasks(arr2);
  eq(arr2.map(t=>t.id), ['f','b','d','c','a','e'], '优先级用中文旧值（进行中、已结案）→ 归一后同序');

  const arr3 = base.map(t=>({...t, values:{...t.values}}));
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'desc', exportStatusPriority:'Ongoing,Closed'});
  api.sortExportTasks(arr3);
  eq(arr3.map(t=>t.id), ['d','b','f','a','c','e'], '降序：块序不随方向反转（Ongoing→Closed→未列入），块内日期降序');

  const arr4 = base.map(t=>({...t, values:{...t.values}}));
  api.setSettings({exportSortBy:'开发日期', exportSortDir:'asc', exportStatusPriority:''});
  api.sortExportTasks(arr4);
  eq(arr4.map(t=>t.id), ['f','b','d','c','e','a'], '留空=不启用：纯按开发日期升序，无状态分块');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 导出排序/结案依赖回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('导出排序（可配置依据+方向）与结案日期↔Closed 双向依赖全部通过 ✓');
