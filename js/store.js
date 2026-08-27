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
function load(k,def){ try{const v=localStorage.getItem(k);return v?JSON.parse(v):def;}catch(e){return def;} }
function save(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ if(e.name==='QuotaExceededError'||e.code===22){ toast('本地存储已满！请删除部分数据或导出备份后清空'); } throw e; } }
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* ============ 默认列 schema（来自 DG周报20260817-20260821.xlsx） ============ */
const DEFAULT_SCHEMA=[
  {name:'项次',    type:'auto',     def:''},
  {name:'厂区',    type:'text',     def:'东莞'},
  {name:'提出日期', type:'date',     def:'{{today}}'},
  {name:'提出部门', type:'text',     def:'仓库'},
  {name:'客户',    type:'dropdown', def:''},
  {name:'专案名称', type:'text',     def:''},
  {name:'需求说明', type:'text',     def:''},
  {name:'负责人',  type:'text',     def:'黄崇璇'},
  {name:'开发进度', type:'textarea', def:''},
  {name:'完成状态', type:'dropdown', def:''},
  {name:'开发日期', type:'date',     def:'{{today}}'},
  {name:'测试日期', type:'date',     def:''},
  {name:'开发天数', type:'text',     def:'1天'},
  {name:'结案日期', type:'date',     def:''},
  {name:'备注',    type:'text',     def:''}
];
const DEFAULT_DROPDOWNS={
  '客户':['所有','N客户','太白山','其他'],
  '完成状态':['Ongoing','Closed','planning','暂停','取消']
};
/* 完成状态语义：结案与取消都视为"已了结"，不计逾期/今日/进行中 */
const STATUS_DONE='Closed';
const STATUS_CANCEL='取消';
const STATUS_PAUSE='暂停';

function guessType(name){
  if(name==='项次')return 'auto';
  if(['提出日期','开发日期','测试日期','结案日期'].includes(name))return 'date';
  if(name==='开发进度')return 'textarea';
  if(['客户','完成状态'].includes(name))return 'dropdown';
  return 'text';
}

function loadSchema(){
  let raw=load(LS_SCHEMA,null);
  let arr;
  if(!raw){
    arr=DEFAULT_SCHEMA.map(c=>({...c}));
  }else if(raw.some(c=>c.type==='default')){
    const oldDef=load('wb_defaults',{});
    arr=raw.map(c=> c.type==='default'
      ? {name:c.name, type:guessType(c.name), def:oldDef[c.name]||''}
      : {name:c.name, type:c.type, def:c.def||''});
  }else{
    arr=raw.map(c=>({...c, def:c.def||''}));
  }
  // 迁移：去掉历史遗留的「结案日志」列（结案不再要求写日志）
  arr=arr.filter(c=>c.name!=='结案日志');
  return arr;
}

/* ============ 全局状态 ============ */
let schema=loadSchema();
let dropdowns=load(LS_DROPDOWNS,JSON.parse(JSON.stringify(DEFAULT_DROPDOWNS)));
/* 迁移：老用户已存储的下拉可能缺新默认状态（暂停/取消），合并进去并持久化 */
(function(){
  if(!Array.isArray(dropdowns['完成状态'])) dropdowns['完成状态']=[];
  let changed=false;
  (DEFAULT_DROPDOWNS['完成状态']||[]).forEach(s=>{ if(!dropdowns['完成状态'].includes(s)){ dropdowns['完成状态'].push(s); changed=true; } });
  if(changed) save(LS_DROPDOWNS,dropdowns);
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
function parseDateAny(v){
  if(!v)return null;
  if(v instanceof Date)return v;
  let s=String(v).trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){const [y,m,d]=s.split('-').map(Number);const x=new Date(y,m-1,d);return (x.getFullYear()===y&&x.getMonth()+1===m&&x.getDate()===d)?x:null;}
  if(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)){const [y,m,d]=s.split('/').map(Number);const x=new Date(y,m-1,d);return (x.getFullYear()===y&&x.getMonth()+1===m&&x.getDate()===d)?x:null;}
  if(/^\d{1,2}\/\d{1,2}$/.test(s)){const [m,d]=s.split('/').map(Number);const x=new Date(new Date().getFullYear(),m-1,d);return (x.getMonth()+1===m&&x.getDate()===d)?x:null;}
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
  schema = tpl.schema.map(c=>({name:String(c.name||'').trim(), type:String(c.type||'text'), def:String(c.def||'')}));
  dropdowns = (tpl.dropdowns && typeof tpl.dropdowns==='object') ? JSON.parse(JSON.stringify(tpl.dropdowns)) : {};
  save(LS_SCHEMA,schema); save(LS_DROPDOWNS,dropdowns);
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
  return names.find(n=>norm(n).includes(norm(h))||norm(h).includes(norm(n)))||null;
}

/* 解析某 excel 表头实际映射到的本工具列名。
   规则：colMapping 中显式存在的值优先（含用户手动选的「不导出」空串）；未出现的表头才回退到自动匹配。
   这样「不导出」能真正生效，避免 colMapping[h]||matchCol(h) 把空串又匹配回去的旧问题。 */
function effMap(h){ return (h in colMapping) ? (colMapping[h]||'') : (matchCol(h)||''); }

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
/* 子任务文本 <-> 数组：每行一条，行首「✓ 」或「[x] 」= 已完成 */
function parseSubtasks(text){
  return String(text||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>{
    const m=/^(?:✓|[xX]\]?)\s*/.exec(s);
    if(m && (s[0]==='✓'||s[0]==='[')) return {text:s.slice(m[0].length).trim(), done:true};
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
/* 逾期判断：未结案/未取消/未暂停 且开发/提出日期早于今天（暂停=暂停，不催） */
function isTaskOverdue(t){
  const s=String(t.values['完成状态']||'').trim();
  if(s===STATUS_DONE || s===STATUS_CANCEL || s===STATUS_PAUSE) return false;
  const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
  return d && toInputDate(d) < todayStr();
}
/* 是否"已了结"（结案或取消），用于排除出今日/进行中等口径 */
function isTaskDone(t){
  const s=String(t.values['完成状态']||'').trim();
  return s===STATUS_DONE || s===STATUS_CANCEL;
}
