/* 配置中心改名/导入还原链路深挖回归：用真实 store.js + config.js + DOM 桩
   目标：验证 ①改名迁移引擎(computeRenames/applyRenames)健壮；②#C1 配置导入保留 dateFmt+id；
   ③#C2 applyColTemplate 保留 dateFmt。
   预期：S1 通过（引擎稳）；S2/S3 当前会因代码剥掉 dateFmt 而 FAIL —— 用于钉死 #C1/#C2 bug。
   用法：node _cfg_reg.js */
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const cfgSrc   = fs.readFileSync(path.join(PROJ, 'js/config.js'), 'utf8');

function makeEl() {
  const t = { _value:'', _checked:false, _text:'', _html:'', _cls:'', style:{}, dataset:{}, files:[],
    classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, click(){},
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
global.document = { querySelector:(s)=>el(s), querySelectorAll:()=>[], getElementById:(id)=>el('#'+id), createElement:()=>makeEl(), body:{appendChild(){}}, addEventListener(){} };
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch'));
global.FileReader = class { readAsText(f){ this.result=f.__text; if(this.onload) this.onload(); } };

const bridge = `
globalThis.__api = { computeRenames, applyRenames, applyColTemplate, loadSchema };
globalThis.__cfg = {
  setSchema(s){ schema = s; },
  setTasks(t){ tasks = t; },
  setMap(m){ colMapping = m; },
  get schema(){ return schema; },
  get tasks(){ return tasks; },
  get colMapping(){ return colMapping; }
};
globalThis.renderEntry = ()=>{};
globalThis.uiPrompt = async ()=>null;
globalThis.renderPreview = ()=>{};
`;
try { (0, eval)(storeSrc + '\n' + cfgSrc + '\n' + bridge); }
catch(e){ console.error('eval 合并源码失败:', e.stack); process.exit(1); }
const api = globalThis.__api, cfg = globalThis.__cfg;

let pass=0, fail=0, warns=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:', m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }
function warn(m){ warns++; console.log('  ⚠ WARN:', m); }

const INIT_SCHEMA = [
  {name:'项次',type:'auto',def:'',id:'col_项次'},
  {name:'提出日期',type:'date',def:'{{today}}',dateFmt:'ymd',id:'col_提出日期'},
  {name:'客户',type:'dropdown',def:'',id:'col_客户'},
  {name:'专案名称',type:'text',def:'',id:'col_专案名称'},
  {name:'开发日期',type:'date',def:'{{today}}',dateFmt:'md',id:'col_开发日期'},
  {name:'完成状态',type:'dropdown',def:'Ongoing',id:'col_完成状态'},
  {name:'结案日期',type:'date',def:'',dateFmt:'md',id:'col_结案日期'}
];
INIT_SCHEMA.forEach(c=>{ if(!c.id) c.id='col_'+c.name; });

(async()=>{
/* === S1（正向）：改名迁移引擎 — B 改名 C，历史数据迁移且不丢其他列 === */
console.log('\n=== S1：computeRenames + applyRenames 改名迁移 ===');
{
  cfg.setSchema([{name:'A',type:'text',def:'',id:'col_A'},{name:'B',type:'text',def:'',id:'col_B'}]);
  cfg.setTasks([{id:'t1', entryDate:'2026-08-06', values:{A:'a1',B:'b1'}, exported:false, exportedNew:false, subtasks:[], history:[]}]);
  const old=[{name:'A',type:'text',def:'',id:'col_A'},{name:'B',type:'text',def:'',id:'col_B'}];
  const neu=[{name:'A',type:'text',def:'',id:'col_A'},{name:'C',type:'text',def:'',id:'col_B'}];
  const rn=api.computeRenames(old,neu);
  eq(rn, [{from:'B',to:'C'}], 'S1 computeRenames 识别 B→C（按稳定 id col_B）');
  api.applyRenames(rn);
  eq(cfg.tasks[0].values, {A:'a1',C:'b1'}, 'S1 applyRenames 把 B→C 迁移，且保留 A（无数据丢失）');
}

/* === S2（#C2）：applyColTemplate 应保留 dateFmt === */
console.log('\n=== S2：applyColTemplate 保留 dateFmt（#C2）===');
{
  cfg.setSchema(INIT_SCHEMA.map(c=>({...c})));
  const tpl={ schema: INIT_SCHEMA.map(c=>({...c})), dropdowns:{}, mapping:{} };
  api.applyColTemplate(tpl);
  const sc = cfg.schema;
  eq((sc.find(c=>c.name==='开发日期')||{}).dateFmt, 'md', 'S2 套用模板后 开发日期 应保留 dateFmt=md（#C2 bug：当前被剥成 undefined）');
  eq((sc.find(c=>c.name==='提出日期')||{}).dateFmt, 'ymd', 'S2 套用模板后 提出日期 应保留 dateFmt=ymd');
}

/* === S3（#C1）：配置导入(#importCfg) 应保留 dateFmt 与 id === */
console.log('\n=== S3：#importCfg 配置导入保留 dateFmt+id（#C1）===');
{
  cfg.setSchema(INIT_SCHEMA.map(c=>({...c})));
  cfg.setTasks([{id:'t1', entryDate:'2026-08-06', values:{'客户':'A','专案名称':'N1','开发日期':'2026-08-18'}, exported:false, exportedNew:false, subtasks:[], history:[]}]);
  // 配置备份（#exportCfg 导出 {schema,dropdowns}，schema 含 dateFmt+id）
  const backup = { schema: INIT_SCHEMA.map(c=>({...c})), dropdowns:{} };
  const fileStub = { __text: JSON.stringify(backup) };
  document.querySelector('#importCfgFile').onchange({ target:{ files:[fileStub], value:'' } });
  const sc = cfg.schema;
  // 列名应完整保留（结构不丢）
  eq(sc.map(c=>c.name), INIT_SCHEMA.map(c=>c.name), 'S3 导入后列名结构完整（非 bug，仅隔离用）');
  // 关键：dateFmt 应保留
  eq((sc.find(c=>c.name==='开发日期')||{}).dateFmt, 'md', 'S3 导入后 开发日期 应保留 dateFmt=md（#C1 bug：当前被剥成 undefined）');
  eq((sc.find(c=>c.name==='提出日期')||{}).dateFmt, 'ymd', 'S3 导入后 提出日期 应保留 dateFmt=ymd');
  // id 应保留（避免下次改名被迫退化为按位置匹配）
  eq((sc.find(c=>c.name==='开发日期')||{}).id, 'col_开发日期', 'S3 导入后 开发日期 应保留 id（#C1 bug：当前被剥成 col_开发日期 虽同名但 id 链路被重置）');
}

/* === S4（① 修复回归）：applyColTemplate 改名后应把 LS_TASKS 一并持久化 === */
console.log('\n=== S4：applyColTemplate 改名后持久化 LS_TASKS（①）===');
{
  // 当前列结构：专案名称(ID col_P)；模板把它改名成 专案名称2（同 id col_P）→ 触发 rename
  cfg.setSchema([{name:'专案名称',type:'text',def:'',id:'col_P'}]);
  cfg.setTasks([{id:'t1',entryDate:'2026-08-06',values:{'专案名称':'N1'},exported:false,exportedNew:false,subtasks:[],history:[]}]);
  global.localStorage.clear();
  const tpl = { schema:[{name:'专案名称2',type:'text',def:'',id:'col_P'}], dropdowns:{}, mapping:{} };
  api.applyColTemplate(tpl);
  // 内存中 tasks 的 key 应已改名
  eq(cfg.tasks[0].values, {'专案名称2':'N1'}, 'S4 内存中 专案名称→专案名称2 已迁移（applyRenames 生效）');
  // 关键回归：磁盘 LS_TASKS 必须也改名，否则刷新后失联
  const onDisk = JSON.parse(global.localStorage.getItem('wb_tasks')||'[]');
  eq((onDisk[0]||{}).values, {'专案名称2':'N1'}, 'S4 持久化 LS_TASKS 已改名（① 修复：此前只存了 schema/dropdowns/mapping，未存 tasks，刷新即失联）');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 配置中心改名/导入回归结果：PASS=${pass}  FAIL=${fail}  WARN=${warns} ==========`);
if(fail){ console.log('失败项（即本次深挖发现的 bug）：'); fails.forEach(f=>console.log(' - '+f)); }
else console.log('✓ 配置中心链路无回归');
})();
