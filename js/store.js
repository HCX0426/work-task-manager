/* ============ 存储与全局状态（store.js） ============ */
const LS_SCHEMA='wb_schema', LS_DROPDOWNS='wb_dropdowns', LS_TASKS='wb_tasks', LS_TRASH='wb_trash', LS_LASTBACKUP='wb_lastbackup', LS_MAPPING='wb_mapping', LS_EXPORTCFG='wb_exportcfg';

/* 默认设置（配置中心可改默认，各页面运行时临时可覆盖单次） */
const DEF_SETTINGS={
  copyRowStyle:true,            // 导出：对齐上一行样式
  appendMode:'group',           // 导出：追加模式（末尾/分组）
  rangeBy:'开发日期',           // 导出：范围日期类型（entryDate/提出日期/开发日期）
  listSortBy:'devDate',         // 列表：排序依据（date/status/cust/devDate）
  listSortDir:'desc',           // 列表：排序方向（asc/desc）
  monthDedup:true,              // 月报：去重
  weeklyFields:['客户','专案名称','需求说明','开发进度'], // 周报段落包含字段
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
  '完成状态':['Ongoing','Closed','planning']
};

function guessType(name){
  if(name==='项次')return 'auto';
  if(['提出日期','开发日期','测试日期','结案日期'].includes(name))return 'date';
  if(name==='开发进度')return 'textarea';
  if(['客户','完成状态'].includes(name))return 'dropdown';
  return 'text';
}

function loadSchema(){
  let raw=load(LS_SCHEMA,null);
  if(!raw)return DEFAULT_SCHEMA.map(c=>({...c}));
  if(raw.some(c=>c.type==='default')){
    const oldDef=load('wb_defaults',{});
    return raw.map(c=> c.type==='default'
      ? {name:c.name, type:guessType(c.name), def:oldDef[c.name]||''}
      : {name:c.name, type:c.type, def:c.def||''});
  }
  return raw.map(c=>({...c, def:c.def||''}));
}

/* ============ 全局状态 ============ */
let schema=loadSchema();
let dropdowns=load(LS_DROPDOWNS,JSON.parse(JSON.stringify(DEFAULT_DROPDOWNS)));
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
