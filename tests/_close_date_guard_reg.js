/* H1 回归：结案日期强制填写（批量补录 batchApply + 看板拖拽到 Closed）。
   旧行为：两处都静默用 today 补「结案日期」，绕过 checkCloseDependency 硬约束，
          导致结案日期失真且无法追溯真实结案日。
   新行为：缺结案日期时必须弹窗填写；取消/留空则本次不改（与录入页口径一致）。
   本测试直接驱动真实源码里的事件处理器，不复制业务逻辑。
   用法：node _close_date_guard_reg.js */
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js', 'store.js'), 'utf8');
const listSrc  = fs.readFileSync(path.join(PROJ, 'js', 'list.js'),  'utf8');

/* ---------- DOM 桩：与 _restore_reg.js 同构，额外支持 addEventListener 捕获（看板 drop 用） ---------- */
function makeEl() {
  const t = { _value:'', _checked:false, _text:'', _html:'', _cls:'', style:{}, dataset:{}, files:[], _ls:{},
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},
    addEventListener(type,fn){ (this._ls[type]=this._ls[type]||[]).push(fn); },
    removeEventListener(){}, dispatchEvent(){}, click(){},
    appendChild(){}, querySelector(){return makeEl();}, querySelectorAll(){return [];}, getContext(){return null;} };
  return new Proxy(t, {
    get(o,p){ if(p in o)return o[p]; if(p==='value')return o._value; if(p==='checked')return o._checked;
      if(p==='textContent')return o._text; if(p==='innerHTML')return o._html; if(p==='className')return o._cls; return undefined; },
    set(o,p,v){ if(p==='value')o._value=v; else if(p==='checked')o._checked=v; else if(p==='textContent')o._text=v;
      else if(p==='innerHTML')o._html=v; else if(p==='className')o._cls=v; else o[p]=v; return true; }
  });
}
const _els = {};
function el(key){ if(!_els[key]) _els[key]=makeEl(); return _els[key]; }
global.window = { crypto:null, scrollTo(){} };
global.localStorage = (()=>{ const m={}; return {
  getItem:k=>(k in m)?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}
}; })();
globalThis.__qsa = {};   // selector -> 元素数组（按用例注入，默认空数组）
global.document = {
  querySelector:(s)=>el(s),
  querySelectorAll:(s)=>globalThis.__qsa[s]||[],
  getElementById:(id)=>el('#'+id),
  createElement:()=>makeEl(),
  body:{appendChild(){}},
  addEventListener(){}
};
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch'));
global.FileReader = class { readAsText(){} };

/* 可控的提示 / 弹窗输入 */
globalThis.__toasts = [];
globalThis.__prompts = [];      // 弹窗返回值队列
globalThis.__promptMsgs = [];   // 记录弹过的提示文案

const bridge = `
globalThis.__api = {
  COL, STATUS_DONE, STATUS_PAUSE, STATUS_CANCEL, STATUS_ONGOING, LS_TASKS,
  el: (s)=>document.querySelector(s),
  getTasks: ()=>tasks,
  setTasks: (t)=>{ tasks = t; },
  on: (sel, type)=> (document.querySelector(sel)._ls[type]||[])[0]
};
globalThis.toast = (m)=>{ globalThis.__toasts.push(String(m)); };
globalThis.renderList = ()=>{};
globalThis.renderKanban = ()=>{};
globalThis.renderStats = ()=>{};
globalThis.renderEntry = ()=>{};
globalThis.uiPrompt = async (msg)=>{
  globalThis.__promptMsgs.push(String(msg));
  return globalThis.__prompts.length ? globalThis.__prompts.shift() : null;
};
`;
try { (0, eval)(storeSrc + '\n' + listSrc + '\n' + bridge); }
catch(e){ console.error('eval 合并源码失败:', e.stack); process.exit(1); }
const api = globalThis.__api;
const { COL, STATUS_DONE, STATUS_ONGOING } = api;

let pass=0, fail=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:', m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }

/* ---------- 夹具 ---------- */
function mkTask(id, status, closeDate){
  const v = { [COL.PROJECT]:'P-'+id };
  if(status) v[COL.STATUS]=status;
  if(closeDate) v[COL.CLOSE_DATE]=closeDate;
  return { id, entryDate:'2026-08-01', values:v, exported:false, exportedNew:false, subtasks:[], history:[] };
}
function reset(prompts, t){
  global.localStorage.clear();
  globalThis.__toasts.length=0; globalThis.__promptMsgs.length=0;
  globalThis.__prompts.length=0; (prompts||[]).forEach(p=>globalThis.__prompts.push(p));
  api.setTasks(t);
}
const toastsAll = ()=>globalThis.__toasts.join(' | ');
const closeOf = (id)=>{ const t=api.getTasks().find(x=>x.id===id); return t? t.values[COL.CLOSE_DATE] : '<<任务不存在>>'; };
const statusOf = (id)=>{ const t=api.getTasks().find(x=>x.id===id); return t? t.values[COL.STATUS] : '<<任务不存在>>'; };

/* 批量补录：模拟点击「批量应用」 */
async function clickBatch(ids){
  globalThis.__qsa['.tcheck:checked'] = ids.map(id=>({dataset:{id}}));
  const h = api.el('#batchApply').onclick;
  if(typeof h!=='function'){ ok(false,'#batchApply.onclick 未取到（选择器变更？）'); return; }
  await h();
}
function setBatch(status, closeDate){
  api.el('#batchStatus').value = status==null?'':status;
  api.el('#batchClose').value  = closeDate==null?'':closeDate;
  api.el('#batchTest').value   = '';
}

/* 看板拖拽：构造 drop 事件丢到指定状态列 */
async function dropTo(id, status){
  const col = { dataset:{status, label:status}, classList:{add(){},remove(){},contains(){return false;}} };
  const e = { preventDefault(){}, target:{closest:()=>col}, dataTransfer:{getData:()=>id} };
  const h = api.on('#kanbanBoard','drop');
  if(typeof h!=='function'){ ok(false,'#kanbanBoard 的 drop 监听器未取到（绑定方式变更？）'); return; }
  await h(e);
}

(async()=>{
console.log('=== H1-A：批量补录改 Closed 必须填结案日期 ===');

/* S1：批量框为空 + 选中任务缺结案日期 → 弹窗；取消（返回空）则整批中止、不落 today */
{ reset([], [mkTask('t1', STATUS_ONGOING, null)]);
  setBatch(STATUS_DONE, '');
  await clickBatch(['t1']);
  eq(globalThis.__promptMsgs.length, 1, 'S1 弹窗询问结案日期（仅一次）');
  ok(/结案日期/.test(globalThis.__promptMsgs[0]||''), 'S1 弹窗文案含「结案日期」');
  ok(/已取消/.test(toastsAll()), 'S1 取消后提示已取消（实际 toast：'+toastsAll()+'）');
  eq(statusOf('t1'), STATUS_ONGOING, 'S1 取消后状态未改为 Closed');
  eq(closeOf('t1'), undefined, 'S1 取消后未静默补 today（核心回归点）');
}

/* S2：同上但填写了日期 → 应用到缺结案日期的任务 */
{ reset(['2026-09-01'], [mkTask('t1', STATUS_ONGOING, null)]);
  setBatch(STATUS_DONE, '');
  await clickBatch(['t1']);
  eq(statusOf('t1'), STATUS_DONE, 'S2 状态已改为 Closed');
  eq(closeOf('t1'), '2026-09-01', 'S2 结案日期取弹窗输入值');
  ok(!/已取消/.test(toastsAll()), 'S2 未出现取消提示（正常落库）');
}

/* S3：批量框已填结案日期 → 直接采用，不再打扰用户 */
{ reset([], [mkTask('t1', STATUS_ONGOING, null)]);
  setBatch(STATUS_DONE, '2026-09-05');
  await clickBatch(['t1']);
  eq(globalThis.__promptMsgs.length, 0, 'S3 批量框有值时不再弹窗');
  eq(closeOf('t1'), '2026-09-05', 'S3 结案日期取批量框的值');
  eq(statusOf('t1'), STATUS_DONE, 'S3 状态已改为 Closed');
}

/* S4：选中任务本就都有结案日期 → 不弹窗，且保留原日期不被覆盖 */
{ reset([], [mkTask('t1', STATUS_ONGOING, '2026-07-01')]);
  setBatch(STATUS_DONE, '');
  await clickBatch(['t1']);
  eq(globalThis.__promptMsgs.length, 0, 'S4 已有结案日期不弹窗');
  eq(closeOf('t1'), '2026-07-01', 'S4 原有结案日期未被覆盖');
  eq(statusOf('t1'), STATUS_DONE, 'S4 状态已改为 Closed');
}

/* S5：批量改非 Closed 状态 → 完全不触发结案日期弹窗（防止过度打扰） */
{ reset([], [mkTask('t1', 'Planning', null)]);
  setBatch(STATUS_ONGOING, '');
  await clickBatch(['t1']);
  eq(globalThis.__promptMsgs.length, 0, 'S5 改 Ongoing 不弹结案日期');
  eq(statusOf('t1'), STATUS_ONGOING, 'S5 状态已改为 Ongoing');
  eq(closeOf('t1'), undefined, 'S5 未写入结案日期');
}

console.log('\n=== H1-B：看板拖拽到 Closed 必须填结案日期 ===');

/* S6：拖到 Closed 且缺结案日期 → 弹窗；取消则不改状态、不补 today */
{ reset([], [mkTask('k1', STATUS_ONGOING, null)]);
  await dropTo('k1', STATUS_DONE);
  eq(globalThis.__promptMsgs.length, 1, 'S6 拖拽弹窗询问结案日期');
  ok(/已取消/.test(toastsAll()), 'S6 取消后提示已取消（实际 toast：'+toastsAll()+'）');
  eq(statusOf('k1'), STATUS_ONGOING, 'S6 取消后状态保持 Ongoing');
  eq(closeOf('k1'), undefined, 'S6 取消后未静默补 today（核心回归点）');
}

/* S7：填写后正常落库 */
{ reset(['2026-09-02'], [mkTask('k1', STATUS_ONGOING, null)]);
  await dropTo('k1', STATUS_DONE);
  eq(statusOf('k1'), STATUS_DONE, 'S7 状态已改为 Closed');
  eq(closeOf('k1'), '2026-09-02', 'S7 结案日期取弹窗输入值');
}

/* S8：已有结案日期 → 不弹窗且不覆盖原值 */
{ reset([], [mkTask('k1', STATUS_ONGOING, '2026-06-01')]);
  await dropTo('k1', STATUS_DONE);
  eq(globalThis.__promptMsgs.length, 0, 'S8 已有结案日期不弹窗');
  eq(closeOf('k1'), '2026-06-01', 'S8 原有结案日期未被覆盖');
  eq(statusOf('k1'), STATUS_DONE, 'S8 状态已改为 Closed');
}

/* S9：拖到非 Closed 列 → 不触发结案日期弹窗 */
{ reset([], [mkTask('k1', 'Planning', null)]);
  await dropTo('k1', STATUS_ONGOING);
  eq(globalThis.__promptMsgs.length, 0, 'S9 拖到 Ongoing 不弹结案日期');
  eq(statusOf('k1'), STATUS_ONGOING, 'S9 状态已改为 Ongoing');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== H1 结案日期强制填写回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('✓ 批量补录与看板拖拽均不再静默补 today，取消即中止（与录入页口径一致）');
})();
