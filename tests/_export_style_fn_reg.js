/* 导出文件名 + 导出样式 回归：用 DOM 桩 + ExcelJS 加载 store.js+export.js，验证：
   1) toArgb / fmtFileDate / buildFileName（文件名 前缀+日期格式）
   2) statusBgFill（状态背景色映射）
   3) styleCell（字体/字号仅配置时设置）
   4) buildNewWorkbook 集成：表头背景、状态列背景、字体字号 实际应用
   用法：node _export_style_fn_reg.js */
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');
const storeSrc = fs.readFileSync(path.join(PROJ, 'js/store.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(PROJ, 'js/export.js'), 'utf8');

/* ---------- DOM / 浏览器环境桩 ---------- */
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
  toArgb, fmtFileDate, buildFileName, statusBgFill, styleCell, buildNewWorkbook, loadSettings, schema,
  setSettings(s){ const k='wb_exportcfg'; if(s) localStorage.setItem(k, JSON.stringify(s)); else localStorage.removeItem(k); },
  setRangeTasks(t){ getRangeTasks=()=>t; }
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

(async()=>{
/* ---------- 场景 1：toArgb 颜色规整 ---------- */
console.log('\n=== 场景 1：toArgb ----------');
eq(api.toArgb('#C6EFCE'), 'FFC6EFCE', '#RRGGBB → FF+大写');
eq(api.toArgb('C6EFCE'),   'FFC6EFCE', '无#前缀也识别');
eq(api.toArgb('#abc'),     'FFAABBCC', '#RGB 展开为 RRGGBB');
eq(api.toArgb('xyz'),      null, '非法 → null（不设置）');
eq(api.toArgb(''),         null, '空 → null');

/* ---------- 场景 2：fmtFileDate 日期格式 ---------- */
console.log('\n=== 场景 2：fmtFileDate 文件名日期格式 ----------');
api.setSettings({exportFileDateFormat:'YYYYMMDD'});
eq(api.fmtFileDate('2026-08-24'), '20260824', 'YYYYMMDD');
api.setSettings({exportFileDateFormat:'YYYY-MM-DD'});
eq(api.fmtFileDate('2026-08-24'), '2026-08-24', 'YYYY-MM-DD');
api.setSettings({exportFileDateFormat:'YYYY/MM/DD'});
eq(api.fmtFileDate('2026-08-24'), '2026/08/24', 'YYYY/MM/DD');
api.setSettings({exportFileDateFormat:'MMDD'});
eq(api.fmtFileDate('2026-08-24'), '0824', 'MMDD');

/* ---------- 场景 3：buildFileName 前缀+范围 ---------- */
console.log('\n=== 场景 3：buildFileName 前缀+日期范围 ===');
api.setSettings({exportFilePrefix:'DG周报', exportFileDateFormat:'YYYYMMDD'});
eq(api.buildFileName('2026-08-24','2026-08-28'), 'DG周报20260824-20260828', '前缀+起止（匹配用户示例）');
api.setSettings({exportFilePrefix:'', exportFileDateFormat:'YYYYMMDD'});
eq(api.buildFileName('2026-08-24','2026-08-28'), '20260824-20260828', '无前缀仅日期范围');
eq(api.buildFileName('2026-08-24',''), '20260824', '仅起始日期');

/* ---------- 场景 4：statusBgFill 状态背景映射 ---------- */
console.log('\n=== 场景 4：statusBgFill 状态背景映射 ===');
api.setSettings({exportStatusBg:{'Closed':'#C6EFCE','Ongoing':'#FFEB9C'}});
eq(api.statusBgFill('Closed'),  {type:'pattern',pattern:'solid',fgColor:{argb:'FFC6EFCE'}}, 'Closed → #C6EFCE');
eq(api.statusBgFill('Ongoing'), {type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEB9C'}}, 'Ongoing → #FFEB9C');
eq(api.statusBgFill('Planning'), null, '未配置状态 → null（不染色）');
api.setSettings({exportStatusBg:{}});
eq(api.statusBgFill('Closed'), null, '空映射 → null（默认不染色）');

/* ---------- 场景 5：styleCell 仅配置时设置字体/字号 ---------- */
console.log('\n=== 场景 5：styleCell 字体/字号 ----------');
api.setSettings({exportFontName:'等线', exportFontSize:'11'});
{ const cell={}; api.styleCell(cell,false); eq(cell.font, {name:'等线',size:11}, '配置后字体/字号生效'); ok(!!cell.alignment, 'alignment 始终设置'); }
api.setSettings({exportFontName:'', exportFontSize:''});
{ const cell={}; api.styleCell(cell,false); ok(cell.font===undefined, '无配置 → 不设置字体（沿用默认/模板）'); ok(!!cell.alignment, 'alignment 仍设置'); }

/* ---------- 场景 6：buildNewWorkbook 集成（表头/状态背景/字体实际写入） ---------- */
console.log('\n=== 场景 6：buildNewWorkbook 样式集成 ===');
{
  api.setSettings({exportHeaderBg:'#D9E1F2', exportStatusBg:{'Closed':'#C6EFCE'}, exportFontName:'等线', exportFontSize:'11'});
  const tasks=[{ id:'x1', entryDate:'2026-08-20', values:{ '项次':0,'厂区':'东莞','提出日期':'2026-08-15','提出部门':'仓库','客户':'A','专案名称':'P1','需求说明':'','负责人':'黄','开发进度':'开发中','完成状态':'Closed','开发日期':'2026-08-18','测试日期':'','开发天数':'1天','结案日期':'2026-08-20','备注':'' }, exported:false, exportedNew:false }];
  api.setRangeTasks(tasks);
  const res = await api.buildNewWorkbook();
  ok(res && res.wb, 'buildNewWorkbook 应返回 {wb,t}');
  const ws = res.wb.getWorksheet(1);
  const hdrFill = ws.getRow(1).getCell(1).fill;
  ok(hdrFill && hdrFill.pattern && hdrFill.fgColor && hdrFill.fgColor.argb==='FFD9E1F2', '表头背景色写入（FFD9E1F2）');
  const sc = api.schema.findIndex(c=>c.name==='完成状态');
  ok(sc>=0, 'schema 含 完成状态 列');
  const stFill = ws.getRow(2).getCell(sc+1).fill;
  ok(stFill && stFill.pattern && stFill.fgColor && stFill.fgColor.argb==='FFC6EFCE', '状态列(Closed)背景色写入（FFC6EFCE）');
  const font = ws.getRow(2).getCell(1).font;
  ok(font && font.name==='等线' && font.size===11, '数据行字体/字号写入（等线/11）');
  // 默认不设置情形：清空配置后重建应无强制样式
  api.setSettings({exportHeaderBg:'', exportStatusBg:{}, exportFontName:'', exportFontSize:''});
  const res2 = await api.buildNewWorkbook();
  const ws2 = res2.wb.getWorksheet(1);
  ok(!ws2.getRow(1).getCell(1).fill, '清空表头背景配置 → 重建无表头填充');
  const stFill2 = ws2.getRow(2).getCell(sc+1).fill;
  ok(stFill2===undefined || !stFill2, '清空状态背景配置 → 状态列无填充');
}

/* ---------- 汇总 ---------- */
console.log(`\n========== 导出文件名/样式回归：PASS=${pass}  FAIL=${fail} ==========`);
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else console.log('导出文件名（前缀+日期格式）与导出样式（字体/字号/表头背景/状态背景）全部通过 ✓');
})();
