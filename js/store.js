/* ============ 存储与全局状态（store.js） ============ */
/* ------------------------------------------------------------------
   一、常量区（全项目唯一定义处）
   原则：任何「会被多处引用 / 未来可能调整」的字面量都具名收在此处，
        其余文件只允许引用常量，不允许再各自写字面量。
   ------------------------------------------------------------------ */

/* ---- localStorage 键：新增键必须加进这里并纳入 LS_ALL，避免散落各文件后漂移 ---- */
const LS_SCHEMA='wb_schema', LS_DROPDOWNS='wb_dropdowns', LS_TASKS='wb_tasks', LS_TRASH='wb_trash',
      LS_LASTBACKUP='wb_lastbackup', LS_MAPPING='wb_mapping', LS_EXPORTCFG='wb_exportcfg', LS_COL_TMPL='wb_col_templates',
      LS_DRAFT='wb_draft', LS_THEME='wb_theme', LS_CFG_V='wb_cfg_v';
/* 业务存储键全集（供「存储用量统计」等遍历场景使用，别处不再抄列表） */
const LS_ALL=[LS_SCHEMA,LS_DROPDOWNS,LS_TASKS,LS_TRASH,LS_LASTBACKUP,LS_MAPPING,LS_EXPORTCFG,LS_COL_TMPL,LS_DRAFT];
/* 损坏数据备份键前缀：JSON 解析失败时把原始串另存到此键，留待人工抢救 */
const LS_CORRUPT_PREFIX='wb_corrupt_';

/* ---- 时间 / 延时 / 阈值 ---- */
const MS_PER_DAY=86400000;            // 一天的毫秒数
const GANTT_DAY_WIDTH=14;             // 甘特图每天像素宽度（布局单一事实来源）
/* 甘特「最近60/90天」固定档偏移对（天）：back=向前回看、fwd=向后预估；与 index.html 下拉文案对应 */
const GANTT_RANGE={'60':{back:15,fwd:45},'90':{back:30,fwd:60}};
const GANTT_EDGE_PAD_DAYS=3;          // 甘特两端各外扩天数，保证首尾条不贴边
const GANTT_ONGOING_EST_DAYS=7;       // 未完成任务甘特条向后的预估天数
const TOAST_MS=2200;                  // toast 显示时长
const BACKUP_REMIND_DAYS=7;           // 距上次备份超过该天数则提醒
const BACKUP_REMIND_DELAY_MS=600;     // 备份提醒 toast 的延迟（避开首屏渲染）
const DRAFT_DEBOUNCE_MS=800;          // 录入页草稿自动保存防抖
const LIST_SEARCH_DEBOUNCE_MS=200;    // 列表搜索防抖
const PRINT_DELAY_MS=350;             // 打印窗口打开后等待内容渲染的时间
const BOOT_TOAST_DELAY_MS=1500;       // 首屏「今日待办」提示延迟

/* ---- 安全 / 网络 ---- */
const PBKDF2_ITERATIONS=150000;       // 加密备份口令派生迭代次数（安全参数，调整前需评估）
const AI_TIMEOUT_MS=20000;            // AI 请求超时（毫秒）
const AI_RETRY=1;                     // AI 请求重试次数（不含首次；4xx 不重试）
const ERR_BODY_MAX=200;               // 接口错误响应体回显的最大字符数
const AI_DEF_BASE_URL='https://api.deepseek.com'; // AI 润色默认服务地址（BYOK，用户可改）
const AI_DEF_MODEL='deepseek-chat';   // AI 润色默认模型
const AI_CHAT_PATH='/chat/completions'; // OpenAI 兼容接口的聊天补全路径
let _httpWarnShown=false;             // http 明文服务地址的 UI 一次性告警标记

/* ---- 文件 / Excel ---- */
const MAX_UPLOAD_BYTES=20*1024*1024;  // 上传 .xlsx 大小上限，防止超大文件解析时长时间阻塞主线程
const MAX_UPLOAD_MB=Math.round(MAX_UPLOAD_BYTES/1048576);
const MIN_HEADER_CELLS=3;             // 判定「表头行」所需的最少非空单元格数
const BYTES_PER_MB=1048576;           // 1MB 字节数
const ASSUMED_QUOTA_MB=5;             // 浏览器 localStorage 典型配额（非规范保证值，仅用于估算占比）

/* ---- 展示上限 ---- */
const HISTORY_SHOW_MAX=15;            // 任务卡片历史记录展示条数上限
const TODAY_PANEL_MAX=12;             // 今日待办 / 逾期面板各区块展示条数上限
const WEEK_PANEL_MAX=15;              // 「本周已录」面板展示条数上限
const HEALTH_SHOW_MAX=8;              // 数据看板「健康检查」展示条数上限
const CAL_CELL_MAX=4;                 // 日历单元格内任务展示条数上限（非本月为 3）
const CAL_CELL_MAX_OTHER=3;
const CAL_GRID_CELLS=42;              // 日历固定 6 行 × 7 列

/* ---- 列定义默认值 / 取值域 ---- */
const DEF_TODAY='{{today}}';          // 日期列「默认今天」哨兵
const DEFAULT_HEADER_BG='#D9E1F2';    // 导出表头默认背景色（配置中心未设时的兜底）
const DEFAULT_STATUS_BG='#C6EFCE';    // 状态背景色映射未设时的默认兜底
const DATE_FMT_YMD='ymd', DATE_FMT_MD='md'; // 列日期导出格式
const COL_TYPES=['text','dropdown','date','textarea','auto']; // 列类型合法值（配置中心/导入校验/guessType 共用）
const COL_TYPE_TEXT='text', COL_TYPE_DROPDOWN='dropdown', COL_TYPE_DATE='date', COL_TYPE_TEXTAREA='textarea', COL_TYPE_AUTO='auto';
/* 导出/筛选的「日期依据」取值域：统一为列名口径。
   「录入日期」是任务字段 entryDate 而非 schema 列，单独列出以保证两个下拉值域一致；
   旧配置残留的 'entryDate' 在读取时归一为 ENTRY，避免值域混用导致排序键取空。 */
const DATE_BY={ ENTRY:'录入日期', RAISE:'提出日期', DEV:'开发日期' };
const DATE_BY_ALIAS={ entryDate:DATE_BY.ENTRY };
/* 列表排序依据取值域（与导出排序是两套独立配置，故单独成常量，避免与 DATE_BY 混淆） */
const LIST_SORT_BY={ ENTRY:'date', STATUS:'status', CUST:'cust', DEV_DATE:'devDate' };
const SORT_ASC='asc', SORT_DESC='desc';

/* ---- 列名常量：全项目唯一定义处，改名只改这里 ----
   任务 values 的 key、schema[].name、dropdowns 的 key、导出映射目标列，全部以列名字符串为准。
   此前这些字符串散落 9 个文件 200+ 处，改名极易漏改，故统一收敛。 */
const COL={
  SEQ:'项次',          // 自动续号（type:auto，不参与编辑/导出映射）
  SITE:'厂区',
  RAISE_DATE:'提出日期',
  RAISE_DEPT:'提出部门',
  CUST:'客户',
  PROJECT:'专案名称',
  REQ:'需求说明',
  OWNER:'负责人',
  PROGRESS:'开发进度',
  STATUS:'完成状态',
  DEV_DATE:'开发日期',
  TEST_DATE:'测试日期',
  DEV_DAYS:'开发天数',
  CLOSE_DATE:'结案日期',
  NOTE:'备注'
};
/* 日期类列（批量场景：日期格式迁移、跨字段先后校验等） */
const DATE_COLS=[COL.RAISE_DATE,COL.DEV_DATE,COL.TEST_DATE,COL.CLOSE_DATE];
/* 导出结构校验的「关键列」：未映射到 excel 列即视为阻断项（数据丢失风险高） */
const CRITICAL_COLS=[COL.PROJECT,COL.CUST,COL.OWNER,COL.STATUS,COL.RAISE_DATE,COL.DEV_DATE];

/* ---- 默认设置（配置中心可改默认，各页面运行时临时可覆盖单次） ---- */
const DEF_SETTINGS={
  copyRowStyle:true,            // 导出：对齐上一行样式
  appendMode:'group',           // 导出：追加模式（末尾/分组）
  rangeBy:DATE_BY.DEV,          // 导出：范围日期类型（录入日期/提出日期/开发日期）
  exportSortBy:DATE_BY.DEV,     // 导出：排序依据，导出/追加/生成新周报统一按此排序
  exportSortDir:SORT_ASC,       // 导出：排序方向，默认升序（周一→周五阅读更自然）
  exportFilePrefix:'',          // 导出文件名前缀（空=无），如 DG周报
  exportFileDateFormat:'YYYYMMDD', // 导出文件名日期格式：YYYYMMDD / YYYY-MM-DD / YYYY/MM/DD / MMDD
  exportFontName:'',            // 导出 Excel 字体（空=不设置，沿用默认/模板）
  exportFontSize:'',            // 导出 Excel 字号（空=不设置）
  exportHeaderBg:'',            // 导出 Excel 表头背景色(hex，空=不设置)
  exportStatusBg:{},            // 导出 Excel 状态列背景色映射：{状态值:hex}，空=不设置
  listSortBy:LIST_SORT_BY.DEV_DATE, // 列表：排序依据
  listSortDir:SORT_DESC,        // 列表：排序方向
  monthDedup:true,              // 月报：去重
  weeklyFields:[COL.CUST,COL.PROJECT,COL.REQ,COL.PROGRESS], // 周报段落包含字段
  phrases:['开发中','已完成，待测试','已上线','联调中，等待验证','等待测试'], // 常用短语（开发进度一键插入）
  aiKey:'',                     // AI 润色：用户自己的 Key（BYOK，数据只发往用户填写的服务商）
  aiBaseUrl:AI_DEF_BASE_URL,    // AI 润色：OpenAI 兼容服务地址
  aiModel:AI_DEF_MODEL,         // AI 润色：模型名
  aiReq:''                      // AI 润色：个性化要求
};
function loadSettings(){ return Object.assign({}, DEF_SETTINGS, load(LS_EXPORTCFG,{})||{}); }
/* P3 修复：备份用的设置快照——剔除 aiKey。
   loadSettings 返回新对象（Object.assign 到 {}），delete 不会污染 DEF_SETTINGS。
   目的：明文 API Key 不随备份文件外泄（全量备份是明文 .json，可能被转发/留存）。 */
function settingsForBackup(){ const s=loadSettings(); delete s.aiKey; return s; }

/* ------------------------------------------------------------------
   二、状态定义（单一事实来源）
   ------------------------------------------------------------------ */
/* 完成状态：单一事实来源（新增状态只改这里）。
   value=存储值（导出 Excel/看板/月报统一使用，英文大驼峰）；label=界面显示名（默认同 value，可改中文而不动 value）；
   overdueExempt=是否不计逾期（暂停/已了结不催）；done=是否"已了结"（排除今日/进行中口径）；
   needNote=选它是否须填备注；needCloseDate=选它是否须填结案日期 */
const STATUS_DEFS=[
  {value:'Planning',  label:'Planning',  overdueExempt:false, done:false, needNote:false, needCloseDate:false}, // 规划中
  {value:'Ongoing',   label:'Ongoing',   overdueExempt:false, done:false, needNote:false, needCloseDate:false}, // 进行中（默认）
  {value:'Testing',   label:'Testing',   overdueExempt:false, done:false, needNote:false, needCloseDate:false}, // 测试中
  {value:'Paused',    label:'Paused',    overdueExempt:true,  done:false, needNote:true,  needCloseDate:false}, // 暂停
  {value:'Closed',    label:'Closed',    overdueExempt:true,  done:true,  needNote:false, needCloseDate:true }, // 已结案
  {value:'Cancelled', label:'Cancelled', overdueExempt:true,  done:true,  needNote:true,  needCloseDate:false}, // 取消
];
const STATUS_VALUES=STATUS_DEFS.map(s=>s.value);
/* 角色常量（稳定别名，逻辑沿用；值即 STATUS_DEFS 中的权威 value） */
const STATUS_DONE='Closed';
const STATUS_CANCEL='Cancelled';
const STATUS_PAUSE='Paused';
const STATUS_ONGOING='Ongoing';
/* 语义查询（统一走 STATUS_DEFS，避免散落字面量/大小写 bug） */
function statusDef(v){ return STATUS_DEFS.find(s=>s.value===String(v||'').trim()); }
function isStatusOverdueExempt(v){ const d=statusDef(v); return !!(d&&d.overdueExempt); }
function isStatusDone(v){ const d=statusDef(v); return !!(d&&d.done); }
function statusNeedsNote(v){ const d=statusDef(v); return !!(d&&d.needNote); }
function statusNeedsCloseDate(v){ const d=statusDef(v); return !!(d&&d.needCloseDate); }

/* 旧状态值 → 权威 value（历史数据迁移 / 导入归一用）。
   说明：权威值之间的大小写差异由下方 toLowerCase 回退统一处理，
   此表只放「无法靠大小写归一」的旧中文值，补全新状态时需同步补表。 */
const LEGACY_STATUS_MAP={
  '暂停':STATUS_PAUSE,   '已暂停':STATUS_PAUSE,
  '取消':STATUS_CANCEL,  '已取消':STATUS_CANCEL,
  '规划中':'Planning',   '进行中':STATUS_ONGOING,
  '测试中':'Testing',    '已结案':STATUS_DONE, '已完成':STATUS_DONE
};
/* 状态值归一：大小写不敏感地映射到 STATUS_DEFS 权威 value；旧中文值也一并归一。
   用于导入/追加时即时归一，避免 reload 延迟与瞬态重复项。未命中则保留自定义值。 */
function normalizeStatus(v){
  v=String(v==null?'':v).trim();
  if(!v) return '';
  if(STATUS_VALUES.includes(v)) return v;
  if(LEGACY_STATUS_MAP[v]) return LEGACY_STATUS_MAP[v];
  const low=v.toLowerCase();
  const hit=STATUS_DEFS.find(s=>s.value.toLowerCase()===low);
  if(hit) return hit.value;
  return v;
}
/* 日期依据归一：旧配置里的 'entryDate' 统一为 DATE_BY.ENTRY，消除值域混用 */
function normalizeDateBy(v){ const s=String(v==null?'':v).trim(); return DATE_BY_ALIAS[s]||s; }

/* ------------------------------------------------------------------
   三、默认列结构
   ------------------------------------------------------------------ */
/* 默认列 schema（来自 DG周报20260817-20260821.xlsx） */
const DEFAULT_SCHEMA=[
  {name:COL.SEQ,        type:COL_TYPE_AUTO,     def:''},
  {name:COL.SITE,       type:COL_TYPE_DROPDOWN, def:'东莞'},
  {name:COL.RAISE_DATE, type:COL_TYPE_DATE,     def:DEF_TODAY, dateFmt:DATE_FMT_YMD},
  {name:COL.RAISE_DEPT, type:COL_TYPE_DROPDOWN, def:'仓库'},
  {name:COL.CUST,       type:COL_TYPE_DROPDOWN, def:''},
  {name:COL.PROJECT,    type:COL_TYPE_TEXT,     def:''},
  {name:COL.REQ,        type:COL_TYPE_TEXT,     def:''},
  {name:COL.OWNER,      type:COL_TYPE_TEXT,     def:''},
  {name:COL.PROGRESS,   type:COL_TYPE_TEXTAREA, def:''},
  {name:COL.STATUS,     type:COL_TYPE_DROPDOWN, def:STATUS_ONGOING, required:true},
  {name:COL.DEV_DATE,   type:COL_TYPE_DATE,     def:DEF_TODAY, dateFmt:DATE_FMT_MD},
  {name:COL.TEST_DATE,  type:COL_TYPE_DATE,     def:'', dateFmt:DATE_FMT_MD},
  {name:COL.DEV_DAYS,   type:COL_TYPE_TEXT,     def:'1天'},
  {name:COL.CLOSE_DATE, type:COL_TYPE_DATE,     def:'', dateFmt:DATE_FMT_MD},
  {name:COL.NOTE,       type:COL_TYPE_TEXT,     def:''}
];
/* 每列稳定 id：改名检测靠它（不靠列名/位置），保证「改列名」时历史任务 values 的 key 能跟着改名而不失联 */
DEFAULT_SCHEMA.forEach(c=>{ if(!c.id) c.id='col_'+c.name; });

const DEFAULT_DROPDOWNS={
  [COL.CUST]:['所有'],
  [COL.STATUS]:STATUS_VALUES.slice(),
  [COL.SITE]:['东莞','苏州','厦门','咸阳','重庆'],
  [COL.RAISE_DEPT]:['仓库','IQC','SQE']
};

/* 结案日期 ↔ 完成状态(Closed) 双向依赖校验（纯函数，录入保存与回归测试共用，单一事实来源）。
   - 填了「结案日期」→ 完成状态必须是 Closed
   - 完成状态是 Closed → 必须填「结案日期」
   两者任一不满足即视为非法（不再静默补填，见 entry.js 保存拦截）。 */
function checkCloseDependency(values){
  const stV=String(values[COL.STATUS]||'').trim();
  const cdV=String(values[COL.CLOSE_DATE]||'').trim();
  if(cdV && stV!==STATUS_DONE) return {ok:false, msg:'填了「结案日期」必须选「完成状态=Closed」'};
  if(stV===STATUS_DONE && !cdV) return {ok:false, msg:'选「Closed」必须填写「结案日期」'};
  return {ok:true, msg:''};
}

/* 状态值迁移：旧中文/小写值 → 新英文大驼峰（幂等；首次运行后旧值消失，后续为空操作）。
   覆盖任务值、下拉选项、导出状态色映射键；归一统一走 normalizeStatus（大小写不敏感）。 */
function migrateStatusValues(){
  let changed=false;
  if(Array.isArray(tasks)){
    tasks.forEach(t=>{ if(t&&t.values){ const raw=String(t.values[COL.STATUS]||'').trim(); const norm=normalizeStatus(raw); if(norm!==raw){ t.values[COL.STATUS]=norm; changed=true; } } });
  }
  if(Array.isArray(dropdowns[COL.STATUS])){
    const next=[];
    dropdowns[COL.STATUS].forEach(s=>{ const n=normalizeStatus(s); if(!next.includes(n)) next.push(n); });
    STATUS_VALUES.forEach(s=>{ if(!next.includes(s)) next.push(s); });
    if(JSON.stringify(next)!==JSON.stringify(dropdowns[COL.STATUS])){ dropdowns[COL.STATUS]=next; changed=true; }
  }
  const cfg=loadSettings();
  if(cfg.exportStatusBg && typeof cfg.exportStatusBg==='object'){
    let bgChanged=false; const nb={};
    Object.keys(cfg.exportStatusBg).forEach(k=>{ const nk=normalizeStatus(k); nb[nk]=cfg.exportStatusBg[k]; if(nk!==k) bgChanged=true; });
    if(bgChanged){ cfg.exportStatusBg=nb; save(LS_EXPORTCFG, cfg); changed=true; }
  }
  if(changed){
    if(Array.isArray(tasks)) save(LS_TASKS, tasks);
    if(Array.isArray(dropdowns[COL.STATUS])) save(LS_DROPDOWNS, dropdowns);
  }
  return changed;
}
function guessType(name){
  if(name===COL.SEQ)return COL_TYPE_AUTO;
  if(DATE_COLS.includes(name))return COL_TYPE_DATE;
  if(name===COL.PROGRESS)return COL_TYPE_TEXTAREA;
  if([COL.CUST,COL.STATUS,COL.SITE,COL.RAISE_DEPT].includes(name))return COL_TYPE_DROPDOWN;
  return COL_TYPE_TEXT;
}

/* ------------------------------------------------------------------
   四、存储读写
   ------------------------------------------------------------------ */
/* 损坏键登记：JSON 解析失败的键记在此，UI 层用 hasCorruptData()/getCorruptKeys() 提示用户 */
const corruptKeys=new Set();
function markCorrupt(k){ corruptKeys.add(k); }
function getCorruptKeys(){ return Array.from(corruptKeys); }
function hasCorruptData(){ return corruptKeys.size>0; }

/* 读取并 JSON 解析。异常分两类处理：
   - 读取失败（隐私模式/禁用存储）→ 返回默认值（环境限制，无数据可损）
   - 解析失败（数据已损坏）→ **不静默降级**：把原始串另存到 wb_corrupt_<key> 留待抢救、
     登记到 corruptKeys 供 UI 告警、再返回默认值。
     旧实现直接 return def，用户无感知，之后任意一次 save 即用空值覆盖 → 数据永久丢失且无痕迹。 */
function load(k,def){
  let raw=null;
  try{ raw=localStorage.getItem(k); }
  catch(e){ return def; }            // 无法读取（权限/隐私模式）
  if(raw==null) return def;
  try{ return JSON.parse(raw); }
  catch(e){
    try{ localStorage.setItem(LS_CORRUPT_PREFIX+k, raw); }catch(_){}
    markCorrupt(k);
    try{ console.error('[存储损坏] 键「'+k+'」JSON 解析失败，原始内容已备份到「'+LS_CORRUPT_PREFIX+k+'」，请勿覆盖写入以免丢失可抢救数据。'); }catch(_){}
    return def;
  }
}
function save(k,v){
  try{ localStorage.setItem(k,JSON.stringify(v)); return true; }
  catch(e){
    // 存储写入失败（空间满/浏览器限制）：明确提示且不抛出，避免中断后续流程；
    // 返回 false 供关键保存点判断，防止误报「已保存」
    const isQuota=(e.name==='QuotaExceededError'||e.code===22);
    toast(isQuota?'本地存储已满！本次修改未保存，请导出备份后清理':'本地存储写入失败！本次修改未保存');
    return false;
  }
}
/* P8/P7/P4 复用：原子多键写入 —— 任一键保存失败则逆序回滚已写入的键，返回 true/false。
   用于配置中心「保存列配置 / 删除列 / 新增列」等多键联动保存，避免「内存已改、存储只写了一半」的不一致。 */
function saveAtomic(plan){
  const written=[];
  for(let i=0;i<plan.length;i++){
    const k=plan[i][0], v=plan[i][1];
    const orig = localStorage.getItem(k); // 原始串（无则 null），用于回滚
    if(save(k,v)){ written.push([k,orig]); }
    else {
      for(let j=written.length-1;j>=0;j--){ const kk=written[j][0], oo=written[j][1]; if(oo==null) localStorage.removeItem(kk); else localStorage.setItem(kk,oo); }
      return false;
    }
  }
  return true;
}
/* 转义 HTML（含单引号，覆盖所有引号属性场景） */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* 深拷贝（纯 JSON 数据） */
function deepClone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }
function pad2(n){ return String(n).padStart(2,'0'); }

/* ------------------------------------------------------------------
   五、全局状态
   ------------------------------------------------------------------ */
function loadSchema(){
  let raw=load(LS_SCHEMA,null);
  // m3 修复：删除永不触发的死分支（type==='default' 从未作为真实类型存在，且 wb_defaults 从未写入）；
  // 保留「无存储则用默认、有存储则补全 id/def」的唯二路径
  let arr = raw
    ? raw.map(c=>({...c, id:(c.id||('col_'+c.name)), def:c.def||''}))
    : DEFAULT_SCHEMA.map(c=>({...c}));
  // 迁移：去掉历史遗留的「结案日志」列（结案不再要求写日志）
  arr=arr.filter(c=>c.name!=='结案日志');
  // 迁移：date 列补 dateFmt 默认（ymd），使旧配置也按列输出正确日期格式
  arr=arr.map(c=>{
    if(c.type===COL_TYPE_DATE && !c.dateFmt){
      const d=DEFAULT_SCHEMA.find(x=>(c.id&&x.id===c.id)||x.name===c.name);
      c.dateFmt=(d&&d.dateFmt)?d.dateFmt:DATE_FMT_YMD;
    }
    return c;
  });
  // 核心必填列（专案名称/完成状态）始终强制 required：二者为月报汇总与状态校验的硬依赖，
  // 不允许被用户配置取消。其余列是否必填由 schema.required 决定（可在配置中心扩展）。
  arr=arr.map(c=>{
    if(c.name===COL.PROJECT || c.name===COL.STATUS) c.required=true;
    return c;
  });
  return arr;
}
let schema=loadSchema();
let dropdowns=load(LS_DROPDOWNS,deepClone(DEFAULT_DROPDOWNS));
/* 迁移（v3）：老用户按新默认更新同名列类型/默认值；下拉「合并」默认项（不覆盖自定义），标记后不再动（配置中心仍可改）
   P12 修复：版本 2→3。曾运行过旧版迁移（v2 为「覆盖式」）的用户，其下拉可能只剩默认项、缺了补齐项；
   升版让合并（并集）再执行一次——该操作幂等，只补缺失的默认项，绝不删除任何自定义项。
   注：已被旧版覆盖掉的自定义项无法自动找回，需用户在配置中心补回，此处无法代劳。 */
(function(){
  const VER='3';
  if(load(LS_CFG_V,'')===VER) return;
  if(!Array.isArray(dropdowns[COL.STATUS])) dropdowns[COL.STATUS]=[];
  const defByName={}; DEFAULT_SCHEMA.forEach(c=>defByName[c.name]=c);
  const sc=load(LS_SCHEMA,null);
  if(Array.isArray(sc)&&sc.length){
    let changed=false;
    const ns=sc.map(c=>{
      const nd=defByName[c.name];
      if(nd && (c.type!==nd.type || c.def!==nd.def)){
        changed=true;
        return Object.assign({}, c, {type:nd.type, def:nd.def});
      }
      return c;
    });
    if(changed) save(LS_SCHEMA, ns);
  }
  schema=loadSchema(); // 内存同步为新 schema（类型/默认值生效）
  (DEFAULT_DROPDOWNS[COL.STATUS]||[]).forEach(s=>{ if(!dropdowns[COL.STATUS].includes(s)) dropdowns[COL.STATUS].push(s); });
  // M2 修复：自定义下拉「合并」默认项而非「覆盖」，避免升级用户丢失自己加的选项（如 其他/太白山/N客户）
  const unionDd=key=>{ const a=(dropdowns[key]||[]).slice(); (DEFAULT_DROPDOWNS[key]||[]).forEach(v=>{ if(!a.includes(v)) a.push(v); }); dropdowns[key]=a; };
  unionDd(COL.CUST); unionDd(COL.SITE); unionDd(COL.RAISE_DEPT);
  save(LS_DROPDOWNS,dropdowns);
  save(LS_CFG_V,VER);
})();
let tasks=load(LS_TASKS,[]); // [{id, entryDate, values:{colName:value}, exported:false}]
migrateStatusValues();
let trash=load(LS_TRASH,[]); // 回收站（软删除）
let editingId=null;

/* 导出追加运行时状态 */
let excelBook=null, excelSheet=null, excelSheetName=null, excelHeaderRow=1, excelHeaders=[], colMapping={};

/* ------------------------------------------------------------------
   六、通用 helpers
   ------------------------------------------------------------------ */
function $(s){return document.querySelector(s);}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function fmtDateCN(d){ const x=new Date(d); if(isNaN(x))return d; return x.getFullYear()+'/'+pad2(x.getMonth()+1)+'/'+pad2(x.getDate()); }
/* 月-日（无年份），用于导出与真实周报模板对齐：开发/测试/结案日期列用 MM/DD */
function fmtDateMD(d){ const x=new Date(d); if(isNaN(x))return d; return pad2(x.getMonth()+1)+'/'+pad2(x.getDate()); }
function parseDateAny(v){
  if(!v)return null;
  if(v instanceof Date)return v;
  let s=String(v).trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){const [y,m,d]=s.split('-').map(Number);const x=new Date(y,m-1,d);return (x.getFullYear()===y&&x.getMonth()+1===m&&x.getDate()===d)?x:null;}
  if(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)){const [y,m,d]=s.split('/').map(Number);const x=new Date(y,m-1,d);return (x.getFullYear()===y&&x.getMonth()+1===m&&x.getDate()===d)?x:null;}
  // m6 修复：MM/DD 仅含月日、年份歧义——取与今天"更近"的年份（1 月录入历史 12/30 不会误判为今年未来）
  if(/^\d{1,2}\/\d{1,2}$/.test(s)){const [m,d]=s.split('/').map(Number);const y=new Date().getFullYear();const x=new Date(y,m-1,d);if(!(x.getMonth()+1===m&&x.getDate()===d))return null;const now0=new Date();now0.setHours(0,0,0,0);const prev=new Date(y-1,m-1,d);return (Math.abs(prev-now0)<Math.abs(x-now0))?prev:x;}
  const x=new Date(s); return isNaN(x)?null:x;
}
function toInputDate(v){ if(!v)return ''; const d=parseDateAny(v); if(!d)return ''; return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),TOAST_MS);}

/* 统一下载入口：把 blob 落成文件。
   - 先 append 到 body 再 click（Firefox 要求节点在文档中才触发下载）
   - 用完移除节点，并延后 revokeObjectURL（立即 revoke 可能中断下载；旧实现从不释放，会泄漏 blob） */
function triggerDownload(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name;
  try{ if(document.body&&document.body.appendChild) document.body.appendChild(a); }catch(e){}
  a.click();
  try{ if(a.remove) a.remove(); else if(a.parentNode&&a.parentNode.removeChild) a.parentNode.removeChild(a); }catch(e){}
  setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(e){} },0);
}
function downloadJSON(obj,name){ triggerDownload(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),name); }
function downloadBlob(blob,name){ triggerDownload(blob,name); }
/* 按需加载 ExcelJS（约 947KB）：仅在真正用到 Excel 导出/导入时才注入 script，避免首屏解析拖慢启动。
   离线场景由 sw.js 的 ASSETS 预缓存兜底；已加载则直接返回。 */
let _excelJsLoading=null;
function loadExcelJS(){
  if(typeof ExcelJS!=='undefined' && ExcelJS) return Promise.resolve(); // 已加载（浏览器动态注入后、或测试环境预置全局）
  if(_excelJsLoading) return _excelJsLoading;
  _excelJsLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='exceljs.min.js';
    s.onload=()=>res();
    s.onerror=()=>rej(new Error('ExcelJS 加载失败（可能是离线且缓存未命中）'));
    (document.head||document.body||document.documentElement).appendChild(s);
  });
  return _excelJsLoading;
}

/* 自定义输入弹层（替代原生 prompt）：沙箱 iframe（如预览页）禁用 prompt，统一走页面内弹层，任何环境可用 */
let uiModalEl=null;
function uiModal(){
  if(uiModalEl) return uiModalEl;
  uiModalEl=document.createElement('div');
  uiModalEl.id='uiModal';
  uiModalEl.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;z-index:40;';
  uiModalEl.innerHTML='<div style="background:var(--card);border-radius:12px;padding:18px 20px;width:min(430px,90vw);box-shadow:0 10px 34px rgba(0,0,0,.22);font-size:14px">'
    +'<div class="ui-title" style="font-weight:600;font-size:15px;margin-bottom:12px;line-height:1.5"></div>'
    +'<div class="ui-body" style="color:var(--txt)"></div>'
    +'<div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn sec ui-cancel">取消</button><button class="btn ui-ok">确定</button></div>'
    +'</div>';
  document.body.appendChild(uiModalEl);
  return uiModalEl;
}
function uiPrompt(title, defaultValue){
  return new Promise(resolve=>{
    const m=uiModal();
    m.querySelector('.ui-title').textContent=title||'';
    const body=m.querySelector('.ui-body');
    body.innerHTML='<input type="text" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px">';
    const inp=body.querySelector('input');
    inp.value=defaultValue||'';
    m.style.display='flex';
    const ok=m.querySelector('.ui-ok'), cancel=m.querySelector('.ui-cancel');
    const done=val=>{ m.style.display='none'; ok.onclick=null; cancel.onclick=null; inp.onkeydown=null; m.onclick=null; resolve(val); };
    ok.onclick=()=>done(inp.value);
    cancel.onclick=()=>done(null);
    m.onclick=e=>{ if(e.target===m) done(null); };
    inp.onkeydown=e=>{
      if(e.key==='Enter'){ e.preventDefault(); done(inp.value); }
      else if(e.key==='Escape'){ done(null); }
    };
    setTimeout(()=>inp.focus(),0);
  });
}

/* 带超时的 fetch（统一封装，供所有网络调用复用，避免各处各自为政） */
async function fetchWithTimeout(url,opt,ms){
  const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  const timer=ctrl?setTimeout(()=>{ try{ ctrl.abort(); }catch(e){} },ms||AI_TIMEOUT_MS):null;
  try{ return await fetch(url, ctrl?Object.assign({},opt,{signal:ctrl.signal}):opt); }
  finally{ if(timer) clearTimeout(timer); }
}

/* BYOK AI 调用：直连用户自己配置的 OpenAI 兼容接口（AI_CHAT_PATH）。
   数据只发往用户填写的服务地址，不经过本工具任何服务器。 */
async function aiChat(messages){
  const st=loadSettings();
  if(!st.aiKey) throw new Error('未配置 API Key（配置中心 → AI 润色）');
  const base=(st.aiBaseUrl||AI_DEF_BASE_URL).trim().replace(/\/+$/,'');
  // M3 修复：校验服务地址协议，拒绝非 http(s) 的任意 URL（原实现会把 Key 发往用户填的任意地址）
  if(!/^https?:\/\//i.test(base)) throw new Error('服务地址必须以 http:// 或 https:// 开头（请填写完整地址）');
  if(base.startsWith('http://')){
    console.warn('[AI 润色] 服务地址使用非加密 http，API Key 将以明文发送，仅建议在本地/可信网络使用');
    if(!_httpWarnShown){ _httpWarnShown=true; toast('警告：AI 服务地址为非加密 http，API Key 将明文发送'); }
  }
  const model=(st.aiModel||AI_DEF_MODEL).trim()||AI_DEF_MODEL;
  let res=null, lastErr=null;
  for(let attempt=0;attempt<=AI_RETRY;attempt++){
    try{
      const r=await fetchWithTimeout(base+AI_CHAT_PATH,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+st.aiKey.trim()},
        body:JSON.stringify({model, messages, stream:false, temperature:0.7})
      },AI_TIMEOUT_MS);
      if(r.ok){ res=r; break; }
      // 4xx 属确定性错误（Key 无效/模型名错/地址错），重试无意义
      if(r.status>=400 && r.status<500){ res=r; break; }
      lastErr=new Error('接口返回 '+r.status); // 5xx 才重试
    }catch(e){ lastErr=e; }
  }
  if(!res){
    if(lastErr && lastErr.name==='AbortError') throw new Error('请求超时（'+(AI_TIMEOUT_MS/1000)+' 秒无响应），请稍后重试');
    throw new Error('请求失败（网络/跨域）：该服务商可能不允许浏览器直连，建议换用支持 CORS 的服务，如 DeepSeek/OpenAI。原始错误：'+((lastErr&&lastErr.message)||'未知'));
  }
  if(!res.ok){
    let t='';
    try{ t=(await res.text()).slice(0,ERR_BODY_MAX); }catch(e){}
    throw new Error('接口返回 '+res.status+(t?'：'+t:'')+(res.status===401?'（Key 无效，请检查）':''));
  }
  const d=await res.json();
  const out=d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
  if(!out) throw new Error('接口响应格式异常（模型名或服务地址不对？）');
  return String(out);
}

/* 加密备份：Web Crypto AES-256-GCM + PBKDF2。密码不落盘，仅用于派生密钥。 */
function cryptoAvailable(){ return !!(window.crypto && window.crypto.subtle); }
async function deriveKey(password, salt){
  const enc=new TextEncoder();
  const baseKey=await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:PBKDF2_ITERATIONS, hash:'SHA-256'},
    baseKey,
    {name:'AES-GCM', length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function encryptBackupJSON(obj, password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(password, salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({v:1, alg:'AES-256-GCM', salt:Array.from(salt), iv:Array.from(iv), data:Array.from(new Uint8Array(ct))});
}
async function decryptBackupJSON(text, password){
  const p=JSON.parse(text);
  if(!p || p.v!==1 || !Array.isArray(p.data)) throw new Error('不是有效的加密备份文件（.wbe）');
  const salt=new Uint8Array(p.salt), iv=new Uint8Array(p.iv), ct=new Uint8Array(p.data);
  const key=await deriveKey(password, salt);
  let plain;
  try{ plain=await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct); }
  catch(e){ throw new Error('密码错误或文件已损坏'); }
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ------------------------------------------------------------------
   七、列模板 / 备份提醒 / 列名匹配
   ------------------------------------------------------------------ */
/* 列模板（配置中心多套列结构）：{active:'名称', list:{名称:{schema:[],dropdowns:{},mapping:{}}}} */
function loadColTemplates(){ return load(LS_COL_TMPL, {active:'', list:{}}); }
function saveColTemplates(o){ save(LS_COL_TMPL, o); }
/* 应用一套列模板：覆盖当前 schema/dropdowns/colMapping 并持久化（供切换模板调用） */
function applyColTemplate(tpl){
  if(!tpl || !Array.isArray(tpl.schema) || !tpl.schema.length) throw new Error('模板缺少有效列定义');
  const oldSchema=schema.slice();
  schema = tpl.schema.map(c=>({name:String(c.name||'').trim(), type:String(c.type||COL_TYPE_TEXT), def:String(c.def||''), id:(c.id||('col_'+String(c.name||'').trim())), dateFmt:(String(c.type||COL_TYPE_TEXT)===COL_TYPE_DATE?(c.dateFmt===DATE_FMT_MD?DATE_FMT_MD:DATE_FMT_YMD):undefined)}));
  const rn=computeRenames(oldSchema, schema); if(rn.length) applyRenames(rn);
  dropdowns = (tpl.dropdowns && typeof tpl.dropdowns==='object') ? deepClone(tpl.dropdowns) : {};
  save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns); save(LS_MAPPING,colMapping); save(LS_TASKS,tasks);
  // 仅当模板带非空映射时才覆盖导出映射（空映射=保留自动识别，避免误清记忆）
  if(tpl.mapping && typeof tpl.mapping==='object' && Object.keys(tpl.mapping).length){
    colMapping=deepClone(tpl.mapping); save(LS_MAPPING,colMapping);
  }
}
function markBackup(){ save(LS_LASTBACKUP,Date.now()); }
function checkBackupReminder(){
  const lb=load(LS_LASTBACKUP,0); const days=(Date.now()-lb)/MS_PER_DAY;
  if(!lb){ setTimeout(()=>toast('首次使用，建议到「任务列表」导出任务库备份'),BACKUP_REMIND_DELAY_MS); }
  else if(days>BACKUP_REMIND_DAYS){ setTimeout(()=>toast('距上次备份已 '+Math.floor(days)+' 天，建议导出备份任务库/配置'),BACKUP_REMIND_DELAY_MS); }
}

/* 列名匹配：自动识别 excel 表头 -> 本工具列名 */
function matchCol(headerName){
  if(!headerName)return null;
  const h=headerName.trim();
  if(!h)return null;
  const names=schema.map(c=>c.name);
  if(names.includes(h))return h;
  const norm=s=>s.replace(/[\s()（）]/g,'');
  const hit=names.find(n=>norm(n)===norm(h)); if(hit)return hit;
  // 子串回退：仅当「唯一候选」时才自动匹配，避免泛化表头（如"日期""开发"）误配到具体列；多候选/歧义返回 null 交用户手选
  const hn=norm(h);
  const cands=names.filter(n=>norm(n).includes(hn)||hn.includes(norm(n)));
  return cands.length===1?cands[0]:null;
}

/* 解析某 excel 表头实际映射到的本工具列名。
   规则：colMapping 中显式存在的值优先（含用户手动选的「不导出」空串）；未出现的表头才回退到自动匹配。
   这样「不导出」能真正生效，避免 colMapping[h]||matchCol(h) 把空串又匹配回去的旧问题。 */
function effMap(h){ return (h in colMapping) ? (colMapping[h]||'') : (matchCol(h)||''); }

/* ---- 上传文件与 Excel 表头识别（三处导入路径共用，避免各写一份后漂移） ---- */
function isXlsx(name){ return /\.xlsx$/i.test(String(name||'')); }
/* 上传前校验：扩展名 + 大小上限（超大文件的解析会长时间阻塞主线程且无进度反馈） */
function checkUploadFile(f){
  if(!f) return {ok:false,msg:'未选择文件'};
  if(!isXlsx(f.name)) return {ok:false,msg:'仅支持 .xlsx 文件（旧版 .xls 请先在 Excel 里另存为 .xlsx）'};
  if(f.size && f.size>MAX_UPLOAD_BYTES){
    return {ok:false,msg:'文件超过 '+MAX_UPLOAD_MB+'MB 上限（当前 '+Math.round(f.size/BYTES_PER_MB)+'MB），请拆分后再导入'};
  }
  return {ok:true,msg:''};
}
/* 上传行数上限：行数需读表后才知道，故在 wb.xlsx.load 之后由 checkUploadRows 前置拦截，
   避免超大清单整张读进内存并长时间阻塞主线程。与 MAX_UPLOAD_BYTES 共同构成上传护栏。 */
const MAX_UPLOAD_ROWS=50000;
function checkUploadRows(ws){
  if(ws && ws.rowCount && ws.rowCount>MAX_UPLOAD_ROWS){
    return {ok:false, msg:'文件行数超过 '+MAX_UPLOAD_ROWS+' 行上限（当前约 '+ws.rowCount+' 行），请拆分后再导入'};
  }
  return {ok:true,msg:''};
}
/* 找表头行：首个「非空单元格数 >= MIN_HEADER_CELLS」的行（1-based）；未找到返回 0 */
function findHeaderRow(ws){
  if(!ws) return 0;
  for(let r=1;r<=ws.rowCount;r++){
    let n=0; ws.getRow(r).eachCell(()=>{n++;});
    if(n>=MIN_HEADER_CELLS) return r;
  }
  return 0;
}
/* 读取表头行的列名（保留空串占位，便于按列号回写）；去重由调用方决定 */
function readHeaders(ws, hr){
  if(!ws||!hr) return [];
  const maxCol=Math.max((ws.getRow(hr).cellCount||0), (ws.columnCount||0));
  const out=[];
  for(let c=1;c<=maxCol;c++){ const v=ws.getRow(hr).getCell(c).value; out.push(v!=null?String(v).trim():''); }
  return out;
}
/* hex 颜色归一化：#RGB / #RRGGBB（'#' 可省）→ 规范形式。
   argb=true 返回 ExcelJS 用的 'FFRRGGBB'，否则返回 '#RRGGBB'（大写）；非法输入返回 ''。
   合并了原 config.js 的 toHex 与 export.js 的 toArgb 两份近似实现。 */
function normalizeHex(c, argb){
  let s=String(c||'').trim().replace(/^#/,'');
  if(/^[0-9a-fA-F]{3}$/.test(s)) s=s.split('').map(x=>x+x).join('');
  if(!/^[0-9a-fA-F]{6}$/.test(s)) return '';
  s=s.toUpperCase();
  return argb?('FF'+s):('#'+s);
}

/* ------------------------------------------------------------------
   八、列改名迁移（#2：改列名后历史任务不失联）
   ------------------------------------------------------------------ */
/* 计算新旧 schema 之间的「重命名」映射：优先按稳定 id 匹配，位置作为兜底（覆盖恢复默认/导入整份配置）。
   from=旧列名，to=新列名。会去重，避免 A→B 与 B→C 冲突。 */
function computeRenames(oldSchema, newSchema){
  const renames=[]; const usedFrom=new Set(); const usedTo=new Set();
  const oldById={}, newById={};
  (oldSchema||[]).forEach(c=>{ if(c&&c.id) oldById[c.id]=c.name; });
  (newSchema||[]).forEach(c=>{ if(c&&c.id) newById[c.id]=c.name; });
  Object.keys(oldById).forEach(id=>{
    if(newById[id]!=null && newById[id]!==oldById[id] && !usedFrom.has(oldById[id]) && !usedTo.has(newById[id])){
      renames.push({from:oldById[id], to:newById[id]}); usedFrom.add(oldById[id]); usedTo.add(newById[id]);
    }
  });
  const n=Math.min((oldSchema||[]).length,(newSchema||[]).length);
  for(let i=0;i<n;i++){
    const o=(oldSchema[i]||{}).name, v=(newSchema[i]||{}).name;
    if(o!==v && !usedFrom.has(o) && !usedTo.has(v) && !renames.some(r=>r.from===o||r.to===v)){
      renames.push({from:o, to:v}); usedFrom.add(o); usedTo.add(v);
    }
  }
  return renames;
}
/* 应用重命名：把 tasks[].values 的 key、dropdowns 的 key、colMapping 的 value 一并改名。
   不覆盖已存在的新 key（避免丢数据），返回改名条数。调用方需自行 save。 */
function applyRenames(renames){
  if(!renames||!renames.length) return 0;
  renames.forEach(r=>{
    tasks.forEach(t=>{ if(t&&t.values!=null && r.from in t.values && !(r.to in t.values)){ t.values[r.to]=t.values[r.from]; delete t.values[r.from]; } });
    if(dropdowns && r.from in dropdowns){ dropdowns[r.to]=dropdowns[r.from]; delete dropdowns[r.from]; }
    Object.keys(colMapping).forEach(k=>{ if(colMapping[k]===r.from) colMapping[k]=r.to; });
  });
  return renames.length;
}

/* ------------------------------------------------------------------
   九、统计聚合与业务判定
   ------------------------------------------------------------------ */
/* P10 修复：统一的「某年月的任务」筛选（列表/看板/月报共用，消除两处等价实现各自演进的漂移风险） */
function monthTasksOfYM(ts, y, m){
  return ts.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d.getFullYear()===y&&d.getMonth()+1===m;});
}
/* ============ 共享统计聚合（m12：避免看板/数据看板/列表口径漂移） ============ */
function aggregateTasks(ts, now){
  now=now||new Date();
  const y=now.getFullYear(), m=now.getMonth()+1;
  const monthTasks=monthTasksOfYM(ts,y,m);
  const closedMonth=monthTasks.filter(t=>String(t.values[COL.STATUS]||'')===STATUS_DONE).length;
  const rate=monthTasks.length?Math.round(closedMonth/monthTasks.length*100):0;
  const closedAll=ts.filter(t=>String(t.values[COL.STATUS]||'')===STATUS_DONE).length;
  const ongoing=ts.filter(t=>{const s=String(t.values[COL.STATUS]||'').trim();return s&&!isTaskDone(t)&&s!==STATUS_PAUSE;}).length;
  const overdue=ts.filter(t=>isTaskOverdue(t,now)); // P9：与 monthTasks 共用同一参考日
  const byCust={}; ts.forEach(t=>{const c=(t.values[COL.CUST]||'').trim()||'未填';byCust[c]=byCust[c]||{total:0,closed:0};byCust[c].total++;if(String(t.values[COL.STATUS]||'')===STATUS_DONE)byCust[c].closed++;});
  const bySt={}; ts.forEach(t=>{const s=String(t.values[COL.STATUS]||'').trim()||'未填';bySt[s]=(bySt[s]||0)+1;});
  return {total:ts.length, y, m, monthTasks, closedMonth, rate, closedAll, ongoing, overdueCount:overdue.length, overdue, byCust, bySt};
}
/* 防抖：用于搜索框每次按键全量重渲染（m4） */
function debounce(fn,ms){let t;return function(){const a=arguments;clearTimeout(t);t=setTimeout(()=>fn.apply(null,a),ms);};}

/* ============ 回收站清理上限 ============ */
const TRASH_CAP=50; // 回收站最多保留条数，超出自动清理最旧记录
function trimTrash(){ if(trash.length>TRASH_CAP) trash.splice(0, trash.length-TRASH_CAP); }

/* ============ 子任务 + 任务历史（共享 helper） ============ */
const HISTORY_CAP=50; // 每条任务最多保留历史条数
function subtasksOf(t){ return Array.isArray(t&&t.subtasks)?t.subtasks:[]; }
/* 子任务进度：无子任务返回 null；否则 {done,total,pct} */
function subtaskProgress(t){
  const st=subtasksOf(t);
  if(!st.length) return null;
  const done=st.filter(x=>x&&x.done).length;
  return {done, total:st.length, pct:Math.round(done/st.length*100)};
}
/* 进度推导（主路径）：开发进度每行一个推进节点，行首「✓ 」= 已完成，自动统计；
   仅当出现 ✓ 标记行时才按行统计，否则回退到历史子任务进度 */
function devProgressOf(t){
  const v=t&&t.values?String(t.values[COL.PROGRESS]||'').trim():'';
  if(v){
    const arr=parseSubtasks(v);
    if(arr.length && arr.some(x=>x.done)){
      const done=arr.filter(x=>x.done).length;
      return {done, total:arr.length, pct:Math.round(done/arr.length*100)};
    }
  }
  return subtaskProgress(t);
}
/* 子任务文本 <-> 数组：每行一条，行首「✓ 」「[x]」「[X]」= 已完成（与录入页提示一致） */
function parseSubtasks(text){
  return String(text||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>{
    const m=/^(?:✓\s*|\[[ xX]\]\s*)/.exec(s);
    if(m) return {text:s.slice(m[0].length).trim(), done:true};
    return {text:s, done:false};
  });
}
/* 本周（周一~周日）起止日期 */
function weekRange(now){
  const d=now||new Date();
  const day=d.getDay();
  const diff=day===0?-6:1-day;
  const start=new Date(d); start.setDate(d.getDate()+diff);
  const end=new Date(start); end.setDate(start.getDate()+6);
  return {start, end, startStr:toInputDate(start), endStr:toInputDate(end)};
}
/* 开发天数：开发日期~结案日期（含首尾）；任一为空返回 null */
function calcDevDays(d1,d2){
  if(!d1||!d2) return null;
  const diff=Math.round((d2-d1)/MS_PER_DAY)+1;
  return diff>=1?diff:null;
}
/* 打开任务到每日录入页编辑（公共跳转，供卡片/看板/日历/今日待办复用） */
function openTaskEdit(id){
  const tk=tasks.find(x=>x.id===id);
  if(!tk) return;
  editingId=tk.id;
  document.querySelector('nav button[data-tab="entry"]').click();
  renderEntry({...tk.values, entryDate:tk.entryDate});
  window.scrollTo(0,0);
}
/* 追加一条任务历史：{ts, a:动作, d:详情}，超上限自动裁旧 */
function addHistory(t, action, detail){
  if(!t) return;
  t.history=t.history||[];
  t.history.push({ts:Date.now(), a:action, d:detail||''});
  if(t.history.length>HISTORY_CAP) t.history.splice(0, t.history.length-HISTORY_CAP);
}
function fmtHistoryTime(ts){
  const d=new Date(ts);
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
}
/* 逾期判断：未结案/未取消/未暂停 且开发/提出日期早于今天（暂停=暂停，不催）
   P9 修复：ref 为参考日（默认今天）；aggregateTasks 传入同一个 now，
   保证「本月任务」与「逾期」使用同一参考日（此前 now 与全局 todayStr() 可能不同源） */
function isTaskOverdue(t, ref){
  const s=String(t.values[COL.STATUS]||'').trim();
  if(isStatusOverdueExempt(s)) return false;
  const d=parseDateAny(t.values[COL.DEV_DATE])||parseDateAny(t.values[COL.RAISE_DATE]);
  const refStr=ref?toInputDate(ref):todayStr();
  return d && toInputDate(d) < refStr;
}
/* 是否"已了结"（结案或取消），用于排除出今日/进行中等口径 */
function isTaskDone(t){
  const s=String(t.values[COL.STATUS]||'').trim();
  return isStatusDone(s);
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
