/* ============ 数据看板（dashboard.js） ============ */
function renderDashboard(){
  const total=tasks.length;
  const now=new Date(); const y=now.getFullYear(),m=now.getMonth()+1;
  const monthTasks=tasks.filter(t=>{const d=parseDateAny(t.entryDate);return d&&d.getFullYear()===y&&d.getMonth()+1===m;});
  const closedAll=tasks.filter(t=>String(t.values['完成状态']||'')==='Closed').length;
  const closedMonth=monthTasks.filter(t=>String(t.values['完成状态']||'')==='Closed').length;
  const rate=monthTasks.length?Math.round(closedMonth/monthTasks.length*100):0;
  const ongoing=tasks.filter(t=>{const s=String(t.values['完成状态']||'').trim();return s && s.toLowerCase()!=='closed';}).length;
  const overdue=tasks.filter(t=>{
    if(String(t.values['完成状态']||'')==='Closed')return false;
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    return d && todayStr()>toInputDate(d);
  });
  $('#dashKpis').innerHTML=`
    <div class="stat"><div class="num">${total}</div><div class="lab">任务总数</div></div>
    <div class="stat"><div class="num">${monthTasks.length}</div><div class="lab">本月任务</div></div>
    <div class="stat"><div class="num">${rate}%</div><div class="lab">本月完成率</div></div>
    <div class="stat"><div class="num">${ongoing}</div><div class="lab">未结案</div></div>
    <div class="stat"><div class="num">${closedAll}</div><div class="lab">已结案</div></div>
    <div class="stat${overdue.length?' warn':''}"><div class="num">${overdue.length}</div><div class="lab">逾期未完成</div></div>`;

  // 任务趋势：近 6 个月录入
  const trend=[];
  for(let i=5;i>=0;i--){
    const d=new Date(y,m-1-i,1);
    const yy=d.getFullYear(), mm=d.getMonth()+1;
    const n=tasks.filter(t=>{const x=parseDateAny(t.entryDate);return x&&x.getFullYear()===yy&&x.getMonth()+1===mm;}).length;
    trend.push({mm,n});
  }
  const maxN=Math.max(1,...trend.map(t=>t.n));
  $('#dashTrend').innerHTML=trend.map(t=>{
    const pct=Math.round(t.n/maxN*100);
    return `<div class="t-col"><div class="t-val">${t.n}</div><div class="t-bar${t.n?'':' zero'}" style="height:${pct}%"></div><div class="t-lab">${t.mm}月</div></div>`;
  }).join('');

  // 按客户：数量 + 完成率
  const byCust={};
  tasks.forEach(t=>{
    const c=(t.values['客户']||'').trim()||'未填';
    byCust[c]=byCust[c]||{total:0,closed:0};
    byCust[c].total++;
    if(String(t.values['完成状态']||'')==='Closed')byCust[c].closed++;
  });
  const custArr=Object.entries(byCust).sort((a,b)=>b[1].total-a[1].total);
  $('#dashCust').innerHTML=custArr.length
    ? custArr.map(([k,v])=>{
        const r=v.total?Math.round(v.closed/v.total*100):0;
        return `<div class="cust-row"><span class="cust-name" title="${esc(k)}">${esc(k)}</span><div class="cust-bar"><i style="width:${r}%"></i></div><span class="cust-rate">${r}%</span><span class="cust-n muted">${v.closed}/${v.total}</span></div>`;
      }).join('')
    : '<p class="muted" style="padding:20px 0;text-align:center">暂无任务</p>';

  // 按完成状态分布
  const bySt={};
  tasks.forEach(t=>{const s=String(t.values['完成状态']||'').trim()||'未填';bySt[s]=(bySt[s]||0)+1;});
  const stArr=Object.entries(bySt).sort((a,b)=>b[1]-a[1]);
  const stMax=Math.max(1,...stArr.map(x=>x[1]));
  $('#dashStatus').innerHTML=stArr.length
    ? stArr.map(([k,n])=>`<div class="dash-bar-row"><span class="bk">${esc(k)}</span><div class="bt"><i style="width:${Math.round(n/stMax*100)}%"></i></div><span class="bn">${n}</span></div>`).join('')
    : '<p class="muted" style="padding:20px 0;text-align:center">暂无任务</p>';

  // 逾期清单
  const wrap=$('#dashOverdue');
  if(!overdue.length){ wrap.innerHTML='<div class="dash-overdue-empty">✓ 没有逾期未完成的任务</div>'; return; }
  const today0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const sorted=overdue.slice().sort((a,b)=>{
    const da=parseDateAny(a.values['开发日期'])||parseDateAny(a.values['提出日期']);
    const db=parseDateAny(b.values['开发日期'])||parseDateAny(b.values['提出日期']);
    return (da?da.getTime():0)-(db?db.getTime():0);
  });
  wrap.innerHTML=sorted.map(t=>{
    const d=parseDateAny(t.values['开发日期'])||parseDateAny(t.values['提出日期']);
    const d0=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const days=Math.max(1,Math.round((today0-d0)/86400000));
    const name=t.values['专案名称']||'未命名';
    const cust=t.values['客户']||'';
    return `<div class="dash-over-item"><span class="od-name">${esc(name)}</span><span class="od-meta">${esc(cust)}</span><span class="od-days">逾期 ${days} 天</span></div>`;
  }).join('');
}
