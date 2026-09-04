# 第三方依赖：ExcelJS（vendor）

本目录/根目录下的 `exceljs.min.js` 为**离线内置**的 Excel 生成库，供「导出追加 / 生成新周报」按需动态加载（见 `store.js` 的 `loadExcelJS()`），不依赖 CDN，保证 PWA 离线可用。

| 项 | 值 |
| --- | --- |
| 库 | ExcelJS |
| 版本 | 3.33.0（文件头注释 `/*! ExcelJS 19-10-2023 */`，内部 `version:"3.33.0"`） |
| 构建日期 | 2023-10-19 |
| 许可证 | MIT |
| 来源 | npm `exceljs@3.33.0` / GitHub `exceljs/exceljs` |
| 体积 | 约 948 KB（minified，单行） |
| 加载方式 | 运行时 `loadExcelJS()` 动态注入 `<script>`，不在首屏同步加载（避免阻塞解析，#27） |
| 缓存 | `sw.js` 已将其列入 `ASSETS` 预缓存清单，与 `APP_VERSION` 联动（升级即失效重取） |

## 维护约定
- **升级**：替换 `exceljs.min.js` 后，必须同步 `sw.js` 的 `APP_VERSION`（或 `CACHE` 键），否则旧缓存命中会导致新文件不生效。
- **SRI（子资源完整性）**：当前**未**启用 `integrity` 属性。原因：该资源同源（GitHub Pages 同域）提供，且已通过 `sw.js` 版本化预缓存；若追加 SRI，每次换包都需同步更新哈希，易因哈希不一致导致脚本被浏览器拒绝（高风险、低收益）。如改为跨域 CDN 托管，再补 `crossorigin="anonymous"` + `integrity="sha384-..."`。
- **版本/许可证溯源**：文件本身仅含构建日期，无显式版本号与 LICENSE 文本；本说明文件为该信息的唯一权威记录，升级时同步更新上表。
