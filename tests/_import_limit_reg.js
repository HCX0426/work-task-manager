/* H3 回归：三处文件导入的 20MB 上限校验 + 读取失败兜底。
   旧行为：只判断文件是否存在，超大文件会直接进入解析，长时间阻塞主线程；
          FileReader 失败（权限/设备错误）时无任何提示，表现为「点了没反应」。
   新行为：超过 MAX_UPLOAD_BYTES 直接提示并清空选择；onerror 时提示读取失败。
   覆盖 #importAllFile / #restoreEncFile / #importTasksFile 三个入口。
   本测试驱动真实源码里的 onchange 处理器，不复制业务逻辑。
   用法：node _import_limit_reg.js */
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js', 'store.js'), 'utf8');
const listSrc  = fs.readFileSync(path.join(PROJ, 'js', 'list.js'),  'utf8');

/* ---------- DOM 桩 ---------- */
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
globalThis.__qsa = {};
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

/* 可控 FileReader：按 mode 决定回调，统计 readAsText 次数 */
globalThis.__fr = { reads:0, mode:'ok', result:'{}' };
global.FileReader = class {
  readAsText(/* f */){
    globalThis.__fr.reads++;
    this.result = globalThis.__fr.result;
    const mode = globalThis.__fr.mode;
    if(mode==='error'){ if(this.onerror) this.onerror(); return; }
    if(mode==='ok'){ if(this.onload) this.onload(); }
    // mode==='never'：不触发任何回调（用于确认上限分支提前 return，根本没创建读取）
  }
};

globalThis.__toasts = [];
const bridge = `
globalThis.__api = {
  MAX_UPLOAD_BYTES, MAX_UPLOAD_MB,
  el: (s)=>document.querySelector(s)
};
globalThis.toast = (m)=>{ globalThis.__toasts.push(String(m)); };
globalThis.renderList = ()=>{};
globalThis.renderKanban = ()=>{};
globalThis.renderStats = ()=>{};
globalThis.renderEntry = ()=>{};
globalThis.uiPrompt = async ()=>null;   // 加密恢复场景：返回 null 即中止，不进入解密
`;
try { (0, eval)(storeSrc + '\n' + listSrc + '\n' + bridge); }
catch(e){ console.error('eval 合并源码失败:', e.stack); process.exit(1); }
const api = globalThis.__api;
const MAX = api.MAX_UPLOAD_BYTES, MAXMB = api.MAX_UPLOAD_MB;

let pass=0, fail=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:', m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }

/* 触发某文件输入的 onchange；返回事件对象以便断言 e.target.value 被重置 */
function fire(sel, files, mode){
  globalThis.__toasts.length = 0;
  globalThis.__fr.reads = 0;
  globalThis.__fr.mode = mode || 'ok';
  const ev = { target:{ files, value:'DIRTY' } };
  const h = api.el(sel).onchange;
  if(typeof h!=='function'){ ok(false, sel+'.onchange 未取到（选择器变更？）'); return ev; }
  h(ev);
  return ev;
}
const toastsAll = ()=>globalThis.__toasts.join(' | ');
const INPUTS = [['#importAllFile','全量恢复'], ['#restoreEncFile','加密恢复'], ['#importTasksFile','任务导入']];

(async()=>{
/* ===== S1：超过上限 → 提示 + 不读取 + 清空选择（三个入口逐一验证）===== */
console.log('=== H3-A：超过 '+MAXMB+'MB 上限必须拦截 ===');
for(const [sel,label] of INPUTS){
  const ev = fire(sel, [{size: MAX + 1}], 'never');
  ok(/上限/.test(toastsAll()), `${label} 超限有「上限」提示（实际 toast：${toastsAll()||'无'}）`);
  ok(new RegExp(MAXMB+'MB').test(toastsAll()), `${label} 提示含具体上限 ${MAXMB}MB`);
  eq(globalThis.__fr.reads, 0, `${label} 超限时未创建/未触发读取（核心回归点）`);
  eq(ev.target.value, '', `${label} 超限后已清空 file input（可重复选同一文件）`);
}

/* ===== S2：读取失败 → 明确提示 + 清空选择 ===== */
console.log('\n=== H3-B：FileReader 失败必须提示（不再静默无反应）===');
for(const [sel,label] of INPUTS){
  const ev = fire(sel, [{size: 1024}], 'error');
  ok(/读取失败/.test(toastsAll()), `${label} 读取失败有提示（实际 toast：${toastsAll()||'无'}）`);
  eq(globalThis.__fr.reads, 1, `${label} 确实发起过一次读取`);
  eq(ev.target.value, '', `${label} 读取失败后已清空 file input`);
}

/* ===== S3：正常大小 → 正常进入读取，不误报 ===== */
console.log('\n=== H3-C：正常文件不应被误拦 ===');
for(const [sel,label] of INPUTS){
  fire(sel, [{size: 1024}], 'ok');
  eq(globalThis.__fr.reads, 1, `${label} 正常文件进入读取流程`);
  ok(!/上限/.test(toastsAll()), `${label} 正常文件未误报超限`);
  ok(!/读取失败/.test(toastsAll()), `${label} 正常文件未误报读取失败（实际 toast：${toastsAll()||'无'}）`);
}

/* ===== S4：边界值 —— 恰好等于上限应放行（条件为 > 而非 >=）===== */
console.log('\n=== H3-D：边界与空选择 ===');
{
  fire(INPUTS[0][0], [{size: MAX}], 'ok');
  eq(globalThis.__fr.reads, 1, `恰好 ${MAXMB}MB 应放行（上限判定为严格大于）`);
  ok(!/上限/.test(toastsAll()), `恰好 ${MAXMB}MB 不提示超限`);
}
/* 空选择（用户点了取消）→ 静默返回，不读不提示 */
{
  const ev = fire(INPUTS[0][0], [], 'never');
  eq(globalThis.__fr.reads, 0, '未选文件时不读取');
  eq(globalThis.__toasts.length, 0, '未选文件时不提示（取消选择属正常操作）');
  eq(ev.target.value, 'DIRTY', '未选文件时不改动 value（提前 return）');
}
/* size 缺失/为 0（部分环境拿不到 size）→ 不应被误判为超限 */
{
  fire(INPUTS[2][0], [{size: 0}], 'ok');
  eq(globalThis.__fr.reads, 1, 'size=0 时不误拦（f.size && 短路）');
  ok(!/上限/.test(toastsAll()), 'size=0 不提示超限');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== H3 导入上限/读取失败回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log(`✓ 三处导入均拦截超 ${MAXMB}MB 文件并兜底读取失败，正常文件不受影响`);
})();
