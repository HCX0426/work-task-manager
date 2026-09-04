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
- **SRI（子资源完整性）**：当前**未**启用 `integrity` 属性（运行时不挂哈希）。原因：该资源同源（GitHub Pages 同域）提供，且已通过 `sw.js` 版本化预缓存；若追加 SRI，每次换包都需同步更新哈希，易因哈希不一致导致脚本被浏览器拒绝（高风险、低收益）。如改为跨域 CDN 托管，再补 `crossorigin="anonymous"` + `integrity="sha384-..."`。
- **当前文件 SRI（仅供换包核验，不挂运行期）**：`sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz`（sha256 `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9`，947702 字节）。后续任何替换都必须使该哈希变化，否则视为无效替换。
- **版本/许可证溯源**：文件本身仅含构建日期，无显式版本号与 LICENSE 文本；本说明文件为该信息的唯一权威记录，升级时同步更新上表。

## 升级评估（2026-09-04）

审计项 L7 建议"升级过旧 ExcelJS（标注 3.33.0）"。实测结论：**维持现状，不替换**。

证据链：
1. `npm view exceljs version` → 最新稳定 `4.4.0`（dist-tag `latest`；另有 `4.4.1-prerelease.0` 预发布、`0.4.8` beta，均不取）。
2. `npm pack exceljs@4.4.0`（registry 完整性校验：shasum `cfb1cb8dcc82c760a9fc9faa9e52dadab66b0156`，integrity `sha512-XctvKaEMaj1Ii...s/VadKIS6llvg==`）→ 提取 `package/dist/exceljs.min.js`。
3. 与仓库现行 `exceljs.min.js` 逐字节比对：**sha256 完全一致**（`7e49da6...`），947702 字节、文件头 `/*! ExcelJS 19-10-2023 */`、内部 `version:"3.33.0"` 均相同。

结论：ExcelJS 官方发布的 **minified UMD 浏览器包自 3.33.0 起构建冻结**，4.4.0 的 npm 包虽含更新的 `lib/`（CommonJS 源码）与 `dist/es5/`（ES5 模块），但本 PWA 实际加载的 `dist/exceljs.min.js` 未再更新。因此：
- 替换 vendor 文件 = **零字节变化**，无功能收益；
- 强行替换还会**无谓触发 `sw.js` 缓存失效**（用户需重取 948KB），纯负面；
- 故 1.0.9 不替换、不升 `APP_VERSION`、不新增导出回归（无可测差异）。

后续若确需功能层面更新 ExcelJS，唯一路径是改用 `dist/es5/exceljs.browser.js`（ES5 构建、模块格式不同），并重做 `store.js` 的 `loadExcelJS()`（暴露的全局名/挂载方式需复核）——属重构，超出"换包"范围，标记为后续选项，不在本轮执行。
