# 工作任务管理 · 代码审查报告

- **审查日期**：2026-09-03
- **审查范围**：`index.html`(1205) / `js/store.js`(536) / `js/list.js`(894) / `js/entry.js`(593) / `js/export.js`(494) / `js/config.js`(428) / `js/dashboard.js`(301) / `js/monthly.js`(242) / `js/app.js`(81) / `js/help.js`(64) / `sw.js`(91) / `manifest.json`(19)，合计 **4948 行**
- **排除范围**：`tests/`（测试夹具与断言）、`exceljs.min.js`（第三方 vendor）、枚举定义（如 `STATUS_DEFS`、`DEFAULT_SCHEMA`）
- **审查方式**：逐文件通读 + 跨文件交叉核对（重复实现、值域一致性、常量漂移）
- **结论**：未发现硬编码的密钥 / token / 端口 / 数据库连接信息；**无凭证泄露**。主要问题集中在 **错误处理被静默吞掉** 与 **同一概念多处重复实现/字面量散落** 两类。

---

## 一、总体结论

| 维度 | 结论 |
|---|---|
| 硬编码 URL / 接口 | 仅 1 处合法默认值（`api.deepseek.com`），但在 3 处重复 |
| 密钥 / token / 端口 / DB | **无**。AI Key 为 BYOK 存 localStorage，备份已剔除（P3 设计正确） |
| 超时 / 重试 | 全局**无统一策略**，`aiChat` 无超时无中断，其余均为 UI 延时魔法数字 |
| 魔法数字 | 集中在甘特图（`list.js`）、配额计算（`dashboard.js`）、各 `setTimeout` |
| 重复字面量 | **最突出**：列名 `'完成状态'` 出现 70 次、`'开发日期'` 37 次、`'专案名称'` 27 次，散落 9 个文件 |
| 配置不一致 | 3 处真实双轨：`EXCEL_FONT` vs 可配置样式、追加文件名 vs `buildFileName`、批量导出表头 vs `styleHeader` |
| 静默吞错 | 2 处高危：`store.js load()`、`sw.js install` |
| 未校验输入 | 上传文件无大小/行数上限；`aiChat` 未校验模型名字符集 |

---

## 二、按文件分组

### js/store.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 32 | 错误被静默吞掉 | **高** | `load()` 的 `catch(e){return def;}` 会把「localStorage 中 JSON 损坏」静默降级为默认值。用户无感知，之后任意一次 `save()` 即用空数组覆盖损坏数据 → **永久丢失且无痕迹**。建议：解析失败时保留原始串到 `wb_corrupt_<key>` 备份、弹出明确告警、进入只读保护态，由用户手动确认后再覆盖。 |
| 293-320 | 超时/重试缺失 | 中 | `aiChat` 的 `fetch` 无 `AbortController`、无 timeout、无重试。服务商无响应时按钮永久停在「润色中…」。建议：`AbortSignal.timeout(20000)` + 1 次重试 + finally 恢复按钮。 |
| 303 | 硬编码接口路径 | 中 | `/chat/completions` 硬编码，隐含「仅支持 OpenAI 兼容协议」的约束，既未校验也未在 UI 说明。建议：抽为 `AI_CHAT_PATH` 常量并在配置项旁注明协议要求。 |
| 23 / 296 / 300 + index.html:1011 | 重复字面量 | 中 | 默认值 `https://api.deepseek.com`、`deepseek-chat` 重复 4 处。建议：统一引用 `DEF_SETTINGS.aiBaseUrl / aiModel`。 |
| 229 | 配置不一致 | 中 | `EXCEL_FONT={name:'等线',size:11}` 现仅 `monthly.js` 使用，而 `export.js/list.js` 走可配置 `styleCell`。用户在配置中心设的字体对「月报汇总 Excel」无效，且对「生成新周报」有效 → 双轨。建议：删除 `EXCEL_FONT`，`monthly.js` 改用 `styleCell`。 |
| 2 vs entry.js:13 / app.js:7 / index.html:9 / dashboard.js:60 | 常量分散 | 中 | `LS_*` 常量集中在 store.js，但 `wb_draft`、`wb_theme`、`wb_cfg_v` 散落 4 个文件，且 `dashboard.js:60` 又抄了一份完整 key 列表。建议：全部 `wb_*` 键收归 store.js 的 `LS` 命名空间对象，dashboard 遍历 `Object.values(LS)`。 |
| 8 / 17 | 值域不一致 | 中 | `rangeBy` 与 `exportSortBy` 的取值混用两种域：`'entryDate'`（英文字段名）与 `'提出日期'/'开发日期'`（中文列名）、`'录入日期'`（既非字段也非列名）。建议：统一为 schema 列名或统一为字段标识，并提供映射表。 |
| 110 | 边界遗漏 | 中 | `normalizeStatus` 的 `MAP` 只覆盖 `暂停/取消/planning`；`planning` 那条已被下方 `toLowerCase` 回退覆盖（冗余）。若历史数据存在其它中文状态（如「已结案」）则无法归一。建议：把映射表提到模块级 `LEGACY_STATUS_MAP` 并补全历史值。 |
| 328 | 安全魔法数字 | 中 | PBKDF2 `iterations:150000` 裸写在参数对象里。建议：抽为 `PBKDF2_ITERATIONS` 具名常量并附调整依据注释（OWASP 建议值随时间上升，需可审计）。 |
| 251-252 | 资源泄漏 | 中 | `downloadJSON/downloadBlob` 创建的 `<a>` 未 append 到 DOM（Firefox 可能不触发），且 `URL.createObjectURL` 后从不 `revokeObjectURL`。建议：append → click → remove → `setTimeout(revokeObjectURL, 0)`。 |
| 164-167 | 硬编码列名 | 中 | `guessType()` 内列名数组与 `entry.js:203/221`、`export.js:222`、`monthly.js:74-77` 各自维护一份。建议：合并为单一 `COL` 常量表。 |
| 313 | 魔法数字 | 低 | `res.text().slice(0,200)` 截断长度。抽 `ERR_BODY_MAX=200`。 |
| 249 / 371 | 魔法数字 | 低 | toast `2200`ms、备份提醒 `86400000` + `days>7`。建议抽 `TOAST_MS`、`MS_PER_DAY`、`BACKUP_REMIND_DAYS`。 |
| 299 | 日志 | 低 | `console.warn` 提示 http 明文，仅开发者可见。建议同时在 UI 上给一次性提示。 |
| 58 | 转义不全 | 低 | `esc()` 未转义单引号 `'`；当前所有插值属性均用双引号，暂无风险，但属脆弱约定。建议补 `&#39;` 并加注释锁定用法。 |
| 192 / config.js:19,131,344,368,410 | 重复代码块 | 低 | `JSON.parse(JSON.stringify(x))` 深拷贝惯用法 6 处。建议抽 `deepClone()`。 |

### js/export.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 448 / 451 | 配置不一致 | 中 | 追加下载的文件名固定为 `原名_已追加.xlsx`，**不套用**用户配置的 `exportFilePrefix` / `exportFileDateFormat`；而同文件 L487「生成新周报」走 `buildFileName()` 会套用。两条通道口径不一。建议：统一走 `buildFileName()`，把「原名」降级为前缀缺省时的回退。 |
| 17 vs config.js:264 | 重复实现 | 中 | `toArgb()` 与 `toHex()` 是两份近似但返回值不同的颜色归一化实现（一个返回 `FF+hex`，一个返回 `#hex`）。建议：合并为 `normalizeHex(hex, {argb:true})`。 |
| 77-84 vs config.js:64-69 vs list.js:456-461 | 重复代码块 | 中 | 「找表头行（首个非空单元格 ≥3）+ 读取列名」逻辑三份拷贝，且阈值 `3` 在三处各写一遍。建议：抽 `findHeaderRow(ws)` / `readHeaders(ws, hr)` 到 store.js，阈值用 `MIN_HEADER_CELLS` 常量。 |
| 222 | 硬编码列名 | 中 | `CRITICAL_COLS` 硬编码 6 个列名，且未与 `DEFAULT_SCHEMA` 联动。建议在 schema 列定义上加 `critical:true` 元数据，由此推导。 |
| 363 + 398-422 | 边界假设 | 中 | `copyRowStyle(ws,rowNum,rowNum-1)` 假定「上一行是数据行」。当模板无任何数据行（`lastDataRow===excelHeaderRow`）时，会复制**表头样式**到数据行。建议：`rowNum-1 > excelHeaderRow` 才复制，否则跳过。 |
| 154-156 | 值域混用 | 中 | 同 store.js:8，`'录入日期'` 是字段别名、另两个是列名。建议统一。 |
| 66 / list.js:447 / config.js:56 | 未校验输入 | 中 | 上传 `.xlsx` 只校验扩展名，**无大小/行数上限**；`f.arrayBuffer()` + `wb.xlsx.load()` 在 100MB+ 文件上会长时间阻塞主线程且无进度反馈。建议：加 `MAX_UPLOAD_BYTES`（如 20MB）与 `MAX_ROWS` 前置检查 + loading 态。 |
| 433-454 | 重复计算 | 低 | `doExportInner` 再次调用 `getRangeTasks()`，而 `validateExportStructure()` 内部已调过一次。建议：校验结果中回传任务列表。 |
| 68 / config.js:58 / list.js:449 | 重复字面量 | 低 | `/\.xlsx$/i` 校验三处。建议抽 `isXlsx(name)`。 |
| 66-91 | 行为不一致 | 低 | `onchange` 仅在失败分支 `e.target.value=''`，成功分支不重置。建议统一在末尾重置。 |

### js/list.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 267-273 | 无原子写入 / 无回滚 | **高** | 回收站「恢复」先 `tasks.push` + `save(LS_TASKS)`，再 `save(LS_TRASH)`；**两次 save 均未检查返回值、无回滚**。若任务库写成功而回收站写失败（配额满），任务会**同时存在于两处**（重复）；反之则永久丢失。本项目已有 `saveAtomic()` 可直接复用。建议：改用 `saveAtomic([[LS_TASKS,...],[LS_TRASH,...]])`。 |
| 246 / 284 / 288 / 296 / 434 / 437 / 493 | 错误被静默忽略 | 中 | 清空回收站、清空全部任务库、撤销已追加标记、导入任务、Excel 导入等 7 处 `save()` 未检查返回值，界面仍提示「已完成」。其中 `clearTasks`（L284）一次清两个键却非原子。建议：统一接入 `saveAtomic()` 或至少检查返回值后分支提示。 |
| 151 vs export.js:464 | 配置不一致 | 中 | 批量导出表头用 `styleCell(cell)`，未用 `styleHeader(cell)` → 用户配置的表头背景色对「批量导出」无效。建议：改用 `styleHeader`。 |
| 544-549 | 命名不清 + 魔法数字 | 中 | `rangeSel==='30'` 实际跨度是 `-15 ~ +45`（61 天），`'90'` 是 `-30 ~ +60`（91 天），**选项名与实际跨度不符**。建议：改名或直接改为 `{days:30}` 语义，并把偏移对抽为具名映射。 |
| 683-691 | 性能隐患 | 中 | 为每个 `.gantt-bar-col`（即每个任务行）都 `createElement` 一条「今天线」并写内联 `style`，任务上千时 DOM 节点翻倍。建议：改为在图表容器上用 1 条绝对定位线 + CSS 变量控制位置。 |
| 456-461 | 重复代码块 | 中 | 同 export.js 第 3 条（表头识别三处重复）。 |
| 16 | 魔法哨兵值 | 中 | `'__not_closed'` 作为筛选项特殊值硬编码在模板与过滤逻辑中。建议：抽 `FILTER_NOT_CLOSED` 常量。 |
| 103 / 106 | 重复字面量 | 低 | 历史显示上限 `15` 出现在 `slice(0,15)` 与文案「仅显示最近 15 条」两处，改一处易漏另一处。建议：`const HISTORY_SHOW=15;` 并用模板串。 |
| 562 / 557-558 / 619 / 688 | 硬编码布局与魔法数字 | 低 | `dayWidth=14`、±3 天、预估 +7 天、`top:-32px; width:2px` 内联样式散落。建议：抽 `GANTT` 配置对象，样式移入 CSS 类。 |
| 502 / 505 | 死状态 | 低 | `currentView` 只被赋值、从未被读取（`switchView` 用显式参数）。建议：删除，或补全所有分支的读取使其真正生效。 |
| 134 / 125 | 全局可变状态 | 低 | `window.__batchSel` 全局 + 惰性初始化，与 `moveToTrash` 等已封装逻辑风格不一。建议：收敛为模块内 `let batchSel=new Set()`。 |
| 827 / 888-890 | 命名不清 | 低 | `calY` / `calM` 缩写。建议：`calYear` / `calMonth`。 |

### js/entry.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 266 | 潜在逻辑 bug | 中 | 语音 `interimResults=true` 时，同一段中间结果会多次触发 `onresult`，`ta.value += text` **重复累加**，最终文本出现大量重复片段。建议：区分 `isFinal`，仅对最终结果追加；或对 interim 结果先回滚上一版 interim 再写入。 |
| 13 | 常量分散 | 中 | `LS_DRAFT='wb_draft'` 定义在 entry.js，脱离 store.js 的 `LS_*` 簇。建议：统一到 store.js。 |
| 94 | 硬编码 / 不可配置 | 中 | 必填列 `专案名称 / 完成状态` 写死在渲染逻辑中，用户无法调整。建议：schema 列定义增加 `required:true`，由此判定。 |
| 203 / 221 vs store.js:164 | 重复字面量 | 中 | 日期字段列表 `['提出日期','开发日期','测试日期','结案日期']` 两份。建议：抽 `DATE_COLS` 常量。 |
| 17 | 超时魔法数字 | 低 | 草稿防抖 `800`ms。建议：`DRAFT_DEBOUNCE_MS`。 |
| 92 | 冗余逻辑 | 低 | `hasVal` 的三元 `(col.def && col.def!=='{{today}}' ? true : col.def==='{{today}}')` 恒等于 `!!col.def`。建议：简化。 |
| 551 / 581 | 命名不清 | 低 | 同为「展示上限」，一处叫 `MAX`、一处叫 `MAXS`。建议：统一 `PANEL_ITEM_MAX`。 |
| 106-107 | 冗余代码 | 低 | 先追加 `<option selected>`，随后 L127 又 `el.value=val` 赋值，二者重复。建议：保留其一。 |

### js/config.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 243-306 | 重复代码块 | 中 | 12 个配置控件是同一段样板（读 `loadSettings()` → 赋初值 → `onchange → saveCfg`）。建议：改为表驱动 `[{id, key, transform}]` 循环绑定，新增配置项只加一行。 |
| 106 / 117 / 334 + store.js:64,72 + entry.js:92,99,436 | 重复字面量 | 中 | 日期默认值哨兵 `'{{today}}'` 共 7 处。建议：抽 `DEF_TODAY='{{today}}'` 常量。 |
| 394 vs store.js:164 vs index.html | 枚举分散 | 中 | 列类型合法值 `['text','dropdown','date','textarea','auto']` 与 `guessType()`、index.html 的类型下拉各自维护。建议：抽 `COL_TYPES` 单一来源，三处引用。 |
| 264 | 重复实现 | 中 | 同 export.js 第 2 条（`toHex` / `toArgb`）。 |
| 64-69 | 重复代码块 | 中 | 同 export.js 第 3 条（表头识别）。 |
| 56 | 未校验输入 | 中 | 同 export.js 第 6 条（上传无大小上限）。 |
| 276 | 空值处理 | 低 | `sbWrap.querySelector('input[data-sbg=...]').value` 未判空，找不到节点即抛 `TypeError` 中断整个配置初始化。建议：`?.value ?? ''`。 |
| 240 | 错误被静默忽略 | 低 | `saveCfg` 不检查 `save()` 返回值，配额满时仍提示「默认设置已保存」。建议：检查后分支提示。 |
| 270 / 275 | 硬编码颜色 | 低 | 默认色 `#D9E1F2`、`#C6EFCE` 裸写。建议：抽 `DEF_HEADER_BG` / `DEF_STATUS_BG`。 |
| 19 / 131 / 344 / 368 / 410 | 重复代码块 | 低 | 深拷贝惯用法（见 store.js 末条）。 |

### js/dashboard.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 60 | 常量漂移 | 中 | localStorage key 列表在此硬编码抄了一遍，与 store.js 的 `LS_*` 无联动。新增存储键时此处会漏 → 存储用量统计偏低，用户误判距配额上限还有余量。建议：遍历 `Object.values(LS)`。 |
| 116 | 魔法数字 | 中 | `st.total/1048576/5*100`：`1048576`（1MB）与 `5`（假定配额 5MB）均为裸数字，且 5MB 是浏览器典型值而**非规范保证值**。建议：抽 `BYTES_PER_MB` / `ASSUMED_QUOTA_MB` 并注明「估值」。 |
| 177-184 vs 273-277 | 重复代码块 | 中 | 「按客户/按状态」的排序与行渲染在 PDF 与 Word 两条导出路径各写一遍。建议：抽 `buildCustRows(d)` / `buildStatusRows(d)`。 |
| 192-255 / 279-295 | 可维护性 | 中 | 两处大段内联 HTML + 内联 `<style>` 模板字符串。建议：样式移入 CSS，HTML 走模板函数。 |
| 25 | 魔法数字 | 低 | `86400000`。建议：`MS_PER_DAY`。 |
| 168-169 vs 269-270 | 重复代码块 | 低 | 日期格式化 `p=n=>padStart(2,'0')` 与拼串重复。建议：复用 `todayStr()` 或抽 `fmtDate`。 |
| 109-110 | 魔法数字 | 低 | 健康检查展示上限 `8`。建议：`HEALTH_SHOW_MAX`。 |
| 261 vs monthly.js:143 | 配置不一致 | 低 | 打印前延时一处 `350`ms、一处 `100`ms，无依据。建议：统一常量。 |
| 256 / monthly.js:143 | 安全 | 低 | `window.open('','_blank')` 无 `noopener`（需 `document.write` 故无法直接加）。建议：改用 `blob:` URL 或隐藏 iframe 打印，彻底规避。 |

### js/monthly.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 81 / 92 / 98 | 配置不一致 | 中 | 使用硬编码 `EXCEL_FONT`，未走可配置 `styleCell`；表头也未走 `styleHeader`。用户配置的字体/表头色对月报 Excel 全部无效。建议：改用 `styleCell` / `styleHeader`。 |
| 22 vs 170 | 重复实现 | 中 | 同文件内，`renderMonthly` 的 `totalTasks` 手写「按录入年月筛选」，而 L170 已有 `monthTasksOf(mv)`。两处等价实现并存，易漂移。建议：`const totalTasks = monthTasksOf(mv).length;`。 |
| 30-38 vs 58-66 | 重复代码块 | 中 | 「按勾选字段拼每行文本」逻辑在预览与导出中完全重复。建议：抽 `buildMonthlyLines(data, {cust,owner,status})`。 |
| 131 vs export.js:122 | 重复代码块 | 中 | `setDefaultRangeWp()` 与 `setDefaultRange()` 近乎相同（均为「本周一 ~ 周五」），仅目标元素不同。建议：合并为 `applyWeekRange(startSel, endSel)`。 |
| 10 | 边界 / 配置不一致 | 中 | `$('#mf_dedup').checked : true` 的元素兜底是 `true`，而 `loadSettings().monthDedup` 默认也是 `true`，但若用户在配置中心设为 `false` 且元素尚未初始化，瞬时取值会与配置相反。建议：兜底改为读 `loadSettings().monthDedup`。 |
| 74-77 | 硬编码列名 | 低 | `['序号','专案名称','客户','负责人','完成状态']` 裸写。建议：引用 `COL` 常量。 |
| 95-97 vs 27-28 | 重复计算 | 低 | 完成数与完成率在 `renderMonthly` 与导出中重复计算。建议：抽 `monthSummary(data)`。 |

### js/app.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 7 / 10 / 11 + index.html:9 + dashboard.js:60 | 重复字面量 | 中 | `'wb_theme'` 键散落 5 处。建议：并入 `LS` 常量。 |
| 57 | 硬编码列表 | 低 | tab 列表 `['entry','dashboard','list','config','export','monthly']` 与 index.html 的 DOM 需手工同步。建议：由 `nav button[data-tab]` 动态采集。 |
| 25-30 | 硬编码映射 | 低 | 快捷键 → tab 映射裸写。建议：抽 `HOTKEY_MAP` 常量（便于将来做键位设置）。 |
| 79 | 魔法数字 | 低 | `setTimeout(...,1500)`。建议：`BOOT_TOAST_DELAY_MS`。 |
| 38 | 硬编码路径 | 低 | `register('sw.js')` 相对路径裸写。建议：`SW_PATH` 常量。 |

### sw.js

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 40 | 错误被静默吞掉 | 中 | 预缓存 `catch(err){}` 完全静默。若某资源 404，离线时该资源缺失且无任何提示，表现为「部分功能不可用」的难排查故障。建议：至少 `console.warn(url, err)` 并统计失败数。 |
| 5 vs CHANGELOG / manifest.json | 配置不一致 | 中 | `CACHE='wb-v5'` 版本号与 CHANGELOG 的 `v1.0.2`、manifest 无 version 字段三套体系互不联动，靠人工记忆同步。建议：单一版本常量，构建/发布时注入（本项目无构建，可写死一处供三处引用）。 |
| 6-21 vs index.html:1193-1201 | 配置不一致 | 中 | 资源清单与 HTML 的 9 个 `<script>` 列表两处维护，新增 js 文件漏改其一即导致新增文件不被缓存（离线 404）。建议：注释互指，或加一条巡检脚本比对。 |
| 58 / 73 / 84 | 重复代码块 | 低 | `caches.open(CACHE).then(c=>c.put(...)).catch(()=>{})` 三份。建议：抽 `putCache(req,res)`。 |
| 26 | 硬编码路径规则 | 低 | `/\/js\/[^/]+\.js$/` 目录名硬编码。建议：与 `ASSETS` 同源推导。 |

### index.html

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 全文（无 `<meta http-equiv="Content-Security-Policy">`） | 安全 | 中 | 项目大量使用 `innerHTML` 渲染用户可控内容（列名、专案名、客户名、备注）。虽然数据本地自产、且渲染处普遍用了 `esc()`，但缺少 CSP 纵深防御，一旦出现一处漏转义即为存储型 XSS（可读 localStorage 中的明文 AI Key）。建议：加 CSP（至少 `default-src 'self'`），或统一改为 `textContent`/`createElement` 构造。 |
| 20 | 性能隐患 | 中 | `exceljs.min.js`（947 KB）在首屏即 `defer` 全量加载并解析，而绝大多数会话不会用到导出功能。建议：改为首次点击导出/导入时动态 `import()` 或注入 script。 |
| 9 | 重复字面量 | 中 | 同 app.js 第 1 条（`wb_theme`）。 |
| 1011 | 重复字面量 | 低 | 默认 AI 地址 placeholder 重复。建议：由 JS 初始化填充。 |
| 21-1192 | 可维护性 | 低 | 约 1170 行内联 `<style>` 与结构混在单文件。建议：拆出 `styles.css`（注意需同步更新 sw.js 的 ASSETS）。 |

### manifest.json

| 行号 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 全文（缺 `version`） | 配置不一致 | 低 | 无 `version` 字段，无法与 sw 缓存版本、CHANGELOG 对齐。建议：补 `version` 并与缓存键同源。 |

### 跨文件 / 全局

| 位置 | 问题类型 | 严重度 | 说明与建议改法 |
|---|---|---|---|
| 全项目 | 重复字面量（**最大项**） | 中 | 列名字面量散落 9 个文件：`'完成状态'` 70 次、`'开发日期'` 37 次、`'专案名称'` 27 次、`'客户'` 26 次、`'结案日期'` 25 次、`'提出日期'` 23 次、`'备注'` 5 次……改名需全项目搜索替换，且无法静态校验。建议：在 store.js 建 `const COL={PROJECT:'专案名称', STATUS:'完成状态', ...}`，全量替换；后续改名只改一处。 |
| 全项目 | 错误监控缺失 | 中 | 无 `window.onerror` / `unhandledrejection` 全局捕获。PWA 离线场景下用户侧异常完全不可见。建议：加全局捕获并落到内存错误队列，在配置页提供「查看最近错误」。 |
| 全项目 | 未国际化文案 | 低 | 全部 UI 文案为中文内联字符串，无 i18n 层。**判断**：本项目定位为单语言本地工具，引入 i18n 收益不抵成本，建议维持现状，仅需在 README 中明确「不支持多语言」。 |
| 全项目 | 超时 / 重试策略缺失 | 中 | 除 `aiChat` 外无网络调用，故影响面小；但缺少统一约定，后续新增接口会各自为政。建议：在 store.js 提供 `fetchWithTimeout(url, opt, ms)` 统一封装。 |

---

## 三、优先修复清单（按严重程度排序）

### 高（建议立即修，涉及数据丢失风险）

| # | 位置 | 问题 | 修复要点 |
|---|---|---|---|
| 1 | `store.js:32` | `load()` 静默吞 JSON 异常，损坏数据被静默清空并可能被覆盖 | 解析失败时备份原始串到 `wb_corrupt_*`、明确告警、进入只读保护，禁止自动覆盖 |
| 2 | `list.js:267-273` | 回收站恢复/彻底删除非原子、无回滚，可能造成任务重复或永久丢失 | 改用已有的 `saveAtomic([[LS_TASKS,…],[LS_TRASH,…]])` |

### 中（按修复收益 / 改动成本比排序）

| # | 位置 | 问题 |
|---|---|---|
| 3 | `store.js:293-320` | `aiChat` 无超时无中断，失败即永久卡在「润色中…」 |
| 4 | `export.js:66` `list.js:447` `config.js:56` | 上传文件无大小/行数上限，大文件阻塞主线程 |
| 5 | `list.js` 246/284/288/296/434/437/493 | 7 处 `save()` 未检查返回值却提示成功 |
| 6 | `store.js:229` + `monthly.js:81,92,98` | `EXCEL_FONT` 与可配置导出样式双轨，配置对月报 Excel 无效 |
| 7 | `list.js:151` | 批量导出表头未用 `styleHeader`，表头背景色配置失效 |
| 8 | `export.js:448,451` | 追加文件名未套用配置的前缀与日期格式，与「生成新周报」口径不一 |
| 9 | 全项目 | 列名字面量 200+ 处 → 抽取 `COL` 常量表（**收益最大，可分批**） |
| 10 | `export.js:77-84` `config.js:64-69` `list.js:456-461` | 表头识别逻辑三处重复 → 抽公共函数 |
| 11 | `export.js:17` `config.js:264` | `toArgb` / `toHex` 两份实现 → 合并 |
| 12 | `entry.js:266` | 语音 `interimResults` 导致文本重复累加 |
| 13 | `monthly.js:22` vs `monthly.js:170` | 同文件两套「按年月筛选」实现 |
| 14 | `monthly.js:30-38` vs `58-66`；`dashboard.js:177-184` vs `273-277` | 导出路径重复代码块 |
| 15 | `store.js` 2 / `entry.js:13` / `app.js:7` / `index.html:9` / `dashboard.js:60` | localStorage 键常量分散且 dashboard 抄了一份列表（会漂移） |
| 16 | `config.js:243-306` | 12 个配置控件样板重复 → 表驱动 |
| 17 | `store.js:8` `export.js:154-156` | 排序/范围依据值域混用（`entryDate` vs 中文列名） |
| 18 | `store.js:110` | `normalizeStatus` 历史值映射表覆盖不全 |
| 19 | `entry.js:94` | 必填列硬编码，不可配置 |
| 20 | `store.js:251-252` | `downloadJSON/downloadBlob` 未 `revokeObjectURL`、未挂载 `<a>` |
| 21 | `store.js:328` | PBKDF2 迭代次数裸写，不可审计 |
| 22 | `sw.js:40` | 预缓存失败被静默吞掉 |
| 23 | `sw.js:5,6-21` | 缓存版本号与资源清单需与 HTML/CHANGELOG 手工同步 |
| 24 | `list.js:544-549` | 甘特范围选项名（30/90）与实际跨度（61/91 天）不符 |
| 25 | `list.js:683-691` | 「今天线」每行一个 DOM 节点，任务量大时膨胀 |
| 26 | `index.html` | 无 CSP；`innerHTML` 广泛使用的纵深防御缺失 |
| 27 | `index.html:20` | exceljs 947KB 首屏全量预载 → 改为按需加载 |
| 28 | `monthly.js:10` | 去重开关兜底值与配置默认值不一致 |
| 29 | `dashboard.js:116` | 5MB 配额与 1MB 换算裸写，且 5MB 非规范保证值 |
| 30 | 全项目 | 缺全局 `window.onerror` / `unhandledrejection` 捕获 |

### 低（可择机清理）

- `store.js:313` 错误体截断 200；`store.js:249` toast 2200ms；`store.js:371` 备份提醒 7 天 / `86400000`
- `store.js:58` `esc()` 未转义单引号；`store.js:299` 仅 console 提示 http
- `list.js:16` `'__not_closed'` 哨兵；`list.js:103/106` 历史上限 15；`list.js:562/557/619/688` 甘特布局魔法数字
- `list.js:502` `currentView` 死状态；`list.js:134` `window.__batchSel` 全局；`list.js:827` `calY/calM` 缩写
- `entry.js:17` 800ms 防抖；`entry.js:92` 冗余三元；`entry.js:106-107` 重复赋值；`entry.js:551/581` 命名不一致
- `config.js:276` querySelector 未判空；`config.js:240` saveCfg 不检查返回值；`config.js:270/275` 默认色裸写
- `dashboard.js:25` `86400000`；`dashboard.js:109` 上限 8；`dashboard.js:261` vs `monthly.js:143` 打印延时不一致；`dashboard.js:256` / `monthly.js:143` `window.open` 无 noopener
- `monthly.js:74-77` 列名数组；`monthly.js:95-97` 完成率重复计算
- `app.js:57` tab 列表；`app.js:25-30` 快捷键映射；`app.js:79` 1500ms；`app.js:38` SW 路径
- `sw.js:58/73/84` 缓存写入三处重复；`sw.js:26` 路径正则硬编码
- `manifest.json` 缺 `version`；`index.html` 内联样式 1170 行未拆分
- 全项目 `JSON.parse(JSON.stringify(x))` 深拷贝 6 处 → 抽 `deepClone()`

---

## 四、明确排除项（合理常量，不计入问题）

- `STATUS_DEFS` / `STATUS_VALUES` / `DEFAULT_SCHEMA` / `DEFAULT_DROPDOWNS`：枚举与默认定义，属合理常量
- `TRASH_CAP=50` / `HISTORY_CAP=50`：已具名，语义清晰
- `LS_SCHEMA` 等 `LS_*`：已集中定义为常量
- `tests/` 下的测试数据与断言
- `exceljs.min.js`：第三方 vendor 产物
- `store.js:23` `aiBaseUrl` 默认值：业务默认值，非硬编码密钥（仅重复问题已单列）
