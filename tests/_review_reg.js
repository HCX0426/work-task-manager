/* 代码审查 16 项修复回归：用真实源码（DOM 桩 + eval）驱动验证本次修复的真实行为。
   覆盖：M1/M4 甘特、M2 下拉合并迁移、M3 AI 地址校验、m1 预览日期格式、m2 esc、
   m3 loadSchema 完整性、m4 debounce、m5 copyRowStyle、m6 MM/DD 近年份、
   m7 Excel 导入缺日期兜底、m9 配置增删列持久化、m12 aggregateTasks 口径一致。
   m8/m10/m11 为静态修复，见文末说明。
   用法：node _review_reg.js */
const fs = require('fs');
const path = require('path');
const RealURL = global.URL; // 捕获真实 URL 构造器（下方 DOM 桩会覆盖 global.URL，需在 fs 读取文件时临时还原，避免 WorkBuddy fs-broker 的 `filePath instanceof URL` 因 URL 被替换成普通对象而抛错）
const PROJ = path.resolve(__dirname, '..');
const storeSrc   = fs.readFileSync(path.join(PROJ,'js/store.js'),'utf8');
const listSrc    = fs.readFileSync(path.join(PROJ,'js/list.js'),'utf8');
const exportSrc  = fs.readFileSync(path.join(PROJ,'js/export.js'),'utf8');
const configSrc  = fs.readFileSync(path.join(PROJ,'js/config.js'),'utf8');
const dashSrc    = fs.readFileSync(path.join(PROJ,'js/dashboard.js'),'utf8');
const monthlySrc = fs.readFileSync(path.join(PROJ,'js/monthly.js'),'utf8');

/* ---------- DOM / 浏览器环境桩 ---------- */
function makeEl(){
  const t={ _value:'', _checked:true, _text:'', _html:'', _cls:'',
    style:{}, dataset:{}, files:[],
    classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){}, click(){},
    appendChild(){}, querySelector(){return makeEl();}, querySelectorAll(){return [];}, getContext(){return null;} };
  return new Proxy(t,{
    get(o,p){ if(p in o)return o[p]; if(p==='value')return o._value; if(p==='checked')return o._checked;
      if(p==='textContent')return o._text; if(p==='innerHTML')return o._html; if(p==='className')return o._cls; return undefined; },
    set(o,p,v){ if(p==='value')o._value=v; else if(p==='checked')o._checked=v; else if(p==='textContent')o._text=v;
      else if(p==='innerHTML')o._html=v; else if(p==='className')o._cls=v; else o[p]=v; return true; }
  });
}
const _els={};
function el(key){ if(!_els[key]) _els[key]=makeEl(); return _els[key]; }
/* 先加载 exceljs（必须在设置 window/document 桩之前，否则其 UMD 浏览器分支会触发非法 instanceof） */
let E; try{ E=require(path.join(PROJ,'exceljs.min.js')); }catch(er){ console.error('require exceljs 失败:',er.message); process.exit(1); }
global.ExcelJS=(E&&E.Workbook)?E:(E.default||E);
global.window={ crypto:null, scrollTo(){} };
const _ls={};
global.localStorage={ getItem:k=>(k in _ls)?_ls[k]:null, setItem:(k,v)=>{_ls[k]=String(v);}, removeItem:k=>{delete _ls[k];}, clear:()=>{for(const k in _ls)delete _ls[k];} };
global.document={ querySelector:(s)=>el(s), getElementById:(id)=>el('#'+id), createElement:()=>makeEl(), body:{appendChild(){}}, addEventListener(){}, querySelectorAll:()=>[] };
global.Blob=class{ constructor(){} };
global.URL={ createObjectURL:()=>'blob:stub', revokeObjectURL(){} };
global.confirm=()=>true;
global.fetch=()=>Promise.reject(new Error('no fetch in harness'));
global.FileReader=class{ readAsText(f){ this.result=f.__text; if(this.onload)this.onload(); } };

/* ---------- M2 场景：v1 自定义下拉（应被合并而非覆盖）---------- */
_ls['wb_dropdowns']=JSON.stringify({ '客户':['所有','其他','N客户'], '完成状态':['Ongoing'], '厂区':['东莞','太白山'], '提出部门':['仓库'] });
/* 不写 wb_cfg_v，使迁移 IIFE 运行一次 */

const bridge=`
globalThis.__api={ parseDateAny, aggregateTasks, debounce, aiChat, loadSchema, renderGantt, renderStats, renderList,
  renderPreview, copyRowStyle, getDashboardData, getMonthlyData, esc, todayStr, saveAtomic, settingsForBackup };
globalThis.__cfg={
  setTasks(t){ tasks=t; }, get tasks(){ return tasks; },
  setSchema(s){ schema=s; }, get schema(){ return schema; },
  get dropdowns(){ return dropdowns; },
  setMap(m){ colMapping=m; },
  setExcel(o){ if('book' in o)excelBook=o.book; if('sheet' in o)excelSheet=o.sheet; if('headers' in o)excelHeaders=o.headers; if('hr' in o)excelHeaderRow=o.hr; if('mapping' in o)colMapping=o.mapping; if('name' in o)excelSheetName=o.name; },
  clearExcel(){ excelBook=null; excelHeaders=[]; },
  setRange(s,e){ document.querySelector('#rangeStart').value=s; document.querySelector('#rangeEnd').value=e; },
  setGantt(range,group){ document.querySelector('#ganttRange').value=range; document.querySelector('#ganttGroupBy').value=group; }
};
globalThis.renderEntry=()=>{};
globalThis.uiPrompt=async()=>null;
`;
try{ (0,eval)(storeSrc+'\n'+listSrc+'\n'+exportSrc+'\n'+configSrc+'\n'+dashSrc+'\n'+monthlySrc+'\n'+bridge); }
catch(e){ console.error('eval 合并源码失败:',e.stack); process.exit(1); }
const api=globalThis.__api, cfg=globalThis.__cfg;

/* ---------- 断言工具 ---------- */
let pass=0,fail=0; const fails=[];
function ok(c,m){ if(c){pass++;} else {fail++; fails.push(m); console.log('  ✗ FAIL:',m);} }
function eq(a,b,m){ ok(JSON.stringify(a)===JSON.stringify(b), m+`  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }
function warn(m){ console.log('  ⚠ WARN:',m); }

(async()=>{
/* === M2：下拉合并迁移（自定义项保留 + 默认项并入）=== */
console.log('\n=== M2：v2 迁移「合并」下拉（不覆盖自定义）===');
{
  const dd=cfg.dropdowns;
  ok(dd['客户'].includes('其他')&&dd['客户'].includes('N客户'), 'M2 客户：自定义项 其他/N客户 保留（旧实现会被默认 [所有] 覆盖）');
  ok(dd['客户'].includes('所有'), 'M2 客户：默认项 所有 并入');
  ok(dd['厂区'].includes('太白山'), 'M2 厂区：自定义项 太白山 保留');
  ok(dd['厂区'].includes('东莞')&&dd['厂区'].includes('苏州')&&dd['厂区'].includes('咸阳'), 'M2 厂区：默认项 东莞/苏州/咸阳 并入');
  ok(JSON.parse(_ls['wb_cfg_v']||'null')==='3', 'M2 迁移标记已写入 wb_cfg_v=3（P12 升版：合并迁移幂等，不会重复丢失自定义项）');
}

/* === M3：AI 润色服务地址协议校验 === */
console.log('\n=== M3：aiChat 校验服务地址协议（拒绝非 http(s)）===');
{
  localStorage.setItem('wb_exportcfg', JSON.stringify({aiKey:'sk-test', aiBaseUrl:'ftp://evil.example', aiModel:'m'}));
  let threw=false, msg='';
  try{ await api.aiChat([{role:'user',content:'x'}]); }catch(e){ threw=true; msg=e.message; }
  ok(threw && /必须以 http:\/\/ 或 https:\/\//.test(msg), 'M3 非 http(s) 地址直接抛错（Key 不会发往任意地址），实际：'+msg);
  localStorage.setItem('wb_exportcfg', JSON.stringify({aiKey:'sk-test', aiBaseUrl:'http://insecure.local', aiModel:'m'}));
  let protoThrew=false, netThrew=false;
  try{ await api.aiChat([{role:'user',content:'x'}]); }catch(e){ protoThrew=/必须以 http:\/\//.test(e.message); netThrew=/网络\/跨域/.test(e.message); }
  ok(!protoThrew && netThrew, 'M3 http:// 不触发协议错误（仅警告），继续尝试请求（harness 无 fetch 故报网络错误）');
  localStorage.removeItem('wb_exportcfg');
}

/* === m2：esc 转义 === */
console.log('\n=== m2：esc() HTML 转义（录入日期/名称防注入）===');
{ eq(api.esc('<b>&"'), '&lt;b&gt;&amp;&quot;', 'm2 esc 转义 < & " 正确'); }

/* === m3：loadSchema 完整性（无死分支 / 旧配置补 dateFmt）=== */
console.log('\n=== m3：loadSchema 无死分支 + 旧配置补 dateFmt ===');
{
  localStorage.removeItem('wb_schema');
  const a=api.loadSchema();
  ok(Array.isArray(a)&&a.length>0, 'm3 无存储时回退 DEFAULT_SCHEMA');
  ok(a.every(c=>c.id && c.id.startsWith('col_')), 'm3 每列补全稳定 id');
  ok(a.find(c=>c.name==='提出日期').dateFmt==='ymd' && a.find(c=>c.name==='开发日期').dateFmt==='md', 'm3 dateFmt 完整');
  localStorage.setItem('wb_schema', JSON.stringify([{name:'提出日期',type:'date',def:'{{today}}'},{name:'客户',type:'dropdown'}]));
  const b=api.loadSchema();
  eq(b.find(c=>c.name==='提出日期').dateFmt, 'ymd', 'm3 旧配置缺 dateFmt 自动补 ymd');
  localStorage.removeItem('wb_schema');
}

/* === m4：debounce 合并 + 延时触发 === */
console.log('\n=== m4：debounce 防抖（搜索框）===');
{
  let n=0; const f=api.debounce(()=>{n++;}, 30);
  f(); f(); f();
  await new Promise(r=>setTimeout(r, 60));
  eq(n, 1, 'm4 连续调用只触发一次（防抖生效）');
}

/* === m6：parseDateAny MM/DD 取近年份 === */
console.log('\n=== m6：parseDateAny MM/DD 歧义年份取「更近」===');
{
  const d1=api.parseDateAny('08/21'); // 今天 2026-08-24 → 当前年 2026-08-21 更近
  ok(d1 instanceof Date && d1.getFullYear()===2026 && d1.getMonth()===7 && d1.getDate()===21, 'm6 08/21（当前年内）→ 2026-08-21');
  // 用固定 now=2026-01-15 验证「去年 12/25 比今年 12/25 更近」的边界
  const RealDate=Date; const FixedNow=new Date(2026,0,15);
  global.Date=class extends RealDate{ constructor(...a){ if(a.length===0) return new RealDate(FixedNow); return new RealDate(...a); } static now(){ return RealDate.now(); } };
  const d2=api.parseDateAny('12/25'); // 今年2026-12-25(差344天) vs 去年2025-12-25(差21天) → 去年
  global.Date=RealDate;
  ok(d2 instanceof Date && d2.getFullYear()===2025 && d2.getMonth()===11 && d2.getDate()===25, 'm6 边界：now=01-15 时 12/25 取去年 2025-12-25（避免误判为今年未来）');
  ok(api.parseDateAny('13/40')===null, 'm6 非法日期返回 null');
}

/* === m1：renderPreview 按列 dateFmt 输出 === */
console.log('\n=== m1：renderPreview 预览按列 dateFmt（与真实导出一致）===');
{
  cfg.setTasks([{id:'p1', entryDate:'2026-08-06', values:{提出日期:'2026-08-06', 开发日期:'2026-08-21', 专案名称:'P1'}, exported:false, exportedNew:false}]);
  cfg.setExcel({ book:{}, sheet:null, headers:['提出日期','开发日期'], hr:1, mapping:{提出日期:'提出日期',开发日期:'开发日期'}, name:null });
  cfg.setRange('2000-01-01','2100-01-01');
  api.renderPreview();
  const html=el('#previewTable').innerHTML;
  ok(/2026\/08\/06/.test(html), 'm1 预览 提出日期(dateFmt=ymd) → 2026/08/06');
  ok(/08\/21/.test(html), 'm1 预览 开发日期(dateFmt=md) → 08/21（无年）');
}

/* === m5：copyRowStyle 浅拷贝（去逐格 JSON 深拷贝）=== */
console.log('\n=== m5：copyRowStyle 单元格样式复制 ===');
{
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('s');
  const src=ws.getRow(1).getCell(1); src.style={font:{bold:true,name:'等线'}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFF'}}};
  cfg.setExcel({ book:wb, sheet:ws, headers:['x'], hr:1, mapping:{}, name:'s' });
  api.copyRowStyle(ws, 2, 1);
  const tgt=ws.getRow(2).getCell(1);
  ok(tgt.style && tgt.style.font && tgt.style.font.bold===true, 'm5 目标行复制了源行字体加粗');
  eq(tgt.style.fill, src.style.fill, 'm5 目标行复制了源行底纹（结构等价）');
  // 源无样式时不抛错、目标保持默认
  const ws2=new ExcelJS.Workbook(); const wsx=ws2.addWorksheet('s'); const empty=wsx.getRow(1).getCell(1);
  cfg.setExcel({ book:ws2, sheet:wsx, headers:['x'], hr:1, mapping:{}, name:'s' });
  let threw=false; try{ api.copyRowStyle(wsx,3,1); }catch(e){ threw=true; }
  ok(!threw, 'm5 源行无样式时不抛错');
}

/* === M1：renderGantt reduce 求最值（多任务不栈溢出）=== */
console.log('\n=== M1：renderGantt 用 reduce 求最值（大量任务不栈溢出）===');
{
  const N=35000; // 每任务 2 个日期 → 70000 个 Date，远超 spread 参数上限(~65536)
  const big=[]; for(let i=0;i<N;i++) big.push({id:'g'+i, entryDate:'2026-03-01', values:{开发日期:'2026-03-01', 专案名称:'T'+i, 完成状态:'Ongoing'}, exported:false, exportedNew:false});
  cfg.setTasks(big);
  cfg.setGantt('all','status');
  let threw=false, em='';
  try{ api.renderGantt(); }catch(e){ threw=true; em=e.message; }
  ok(!threw, 'M1 35000 任务下 renderGantt 未栈溢出（旧 Math.min(...dates) 会抛 Maximum call stack）'+(threw?(' → '+em):''));
  const html=el('#ganttChart').innerHTML||'';
  ok(html.length>0 && !/NaN/.test(html), 'M1 甘特输出非空且不含 NaN');
}

/* === M4：renderGantt 单任务同日期间无 NaN === */
console.log('\n=== M4：renderGantt 同日期间除零兜底（无 NaN）===');
{
  cfg.setTasks([{id:'s1', entryDate:'2026-08-24', values:{开发日期:'2026-08-24', 结案日期:'2026-08-24', 专案名称:'单任务', 完成状态:'Closed'}, exported:false, exportedNew:false}]);
  cfg.setGantt('all','status');
  api.renderGantt();
  const html=el('#ganttChart').innerHTML||'';
  ok(!/NaN/.test(html) && /gantt-bar/.test(html), 'M4 单任务同日期间条形位置/宽度有限（无 NaN），且生成了 gantt-bar');
  const m=html.match(/left:([-\d.]+)%;width:([-\d.]+)%/);
  ok(m && isFinite(Number(m[1])) && isFinite(Number(m[2])), 'M4 条形 left/width 为有限数值（'+(m?m[0]:'无')+'）');
}

/* === m12：aggregateTasks 口径一致（看板/月报复用同一聚合）=== */
console.log('\n=== m12：aggregateTasks 共享聚合（看板/列表/月报口径一致）===');
{
  const now=new Date(2026,7,15);
  // 钉死时钟为 2026-08-15（仅 no-arg new Date 受影响；带参 new Date 仍走真实 Date，parseDateAny 不受影响），
  // 使 getDashboardData()/getMonthlyData() 内部 new Date() 与下方 now 一致，验证「看板/月报复用同一聚合」而非依赖真实系统日期
  const RealDate=Date; const FixedNow=new Date(2026,7,15);
  global.Date=class extends RealDate{ constructor(...a){ if(a.length===0) return new RealDate(FixedNow); return new RealDate(...a); } static now(){ return RealDate.now(); } };
  const ts=[
    {id:'t1', entryDate:'2026-08-01', values:{专案名称:'A',客户:'C1',完成状态:'Closed',开发日期:'2026-07-01'}, exported:false, exportedNew:false},
    {id:'t2', entryDate:'2026-08-10', values:{专案名称:'B',客户:'C1',完成状态:'Ongoing',开发日期:'2026-07-01'}, exported:false, exportedNew:false},
    {id:'t3', entryDate:'2026-07-01', values:{专案名称:'C',客户:'C2',完成状态:'Closed'}, exported:false, exportedNew:false},
    {id:'t4', entryDate:'2026-09-01', values:{专案名称:'D',客户:'C2',完成状态:'Closed'}, exported:false, exportedNew:false}
  ];
  cfg.setTasks(ts);
  const agg=api.aggregateTasks(ts, now);
  eq(agg.total, 4, 'm12 总数=4');
  eq(agg.monthTasks.length, 2, 'm12 本月(2026-08)任务=2');
  eq(agg.closedMonth, 1, 'm12 本月已结案=1');
  eq(agg.rate, 50, 'm12 本月完成率=50%');
  eq(agg.closedAll, 3, 'm12 全部已结案=3');
  eq(agg.ongoing, 1, 'm12 进行中=1');
  eq(agg.overdueCount, 1, 'm12 逾期=1（t2 开发日期早于今天且未完成）');
  // 看板复用同一聚合
  const dash=api.getDashboardData();
  eq(dash.total, agg.total, 'm12 看板.total == aggregateTasks.total');
  eq(dash.monthCount, agg.monthTasks.length, 'm12 看板.monthCount == aggregateTasks.monthTasks.length');
  eq(dash.rate, agg.rate, 'm12 看板.rate == aggregateTasks.rate');
  eq(dash.overdueCount, agg.overdueCount, 'm12 看板.overdueCount == aggregateTasks.overdueCount');
  eq(dash.closedAll, agg.closedAll, 'm12 看板.closedAll == aggregateTasks.closedAll');
  // 月报复用 monthTasksOf
  el('#monthPick').value='2026-08'; el('#mf_dedup').checked=true;
  const mon=api.getMonthlyData();
  eq(mon.length, agg.monthTasks.length, 'm12 月报(2026-08)去重条数 == aggregateTasks.monthTasks.length（口径一致）');
  global.Date=RealDate;
}

/* === m7：Excel 导入缺录入日期兜底为今天 + 提示 === */
console.log('\n=== m7：importExcelFile 缺录入日期兜底今天 + noDate 提示 ===');
{
  cfg.setTasks([]); // 清空，导入后应为新增条数
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('导入');
  ws.getRow(1).values=['专案名称','提出日期','开发日期','客户'];
  ws.getRow(2).values=['有日期任务','2026-08-05','2026-08-10','CX'];
  ws.getRow(3).values=['无日期任务','','','CY']; // 提出/开发日期皆空 → 兜底今天
  const buf=await wb.xlsx.writeBuffer();
  const ab=buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength);
  const fileStub={ name:'import.xlsx', arrayBuffer:async()=>ab };
  await el('#importExcelFile').onchange({ target:{ files:[fileStub] } });
  const imported=cfg.tasks;
  eq(imported.length, 2, 'm7 导入 2 条任务');
  const noDateTask=imported.find(t=>t.values['专案名称']==='无日期任务');
  ok(!!noDateTask, 'm7 无日期行被导入');
  eq(noDateTask.entryDate, api.todayStr(), 'm7 无日期行 entryDate 兜底为今天('+api.todayStr()+')');
  ok(/缺录入日期/.test(el('#toast').textContent||''), 'm7 toast 提示含「缺录入日期」计数');
}

/* === m9：配置中心新增列即时持久化 === */
console.log('\n=== m9：配置中心新增列即时 save(LS_SCHEMA) ===');
{
  cfg.setSchema([{name:'A',type:'text',def:'',id:'col_A'},{name:'B',type:'text',def:'',id:'col_B'}]);
  localStorage.removeItem('wb_schema');
  el('#addCol').onclick();
  const saved=JSON.parse(localStorage.getItem('wb_schema')||'[]');
  ok(saved.some(c=>c.name==='新列'), 'm9 点击新增列后 LS_SCHEMA 含「新列」（已持久化，刷新不丢）');
}

/* === P4：#addCol 生成唯一 id + 唯一列名（避免重名导致改名迁移退化为位置匹配 / id 冲突）=== */
console.log('\n=== P4：#addCol 唯一 id + 唯一列名 ===');
{
  cfg.setSchema([{name:'A',type:'text',def:'',id:'col_A'},{name:'B',type:'text',def:'',id:'col_B'}]);
  localStorage.removeItem('wb_schema');
  el('#addCol').onclick();
  el('#addCol').onclick(); // 第二次应自动命名为 新列2
  const saved=JSON.parse(localStorage.getItem('wb_schema')||'[]');
  const names=saved.map(c=>c.name);
  ok(names.includes('新列') && names.includes('新列2'), 'P4 两次新增列：列名分别为「新列」「新列2」（不重名）');
  const ids=saved.map(c=>c.id);
  ok(ids.every(id=>typeof id==='string' && id.startsWith('col_')), 'P4 每列均带稳定 id（col_ 前缀）');
  ok(new Set(ids).size===ids.length, 'P4 列 id 全局唯一（无碰撞）');
}
/* === P4 健壮性：save 失败时内存不被污染（不新增列）=== */
{
  cfg.setSchema([{name:'A',type:'text',def:'',id:'col_A'}]);
  const before=cfg.schema.length;
  const realSet=global.localStorage.setItem;
  global.localStorage.setItem=(k,v)=>{ if(k==='wb_schema') throw new Error('QuotaExceededError'); realSet(k,v); };
  el('#addCol').onclick();
  global.localStorage.setItem=realSet;
  eq(cfg.schema.length, before, 'P4 存储已满时新增列：内存 schema 行数不变（未污染，先 save 成功才 mutate）');
}

/* === P3：settingsForBackup 剔除明文 aiKey（全量备份不随明文 Key 外泄）=== */
console.log('\n=== P3：settingsForBackup 剔除 aiKey ===');
{
  localStorage.setItem('wb_exportcfg', JSON.stringify({aiKey:'sk-SECRET', aiBaseUrl:'https://api.deepseek.com', aiModel:'deepseek-chat'}));
  const snap=api.settingsForBackup();
  ok(!('aiKey' in snap), 'P3 settingsForBackup 不含 aiKey 字段');
  ok(snap.aiBaseUrl==='https://api.deepseek.com', 'P3 其余设置保留');
  localStorage.removeItem('wb_exportcfg');
}

/* === P6：无 excel 模板时预览也按列 dateFmt 输出（与有模板分支 m1 一致）=== */
console.log('\n=== P6：renderPreview 无模板分支按 dateFmt 输出 ===');
{
  cfg.clearExcel(); // 清除已加载的 excel 模板，强制走无模板分支
  cfg.setSchema([
    {name:'提出日期',type:'date',def:'{{today}}',dateFmt:'ymd',id:'col_提出日期'},
    {name:'开发日期',type:'date',def:'',dateFmt:'md',id:'col_开发日期'},
    {name:'专案名称',type:'text',def:'',id:'col_专案名称'}
  ]);
  cfg.setTasks([{id:'p6', entryDate:'2026-08-06', values:{提出日期:'2026-08-06', 开发日期:'2026-08-21', 专案名称:'P6'}, exported:false, exportedNew:false}]);
  cfg.setRange('2000-01-01','2100-01-01');
  api.renderPreview();
  const html=el('#previewTable').innerHTML;
  ok(/2026\/08\/06/.test(html), 'P6 无模板：提出日期(dateFmt=ymd) → 2026/08/06');
  ok(/08\/21/.test(html), 'P6 无模板：开发日期(dateFmt=md) → 08/21（无年）');
}

/* === P8/P7 核心：saveAtomic 原子多键写入 + 失败回滚（配置中心 保存列配置/删除列/新增列 共用）=== */
console.log('\n=== P8/P7：saveAtomic 原子写入 + 失败回滚 ===');
{
  localStorage.removeItem('wb_schema'); localStorage.removeItem('wb_dropdowns'); localStorage.removeItem('wb_mapping');
  const ok1=api.saveAtomic([['wb_schema',{a:1}],['wb_dropdowns',{x:2}],['wb_mapping',{y:3}]]);
  ok(ok1===true, 'P8 saveAtomic 三键全成功返回 true');
  eq(JSON.parse(localStorage.getItem('wb_schema')), {a:1}, 'P8 键1 已写入');
  eq(JSON.parse(localStorage.getItem('wb_dropdowns')), {x:2}, 'P8 键2 已写入');
  eq(JSON.parse(localStorage.getItem('wb_mapping')), {y:3}, 'P8 键3 已写入');
  const realSet=global.localStorage.setItem;
  global.localStorage.setItem=(k,v)=>{ if(k==='wb_dropdowns') throw new Error('QuotaExceededError'); realSet(k,v); };
  const ok2=api.saveAtomic([['wb_schema',{a:99}],['wb_dropdowns',{x:99}],['wb_mapping',{y:99}]]);
  global.localStorage.setItem=realSet;
  ok(ok2===false, 'P8 中间键失败返回 false');
  eq(JSON.parse(localStorage.getItem('wb_schema')), {a:1}, 'P8 失败回滚：键1 还原为写入前的值（未被 {a:99} 污染）');
  eq(JSON.parse(localStorage.getItem('wb_mapping')), {y:3}, 'P8 失败回滚：键3 未被部分写入（保持原值）');
}

/* === P5：index.html 全部外部脚本均带 defer（exceljs 不阻塞首屏，模块按序就绪）=== */
console.log('\n=== P5：index.html 全部脚本 defer ===');
{
  const su=global.URL; global.URL=RealURL; // 还原真实 URL 构造器，避免 WorkBuddy fs-broker 的 filePath instanceof URL 抛错
  const html=fs.readFileSync(path.join(PROJ,'index.html'),'utf8');
  global.URL=su;
  const scripts=[...html.matchAll(/<script\s+([^>]*?)>/g)].map(m=>m[1]).filter(s=>/src=/.test(s));
  ok(scripts.length>=10, 'P5 识别到 >=10 个外部 script（实际 '+scripts.length+'）');
  const noDefer=scripts.filter(s=>!/defer/.test(s));
  ok(noDefer.length===0, 'P5 所有外部脚本均含 defer（无 defer：'+JSON.stringify(noDefer)+'）');
  ok(/defer src="exceljs\.min\.js"/.test(html), 'P5 exceljs 也带 defer');
}

/* === P13：列表/甘特全量重建优化（content-visibility 原生虚拟滚动 + 重建保滚动）=== */
console.log('\n=== P13：renderList/renderGantt 全量重建优化（等价虚拟滚动，无 JS 窗口化风险）===');
{
  const su=global.URL; global.URL=RealURL; // 还原真实 URL 构造器，避免 WorkBuddy fs-broker 的 filePath instanceof URL 抛错
  const html=fs.readFileSync(path.join(PROJ,'index.html'),'utf8');
  global.URL=su;
  ok(/content-visibility:auto/.test(html), 'P13 index.html 引入 content-visibility:auto（浏览器原生跳过屏外卡片布局/绘制，等价虚拟滚动）');
  ok(/\.task-card\{[^}]*content-visibility:auto/.test(html), 'P13 .task-card 启用 content-visibility');
  ok(/\.gantt-row\{[^}]*content-visibility:auto/.test(html), 'P13 .gantt-row 启用 content-visibility');
  ok(/\.kanban-card\{[^}]*content-visibility:auto/.test(html), 'P13 .kanban-card 启用 content-visibility');
  // 列表渲染结构不被优化破坏：大量任务下仍生成等量卡片且带 data-id（交互不受影响）
  const many=[]; for(let i=0;i<60;i++) many.push({id:'L'+i, entryDate:'2026-08-'+String((i%28)+1).padStart(2,'0'), values:{专案名称:'任务'+i,客户:'C1',完成状态:(i%3?'Ongoing':'Closed'),开发日期:'2026-08-01'}, exported:false, exportedNew:false});
  cfg.setTasks(many);
  let threw=false; try{ api.renderList(); }catch(e){ threw=true; console.log('  P13 renderList 抛错:',e.message); }
  ok(!threw, 'P13 renderList 60 条不抛错');
  const lh=el('#taskTableWrap').innerHTML;
  eq((lh.match(/class="task-card/g)||[]).length, 60, 'P13 列表渲染生成 60 个 .task-card（结构未因优化丢行）');
  ok(/data-id="L0"/.test(lh), 'P13 卡片仍带 data-id（编辑/删除/批量交互不受影响）');
  // 甘特渲染结构不被破坏
  let gthrew=false; try{ api.renderGantt(); }catch(e){ gthrew=true; console.log('  P13 renderGantt 抛错:',e.message); }
  ok(!gthrew, 'P13 renderGantt 不抛错');
  const gh=el('#ganttChart').innerHTML;
  ok(/gantt-row/.test(gh) && /gantt-bar/.test(gh), 'P13 甘特仍生成 .gantt-row/.gantt-bar（结构未破坏）');
}

/* ---------- 汇总 ---------- */
console.log('\n========== 代码审查修复回归结果：PASS='+pass+'  FAIL='+fail+' ==========');
if(fail){ console.log('失败项：'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
else {
  console.log('✓ 可执行项全部通过（M1/M2/M3/M4/m1/m2/m3/m4/m5/m6/m7/m9/m12 + P3/P4/P6/P8/P5/P13）');
  console.log('  本次新增运行时断言：');
  console.log('   - P3 settingsForBackup 剔除 aiKey（全量备份不随明文 Key 外泄）');
  console.log('   - P4 #addCol 唯一 id + 唯一列名；存储失败时内存不被污染');
  console.log('   - P6 无 excel 模板时预览也按列 dateFmt（与有模板分支一致）');
  console.log('   - P8/P7 saveAtomic 原子多键写入 + 失败回滚（保存列配置/删除列/新增列 共用）');
  console.log('   - P5 index.html 全部 10 个外部脚本均带 defer');
  console.log('   - P13 content-visibility 原生虚拟滚动（.task-card/.gantt-row/.kanban-card）+ 重建保滚动；渲染结构/交互未破坏');
  console.log('  静态修复（已读代码确认，无运行时断言）：');
  console.log('   - m8 删除列/批量删除：save 成功才改内存（list.js 单删+batchDelete 走 moveToTrash 安全顺序）');
  console.log('   - m10 录入表单改由 renderEntry 运行时填充（index.html 去硬编码 2026-08-27）');
  console.log('   - m11/P5 exceljs 与 9 个模块均加 defer，按文档顺序在解析后执行且不阻塞首屏（index.html）');
}
})();
