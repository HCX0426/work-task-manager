/* ============ 月报汇总（monthly.js） ============ */
function setMonthDefault(){
  const now=new Date();
  const p=n=>String(n).padStart(2,'0');
  $('#monthPick').value=now.getFullYear()+'-'+p(now.getMonth()+1);
}
function getMonthlyData(){
  const mv=$('#monthPick').value;
  if(!mv)return [];
  const [y,m]=mv.split('-').map(Number);
  const seen={}, out=[];
  tasks.forEach(t=>{
    const d=parseDateAny(t.entryDate); if(!d)return;
    if(d.getFullYear()===y && d.getMonth()+1===m){
      const name=(t.values['专案名称']||'').trim();
      if(name && !seen[name]){ seen[name]=true; out.push({name, 客户:t.values['客户']||'', 负责人:t.values['负责人']||'', 完成状态:t.values['完成状态']||''}); }
    }
  });
  return out;
}
function renderMonthly(){
  const data=getMonthlyData();
  const mv=$('#monthPick').value;
  const totalTasks=tasks.filter(t=>{const d=parseDateAny(t.entryDate);if(!mv||!d)return false;const[y,m]=mv.split('-').map(Number);return d.getFullYear()===y&&d.getMonth()+1===m;}).length;
  $('#monthCount').textContent='（该月共 '+totalTasks+' 条任务）';
  $('#monthListCount').textContent='（去重后 '+data.length+' 个）';
  const box=$('#monthResult');
  if(!data.length){ box.textContent='该月没有可汇总的任务（需先在「每日录入」录过且填了专案名称）。'; return; }
  const showCust=$('#mf_cust').checked, showOwner=$('#mf_owner').checked, showStatus=$('#mf_status').checked;
  const lines=data.map((r,i)=>{
    let s=(i+1)+'. '+r.name;
    const extras=[];
    if(showCust&&r.客户)extras.push('客户：'+r.客户);
    if(showOwner&&r.负责人)extras.push('负责人：'+r.负责人);
    if(showStatus&&r.完成状态)extras.push('状态：'+r.完成状态);
    if(extras.length)s+='（'+extras.join('，')+'）';
    return s;
  });
  box.textContent=lines.join('\n');
}
$('#monthPick').onchange=renderMonthly;
$('#monthThis').onclick=()=>{ setMonthDefault(); renderMonthly(); };
['mf_cust','mf_owner','mf_status'].forEach(id=>$('#'+id).onchange=renderMonthly);
$('#exportMonthly').onclick=()=>{
  const data=getMonthlyData();
  if(!data.length){toast('该月没有可汇总的任务');return;}
  const text=data.map((r,i)=>{
    let s=(i+1)+'. '+r.name;
    const extras=[];
    if($('#mf_cust').checked&&r.客户)extras.push('客户：'+r.客户);
    if($('#mf_owner').checked&&r.负责人)extras.push('负责人：'+r.负责人);
    if($('#mf_status').checked&&r.完成状态)extras.push('状态：'+r.完成状态);
    if(extras.length)s+='（'+extras.join('，')+'）';
    return s;
  }).join('\n');
  const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
  const mv=$('#monthPick').value||'monthly';
  downloadBlob(blob,'月报汇总_'+mv+'.txt');
  toast('已导出纯文本');
};
$('#exportMonthlyXlsx').onclick=async ()=>{
  const data=getMonthlyData();
  if(!data.length){toast('该月没有可汇总的任务');return;}
  const cols=['序号','专案名称'];
  if($('#mf_cust').checked)cols.push('客户');
  if($('#mf_owner').checked)cols.push('负责人');
  if($('#mf_status').checked)cols.push('完成状态');
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('月报汇总');
  const hrow=ws.getRow(1);
  cols.forEach((cn,i)=>{ const cell=hrow.getCell(i+1); cell.value=cn; cell.font=EXCEL_FONT; cell.alignment={vertical:'top'}; });
  data.forEach((r,i)=>{
    const rowVals=cols.map(cn=>{
      if(cn==='序号')return i+1;
      if(cn==='专案名称')return r.name;
      if(cn==='客户')return r.客户;
      if(cn==='负责人')return r.负责人;
      if(cn==='完成状态')return r.完成状态;
      return '';
    });
    const row=ws.addRow(rowVals);
    row.eachCell(cell=>{ cell.font=EXCEL_FONT; cell.alignment={vertical:'top'}; });
  });
  const out=await wb.xlsx.writeBuffer();
  const mv=$('#monthPick').value||'monthly';
  downloadBlob(new Blob([out],{type:'application/octet-stream'}),'月报汇总_'+mv+'.xlsx');
  toast('已导出Excel');
};

/* H. 周报段落预览/打印 */
function genWeekly(){
  const s=$('#wpStart').value,e=$('#wpEnd').value;
  if(!s||!e){$('#wpText').value='';return;}
  const st=parseDateAny(s); if(st)st.setHours(0,0,0,0);
  const en=parseDateAny(e); if(en)en.setHours(23,59,59,999);
  const list=tasks.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d>=st&&d<=en;}).sort((a,b)=>a.entryDate.localeCompare(b.entryDate));
  if(!list.length){$('#wpText').value='该范围内没有任务。';return;}
  let out='本周工作小结（'+s+' ~ '+e+'）：\n';
  list.forEach(t=>{
    const v=t.values;
    const parts=[];
    if(v['客户'])parts.push('客户：'+v['客户']);
    if(v['专案名称'])parts.push(v['专案名称']);
    if(v['需求说明'])parts.push('（'+v['需求说明']+'）');
    if(v['开发进度'])parts.push('进度：'+v['开发进度'].replace(/\n/g,'；'));
    out+='· '+parts.join(' ')+'\n';
  });
  $('#wpText').value=out;
}
function setDefaultRangeWp(){
  const now=new Date();const day=now.getDay();const diff=(day===0?-6:1-day);
  const mon=new Date(now);mon.setDate(now.getDate()+diff);const fri=new Date(mon);fri.setDate(mon.getDate()+4);
  $('#wpStart').value=toInputDate(mon);$('#wpEnd').value=toInputDate(fri);
}
function fallbackCopy(txt){ const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){} ta.remove();toast('已复制'); }
$('#wpStart').onchange=genWeekly;
$('#wpEnd').onchange=genWeekly;
$('#wpThisWeek').onclick=()=>{ setDefaultRangeWp(); genWeekly(); };
$('#wpThisMonth').onclick=()=>{ const now=new Date();const p=n=>String(n).padStart(2,'0'); const y=now.getFullYear(),m=now.getMonth()+1; const first=y+'-'+p(m)+'-01'; const last=new Date(y,m,0); $('#wpStart').value=first; $('#wpEnd').value=toInputDate(last); genWeekly(); };
$('#wpCopy').onclick=()=>{ const txt=$('#wpText').value; if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>toast('已复制'),()=>fallbackCopy(txt));}else fallbackCopy(txt); };
$('#wpPrint').onclick=()=>{ const txt=$('#wpText').value; const w=window.open('','_blank'); if(!w){toast('浏览器拦截了打印窗口');return;} w.document.write('<pre style="font-family:inherit;white-space:pre-wrap;padding:24px;line-height:1.7">'+esc(txt)+'</pre>'); w.document.title='周报段落'; w.document.close(); w.focus(); w.print(); };
