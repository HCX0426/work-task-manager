对 `CODE_REVIEW_2026-09-03.md` 做逐项对账式复查（高 2 + 中 28 + 低 35 + 全局 4 全部重验），发现并补齐 3 处漏网：

### 修复

- **看板 PDF/Word 报告去重（审计 #14 dashboard 半边）**：「按客户统计 / 按状态分布 / 逾期未完成」的排序与表格行 HTML 在 `exportReportPDF` 与 `exportReportWord` 各写一遍，抽为公共函数 `custStatRows(d)` / `statusStatRows(d)` / `overdueRows(d)`（看板页自身的图形化渲染不受影响）。
- **README 注明界面语言（审计全局第 3 条）**：功能特性区补「仅中文（单语言本地工具，不引入 i18n 层）」。
- **AI 默认地址 placeholder 去重（审计 index.html 低项）**：HTML 不再硬编码服务地址，改由 config.js 用 `AI_DEF_BASE_URL` 填充 placeholder。

### 验证

- 回归 10 套件 PASS=226 FAIL=0；改动文件 `node --check` 通过
- 完整版本记录见 [CHANGELOG](https://github.com/HCX0426/work-task-manager/blob/main/CHANGELOG.md)

**Full Changelog**: https://github.com/HCX0426/work-task-manager/compare/v1.0.4...v1.0.5
