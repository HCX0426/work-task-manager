/* ============ 数据看板（dashboard.js） ============ */
/* 汇总全部统计：看板渲染与 PDF 汇报共用同一数据源，避免口径不一致 */
function getDashboardData(){
  // m12 修复：复用 store.aggregateTasks，避免与列表统计/今日待办口径漂移；返回结构保持不变
  const agg=aggregateTasks(tasks);
  const {total, y, m, monthTasks, closedMonth, rate, ongoing, closedAll, overdueCount, overdue, byCust, bySt}=agg;
  const now=new Date();
  // 近 6 个月趋势
  const trend=[];
  for(let i=5;i>=0;i--){
    const d=new Date(y,m-1-i,1);
    const yy=d.getFullYear(), mm=d.getMonth()+1;
    const n=tasks.filter(t=>{const x=parseDateAny(t.entryDate);return x&&x.getFullYear()===yy&&x.getMonth()+1===mm;}).length;
    trend.push({mm,n});
  }
  // 逾期清单（按逾期天数升序）
  const today0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const overdueList=overdue.slice().sort((a,b)=>{
    const da=parseDateAny(a.values['开发日期'])||parseDateAny(a.values['提出日期']);
    const db=parseDateAny(b.values['开发日期'])||parseDateAny(b.values['提出日期']);
    return (da?da.getTime():0)-(db?db.getTime():0);
  }).map(t=>{
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    const d0=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    return {name:t.values['专案名称']||'未命名', cust:t.values['客户']||'', days:Math.max(1,Math.round((today0-d0)/86400000))};
  });
  return {total, y, m, monthCount:monthTasks.length, closedMonth, rate, ongoing, closedAll, overdueCount, trend, byCust, bySt, overdueList, monthTasks};
}

/* 平均开发天数：开发日期~结案日期（含首尾），取所有已填两者的任务均值 */
function avgDevDays(){
  const days=[];
  tasks.forEach(t=>{
    const n=calcDevDays(parseDateAny(t.values['开发日期']), parseDateAny(t.values['结案日期']));
    if(n!=null) days.push(n);
  });
  if(!days.length) return null;
  return Math.round(days.reduce((a,b)=>a+b,0)/days.length);
}

/* 数据健康检查：列出缺失关键字段的任务 */
function getHealthIssues(){
  const issues=[];
  tasks.forEach(t=>{
    const v=t.values||{};
    const name=String(v['专案名称']||'').trim()||'(未填专案)';
    const st=String(v['完成状态']||'').trim();
    if(!String(v['专案名称']||'').trim()) issues.push({name, why:'缺「专案名称」（月报无法统计）'});
    if(st===STATUS_DONE && !String(v['结案日期']||'').trim()) issues.push({name, why:'已完成但缺「结案日期」'});
    if(st===STATUS_DONE && !String(v['开发日期']||'').trim() && !String(v['提出日期']||'').trim()) issues.push({name, why:'已完成但缺日期'});
    if(String(v['开发进度']||'').trim() && st==='' ) issues.push({name, why:'有进度但状态未填'});
  });
  return issues;
}

/* 本地存储用量 */
function getStorageInfo(){
  try{
    let total=0;
    const keys=[LS_TASKS,LS_TRASH,LS_SCHEMA,LS_DROPDOWNS,LS_EXPORTCFG,LS_MAPPING,LS_COL_TMPL,LS_LASTBACKUP,'wb_draft','wb_theme'];
    const sizes={};
    keys.forEach(k=>{ const v=localStorage.getItem(k); if(v){ sizes[k]=v.length*2; total+=v.length*2; } });
    return {total, sizes, bytes:total};
  }catch(e){ return null; }
}

function renderDashboard(){
  const d=getDashboardData();
  const avg=avgDevDays();
  $('#dashKpis').innerHTML=`
    <div class="stat"><div class="num">${d.total}</div><div class="lab">任务总数</div></div>
    <div class="stat"><div class="num">${d.monthCount}</div><div class="lab">本月任务</div></div>
    <div class="stat"><div class="num">${d.rate}%</div><div class="lab">本月完成率</div></div>
    <div class="stat"><div class="num">${d.ongoing}</div><div class="lab">未结案</div></div>
    <div class="stat"><div class="num">${d.closedAll}</div><div class="lab">已结案</div></div>
    <div class="stat"><div class="num">${avg!=null?avg+'天':'—'}</div><div class="lab">平均开发天数</div></div>
    <div class="stat${d.overdueCount?' warn':''}"><div class="num">${d.overdueCount}</div><div class="lab">逾期未完成</div></div>`;

  // 任务趋势
  const maxN=Math.max(1,...d.trend.map(t=>t.n));
  $('#dashTrend').innerHTML=d.trend.map(t=>{
    const pct=Math.round(t.n/maxN*100);
    return `<div class="t-col"><div class="t-val">${t.n}</div><div class="t-bar${t.n?'':' zero'}" style="height:${pct}%"></div><div class="t-lab">${t.mm}月</div></div>`;
  }).join('');

  // 按客户：数量 + 完成率
  const custArr=Object.entries(d.byCust).sort((a,b)=>b[1].total-a[1].total);
  $('#dashCust').innerHTML=custArr.length
    ? custArr.map(([k,v])=>{
        const r=v.total?Math.round(v.closed/v.total*100):0;
        return `<div class="cust-row"><span class="cust-name" title="${esc(k)}">${esc(k)}</span><div class="cust-bar"><i style="width:${r}%"></i></div><span class="cust-rate">${r}%</span><span class="cust-n muted">${v.closed}/${v.total}</span></div>`;
      }).join('')
    : '<p class="muted" style="padding:20px 0;text-align:center">暂无任务</p>';

  // 按完成状态分布
  const stArr=Object.entries(d.bySt).sort((a,b)=>b[1]-a[1]);
  const stMax=Math.max(1,...stArr.map(x=>x[1]));
  $('#dashStatus').innerHTML=stArr.length
    ? stArr.map(([k,n])=>`<div class="dash-bar-row"><span class="bk">${esc(k)}</span><div class="bt"><i style="width:${Math.round(n/stMax*100)}%"></i></div><span class="bn">${n}</span></div>`).join('')
    : '<p class="muted" style="padding:20px 0;text-align:center">暂无任务</p>';

  // 逾期清单
  $('#dashOverdue').innerHTML=d.overdueList.length
    ? d.overdueList.map(x=>`<div class="dash-over-item"><span class="od-name">${esc(x.name)}</span><span class="od-meta">${esc(x.cust)}</span><span class="od-days">逾期 ${x.days} 天</span></div>`).join('')
    : '<div class="dash-overdue-empty">✓ 没有逾期未完成的任务</div>';

  // 数据健康检查
  const issues=getHealthIssues();
  $('#dashHealth').innerHTML=issues.length
    ? `<div class="dash-overdue-empty" style="color:var(--warn);padding:6px 0 10px">发现 ${issues.length} 处可优化项：</div>`+issues.slice(0,8).map(x=>`<div class="dash-over-item"><span class="od-name">${esc(x.name)}</span><span class="od-meta">${esc(x.why)}</span></div>`).join('')+(issues.length>8?`<div class="muted" style="margin-top:6px">…还有 ${issues.length-8} 项，到任务列表补全即可</div>`:'')
    : '<div class="dash-overdue-empty">✓ 数据健康，关键字段都齐</div>';

  // 本地存储用量
  const st=getStorageInfo();
  $('#dashStorage').innerHTML=st!=null
    ? `<div class="dash-over-item"><span class="od-name">本地数据占用</span><span class="od-meta">${(st.total/1024).toFixed(1)} KB（约 ${st.total} 字节）</span></div><div class="dash-over-item"><span class="od-name">浏览器配额约 5MB</span><span class="od-meta">${(st.total/1048576/5*100).toFixed(1)}% 已用</span></div><p class="muted" style="margin-top:8px">占用过高时建议「任务列表 → 全量备份」后清理旧数据。</p>`
    : '<div class="dash-overdue-empty">无法读取存储用量</div>';

  renderYearBox();
}

/* ============ 年度/季度汇总对比：按录入月份聚合，全年+分季度 ============ */
function renderYearBox(){
  const sel=$('#dashYearSel'); if(!sel)return;
  const curY=new Date().getFullYear();
  const prev=sel.value?+sel.value:curY; // 重建下拉前记住当前选择
  const years=[];
  tasks.forEach(t=>{ const d=parseDateAny(t.entryDate); if(d&&!years.includes(d.getFullYear())) years.push(d.getFullYear()); });
  if(!years.includes(curY)) years.push(curY);
  years.sort((a,b)=>b-a);
  const cur=years.includes(prev)?prev:curY;
  sel.innerHTML=years.map(y=>`<option value="${y}"${y===cur?' selected':''}>${y}年</option>`).join('');
  const body=$('#dashYearBody');
  if(!tasks.length){ body.innerHTML='<p class="muted" style="padding:14px 0;text-align:center">暂无任务数据</p>'; return; }
  // 月度聚合
  const months=[];
  for(let m=1;m<=12;m++){
    const list=tasks.filter(t=>{ const d=parseDateAny(t.entryDate); return d&&d.getFullYear()===cur&&d.getMonth()+1===m; });
    const closed=list.filter(t=>String(t.values['完成状态']||'')===STATUS_DONE).length;
    months.push({m, n:list.length, closed, rate:list.length?Math.round(closed/list.length*100):null});
  }
  // 季度聚合
  const qDefs=[['Q1',1,2,3],['Q2',4,5,6],['Q3',7,8,9],['Q4',10,11,12]];
  const qRows=qDefs.map(([label,a,b,c])=>{
    const seg=months.filter(mm=>mm.m>=a&&mm.m<=c);
    const n=seg.reduce((s,mm)=>s+mm.n,0);
    const closed=seg.reduce((s,mm)=>s+mm.closed,0);
    return `<tr class="q-row"><td style="text-align:center"><b>${label}</b><span class="muted">（${a}-${c}月）</span></td><td class="c"><b>${n}</b></td><td class="c">${closed}</td><td class="c">${n?Math.round(closed/n*100)+'%':'—'}</td></tr>`;
  }).join('');
  const yearN=months.reduce((s,m)=>s+m.n,0);
  const yearClosed=months.reduce((s,m)=>s+m.closed,0);
  const monthRows=months.map(m=>`<tr><td style="text-align:center">${m.m}月</td><td class="c">${m.n}</td><td class="c">${m.closed}</td><td class="c">${m.rate==null?'—':m.rate+'%'}</td></tr>`).join('');
  body.innerHTML=`
  <table>
    <thead><tr><th style="width:110px">月份</th><th class="c">任务数</th><th class="c">已完成</th><th class="c">完成率</th></tr></thead>
    <tbody>
      ${monthRows}
      <tr class="total-row"><td style="text-align:center"><b>${cur}年合计</b></td><td class="c"><b>${yearN}</b></td><td class="c">${yearClosed}</td><td class="c">${yearN?Math.round(yearClosed/yearN*100)+'%':'—'}</td></tr>
      ${qRows}
    </tbody>
  </table>`;
}
$('#dashYearSel').onchange=renderYearBox;

/* ============ 导出 PDF 汇报（打印成 PDF，中文渲染完美、零外部依赖） ============ */
function exportReportPDF(){
  const d=getDashboardData();
  const p=n=>String(n).padStart(2,'0');
  const dateStr=d.y+'-'+p(d.m)+'-'+p(new Date().getDate());
  const title='工作任务管理 · 月度汇报';
  // 各图表区 HTML
  const maxN=Math.max(1,...d.trend.map(t=>t.n));
  const trendHtml=d.trend.map(t=>{
    const pct=t.n?Math.round(t.n/maxN*100):2;
    return `<div class="trend-col"><div class="trend-val">${t.n}</div><div class="trend-bar" style="height:${pct}%"></div><div class="trend-lab">${t.mm}月</div></div>`;
  }).join('');
  const custArr=Object.entries(d.byCust).sort((a,b)=>b[1].total-a[1].total);
  const custHtml=custArr.map(([k,v])=>{
    const r=v.total?Math.round(v.closed/v.total*100):0;
    return `<tr><td>${esc(k)}</td><td class="c">${v.total}</td><td class="c">${v.closed}</td><td class="c">${r}%</td></tr>`;
  }).join('');
  const stArr=Object.entries(d.bySt).sort((a,b)=>b[1]-a[1]);
  const stHtml=stArr.map(([k,n])=>`<tr><td>${esc(k)}</td><td class="c">${n}</td></tr>`).join('');
  const overdueHtml=d.overdueList.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.cust)}</td><td class="c">${x.days} 天</td></tr>`).join('');
  // 本月任务明细（按开发日期排）
  const cols=schema.filter(c=>c.type!=='auto' && ['专案名称','客户','负责人','完成状态','开发日期','开发进度'].includes(c.name));
  const rowHtml=d.monthTasks.slice().sort((a,b)=>String(a.values['开发日期']||'').localeCompare(String(b.values['开发日期']||''))).map(t=>{
    const cells=cols.map(c=>`<td>${esc(t.values[c.name]||'').replace(/\n/g,'<br>')}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('')||'<tr><td colspan="6" class="c muted">本月暂无任务</td></tr>';

  const html=`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#222;font-size:13px;padding:32px 40px;line-height:1.6}
  h1{font-size:24px;text-align:center;margin:8px 0 4px}
  .sub{text-align:center;color:#666;font-size:13px;margin-bottom:24px}
  .sec-title{font-size:16px;font-weight:700;margin:22px 0 10px;padding-left:10px;border-left:4px solid #2f6fed;color:#1a2c4d}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}
  th,td{border:1px solid #cfd6e0;padding:6px 9px;text-align:left;vertical-align:top}
  th{background:#eef3fa;font-weight:600}
  .c{text-align:center}
  .muted{color:#888}
  /* KPI 卡片 */
  .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
  .kpi{flex:1;min-width:110px;border:1px solid #dbe6fb;background:#f4f8ff;border-radius:8px;padding:10px 8px;text-align:center}
  .kpi .num{font-size:22px;font-weight:700;color:#2f6fed}
  .kpi .lab{font-size:12px;color:#5a6b85;margin-top:2px}
  .kpi.warn{background:#fdf3f0;border-color:#f3c4bc}
  .kpi.warn .num{color:#d8453a}
  /* 趋势图 */
  .trend{display:flex;align-items:flex-end;gap:6px;height:130px;border-bottom:1px solid #e3e6eb;padding:0 4px}
  .trend-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px}
  .trend-val{font-size:11px;font-weight:600}
  .trend-bar{width:55%;max-width:38px;background:#2f6fed;border-radius:4px 4px 0 0;min-height:3px}
  .trend-lab{font-size:11px;color:#5a6b85}
  .bar-legend{margin-top:6px;font-size:11px;color:#5a6b85}
  .foot{margin-top:30px;padding-top:10px;border-top:1px solid #e3e6eb;color:#999;font-size:11px;text-align:center}
  @media print{
    body{padding:8mm 10mm}
    @page{margin:12mm}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style></head><body>
  <h1>${title}</h1>
  <div class="sub">统计截至 ${dateStr} · 数据仅存于本地浏览器</div>

  <div class="sec-title">一、总体指标</div>
  <div class="kpis">
    <div class="kpi"><div class="num">${d.total}</div><div class="lab">任务总数</div></div>
    <div class="kpi"><div class="num">${d.monthCount}</div><div class="lab">本月任务</div></div>
    <div class="kpi"><div class="num">${d.rate}%</div><div class="lab">本月完成率</div></div>
    <div class="kpi"><div class="num">${d.ongoing}</div><div class="lab">未结案</div></div>
    <div class="kpi"><div class="num">${d.closedAll}</div><div class="lab">已结案</div></div>
    <div class="kpi${d.overdueCount?' warn':''}"><div class="num">${d.overdueCount}</div><div class="lab">逾期未完成</div></div>
  </div>

  <div class="sec-title">二、任务趋势（近 6 个月录入）</div>
  <div class="trend">${trendHtml}</div>
  <div class="bar-legend">注：柱形高度按当月录入任务数等比绘制。</div>

  <div class="sec-title">三、按客户统计</div>
  <table><thead><tr><th>客户</th><th class="c">任务数</th><th class="c">已完成</th><th class="c">完成率</th></tr></thead><tbody>${custHtml||'<tr><td colspan="4" class="c muted">暂无数据</td></tr>'}</tbody></table>

  <div class="sec-title">四、按完成状态分布</div>
  <table><thead><tr><th>状态</th><th class="c">数量</th></tr></thead><tbody>${stHtml||'<tr><td colspan="2" class="c muted">暂无数据</td></tr>'}</tbody></table>

  <div class="sec-title">五、逾期未完成</div>
  <table><thead><tr><th>专案名称</th><th>客户</th><th class="c">逾期</th></tr></thead><tbody>${overdueHtml||'<tr><td colspan="3" class="c muted">✓ 没有逾期未完成的任务</td></tr>'}</tbody></table>

  <div class="sec-title">六、本月任务明细</div>
  <table><thead><tr>${cols.map(c=>`<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${rowHtml}</tbody></table>

  <div class="foot">由「工作任务管理」生成 · 数据存于本地浏览器，未上传任何服务器</div>
</body></html>`;
  const w=window.open('','_blank');
  if(!w){ toast('浏览器拦截了打印窗口，请允许弹出窗口'); return; }
  w.document.write(html);
  w.document.close();
  w.document.title=title;
  setTimeout(()=>{ w.focus(); w.print(); },350);
  toast('已生成汇报文档，打印对话框选「另存为 PDF」');
}
$('#dashExportPdf').onclick=exportReportPDF;

/* ============ 导出 Word（.doc，HTML 包装，Word/WPS 可直接打开） ============ */
function exportReportWord(){
  const d=getDashboardData();
  const p=n=>String(n).padStart(2,'0');
  const dateStr=d.y+'-'+p(d.m)+'-'+p(new Date().getDate());
  const avg=avgDevDays();
  const issues=getHealthIssues();
  const custArr=Object.entries(d.byCust).sort((a,b)=>b[1].total-a[1].total);
  const custRows=custArr.map(([k,v])=>{ const r=v.total?Math.round(v.closed/v.total*100):0; return `<tr><td>${esc(k)}</td><td class="c">${v.total}</td><td class="c">${v.closed}</td><td class="c">${r}%</td></tr>`; }).join('');
  const stArr=Object.entries(d.bySt).sort((a,b)=>b[1]-a[1]);
  const stRows=stArr.map(([k,n])=>`<tr><td>${esc(k)}</td><td class="c">${n}</td></tr>`).join('');
  const odRows=d.overdueList.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.cust)}</td><td class="c">${x.days} 天</td></tr>`).join('');
  const healthRows=issues.length?issues.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.why)}</td></tr>`).join(''):'<tr><td colspan="2" class="c muted">✓ 数据健康</td></tr>';
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>月度汇报</title></head>
<body>
<h1 style="text-align:center;font-size:20pt">工作任务管理 · 月度汇报</h1>
<p style="text-align:center;color:#666">统计截至 ${dateStr}</p>
<h2 style="border-left:4px solid #2f6fed;padding-left:8px">一、总体指标</h2>
<p>任务总数：${d.total}　本月任务：${d.monthCount}　本月完成率：${d.rate}%　未结案：${d.ongoing}　已结案：${d.closedAll}　平均开发天数：${avg!=null?avg+'天':'—'}　逾期未完成：${d.overdueCount}</p>
<h2 style="border-left:4px solid #2f6fed;padding-left:8px">二、按客户统计</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#eef3fa"><th>客户</th><th>任务数</th><th>已完成</th><th>完成率</th></tr>${custRows||'<tr><td colspan="4">暂无数据</td></tr>'}</table>
<h2 style="border-left:4px solid #2f6fed;padding-left:8px">三、按完成状态分布</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#eef3fa"><th>状态</th><th>数量</th></tr>${stRows||'<tr><td colspan="2">暂无数据</td></tr>'}</table>
<h2 style="border-left:4px solid #2f6fed;padding-left:8px">四、逾期未完成</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#eef3fa"><th>专案名称</th><th>客户</th><th>逾期</th></tr>${odRows||'<tr><td colspan="3">✓ 没有逾期任务</td></tr>'}</table>
<h2 style="border-left:4px solid #2f6fed;padding-left:8px">五、数据健康检查</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#eef3fa"><th>专案</th><th>待补全</th></tr>${healthRows}</table>
<p style="color:#999;font-size:9pt;margin-top:20px">由「工作任务管理」生成 · 数据存于本地浏览器，未上传任何服务器</p>
</body></html>`;
  const blob=new Blob(['\ufeff'+html],{type:'application/msword'});
  downloadBlob(blob,'工作任务月度汇报_'+todayStr()+'.doc');
  toast('已导出 Word 汇报（.doc）');
}
$('#dashExportWord').onclick=exportReportWord;
