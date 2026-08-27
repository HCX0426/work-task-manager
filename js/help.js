/* ============ 内置帮助（help.js） ============ */

function helpHTML(){
  return `
  <h3>🚀 快速上手（3 步走通周报流程）</h3>
  <div class="help-step"><span class="hs-num">1</span><div class="hs-body"><div class="hs-t">每日录入：把每天的任务记下来</div><div class="hs-d">打开「每日录入」，顶部「今日待办」会列出今天要推进和已逾期的任务，点条目可直接补录；表单里填专案名称、需求、进度等（厂区/日期/负责人已预填）→ 保存。「完成状态」必选（Ongoing/planning/暂停/取消/Closed）；改「暂停/取消」需先填「备注」说明原因；「开发进度」支持每行写一个推进节点、行首加「✓ 」表示完成，进度条自动统计，也有常用短语/语音/AI 润色辅助。</div></div></div>
  <div class="help-step"><span class="hs-num">2</span><div class="hs-body"><div class="hs-t">导出追加：把任务写进周报 excel</div><div class="hs-d">「导出追加」→ 上传周报 .xlsx → 自动识别列名（可手动校正）→ 选时间范围 → 生成并下载「_已追加」文件。已追加的会标记防重复。</div></div></div>
  <div class="help-step"><span class="hs-num">3</span><div class="hs-body"><div class="hs-t">月报/汇报：汇总成报告</div><div class="hs-d">「月报汇总」按月汇总、生成周报段落与月度复盘；「数据看板」一键导出 PDF/Word 汇报（含图表）。周报/复盘也都可单独导出 Word。</div></div></div>

  <h3>⌨️ 快捷键</h3>
  <div class="help-card">
    <div class="help-mod"><div class="hm-name">N · 每日录入</div><div class="hm-d">新建/录入任务</div></div>
    <div class="help-mod"><div class="hm-name">F · 搜索</div><div class="hm-d">跳任务列表并聚焦搜索框</div></div>
    <div class="help-mod"><div class="hm-name">G / K / C</div><div class="hm-d">G 甘特视图 · K 看板视图 · C 日历视图</div></div>
    <div class="help-mod"><div class="hm-name">H · 帮助</div><div class="hm-d">打开/关闭本帮助；Esc 关闭</div></div>
    <div class="help-mod"><div class="hm-name">回车 · 保存</div><div class="hm-d">录入页输入框回车保存；多行框内 Ctrl+回车保存</div></div>
  </div>

  <h3>🗂 功能导览</h3>
  <div class="help-card">
    <div class="help-mod"><div class="hm-name">每日录入</div><div class="hm-d">今日待办/逾期/本周已录、预填默认值、克隆上条、批量录入、语音、AI 润色、常用短语、开发进度逐行推进（✓ 自动统计进度）、状态必选（暂停/取消需备注）、重复检测、草稿自动保存</div></div>
    <div class="help-mod"><div class="hm-name">数据看板</div><div class="hm-d">KPI、6 个月趋势、年度/季度对比、客户与状态分布、逾期清单、健康检查、存储用量、导出 PDF/Word 汇报</div></div>
    <div class="help-mod"><div class="hm-name">任务列表</div><div class="hm-d">卡片/甘特/看板(拖拽改状态)/日历 4 视图、搜索筛选排序、批量操作、任务历史、回收站、备份恢复与 Excel 导入</div></div>
    <div class="help-mod"><div class="hm-name">导出追加</div><div class="hm-d">上传周报自动映射列名、按状态分组插入、对齐上一行样式、结构校验、生成新周报</div></div>
    <div class="help-mod"><div class="hm-name">月报汇总</div><div class="hm-d">按月去重汇总、导出文本/Excel、月度复盘总结、周报段落（复制/打印/导出 Word）</div></div>
    <div class="help-mod"><div class="hm-name">配置中心</div><div class="hm-d">列模板、列定义增删排序、常用短语、下拉选项、默认设置、AI 润色配置</div></div>
  </div>

  <h3>❓ 常见问题</h3>
  <div class="help-faq">
    <details><summary>三种 Word/PDF 汇报怎么选？</summary><div class="faq-a">① 数据看板「导出 PDF/Word」= 完整月度汇报（封面+图表+明细），要上交用这个；② 月报页「周报段落 → 导出 Word」= 本周一小段正文，日常周报用；③ 月报页「生成月度复盘 → 导出 Word」= 月度复盘总结，自查或写月报大纲用。</div></details>
    <details><summary>看板/日历/进度/历史怎么用？</summary><div class="faq-a">看板在任务列表点「🗂 看板」，直接拖动卡片到其他列即改完成状态（拖到「暂停/取消」会弹出窗口要你填「备注」，取消则不变；拖到 Closed 会自动补结案日期）；日历点「📅 日历」，按录入日期回看当天记录，点日期上的「补录」可直接补那天的任务。进度：在「开发进度」里每行写一个推进节点，行首加「✓ 」视为已完成，卡片和看板自动显示进度条；卡片底部「🕘 历史」能回看每次改动。</div></details>
    <details><summary>常用短语怎么管理？</summary><div class="faq-a">录入页「开发进度」下方点「+ 新增」可直接加；也可在配置中心「常用短语」统一管理（增删、去重排序）。会存到本地，换模板不影响。</div></details>
    <details><summary>数据存在哪里？会上传吗？</summary><div class="faq-a">所有数据只存在你自己的浏览器本地（localStorage），不经过任何服务器、无需登录；AI 润色仅在你填写了自己的 API Key 时，才把进度文本发往你填写的服务商。</div></details>
    <details><summary>怎么备份 / 换电脑迁移？</summary><div class="faq-a">任务列表 →「🗄 备份/导入/导出」→「全量备份」导出 .json（或「🔐 加密备份」.wbe，需密码）。新电脑打开工具 →「全量恢复」选择备份文件即可。</div></details>
    <details><summary>支持旧版 .xls 吗？</summary><div class="faq-a">只支持 .xlsx。旧 .xls 请先在 Excel 里「另存为」.xlsx 再上传。</div></details>
    <details><summary>离线能用吗？</summary><div class="faq-a">可以。工具是 PWA，首次打开后自动缓存，断网仍可完整使用；Chrome 里还可「安装」成桌面应用。</div></details>
    <details><summary>AI 润色怎么用？</summary><div class="faq-a">配置中心 → AI 润色 → 填你自己的 API Key（支持 DeepSeek/硅基流动等 OpenAI 兼容接口）→ 保存。回到每日录入，点「AI 润色」即可。</div></details>
    <details><summary>如何让新导入的历史任务显示？</summary><div class="faq-a">任务列表 →「🗄 备份/导入/导出」→「📥 从Excel导入」选择历史周报 .xlsx，表头自动映射，任务批量进入任务库。</div></details>
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
