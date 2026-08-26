// 用真实 DG 周报文件测试分组插入 + 样式对齐
const fs = require('fs');
const vm = require('vm');

const styleFlag = { on: true };
const fakeEl = {
  addEventListener(){}, onclick:null, onchange:null, oninput:null, onkeydown:null,
  innerHTML:'', textContent:'', value:'append', checked:true, files:[],
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  style:{}, dataset:{}, querySelector(){ return fakeEl; }, querySelectorAll(){ return []; },
  appendChild(){}, click(){}, setAttribute(){}, getAttribute(){ return ''; }, remove(){},
};
Object.defineProperty(fakeEl, 'checked', { get(){ return styleFlag.on; }, set(){} });
const sandbox = {
  console,
  document: { querySelector:()=>fakeEl, getElementById:()=>fakeEl, createElement:()=>fakeEl, body:fakeEl },
  localStorage: { _s:{}, getItem(k){ return (k in this._s)?this._s[k]:null; }, setItem(k,v){ this._s[k]=String(v); } },
  toast: ()=>{},
  ExcelJS: require('c:/Users/chongxuan-huang/Desktop/工作任务管理/exceljs.min.js'),
};
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('./js/store.js','utf8'), ctx);
vm.runInContext(fs.readFileSync('./js/export.js','utf8'), ctx);

const headers = ['项次','厂区','提出日期','提出部门','客户','专案名称','需求说明','负责人','开发进度','完成状态','开发日期','测试日期','开发天数','结案日期','备注'];
vm.runInContext(`
  schema = ${JSON.stringify(headers.map((n,i)=>({name:n,type:(i===0?'auto':(i===9?'dropdown':'text')),def:''})))};
  colMapping = ${JSON.stringify(Object.fromEntries(headers.map(h=>[h,h])))};
  excelHeaders = ${JSON.stringify(headers)};
  excelHeaderRow = 2;
`, ctx);

const ExcelJS = require('c:/Users/chongxuan-huang/Desktop/工作任务管理/exceljs.min.js');
const srcBuf = fs.readFileSync('C:/Users/chongxuan-huang/Desktop/DG周报20260817-20260821.xlsx');

const tasks=[
  {values:{'完成状态':'Ongoing','专案名称':'新项目X','客户':'N客户','负责人':'黄崇璇','需求说明':'测试新需求'}},
  {values:{'完成状态':'Ongoing','专案名称':'新项目Y','客户':'所有','负责人':'黄崇璇'}},
  {values:{'完成状态':'Closed','专案名称':'已结项Z','客户':'太白山','负责人':'黄崇璇'}},
  {values:{'完成状态':'planning','专案名称':'计划中W','客户':'其他','负责人':'黄崇璇'}}
];

function lastDataRowOf(ws){
  let last=2;
  for(let r=3;r<=ws.rowCount;r++){ let has=false; ws.getRow(r).eachCell(()=>{has=true;}); if(has)last=r; }
  return last;
}
function rowStyleStr(ws, r){
  const parts=[];
  for(let c=1;c<=15;c++){
    const cell=ws.getRow(r).getCell(c);
    parts.push(`${headers[c-1].slice(0,2)}:${cell.border?'B':'-'}${cell.fill?'F':'-'}`);
  }
  return `${parts.join(' ')} | 行高=${ws.getRow(r).height} | 项次=${ws.getRow(r).getCell(1).value} 专案=${ws.getRow(r).getCell(6).value} 状态=${ws.getRow(r).getCell(10).value}`;
}

(async ()=>{
  // 加载真实文件
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(srcBuf);
  const ws = wb.getWorksheet(1);
  const ldr = lastDataRowOf(ws);
  console.log('真实文件 lastDataRow:', ldr);

  vm.runInContext(`insertGrouped(ws, taskArr, ${ldr})`, Object.assign(ctx, {ws, taskArr:tasks}));
  console.log('\n=== 分组插入后各数据行样式 ===');
  for(let r=3;r<=15;r++){
    const has=ws.getRow(r).eachCell(()=>{});
    console.log(`行${r}: ${rowStyleStr(ws,r)}`);
  }

  // 输出结果文件供用户查看
  const out = await wb.xlsx.writeBuffer();
  fs.writeFileSync('C:/Users/chongxuan-huang/Desktop/_周报测试结果.xlsx', out);
  console.log('\n结果文件已输出: 桌面/_周报测试结果.xlsx');
})().catch(e=>{ console.error('ERROR:', e.stack||e.message); });
