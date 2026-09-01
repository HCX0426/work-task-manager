/* ============ 存储与全局状态（store.js） ============ */
const LS_SCHEMA='wb_schema', LS_DROPDOWNS='wb_dropdowns', LS_TASKS='wb_tasks', LS_TRASH='wb_trash', LS_LASTBACKUP='wb_lastbackup', LS_MAPPING='wb_mapping', LS_EXPORTCFG='wb_exportcfg', LS_COL_TMPL='wb_col_templates';

/* 默认设置（配置中心可改默认，各页面运行时临时可覆盖单次） */
const DEF_SETTINGS={
  copyRowStyle:true,            // 导出：对齐上一行样式
  appendMode:'group',           // 导出：追加模式（末尾/分组）
  rangeBy:'开发日期',           // 导出：范围日期类型（entryDate/提出日期/开发日期）
  listSortBy:'devDate',         // 列表：排序依据（date/status/cust/devDate）
  listSortDir:'desc',           // 列表：排序方向（asc/desc）
  monthDedup:true,              // 月报：去重
  weeklyFields:['客户','专案名称','需求说明','开发进度'], // 周报段落包含字段
  phrases:['开发中','已完成，待测试','已上线','联调中，等待验证','等待测试'], // 常用短语（开发进度一键插入）
  aiKey:'',                     // AI 润色：用户自己的 Key（BYOK，数据只发往用户填写的服务商）
  aiBaseUrl:'https://api.deepseek.com', // AI 润色：OpenAI 兼容服务地址
  aiModel:'deepseek-chat',      // AI 润色：模型名
  aiReq:''                      // AI 润色：个性化要求
};
function loadSettings(){ return Object.assign({}, DEF_SETTINGS, load(LS_EXPORTCFG,{})||{}); }
/* P3 修复：备份用的设置快照——剔除 aiKey。
   loadSettings 返回新对象（Object.assign 到 {}），delete 不会污染 DEF_SETTINGS。
   目的：明文 API Key 不随备份文件外泄（全量备份是明文 .json，可能被转发/留存）。 */
function settingsForBackup(){ const s=loadSettings(); delete s.aiKey; return s; }
function load(k,def){ try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;} }
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
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* ============ 默认列 schema（来自 DG周报20260817-20260821.xlsx） ============ */
const DEFAULT_SCHEMA=[
  {name:'项次',    type:'auto',     def:''},
  {name:'厂区',    type:'dropdown', def:'东莞'},
  {name:'提出日期', type:'date',     def:'{{today}}', dateFmt:'ymd'},
  {name:'提出部门', type:'dropdown', def:'仓库'},
  {name:'客户',    type:'dropdown', def:''},
  {name:'专案名称', type:'text',     def:''},
  {name:'需求说明', type:'text',     def:''},
  {name:'负责人',  type:'text',     def:''},
  {name:'开发进度', type:'textarea', def:''},
  {name:'完成状态', type:'dropdown', def:'Ongoing'},
  {name:'开发日期', type:'date',     def:'{{today}}', dateFmt:'md'},
  {name:'测试日期', type:'date',     def:'', dateFmt:'md'},
  {name:'开发天数', type:'text',     def:'1天'},
  {name:'结案日期', type:'date',     def:'', dateFmt:'md'},
  {name:'备注',    type:'text',     def:''}
];
/* 每列稳定 id：改名检测靠它（不靠列名/位置），保证「改列名」时历史任务 values 的 key 能跟着改名而不失联 */
DEFAULT_SCHEMA.forEach(c=>{ if(!c.id) c.id='col_'+c.name; });
const DEFAULT_DROPDOWNS={
  '客户':['所有'],
  '完成状态':['Ongoing','Closed','planning','暂停','取消'],
  '厂区':['东莞','苏州','厦门','咸阳','重庆'],
  '提出部门':['仓库','IQC','SQE']
};
/* 完成状态语义：结案与取消都视为"已了结"，不计逾期/今日/进行中 */
const STATUS_DONE='Closed';
const STATUS_CANCEL='取消';
const STATUS_PAUSE='暂停';

function guessType(name){
  if(name==='项次')return 'auto';
  if(['提出日期','开发日期','测试日期','结案日期'].includes(name))return 'date';
  if(name==='开发进度')return 'textarea';
  if(['客户','完成状态','厂区','提出部门'].includes(name))return 'dropdown';
  return 'text';
}

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
    if(c.type==='date' && !c.dateFmt){
      const d=DEFAULT_SCHEMA.find(x=>(c.id&&x.id===c.id)||x.name===c.name);
      c.dateFmt=(d&&d.dateFmt)?d.dateFmt:'ymd';
    }
    return c;
  });
  return arr;
}

/* ============ 全局状态 ============ */
let schema=loadSchema();
let dropdowns=load(LS_DROPDOWNS,JSON.parse(JSON.stringify(DEFAULT_DROPDOWNS)));
/* 迁移（v3）：老用户按新默认更新同名列类型/默认值；下拉「合并」默认项（不覆盖自定义），标记后不再动（配置中心仍可改）
   P12 修复：版本 2→3。曾运行过旧版迁移（v2 为「覆盖式」）的用户，其下拉可能只剩默认项、缺了补齐项；
   升版让合并（并集）再执行一次——该操作幂等，只补缺失的默认项，绝不删除任何自定义项。
   注：已被旧版覆盖掉的自定义项无法自动找回，需用户在配置中心补回，此处无法代劳。 */
(function(){
  const VER='3';
  if(load('wb_cfg_v','')===VER) return;
  if(!Array.isArray(dropdowns['完成状态'])) dropdowns['完成状态']=[];
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
  (DEFAULT_DROPDOWNS['完成状态']||[]).forEach(s=>{ if(!dropdowns['完成状态'].includes(s)) dropdowns['完成状态'].push(s); });
  // M2 修复：自定义下拉「合并」默认项而非「覆盖」，避免升级用户丢失自己加的选项（如 其他/太白山/N客户）
  const unionDd=key=>{ const a=(dropdowns[key]||[]).slice(); (DEFAULT_DROPDOWNS[key]||[]).forEach(v=>{ if(!a.includes(v)) a.push(v); }); dropdowns[key]=a; };
  unionDd('客户'); unionDd('厂区'); unionDd('提出部门');
  save(LS_DROPDOWNS,dropdowns);
  save('wb_cfg_v',VER);
})();
let tasks=load(LS_TASKS,[]); // [{id, entryDate, values:{colName:value}, exported:false}]
let trash=load(LS_TRASH,[]); // 回收站（软删除）
let editingId=null;

/* 导出追加运行时状态 */
const EXCEL_FONT={name:'等线',size:11};
let excelBook=null, excelSheet=null, excelSheetName=null, excelHeaderRow=1, excelHeaders=[], colMapping={};

/* ============ 通用 helpers ============ */
function $(s){return document.querySelector(s);}
function todayStr(){const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function fmtDateCN(d){ const x=new Date(d); if(isNaN(x))return d; const p=n=>String(n).padStart(2,'0'); return x.getFullYear()+'/'+p(x.getMonth()+1)+'/'+p(x.getDate()); }
/* 月-日（无年份），用于导出与真实周报模板对齐：开发/测试/结案日期列用 MM/DD */
function fmtDateMD(d){ const x=new Date(d); if(isNaN(x))return d; const p=n=>String(n).padStart(2,'0'); return p(x.getMonth()+1)+'/'+p(x.getDate()); }
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
function toInputDate(v){ if(!v)return ''; const d=parseDateAny(v); if(!d)return ''; const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function downloadJSON(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();}

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

/* BYOK AI 调用：直连用户自己配置的 OpenAI 兼容接口（/chat/completions）。
   数据只发往用户填写的服务地址，不经过本工具任何服务器。 */
async function aiChat(messages){
  const st=loadSettings();
  if(!st.aiKey) throw new Error('未配置 API Key（配置中心 → AI 润色）');
  const base=(st.aiBaseUrl||'https://api.deepseek.com').trim().replace(/\/+$/,'');
  // M3 修复：校验服务地址协议，拒绝非 http(s) 的任意 URL（原实现会把 Key 发往用户填的任意地址）
  if(!/^https?:\/\//i.test(base)) throw new Error('服务地址必须以 http:// 或 https:// 开头（请填写完整地址）');
  if(base.startsWith('http://')) console.warn('[AI 润色] 服务地址使用非加密 http，API Key 将以明文发送，仅建议在本地/可信网络使用');
  const model=(st.aiModel||'deepseek-chat').trim()||'deepseek-chat';
  let res;
  try{
    res=await fetch(base+'/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+st.aiKey.trim()},
      body:JSON.stringify({model, messages, stream:false, temperature:0.7})
    });
  }catch(e){
    throw new Error('请求失败（网络/跨域）：该服务商可能不允许浏览器直连，建议换用支持 CORS 的服务，如 DeepSeek/OpenAI。原始错误：'+e.message);
  }
  if(!res.ok){
    let t='';
    try{ t=(await res.text()).slice(0,200); }catch(e){}
    throw new Error('接口返回 '+res.status+(t?'：'+t:'')+(res.status===401?'（Key 无效，请检查）':''));
  }
  const d=await res.json();
  const out=d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
  if(!out) throw new Error('接口响应格式异常（模型名或服务地址不对？）');
  return String(out);
}

/* 加密备份：Web Crypto AES-256-GCM + PBKDF2。密码不落盘，仅用于派生密钥（150k 迭代）。 */
function cryptoAvailable(){ return !!(window.crypto && window.crypto.subtle); }
async function deriveKey(password, salt){
  const enc=new TextEncoder();
  const baseKey=await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:150000, hash:'SHA-256'},
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

/* 列模板（配置中心多套列结构）：{active:'名称', list:{名称:{schema:[],dropdowns:{},mapping:{}}}} */
function loadColTemplates(){ return load(LS_COL_TMPL, {active:'', list:{}}); }
function saveColTemplates(o){ save(LS_COL_TMPL, o); }
/* 应用一套列模板：覆盖当前 schema/dropdowns/colMapping 并持久化（供切换模板调用） */
function applyColTemplate(tpl){
  if(!tpl || !Array.isArray(tpl.schema) || !tpl.schema.length) throw new Error('模板缺少有效列定义');
  const oldSchema=schema.slice();
  schema = tpl.schema.map(c=>({name:String(c.name||'').trim(), type:String(c.type||'text'), def:String(c.def||''), id:(c.id||('col_'+String(c.name||'').trim())), dateFmt:(String(c.type||'text')==='date'?(c.dateFmt==='md'?'md':'ymd'):undefined)}));
  const rn=computeRenames(oldSchema, schema); if(rn.length) applyRenames(rn);
  dropdowns = (tpl.dropdowns && typeof tpl.dropdowns==='object') ? JSON.parse(JSON.stringify(tpl.dropdowns)) : {};
  save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns); save(LS_MAPPING,colMapping);
  // 仅当模板带非空映射时才覆盖导出映射（空映射=保留自动识别，避免误清记忆）
  if(tpl.mapping && typeof tpl.mapping==='object' && Object.keys(tpl.mapping).length){
    colMapping=JSON.parse(JSON.stringify(tpl.mapping)); save(LS_MAPPING,colMapping);
  }
}
function markBackup(){ save(LS_LASTBACKUP,Date.now()); }
function checkBackupReminder(){
  const lb=load(LS_LASTBACKUP,0); const days=(Date.now()-lb)/86400000;
  if(!lb){ setTimeout(()=>toast('首次使用，建议到「任务列表」导出任务库备份'),600); }
  else if(days>7){ setTimeout(()=>toast('距上次备份已 '+Math.floor(days)+' 天，建议导出备份任务库/配置'),600); }
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

/* ============ 列改名迁移（#2：改列名后历史任务不失联） ============ */
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

/* P10 修复：统一的「某年月的任务」筛选（列表/看板/月报共用，消除两处等价实现各自演进的漂移风险） */
function monthTasksOfYM(ts, y, m){
  return ts.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d.getFullYear()===y&&d.getMonth()+1===m;});
}
/* ============ 共享统计聚合（m12：避免看板/数据看板/列表口径漂移） ============ */
function aggregateTasks(ts, now){
  now=now||new Date();
  const y=now.getFullYear(), m=now.getMonth()+1;
  const monthTasks=monthTasksOfYM(ts,y,m);
  const closedMonth=monthTasks.filter(t=>String(t.values['完成状态']||'')===STATUS_DONE).length;
  const rate=monthTasks.length?Math.round(closedMonth/monthTasks.length*100):0;
  const closedAll=ts.filter(t=>String(t.values['完成状态']||'')===STATUS_DONE).length;
  const ongoing=ts.filter(t=>{const s=String(t.values['完成状态']||'').trim();return s&&!isTaskDone(t)&&s!==STATUS_PAUSE;}).length;
  const overdue=ts.filter(t=>isTaskOverdue(t,now)); // P9：与 monthTasks 共用同一参考日
  const byCust={}; ts.forEach(t=>{const c=(t.values['客户']||'').trim()||'未填';byCust[c]=byCust[c]||{total:0,closed:0};byCust[c].total++;if(String(t.values['完成状态']||'')===STATUS_DONE)byCust[c].closed++;});
  const bySt={}; ts.forEach(t=>{const s=String(t.values['完成状态']||'').trim()||'未填';bySt[s]=(bySt[s]||0)+1;});
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
  const v=t&&t.values?String(t.values['开发进度']||'').trim():'';
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
  const diff=Math.round((d2-d1)/86400000)+1;
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
  const d=new Date(ts); const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
/* 逾期判断：未结案/未取消/未暂停 且开发/提出日期早于今天（暂停=暂停，不催）
   P9 修复：ref 为参考日（默认今天）；aggregateTasks 传入同一个 now，
   保证「本月任务」与「逾期」使用同一参考日（此前 now 与全局 todayStr() 可能不同源） */
function isTaskOverdue(t, ref){
  const s=String(t.values['完成状态']||'').trim();
  if(s===STATUS_DONE || s===STATUS_CANCEL || s===STATUS_PAUSE) return false;
  const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
  const refStr=ref?toInputDate(ref):todayStr();
  return d && toInputDate(d) < refStr;
}
/* 是否"已了结"（结案或取消），用于排除出今日/进行中等口径 */
function isTaskDone(t){
  const s=String(t.values['完成状态']||'').trim();
  return s===STATUS_DONE || s===STATUS_CANCEL;
}
