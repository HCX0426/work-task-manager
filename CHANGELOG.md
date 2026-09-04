# Changelog

本文件记录「工作任务管理」的版本演进。格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-09-01

首个对外完整版本。本地优先的离线 PWA：纯静态、无后端、无构建步骤，数据全部存于浏览器 localStorage。

### 新增功能

- **每日录入**：按日期补录多条任务，草稿自动保存与恢复。
- **数据看板**：工作量 / 完成率 / 分布 / 逾期一屏总览，可导出 PDF、Word 汇报。
- **任务列表**：搜索、筛选、排序，支持卡片 / 甘特 / 看板 / 日历多种视图、批量操作与回收站。
- **配置中心**：列结构（名称 / 类型 / 格式）、模板、默认设置、下拉选项可配置，支持 AI 润色 BYOK Key（用户自有 Key 直连，数据不经过本工具）。
- **导出追加**：与 Excel 交互生成周报 / 月报，支持末尾追加、按状态分组插入、对齐上一行样式、去重防重复追加。
- **月报汇总**：按月聚合，生成月度复盘（已完成 / 进行中 / 待处理 / 逾期）。
- **导入/备份**：Excel 反向导入历史周报、一键全量备份/恢复、加密备份（AES-256 本地加密）。
- **离线可用**：Service Worker 缓存 + Web App Manifest，断网可用、可安装为 PWA。
- **体验增强**：深色模式、主题首帧防闪烁、语音录入（WebSpeech）、首次引导与帮助面板。

### 修复与稳定性（P1–P14 代码复查）

- 看板存储占比按 5MB 配额计算（修复前分母误用 1MB，低估 5 倍）。
- PDF 本月任务明细表头使用真实列名（修复 `[object Object]` 渲染）。
- 配置导入 `importCfg` 改为 `saveAtomic` 原子写入（与 P8 对齐）。
- 修复 8 处缺陷：改名失联、恢复丢 Key、回收站计数不同步、批量取消全选误判、下拉被删后字段清空、导出续号文本数字兼容、列名匹配空串防护等。
- 新增 `aiKey` 防丢失回归测试。
- Service Worker 自动更新 + 离线导航兜底。
- 移动端响应式 CSS 级联顺序修正。

### 工程化

- 新增 7 个内置回归测试（`tests/`），覆盖配置、看板、导出、缺陷修复、月报、恢复、代码复查。
- GitHub Pages 自动部署（`.github/workflows/pages.yml`），部署前运行回归测试，失败阻断发布。

## [1.0.1] - 2026-09-03

### 新增功能

- **导出排序可配置**：导出/追加/生成新周报现在按可配置依据排序，不再依赖任务录入顺序。新增设置 `exportSortBy`（默认`开发日期`，可选`录入日期`/`提出日期`，为以后扩展留口）与 `exportSortDir`（默认`asc`）。配置中心「导出」区块与导出页筛选区均可设置，导出页可临时覆盖单次默认值。
- **结案日期 ↔ 完成状态(Closed) 双向依赖**：填了「结案日期」必须选「完成状态=Closed」，反之选了「Closed」必须填「结案日期」；录入时实时标红提示，保存时硬拦截（不再静默把结案日期补成今天）。依赖校验抽成纯函数 `checkCloseDependency`（store.js），录入保存与回归测试共用，单一事实来源。

### 修复与稳定性

- 移除录入保存时「状态为 Closed 则静默把结案日期补成今天」的旧逻辑，改为显式双向依赖校验（更符合"两个是依赖的"语义；如仍需自动补填可回退）。

### 工程化

- 新增回归测试 `tests/_export_sort_dep_reg.js`：覆盖排序（按开发/提出/录入日期、升/降序、空日期置尾、稳定排序）与结案双向依赖（四态 + 常量一致性）。
- 部署门禁 `pages.yml` 已纳入新测试。

[1.0.0]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.0
[1.0.1]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.1

## [1.0.2] - 2026-09-03

### 新增功能

- **导出文件名可配置**：新增 `exportFilePrefix`（前缀，默认空）与 `exportFileDateFormat`（默认 `YYYYMMDD`，可选 `YYYY-MM-DD` / `YYYY/MM/DD` / `MMDD`）。文件名 = 前缀 + 时间范围（起始-结束），如 `DG周报20260824-20260828`。在「生成新周报」时生效；「追加」沿用原模板名 + `_已追加`（保留模板身份，避免按新范围误命名）。
- **导出 Excel 样式可配置**（默认全部"无"=不设置，沿用默认/模板）：
  - `exportFontName`（字体，如 等线）、`exportFontSize`（字号，如 11）——仅配置时写入，不再强制等线 11。
  - `exportHeaderBg`（表头背景色 hex）——仅「生成新周报」的表头行应用。
  - `exportStatusBg`（状态→背景色映射，如 `{Closed:'#C6EFCE'}`）——追加与生成新周报的「完成状态」列按取值分别着色，未命中/空映射不染色。

### 工程化

- 新增回归测试 `tests/_export_style_fn_reg.js`：覆盖 toArgb 颜色规整、文件名日期格式、buildFileName 前缀+范围、statusBgFill 状态映射、styleCell 仅配置时设字体、buildNewWorkbook 集成（表头/状态背景/字体实际写入及清空回退）。
- 新增端到端回归 `tests/_export_e2e_reg.js`：在「同一真实工作簿」组合 排序+文件名+样式+状态着色 后读回校验，并验证结案依赖硬校验；首跑曾因测试桩绕过 getRangeTasks 内部排序而误报失败，已修正桩用真实 `sortExportTasks` 排序（产品代码无 bug）。
- 部署门禁 `pages.yml` 已纳入新测试（现共 10 个回归测试）。

[1.0.1]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.1
[1.0.2]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.2

## [1.0.3] - 2026-09-03

基于 `CODE_REVIEW_2026-09-03.md` 的逐项修复（高/中优先级 + 关键低优先）。以磁盘真实状态为准，复核并补齐了此前会话中"显示成功但未落盘"的编辑。

### 重大修复（崩溃/数据风险）

- **录入页整页崩溃**：`entry.js` 重复声明 `const LS_DRAFT='wb_draft'`（与 store.js 同名），经典脚本下触发 `SyntaxError` 导致全部功能不可用 → 常量已归并 store.js，删除重复声明。
- **任务列表渲染崩溃**：补齐缺失的 `const FILTER_NOT_CLOSED='__not_closed'`（此前声称已加但未落盘），修复 `renderList` 因引用未定义常量而抛错、卡片全空的回归。
- **回收站恢复/清空原子化**：恢复、清空、彻底删除改用 `saveAtomic([[LS_TASKS,…],[LS_TRASH,…]])` 并校验 `save()` 返回值，避免中断导致任务重复或永久丢失（审计 #2/#5）。
- **存储损坏保护**：`load()` 解析失败时备份原始串到 `wb_corrupt_*` 并明确告警，进入只读保护，不再静默清空覆盖（审计 #1）。

### 安全与健壮性

- **CSP 纵深防御**：新增 `Content-Security-Policy`（default-src 'self'，按需放开 script/style inline 与 connect-src https 以支持 BYOK AI 润色），抑制外部脚本/样式源与嵌套 framing（审计 #26）。
- **全局错误捕获**：`window.onerror` / `unhandledrejection` 落到内存队列（上限 50 条），配置中心新增「最近错误（调试）」面板可查看（审计 #30）。
- **下载入口统一**：`triggerDownload` 先挂载 `<a>` 再 click（Firefox 兼容）、延迟 `revokeObjectURL` 避免 blob 泄漏（审计 #20）。
- **AI 润色超时/重试**：`aiChat` 走 `fetchWithTimeout(AI_TIMEOUT_MS)` + `AI_RETRY` 重试，5xx 才重试、4xx 直接报错（审计 #3）。

### 可维护性与一致性（SSOT）

- **localStorage 键 SSOT**：`app.js` / `index.html` 改为引用 `LS_THEME`；看板统计键集复用 `LS_ALL`，并补 `manifest.json` 的 `version` 字段，与 sw 缓存键 `wb-<APP_VERSION>` 同源（审计 #5/#15）。
- **魔法数字收敛**：`DRAFT_DEBOUNCE_MS` / `TODAY_PANEL_MAX` / `DEF_TODAY` / `DATE_COLS`（entry）、`GANTT_DAY_WIDTH` / `HISTORY_SHOW_MAX` / `FILTER_NOT_CLOSED`（list）、`BOOT_TOAST_DELAY_MS` / `SW_PATH` / `HOTKEY_MAP`（app）、`BYTES_PER_MB` / `ASSUMED_QUOTA_MB` / `HEALTH_SHOW_MAX`（dashboard）。
- **月报去重**：`totalTasks` 复用 `monthTasksOf`；预览与导出的每行文本抽出 `buildMonthlyLines` 共用（审计 #13/#14）。
- **颜色归一化**：合并 `toArgb` / `toHex` 为 `normalizeHex`（审计 #11）；删除月报 Excel 未使用的 `EXCEL_FONT` 死代码（审计 #6）。
- **必填列可配置**：录入页必填改由 schema 的 `required` 驱动（`PROJECT`/`STATUS`），不再硬编码（审计 #19）。
- **语音录入修复**：区分 `isFinal` 与 `interim`，避免 `interimResults` 重复累加（审计 #12）。

### 性能

- **ExcelJS 按需加载**：移除首屏 `<script defer src="exceljs.min.js">`，改为首次点击 Excel 导出/导入时由 `loadExcelJS()` 动态注入（离线由 sw 预缓存兜底），首屏不再解析 947KB（审计 #27）。

### Service Worker

- 缓存版本抽 `APP_VERSION` 单一事实来源；预缓存失败由静默改为 `console.warn`；三处重复缓存写入抽 `putCache`；`ASSETS` 增加与 index.html 脚本列表同步的注释（审计 #22/#23）。

### 工程化

- 回归测试 `tests/_review_reg.js` 的 P5 断言随 #27 调整为：9 个业务模块脚本均带 defer、exceljs 改为按需加载（不再首屏预载）。
- 回归测试全绿（共 10 个套件）：配置/看板/导出×4/缺陷修复/月报/恢复/代码复查，PASS 合计 0 失败。

[1.0.3]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.3

## [1.0.4] - 2026-09-03

续 `CODE_REVIEW_2026-09-03.md` 中优先级清单的收尾：以磁盘真实状态复核，补齐前两批（A–H + 1.0.3）后仍未真正落盘的 2 项，并确认其余 6 项已满足。

### 修复与健壮性

- **上传文件护栏（审计 #4）**：`checkUploadFile`（扩展名 + 大小上限 `MAX_UPLOAD_BYTES`/20MB）此前仅在导出页生效；本次在「配置中心·列模板导入」与「任务库 Excel 导入」两处也接入，三处上传口径统一。新增行数上限 `MAX_UPLOAD_ROWS`（5 万行）与 `checkUploadRows(ws)`，在 `wb.xlsx.load` 之后前置拦截，避免超大清单整张读进内存并长时间阻塞主线程。
- **表头识别去重（审计 #10）**：`config.js` / `list.js` 内联的「找表头行 + 读列名」逻辑（各写一份、阈值 `3` 各写一遍）已迁移到 store.js 的 `findHeaderRow(ws)` / `readHeaders(ws, hr)`，阈值统一引用 `MIN_HEADER_CELLS` 常量。至此三处导入路径（导出页/列模板/任务库）共用同一实现，消除漂移。

### 已复核满足（本批无需改动）

- **追加文件名套用配置（#8）**：导出页追加下载已 `buildFileName()`（未配前缀时回退原模板名），与「生成新周报」口径一致。
- **配置控件表驱动（#16）**：`config.js` 12 个控件已由 `CFG_CONTROLS` 循环绑定，新增项只加一行。
- **排序/范围依据值域统一（#17）**：`DATE_BY` / `DATE_BY_ALIAS` / `normalizeDateBy` 已归一 `entryDate` 与中文列名混用。
- **历史状态值映射补全（#18）**：`LEGACY_STATUS_MAP` 已覆盖 `已结案/已完成/已暂停/已取消/规划中/进行中/测试中` 等旧值，配合小写回退。
- **PBKDF2 迭代次数具名（#21）**：`PBKDF2_ITERATIONS=150000` 常量（store.js 安全参数区）。
- **甘特「今天线」单节点（#25）**：已改为图表容器上一条贯穿线，不再逐行重复 DOM。

### 低优先级清仓

- **配置中心**：`saveCfg` 校验 `save()` 返回值（配额满时提示「保存失败：本地存储可能已满」而非假成功）；5 处 `JSON.parse(JSON.stringify(...))` 深拷贝换 `deepClone()`（至此全项目收敛完成）。
- **任务列表**：`window.__batchSel` 全局收敛为模块内 `batchSel`；`calY/calM` 重命名为 `calYear/calMonth`。
- **甘特图布局常量收编 store.js**：`GANTT_RANGE`（60 档=-15~+45、90 档=-30~+60 偏移对）、`GANTT_EDGE_PAD_DAYS`（两端外扩 3 天）、`GANTT_ONGOING_EST_DAYS`（未完成预估 7 天），消除散落字面量。
- **录入页**：展示上限局部别名 `MAX/MAXS` 统一为 `todayMax/weekMax`。
- **月报**：完成数/完成率计算抽 `monthSummary(data)`（预览、txt 导出、xlsx 合计行 3 份重复实现收敛）；周报段落打印延时 `100ms` → `PRINT_DELAY_MS` 与看板统一。
- **AI 润色**：非加密 `http://` 服务地址除 `console.warn` 外增加一次性 UI toast 告警（Key 明文发送风险用户可见）。
- **Service Worker**：`/js/*.js` 判定保留正则而非从 ASSETS 推导，并注明刻意取舍原因（推导式会把「漏登记 ASSETS 的新 js」降级为 stale-while-revalidate，离线兜底反而变弱）。
- **内联样式拆分**：index.html 的 `<style>` 块（约 420 行）原样拆出为 `styles.css`，经 `<link>` 引用（CSP `style-src 'self'` 已覆盖）；sw.js `ASSETS` 增补该文件（离线预缓存，运行期走 stale-while-revalidate）；`_review_reg.js` P13 断言同步改为读 styles.css。样式内容零改动，建议在真实浏览器实地过一遍渲染作最终确认。

### 工程化

- 回归测试全绿（共 10 个套件，PASS=226，FAIL=0）：本批改动经 `node --check` 语法校验 + 全量回归，无新增失败。

[1.0.4]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.4

## [1.0.5] - 2026-09-04

对 `CODE_REVIEW_2026-09-03.md` 做逐项对账式复查（高 2 + 中 28 + 低 35 + 全局 4 全部重验），发现并补齐 3 处漏网：

- **看板 PDF/Word 报告去重（审计 #14 dashboard 半边）**：「按客户统计 / 按状态分布 / 逾期未完成」的排序与表格行 HTML 在 `exportReportPDF` 与 `exportReportWord` 各写一遍，抽为公共函数 `custStatRows(d)` / `statusStatRows(d)` / `overdueRows(d)`（看板页自身的图形化渲染不受影响）。
- **README 注明界面语言（审计全局第 3 条）**：功能特性区补「仅中文（单语言本地工具，不引入 i18n 层）」。
- **AI 默认地址 placeholder 去重（审计 index.html 低项）**：HTML 不再硬编码 `https://api.deepseek.com`，改由 config.js 用 `AI_DEF_BASE_URL` 填充 placeholder。

回归：10 套件 PASS=226 FAIL=0；改动文件 `node --check` 通过。

[1.0.5]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.5

## [1.0.6] - 2026-09-04

修复线上报错（由全局错误捕获捕获到的 `unhandledrejection: ReferenceError: ExcelJS is not defined`）：

- **生成新周报崩溃（v1.0.3 引入）**：`buildNewWorkbook()` 在 ExcelJS 改为按需懒加载后漏了 `await loadExcelJS()`，会话内未先上传过 Excel 就点「生成新周报」即抛 `ReferenceError` → 已补，并在 `#genNew` 入口加 try/catch，加载失败时提示「生成失败：<原因>」（如离线且缓存未命中）而非静默。
- **同型漏点预防**：全量排查所有 `new ExcelJS.Workbook()` 引用，确认「选中任务批量导出 xlsx」（list.js）同样漏注 → 已补同款守卫；其余 4 处（上传解析/Excel 导入/列模板/月报）复核无误。「追加到模板」路径经 `validateExportStructure` 未上传拦截，无此问题。
- 回归 10 套件 PASS=226 FAIL=0（含 buildNewWorkbook 端到端）。

[1.0.6]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.6

## [1.0.8] - 2026-09-04

### 修复（全量代码复查 HIGH/MEDIUM/LOW 清单）

- **H1 状态→Closed 不再静默补填结案日期**：看板拖拽、批量补录两条路径原先绕过 `checkCloseDependency` 直接写入 `today`，与录入页「选 Closed 必须填结案日期」硬校验不一致。现两条路径统一改为弹窗要求填写结案日期，未填则本次不改（与录入页同源）；同步更新帮助文案。
- **H2 CSV 公式注入防护**：导出 CSV 的 `escCsv` 原仅转义引号/逗号/换行，现对行首 `= + - @ 制表符 回车` 前缀单引号，防 Excel/WPS 误执行公式。新增回归 `tests/_csv_injection_reg.js`（11 断言）。
- **H3 导入文件读取健壮化**：全量备份(.json)/加密备份(.wbe)/任务导入(.json) 三个 `FileReader` 补 `onerror` 处理与 `MAX_UPLOAD_BYTES`(20MB) 大小上限，超限/读取失败明确提示。
- **M1 批量录入默认状态**：从「下拉第一项」改为 SSOT 的 `Ongoing`（与录入表单默认一致），下拉无 Ongoing 才退回首项，保证有值且语义正确。
- **M2 完成状态语义统一**：卡片/看板/日历的「已完成」样式改用 `isStatusDone`（Closed 与 Cancelled 均视为已了结）；其余「精确=Closed」用途（结案依赖、Closed 计数、导出优先级）保留原字面量，避免口径漂移。
- **M3 恢复/导入字段保全**：`restoreAll` 还原 schema 时补回 `required` 标志；任务导入补回 `exportedNew` 标志，避免恢复后丢失。
- **M4 看板列优先级去硬编码**：`['Planning','Ongoing','Closed']` 改为 `STATUS_PLANNING/STATUS_ONGOING/STATUS_DONE` 常量（新增 `STATUS_PLANNING`）。
- **M5 数据看板性能**：近 6 月趋势改为单次遍历分桶（原 6 次全量 filter）；逾期清单用 Schwartzian 变换，避免比较器内重复 `parseDateAny`。
- **M6 CI 测试矩阵**：`pages.yml` 测试步骤由硬编码 10 个文件改为 `tests/*.js` 全量，并 `setup-node@v4` 锁定 Node 20。
- **M7 第三方依赖溯源**：新增 `vendor/exceljs.README.md`，记录 ExcelJS 版本(3.33.0)/构建日期(2023-10-19)/MIT 许可/来源与维护约定（含 SRI 暂不启用说明）。
- **L1–L10 一致性/健壮性**：搜索防抖改用 `LIST_SEARCH_DEBOUNCE_MS`；排序默认改用 `LIST_SORT_BY.DEV_DATE`/`SORT_DESC`；录入页列名查询改用 `COL.*` 常量；帮助遮罩点击加空值保护；加密备份密码加 ≥6 位下限；SW 注册失败改 `console.warn`（不再静默）；移除冗余 `batchSel` 初始化。
- 复查中 L4/L5/L9 经核对为误报（搜索匹配唯一、看板空态本就用 `tasks`、回滚写入已校验 `save` 返回值），未改动；L11 CSP `unsafe-inline` 因动态内联样式必需而保留；L12 部署含 `tests/` 属无害冗余文件，未处理。

### 工程化

- 新增回归 `tests/_csv_injection_reg.js`（11 断言，直接抽取 `escCsv` 运行验证）。
- 新增回归 `tests/_close_date_guard_reg.js`（28 断言）：驱动真实的 `#batchApply.onclick` 与看板 `drop` 监听器，覆盖批量补录/拖拽到 Closed 的结案日期强制填写，含「取消不落 today」「已有日期不覆盖」「非 Closed 不打扰」等分支。
- 新增回归 `tests/_import_limit_reg.js`（37 断言）：覆盖三个导入入口的 20MB 上限拦截、读取失败兜底、边界值（恰好 20MB 放行 / size=0 不误拦 / 未选文件静默返回）。
- 上述两个回归均通过**变异验证**（临时把源码改回旧行为后分别失败 11 / 12 条断言），确认非空洞测试。全量 **13 套件 PASS=306 FAIL=0**。

## [1.0.7] - 2026-09-04

### 新增功能

- **完成状态导出优先级**：配置中心「导出」区块新增「状态导出优先级」文本项（如 `Ongoing,Closed`）。配置后，导出/追加/生成新周报先按此状态顺序**分块**（如先 Ongoing 块、再 Closed 块），**块内仍按「排序依据 + 方向」**（默认开发日期升序）；未列入优先级的状态统一排在最后（也按排序依据）。**留空 = 不启用**，维持原有纯日期排序。状态名中英文均可（经 `normalizeStatus` 自动归一，如「进行中」→Ongoing、小写 ongoing→Ongoing），分隔符兼容英文/中文逗号、顿号、大于号。实现于 `sortExportTasks`（三条导出路径单一入口），配置项接入 `CFG_CONTROLS` 表驱动。

### 工程化

- 回归 `tests/_export_sort_dep_reg.js` 新增场景 6（4 条断言）：分块+块内日期序、中文归一等价、降序时块序不反转、留空旧行为；全量 10 套件 PASS=230 FAIL=0。

[1.0.7]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.7
[1.0.8]: https://github.com/HCX0426/work-task-manager/releases/tag/v1.0.8
