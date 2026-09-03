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
