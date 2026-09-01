/* 恢复链路 aiKey 防丢失回归（② 修复）：用真实 store.js + list.js 源码 + DOM 桩
   目标：验证 restoreAll 恢复任意备份时，不会把当前 BYOK 的 aiKey 静默清空。
   旧行为：nSettings（来自备份 settings）不含 aiKey 时，plan 直接 push nSettings，
           成功写入即覆盖当前 LS_EXPORTCFG，当前 aiKey 丢失（P3 修复的反向回归）。
   新行为：nSettings.aiKey 为空且当前有 aiKey 时，沿用当前 Key。
   用法：node _restore_reg.js */
const fs = require('fs');
const path = require('path');
const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const listSrc  = fs.readFileSync(path.join(PROJ, 'js/list.js'),  'utf8');

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

/* 注入的备份最小合法结构（restoreAll 要求 tasks/schema/dropdowns 存在） */
function backup(opts){
  return {
    tasks:[{id:'r1',entryDate:'2026-08-06',values:{'专案名称':'R1'},exported:false,exportedNew:false,subtasks:[],history:[]}],
    trash:[],
    schema:[{name:'专案名称',type:'text',def:''}],
    dropdowns:{},
    colMapping:{},
    settings: opts && opts.settings ? opts.settings : undefined
  };
}

const bridge = `
globalThis.__api = { restoreAll, loadSettings };
globalThis.toast = ()=>{};
globalThis.renderEntry = ()=>{};
renderList = ()=>{};   // 中性化，避免 DOM 渲染副作用（本测试只关心持久化逻辑）
globalThis.downloadJSON = ()=>{};
globalThis.uiPrompt = async ()=>null;
`;
try { (0, eval)(storeSrc + '\n' + listSrc + '\n' + bridge); }
catch(e){ console.error('eval 合并源码失败:', e.stack); process.exit(1); }
const api = globalThis.__api;

let pass=0, fail=0, warns=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:', m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }
function warn(m){ warns++; console.log('  ⚠ WARN:', m); }

const EXPORTCFG = 'wb_exportcfg';
const readCfg = ()=> JSON.parse(global.localStorage.getItem(EXPORTCFG)||'null');

(async()=>{
/* === S1（② 修复）：当前有 aiKey，备份 settings 无 aiKey → 恢复后 aiKey 必须保留 === */
console.log('\n=== S1：恢复无 Key 备份时沿用当前 aiKey（② 修复）===');
{
  global.localStorage.clear();
  // 当前导出配置含 BYOK Key
  global.localStorage.setItem(EXPORTCFG, JSON.stringify({aiKey:'sk-current-123', rangeBy:'entryDate'}));
  const d = backup({ settings:{ rangeBy:'devDate' } }); // 备份 settings 无 aiKey
  const r = api.restoreAll(d, 'ok');
  ok(r===true, 'S1 restoreAll 返回 true（恢复成功）');
  const cfg = readCfg();
  eq(cfg.aiKey, 'sk-current-123', 'S1 恢复后 aiKey 仍为当前值（② 修复：此前被备份的 undefined 覆盖清空）');
  // 顺带确认备份里其它 settings 字段生效、且 tasks 落盘
  eq(cfg.rangeBy, 'devDate', 'S1 备份 settings 字段正常写入');
  const onDiskTasks = JSON.parse(global.localStorage.getItem('wb_tasks')||'[]');
  eq((onDiskTasks[0]||{}).values, {'专案名称':'R1'}, 'S1 恢复的任务库已落盘');
}

/* === S2（对照）：备份 settings 自带 aiKey → 应被尊重（不被当前 Key 覆盖） === */
console.log('\n=== S2：备份自带 aiKey 时以备份为准（对照）===');
{
  global.localStorage.clear();
  global.localStorage.setItem(EXPORTCFG, JSON.stringify({aiKey:'sk-current-999', rangeBy:'entryDate'}));
  const d = backup({ settings:{ aiKey:'sk-backup-777', rangeBy:'devDate' } });
  const r = api.restoreAll(d, 'ok');
  ok(r===true, 'S2 restoreAll 返回 true');
  eq(readCfg().aiKey, 'sk-backup-777', 'S2 恢复后 aiKey 取备份值（不反向覆盖）');
}

/* === S3（对照）：当前无 aiKey 且备份也无 → 不抛错、aiKey 为空 === */
console.log('\n=== S3：双方皆无 Key 时不崩溃（对照）===');
{
  global.localStorage.clear();
  global.localStorage.setItem(EXPORTCFG, JSON.stringify({rangeBy:'entryDate'})); // 无 aiKey
  const d = backup({ settings:{ rangeBy:'devDate' } }); // 无 aiKey
  const r = api.restoreAll(d, 'ok');
  ok(r===true, 'S3 restoreAll 返回 true（无 Key 场景正常）');
  eq(readCfg().aiKey, undefined, 'S3 恢复后 aiKey 为 undefined（双方皆无，符合预期）');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 恢复链路 aiKey 防丢失回归结果：PASS=${pass}  FAIL=${fail}  WARN=${warns} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('✓ 恢复链路无 aiKey 丢失回归');
})();
