/* dashboard.js 回归：驱动真实 exportReportPDF，捕获其生成的 PDF HTML，
   验证「本月任务明细」表头用的是真实列名（c.name）而非 [object Object]。
   用法：node _dash_reg.js  */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'js');
const storeSrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const dashSrc  = fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8');

/* ---- DOM 桩 ---- */
const _els = {};
function makeEl(sel){
  const el = {
    _sel: sel, onclick:null, onchange:null, value:'', innerHTML:'', textContent:'', checked:true,
    style:{}, dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
    focus(){}, scrollIntoView(){}, appendChild(){}, removeEventListener(){}, addEventListener(){},
    querySelector(s){ return makeEl(sel+'>'+s); },
    querySelectorAll(){ return []; },
  };
  return el;
}
global.document = {
  querySelector(s){ if(!_els[s]) _els[s]=makeEl(s); return _els[s]; },
  querySelectorAll(){ return []; },
  createElement(){ return makeEl('created'); },
  body: makeEl('body'),
};

/* ---- localStorage 桩：注入 2 条当月任务 ---- */
const now = new Date();
const y = now.getFullYear(), m = now.getMonth()+1, d = Math.min(now.getDate(), 28);
const p2 = n => String(n).padStart(2,'0');
const ED = y+'-'+p2(m)+'-'+p2(d);
const seededTasks = [
  {id:'t1', entryDate:ED, values:{专案名称:'A项目',客户:'客户X',负责人:'张三',完成状态:'Ongoing',开发日期:ED,开发进度:'进度50%'}, exported:false, exportedNew:false},
  {id:'t2', entryDate:ED, values:{专案名称:'B项目',客户:'客户Y',负责人:'李四',完成状态:'Closed',开发日期:ED,开发进度:'已完成',结案日期:ED}, exported:false, exportedNew:false},
];
const LS = { wb_tasks: JSON.stringify(seededTasks) };
global.localStorage = {
  getItem(k){ return (k in LS) ? LS[k] : null; },
  setItem(k,v){ LS[k]=v; },
  removeItem(k){ delete LS[k]; },
};

/* ---- window.open 桩：捕获 exportReportPDF 写出的 HTML ---- */
let capturedHtml = null;
global.window = {
  open(){ return { document:{ write(h){ capturedHtml=h; }, close(){}, title:'' }, focus(){}, print(){} }; },
};

/* ---- 单 eval：store + dashboard 同一作用域，函数/let 共享 ---- */
const fullSrc = storeSrc + '\n;\n' + dashSrc;
(0, eval)(fullSrc);

/* ---- 断言 ---- */
let pass=0, fail=0;
function eq(a,b,msg){ if(a===b){pass++;console.log('  PASS '+msg);} else {fail++;console.log('  FAIL '+msg+'  (得到='+JSON.stringify(a)+' 期望='+JSON.stringify(b)+')');} }
function ok(cond,msg){ if(cond){pass++;console.log('  PASS '+msg);} else {fail++;console.log('  FAIL '+msg);} }

// 触发真实 exportReportPDF（经捕获的 onclick handler）
const handler = _els['#dashExportPdf'] && _els['#dashExportPdf'].onclick;
ok(typeof handler==='function', 'exportReportPDF 已绑定到 #dashExportPdf.onclick');
handler();

ok(capturedHtml!=null, 'exportReportPDF 已生成 PDF HTML（window.open 捕获）');
// 只取「六、本月任务明细」那一节的 <thead>（避免与前文「逾期未完成」表的同名列混淆）
const SEC6 = '六、本月任务明细';
const sec6Idx = (capturedHtml||'').indexOf(SEC6);
const tail = sec6Idx>=0 ? (capturedHtml||'').slice(sec6Idx) : (capturedHtml||'');
const headerBlock = tail.match(/<thead>[\s\S]*?<\/thead>/);
ok(!!headerBlock, 'PDF「本月任务明细」含 <thead> 表头块');

const EXPECT_COLS = ['专案名称','客户','负责人','开发进度','完成状态','开发日期']; // 按 schema 过滤后顺序
EXPECT_COLS.forEach(c=>{
  ok(new RegExp('<th>'+c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'</th>').test(headerBlock||''),
     'PDF 本月任务明细 表头含真实列名 <th>'+c+'</th>（非 [object Object]）');
});
ok(!/\[object Object\]/.test(headerBlock||''), 'PDF 本月任务明细 表头不含 [object Object]（修复前会渲染对象占位）');

console.log('\n_dash_reg.js 结果: PASS='+pass+' FAIL='+fail);
process.exit(fail?1:0);
