/* 导出新功能 端到端回归：在「同一个真实工作簿」里组合 排序 + 文件名 + 样式 + 状态着色，
   生成后用 ExcelJS 读回逐项校验，证明多特性可正确协同工作（而非仅单测）。
   用法：node _export_e2e_reg.js */
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(PROJ, 'js/export.js'), 'utf8');

function makeEl(){
  const t={ _value:'', _checked:false, _text:'', _html:'', _cls:'', style:{}, dataset:{}, files:[],
    classList:{add(){},remove(){},contains(){return false;}}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, click(){}, appendChild(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];}, getContext(){return null;} };
  return new Proxy(t,{ get(o,p){ if(p in o)return o[p]; if(p==='value')return o._value; if(p==='checked')return o._checked; if(p==='textContent')return o._text; if(p==='innerHTML')return o._html; if(p==='className')return o._cls; return undefined; },
    set(o,p,v){ if(p==='value')o._value=v; else if(p==='checked')o._checked=v; else if(p==='textContent')o._text=v; else if(p==='innerHTML')o._html=v; else if(p==='className')o._cls=v; else o[p]=v; return true; } });
}
let E;
try { E = require(path.join(PROJ, 'exceljs.min.js')); } catch(e){ console.error('require exceljs 失败:', e.message); process.exit(1); }
global.ExcelJS = (E && E.Workbook) ? E : (E.default || E);
global.window = { crypto: null, scrollTo(){} };
global.localStorage = (()=>{ const m={}; return {
  getItem:k=>(k in m)?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}
}; })();
global.document = { querySelector:()=>makeEl(), getElementById:()=>makeEl(), createElement:()=>makeEl(), body:{appendChild(){}}, addEventListener(){} };
global.Blob = class { constructor(){} };
global.URL = { createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm = ()=>true;
global.fetch = ()=>Promise.reject(new Error('no fetch in harness'));
global.toast = ()=>{};

const bridge = `
globalThis.__api = {
  buildNewWorkbook, checkCloseDependency, buildFileName, schema, sortExportTasks,
  setSettings(s){ const k='wb_exportcfg'; if(s) localStorage.setItem(k, JSON.stringify(s)); else localStorage.removeItem(k); },
  // 模拟真实链路：buildNewWorkbook 调 getRangeTasks，而 getRangeTasks 内部会排序。
  // 这里用真实 sortExportTasks 对传入任务排序后返回，忠实复现生产行为（含排序）。
  setRangeTasks(t){ getRangeTasks=()=>sortExportTasks(t.slice()); }
};`;
try { (0, eval)(storeSrc + '\n' + exportSrc + '\n' + bridge); } catch(e){ console.error('eval 失败:', e.stack); process.exit(1); }
const api = globalThis.__api;

let pass=0, fail=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:', m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }

(async()=>{
console.log('\n=== 端到端：排序+文件名+样式+状态着色 同簿组合 ===');
{
  // 配置：按开发日期升序；文件名前缀 DG周报 / YYYYMMDD；字体等线11；表头背景；状态背景映射
  api.setSettings({
    exportSortBy:'开发日期', exportSortDir:'asc',
    exportFilePrefix:'DG周报', exportFileDateFormat:'YYYYMMDD',
    exportFontName:'等线', exportFontSize:'11',
    exportHeaderBg:'#D9E1F2', exportStatusBg:{'Closed':'#C6EFCE','Ongoing':'#FFEB9C'}
  });
  // 故意打乱开发日期顺序 + 混合状态（Closed 必须带结案日期，否则依赖校验会拦；此处给合法数据）
  const tasks=[
    { id:'t1', entryDate:'2026-08-20', values:{ 项次:0, 厂区:'东莞', 提出日期:'2026-08-15', 提出部门:'仓库', 客户:'A', 专案名称:'任务B', 需求说明:'', 负责人:'黄', 开发进度:'开发中', 完成状态:'Ongoing', 开发日期:'2026-08-20', 测试日期:'', 开发天数:'1天', 结案日期:'', 备注:'' }, exported:false },
    { id:'t2', entryDate:'2026-08-18', values:{ 项次:0, 厂区:'苏州', 提出日期:'2026-08-12', 提出部门:'IQC', 客户:'B', 专案名称:'任务A', 需求说明:'', 负责人:'李', 开发进度:'已完成', 完成状态:'Closed', 开发日期:'2026-08-18', 测试日期:'2026-08-19', 开发天数:'2天', 结案日期:'2026-08-20', 备注:'' }, exported:false },
    { id:'t3', entryDate:'2026-08-22', values:{ 项次:0, 厂区:'厦门', 提出日期:'2026-08-16', 提出部门:'SQE', 客户:'C', 专案名称:'任务C', 需求说明:'', 负责人:'王', 开发进度:'联调中', 完成状态:'Ongoing', 开发日期:'2026-08-22', 测试日期:'', 开发天数:'1天', 结案日期:'', 备注:'' }, exported:false }
  ];
  api.setRangeTasks(tasks);
  const res = await api.buildNewWorkbook();
  ok(res && res.wb, 'buildNewWorkbook 返回工作簿');
  const ws = res.wb.getWorksheet(1);

  // 1) 排序：输出顺序应按开发日期升序 = 任务A(08-18) / 任务B(08-20) / 任务C(08-22)
  const nameIdx = api.schema.findIndex(c=>c.name==='专案名称')+1;
  const order = [2,3,4].map(r=>ws.getRow(r).getCell(nameIdx).value);
  eq(order, ['任务A','任务B','任务C'], '行顺序按开发日期升序（A/B/C），证明排序生效');

  // 2) 文件名：前缀+范围
  eq(api.buildFileName('2026-08-17','2026-08-21'), 'DG周报20260817-20260821', '文件名 = 前缀+起止（YYYYMMDD）');

  // 3) 表头背景
  const hdrFill = ws.getRow(1).getCell(1).fill;
  ok(hdrFill && hdrFill.fgColor && hdrFill.fgColor.argb==='FFD9E1F2', '表头背景色写入（FFD9E1F2）');

  // 4) 状态列着色：行内 完成状态 取值决定底色
  const stIdx = api.schema.findIndex(c=>c.name==='完成状态')+1;
  const rowOf = nm => 2 + order.indexOf(nm);
  const fillA = ws.getRow(rowOf('任务A')).getCell(stIdx).fill; // Closed
  const fillB = ws.getRow(rowOf('任务B')).getCell(stIdx).fill; // Ongoing
  const fillC = ws.getRow(rowOf('任务C')).getCell(stIdx).fill; // Ongoing
  ok(fillA && fillA.fgColor && fillA.fgColor.argb==='FFC6EFCE', '任务A(Closed) 状态列底色 #C6EFCE');
  ok(fillB && fillB.fgColor && fillB.fgColor.argb==='FFFFEB9C', '任务B(Ongoing) 状态列底色 #FFEB9C');
  ok(fillC && fillC.fgColor && fillC.fgColor.argb==='FFFFEB9C', '任务C(Ongoing) 状态列底色 #FFEB9C');

  // 5) 字体/字号
  const font = ws.getRow(2).getCell(1).font;
  ok(font && font.name==='等线' && font.size===11, '数据行字体/字号写入（等线/11）');
}

console.log('\n=== 端到端：结案依赖硬校验（保存路径同源） ===');
{
  ok(api.checkCloseDependency({完成状态:'Closed', 结案日期:'2026-08-20'}).ok, '合法：Closed+结案日期');
  ok(!api.checkCloseDependency({完成状态:'Ongoing', 结案日期:'2026-08-20'}).ok, '拦截：填结案日期但非 Closed');
  ok(!api.checkCloseDependency({完成状态:'Closed', 结案日期:''}).ok, '拦截：选 Closed 但无结案日期');
}

console.log(`\n========== 导出新功能端到端回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('排序+文件名+样式+状态着色 组合生效，结案依赖硬校验通过 ✓');
})();
