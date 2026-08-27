/* ============ 内置帮助 + 首次引导（help.js） ============ */
const LS_SEEN='wb_seen_guide';

function helpHTML(){
  return `
  <h3>🚀 快速上手（3 步走通周报流程）</h3>
  <div class="help-step"><span class="hs-num">1</span><div class="hs-body"><div class="hs-t">每日录入：把每天的任务记下来</div><div class="hs-d">打开「每日录入」→ 填专案名称、需求、进度等（厂区/日期/负责人已预填）→ 点「保存任务」。输入会自动存草稿，误关不丢；支持批量录入、语音、AI 润色。</div></div></div>
  <div class="help-step"><span class="hs-num">2</span><div class="hs-body"><div class="hs-t">导出追加：把任务写进周报 excel</div><div class="hs-d">「导出追加」→ 上传你的周报 .xlsx → 自动识别列名（可手动校正）→ 选时间范围 → 生成并下载「_已追加」文件。已追加的会标记防重复。</div></div></div>
  <div class="help-step"><span class="hs-num">3</span><div class="hs-body"><div class="hs-t">月报/汇报：汇总成报告</div><div class="hs-d">「月报汇总」按月汇总、生成周报段落；「数据看板」一键导出 PDF/Word 汇报（含图表），直接上交。</div></div></div>

  <h3>🗂 功能导览</h3>
  <div class="help-card">
    <div class="help-mod"><div class="hm-name">每日录入</div><div class="hm-d">预填默认值、克隆上条、批量录入、语音转文字、AI 润色、重复专案检测、草稿自动保存</div></div>
    <div class="help-mod"><div class="hm-name">数据看板</div><div class="hm-d">KPI 总览、6 个月趋势、客户/状态分布、逾期清单、数据健康检查、存储用量、导出 PDF/Word 汇报</div></div>
    <div class="help-mod"><div class="hm-name">任务列表</div><div class="hm-d">搜索/筛选/排序、批量操作、回收站、甘特视图、全量/加密备份、CSV 导出、从历史 Excel 导入</div></div>
    <div class="help-mod"><div class="hm-name">导出追加</div><div class="hm-d">上传周报自动映射列名、按状态分组插入、对齐上一行样式、结构校验、生成新周报（不依赖模板）</div></div>
    <div class="help-mod"><div class="hm-name">月报汇总</div><div class="hm-d">按月份去重汇总、可选字段、导出纯文本/Excel、周报段落一键生成与打印</div></div>
    <div class="help-mod"><div class="hm-name">配置中心</div><div class="hm-d">列结构增删排序、下拉选项、多套列模板（可切换）、默认设置、AI 润色配置</div></div>
  </div>

  <h3>❓ 常见问题</h3>
  <div class="help-faq">
    <details><summary>数据存在哪里？会上传吗？</summary><div class="faq-a">所有数据只存在你自己的浏览器本地（localStorage），不经过任何服务器、无需登录，隐私安全。</div></details>
    <details><summary>怎么备份 / 换电脑迁移？</summary><div class="faq-a">任务列表 → 「全量备份」导出 .json（或「🔐 加密备份」.wbe，需密码）。新电脑打开工具 → 「全量恢复」选择备份文件即可。</div></details>
    <details><summary>支持旧版 .xls 吗？</summary><div class="faq-a">只支持 .xlsx。旧 .xls 请先在 Excel 里「另存为」.xlsx 再上传。</div></details>
    <details><summary>离线能用吗？</summary><div class="faq-a">可以。工具是 PWA，首次打开后自动缓存，断网仍可完整使用；Chrome 里还可「安装」成桌面应用。</div></details>
    <details><summary>AI 润色怎么用？</summary><div class="faq-a">配置中心 → AI 润色 → 填你自己的 API Key（支持 DeepSeek/硅基流动等 OpenAI 兼容接口）→ 保存。然后回到每日录入，点「AI 润色」即可。</div></details>
    <details><summary>如何让新导入的历史任务显示？</summary><div class="faq-a">任务列表 → 「📥 从Excel导入」选择历史周报 .xlsx，表头会自动映射到列名，任务批量进入任务库。</div></details>
  </div>

  <div class="help-startbar">
    <button class="btn" id="helpGotIt">开始使用</button>
  </div>`;
}

function openHelp(){
  const ov=$('#helpOverlay');
  $('#helpBody').innerHTML=helpHTML();
  ov.classList.remove('hidden');
  const got=$('#helpGotIt');
  if(got) got.onclick=closeHelp;
  // 关闭按钮与遮罩点击
  $('#helpClose').onclick=closeHelp;
  ov.querySelector('.help-mask').onclick=closeHelp;
}
function closeHelp(){
  $('#helpOverlay').classList.add('hidden');
}

$('#helpBtn').onclick=openHelp;
/* 键盘 Esc 关闭帮助 */
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('#helpOverlay').classList.contains('hidden')) closeHelp(); });

/* 首次引导：第一次打开时自动弹出帮助（标记已看过，之后手动点帮助按钮） */
(function(){
  if(load(LS_SEEN,'')) return;
  save(LS_SEEN,'1');
  setTimeout(openHelp, 600);
})();
