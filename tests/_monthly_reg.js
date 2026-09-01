/* monthly.js 回归：验证「切换到空月」时月度复盘面板不再残留上一个非空月份的内容。
   用法：node _monthly_reg.js  */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'js');
const storeSrc  = fs.readFileSync(path.join(ROOT, 'store.js'),  'utf8');
const monthSrc  = fs.readFileSync(path.join(ROOT, 'monthly.js'), 'utf8');

/* ---- DOM 桩 ---- */
const _els = {};
function makeEl(sel){
  return {
    _sel: sel, onclick:null, onchange:null, value:'', innerHTML:'', textContent:'', checked:true,
    style:{}, dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
    focus(){}, scrollIntoView(){}, appendChild(){}, removeEventListener(){}, addEventListener(){},
    querySelector(s){ return makeEl(sel+'>'+s); },
    querySelectorAll(){ return []; },
  };
}
global.document = {
  querySelector(s){ if(!_els[s]) _els[s]=makeEl(s); return _els[s]; },
  querySelectorAll(){ return []; },
  createElement(){ return makeEl('created'); },
  body: makeEl('body'),
};
global.window = { open(){ return { document:{ write(){}, close(){}, title:'' }, focus(){}, print(){} }; } };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };

/* ---- localStorage 桩：注入 2 条「当月」任务 ---- */
const now = new Date();
const y = now.getFullYear(), m = now.getMonth()+1, d = Math.min(now.getDate(), 28);
const p2 = n => String(n).padStart(2,'0');
const ED = y+'-'+p2(m)+'-'+p2(d);
const seededTasks = [
  {id:'t1', entryDate:ED, values:{专案名称:'A项目',客户:'客户X',负责人:'张三',完成状态:'Ongoing',开发日期:ED,开发进度:'进度50%'}},
  {id:'t2', entryDate:ED, values:{专案名称:'B项目',客户:'客户Y',负责人:'李四',完成状态:'Closed',开发日期:ED,开发进度:'已完成',结案日期:ED}},
];
const CUR = y+'-'+p2(m);   // 当月（有任务）
const EMPTY = '2020-01';   // 空月（无任务）
const LS = { wb_tasks: JSON.stringify(seededTasks) };
global.localStorage = {
  getItem(k){ return (k in LS) ? LS[k] : null; },
  setItem(k,v){ LS[k]=v; },
  removeItem(k){ delete LS[k]; },
};

/* ---- 单 eval：store + monthly 同一作用域 ---- */
(0, eval)(storeSrc + '\n;\n' + monthSrc);

/* ---- 断言 ---- */
let pass=0, fail=0;
function ok(cond,msg){ if(cond){pass++;console.log('  PASS '+msg);} else {fail++;console.log('  FAIL '+msg);} }

// 初始：选当月（有任务），renderMonthly 应同时刷新复盘面板
_els['#monthPick'].value = CUR;
renderMonthly();
const reviewFull = (_els['#reviewText'] && _els['#reviewText'].value) || '';
ok(/【.*月 月度复盘】/.test(reviewFull), '当月（有任务）renderMonthly 后复盘面板已填充');

// 关键回归：切到空月，复盘面板必须清空，不能残留上一非空月内容
_els['#monthPick'].value = EMPTY;
renderMonthly();
const reviewEmpty = (_els['#reviewText'] && _els['#reviewText'].value) || '';
ok(reviewEmpty === '该月没有任务数据。', '切到空月后复盘面板被清空（修复前会残留上一非空月内容）');
ok(reviewEmpty !== reviewFull, '空月复盘内容不同于非空月（确为重新计算，非残留）');

console.log('\n_monthly_reg.js 结果: PASS='+pass+' FAIL='+fail);
process.exit(fail?1:0);
