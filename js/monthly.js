/* ============ 月报汇总（monthly.js） ============ */
function setMonthDefault(){
  const now=new Date();
  const p=n=>String(n).padStart(2,'0');
  $('#monthPick').value=now.getFullYear()+'-'+p(now.getMonth()+1);
}
function getMonthlyData(){
  const mv=$('#monthPick').value;
  if(!mv)return [];
  const dedup=$('#mf_dedup') ? $('#mf_dedup').checked : true; // 去重开关（配置默认，可临时改）
  const seen={}, out=[];
  // m12 修复：复用 monthTasksOf 做"按录入月份筛选"，避免与下方重复实现
  monthTasksOf(mv).forEach(t=>{
    const name=(t.values['专案名称']||'').trim();
    if(name && (!dedup || !seen[name])){ seen[name]=true; out.push({name, 客户:t.values['客户']||'', 负责人:t.values['负责人']||'', 完成状态:t.values['完成状态']||''}); }
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
  const closed=data.filter(r=>String(r.完成状态||'')===STATUS_DONE).length;
  const rate=data.length?Math.round(closed/data.length*100):0;
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
  box.textContent='【'+mv+'】共 '+data.length+' 个专案，完成 '+closed+' 个，完成率 '+rate+'%\n\n'+lines.join('\n');
  genReview();
}
$('#monthPick').onchange=renderMonthly;
$('#monthThis').onclick=()=>{ setMonthDefault(); renderMonthly(); };
['mf_cust','mf_owner','mf_status','mf_dedup'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=renderMonthly; });
/* 月报设置初始化（去重开关 / 周报字段）来自配置中心默认 */
(function(){
  const st=loadSettings();
  const d=$('#mf_dedup'); if(d) d.checked=!!st.monthDedup;
  document.querySelectorAll('.wkField').forEach(cb=>{ cb.checked=(st.weeklyFields||[]).includes(cb.value); cb.onchange=()=>{ const fields=[...document.querySelectorAll('.wkField:checked')].map(x=>x.value); const cfg=load(LS_EXPORTCFG,{})||{}; cfg.weeklyFields=fields; save(LS_EXPORTCFG,cfg); genWeekly(); }; });
})();
$('#exportMonthly').onclick=()=>{
  const data=getMonthlyData();
  if(!data.length){toast('该月没有可汇总的任务');return;}
  const mv=$('#monthPick').value||'monthly';
  const closed=data.filter(r=>String(r.完成状态||'')===STATUS_DONE).length;
  const rate=data.length?Math.round(closed/data.length*100):0;
  const head='【'+mv+'】共 '+data.length+' 个专案，完成 '+closed+' 个，完成率 '+rate+'%';
  const text=head+'\n\n'+data.map((r,i)=>{
    let s=(i+1)+'. '+r.name;
    const extras=[];
    if($('#mf_cust').checked&&r.客户)extras.push('客户：'+r.客户);
    if($('#mf_owner').checked&&r.负责人)extras.push('负责人：'+r.负责人);
    if($('#mf_status').checked&&r.完成状态)extras.push('状态：'+r.完成状态);
    if(extras.length)s+='（'+extras.join('，')+'）';
    return s;
  }).join('\n');
  const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
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
  // 底部汇总行
  const closed=data.filter(r=>String(r.完成状态||'')===STATUS_DONE).length;
  const rate=data.length?Math.round(closed/data.length*100):0;
  const sumRow=ws.addRow(['', '合计：'+data.length+' 个专案，完成 '+closed+' 个，完成率 '+rate+'%']);
  sumRow.eachCell(cell=>{ cell.font=EXCEL_FONT; cell.alignment={vertical:'top'}; });
  const out=await wb.xlsx.writeBuffer();
  const mv=$('#monthPick').value||'monthly';
  downloadBlob(new Blob([out],{type:'application/octet-stream'}),'月报汇总_'+mv+'.xlsx');
  toast('已导出Excel');
};

/* H. 周报段落预览/打印 */
function genWeekly(){
  const s=$('#wpStart').value,e=$('#wpEnd').value;
  if(!s||!e){$('#wpText').value='';return;}
  const st=parseDateAny(s), en=parseDateAny(e);
  if(!st||!en){ $('#wpText').value='日期格式无效'; return; }
  st.setHours(0,0,0,0); en.setHours(23,59,59,999);
  const list=tasks.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d>=st&&d<=en;}).sort((a,b)=>a.entryDate.localeCompare(b.entryDate));
  if(!list.length){$('#wpText').value='该范围内没有任务。';return;}
  let out='本周工作小结（'+s+' ~ '+e+'）：\n';
  // 段落包含字段（按勾选，来自配置默认，可临时改）
  const fields=[...document.querySelectorAll('.wkField:checked')].map(cb=>cb.value);
  const show=n=>fields.includes(n);
  list.forEach(t=>{
    const v=t.values;
    const parts=[];
    if(show('客户')&&v['客户'])parts.push('客户：'+v['客户']);
    if(show('专案名称')&&v['专案名称'])parts.push(v['专案名称']);
    if(show('需求说明')&&v['需求说明'])parts.push('（'+v['需求说明']+'）');
    if(show('开发进度')&&v['开发进度'])parts.push('进度：'+v['开发进度'].replace(/\n/g,'；'));
    if(show('负责人')&&v['负责人'])parts.push('负责人：'+v['负责人']);
    if(show('完成状态')&&v['完成状态'])parts.push('状态：'+v['完成状态']);
    out+='· '+parts.join(' ')+'\n';
  });
  $('#wpText').value=out;
}
function setDefaultRangeWp(){
  const {start}=weekRange();
  const fri=new Date(start); fri.setDate(start.getDate()+4);
  $('#wpStart').value=toInputDate(start);
  $('#wpEnd').value=toInputDate(fri);
}
function fallbackCopy(txt){ const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){} ta.remove();toast('已复制'); }
$('#wpStart').onchange=genWeekly;
$('#wpEnd').onchange=genWeekly;
$('#wpThisWeek').onclick=()=>{ setDefaultRangeWp(); genWeekly(); };
$('#wpThisMonth').onclick=()=>{ const now=new Date();const p=n=>String(n).padStart(2,'0'); const y=now.getFullYear(),m=now.getMonth()+1; const first=y+'-'+p(m)+'-01'; const last=new Date(y,m+1,0); $('#wpStart').value=first; $('#wpEnd').value=toInputDate(last); genWeekly(); };
$('#wpCopy').onclick=()=>{ const txt=$('#wpText').value; if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>toast('已复制'),()=>fallbackCopy(txt));}else fallbackCopy(txt); };
$('#wpPrint').onclick=()=>{ const txt=$('#wpText').value; const w=window.open('','_blank'); if(!w){toast('浏览器拦截了打印窗口');return;} const p=w.document.createElement('pre'); p.style.cssText='font-family:inherit;white-space:pre-wrap;padding:24px;line-height:1.7'; p.textContent=txt; w.document.body.appendChild(p); w.document.title='周报段落'; setTimeout(()=>{w.focus();w.print();},100); };

/* 周报段落一键导出 Word（.doc，Word/WPS 可直接打开） */
$('#wpWord').onclick=()=>{
  const txt=$('#wpText').value;
  if(!txt || !txt.trim() || txt==='该范围内没有任务。'){ toast('请先在上方选择日期范围生成周报段落'); return; }
  const s=$('#wpStart').value, e=$('#wpEnd').value;
  const body=txt.split('\n').map(line=>{
    const t=line.trim();
    if(!t) return '<p style="margin:6pt 0">&nbsp;</p>';
    if(/^本周工作小结/.test(t)) return '<h3 style="font-size:14pt;margin:12pt 0 6pt">'+esc(t)+'</h3>';
    return '<p style="margin:2pt 0;line-height:1.7">'+esc(t)+'</p>';
  }).join('\n');
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>工作周报</title></head>
<body style="font-family:微软雅黑,Arial,sans-serif;font-size:12pt;color:#222">
<h1 style="text-align:center;font-size:18pt;margin:6pt 0 2pt">工作周报</h1>
<p style="text-align:center;color:#666;font-size:10.5pt;margin-bottom:14pt">时间范围：${s} ~ ${e}</p>
${body}
<p style="color:#999;font-size:9pt;margin-top:24pt;border-top:1px solid #e3e6eb;padding-top:6pt">由「工作任务管理」生成 · 数据存于本地浏览器</p>
</body></html>`;
  const blob=new Blob(['\ufeff'+html],{type:'application/msword'});
  downloadBlob(blob,'工作周报_'+todayStr()+'.doc');
  toast('已导出 Word 周报（.doc）');
};

/* ============ 月度复盘总结：按所选月份生成完成/进行中/待处理 + 关键产出 ============ */
function monthTasksOf(mv){
  if(!mv) return [];
  const [y,m]=mv.split('-').map(Number);
  return monthTasksOfYM(tasks, y, m); // ⑧ 修复：统一到 store.js 的 monthTasksOfYM，消除两处等价实现漂移
}
function genReview(){
  const mv=$('#monthPick').value;
  const box=$('#reviewText'); if(!box) return;
  const msg=$('#reviewMsg');
  if(!mv){ box.value=''; if(msg)msg.textContent=''; return; }
  const mon=monthTasksOf(mv);
  if(!mon.length){ box.value='该月没有任务数据。'; if(msg)msg.textContent=''; return; }
  const today0=new Date(); today0.setHours(0,0,0,0);
  const closed=[], doing=[], pending=[], paused=[], cancelled=[];
  mon.forEach(t=>{
    const s=String(t.values['完成状态']||'').trim();
    if(s===STATUS_DONE) closed.push(t);
    else if(s===STATUS_CANCEL) cancelled.push(t);
    else if(s===STATUS_PAUSE) paused.push(t);
    else if(s.toLowerCase()==='ongoing') doing.push(t);
    else pending.push(t);
  });
  const overdue=pending.filter(t=>{ const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']); return d && d<today0; }).length;
  const [y2,m2]=mv.split('-').map(Number);
  const line=t=>{
    const name=String(t.values['专案名称']||'').trim()||'未命名任务';
    const cust=String(t.values['客户']||'').trim();
    const prog=String(t.values['开发进度']||'').trim().split('\n')[0];
    const head=[name, cust?('['+cust+']'):''].filter(Boolean).join(' ');
    return prog ? '· '+head+'｜'+prog : '· '+head;
  };
  const sec=(title,arr)=> arr.length ? '\n▎'+title+'（'+arr.length+'）\n'+arr.map(line).join('\n') : '';
  box.value=`【${y2}年${m2}月 月度复盘】\n`
    +`本月录入 ${mon.length} 项，完成 ${closed.length} 项，完成率 ${mon.length?Math.round(closed.length/mon.length*100):0}%`
    +sec('已完成', closed)
    +sec('进行中', doing)
    +sec('待处理（含逾期 '+overdue+' 项）', pending)
    +sec('已暂停', paused)
    +sec('已取消', cancelled)
    +`\n\n复盘要点（可自行补充）：\n`;
  if(msg) msg.textContent=`完成 ${closed.length} · 进行中 ${doing.length} · 待处理 ${pending.length}${paused.length?' · 已暂停 '+paused.length:''}${cancelled.length?' · 已取消 '+cancelled.length:''}`;
}
$('#genReview').onclick=genReview;
$('#reviewCopy').onclick=()=>{
  const txt=$('#reviewText').value;
  if(!txt || !txt.trim()){ toast('请先生成月度复盘'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(()=>toast('已复制'),()=>fallbackCopy(txt)); }
  else fallbackCopy(txt);
};
$('#reviewWord').onclick=()=>{
  const txt=$('#reviewText').value;
  if(!txt || !txt.trim()){ toast('请先生成月度复盘'); return; }
  const mv=$('#monthPick').value||'month';
  const body=txt.split('\n').map(l=>{
    const t=l.trim();
    if(!t) return '<p style="margin:4pt 0">&nbsp;</p>';
    if(/^【/.test(t)) return '<h3 style="font-size:14pt;margin:10pt 0 4pt">'+esc(t)+'</h3>';
    if(/^▎/.test(t)) return '<h4 style="font-size:12pt;margin:8pt 0 3pt;color:#2f6fed">'+esc(t)+'</h4>';
    return '<p style="margin:1.5pt 0;line-height:1.7">'+esc(t)+'</p>';
  }).join('\n');
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>月度复盘</title></head>
<body style="font-family:微软雅黑,Arial,sans-serif;font-size:12pt;color:#222">
<h1 style="text-align:center;font-size:18pt;margin:6pt 0 2pt">月度复盘</h1>
<p style="text-align:center;color:#666;font-size:10.5pt;margin-bottom:12pt">${mv}</p>
${body}
<p style="color:#999;font-size:9pt;margin-top:24pt;border-top:1px solid #e3e6eb;padding-top:6pt">由「工作任务管理」生成 · 数据存于本地浏览器</p>
</body></html>`;
  const blob=new Blob(['\ufeff'+html],{type:'application/msword'});
  downloadBlob(blob,'月度复盘_'+mv+'.doc');
  toast('已导出 Word（.doc）');
};
