# 工作任务管理

本地优先的离线 PWA 工具：在浏览器里完成**工作任务录入、看板统计、列表管理、Excel 导出、周报/月报生成**。数据全部存在浏览器本地（localStorage），不上传任何服务器。

> 在线使用：https://hcx0426.github.io/work-task-manager/

## 功能特性

- **每日录入**：按日期补录多条任务，支持草稿自动保存与恢复
- **数据看板**：工作量 / 完成率 / 分布 / 逾期一屏总览，可导出 PDF、Word 汇报
- **任务列表**：搜索、筛选、排序，支持卡片 / 甘特 / 看板 / 日历多种视图、批量操作与回收站
- **配置中心**：列结构（名称 / 类型 / 格式）、模板、默认设置、下拉选项可配置，支持 AI 润色 BYOK Key
- **导出追加**：与 Excel 交互生成周报 / 月报，去重防重复追加
- **月报汇总**：按月聚合，生成月度复盘（已完成 / 进行中 / 待处理 / 逾期）
- **离线可用**：Service Worker 缓存，断网也能用；纯静态，无需后端

## 本地运行

方式一（最简单）：直接用浏览器打开 `index.html` 即可（`file://` 也能跑，数据存浏览器）。

方式二（本地静态服务，推荐用于调试 PWA / Service Worker）：

```bash
# 任选其一，在仓库根目录执行
python -m http.server 8080
# 或
npx serve .
```

然后访问 `http://localhost:8080`。

## 技术栈

- 原生 JavaScript（vanilla JS，无构建步骤、无框架）
- 数据持久化：localStorage（原子多键写入，保存失败自动回滚）
- 离线：Service Worker（`sw.js`）+ Web App Manifest（`manifest.json`）
- Excel 导出：ExcelJS（按需异步加载）
- 报表：PDF（浏览器打印）、Word（HTML 包装 `.doc`）

## 数据说明

所有任务数据仅保存在**当前浏览器的 localStorage** 中，不会上传任何服务器。更换浏览器 / 设备需通过「任务列表 → 全量备份」导出后再导入。

## 目录结构

```
index.html            入口（PWA 外壳）
manifest.json         PWA 清单
sw.js                 Service Worker（离线缓存）
icon.svg              应用图标
exceljs.min.js        Excel 导出依赖（异步加载）
js/                   各功能模块
  app.js              启动 / 路由
  store.js            数据层（持久化、聚合、工具函数）
  config.js           配置中心
  entry.js            录入
  list.js             任务列表
  dashboard.js        数据看板 + PDF/Word 汇报
  monthly.js          月报 / 周报 / 复盘
  export.js           Excel 导出
  help.js             帮助
tests/                内置回归测试（Node 直接运行，如 node tests/_dash_reg.js）
```

## 部署

通过 GitHub Pages 自动部署：推送到 `main` 分支即触发 `.github/workflows/pages.yml`，将仓库根目录发布为静态站点。

## License

[MIT](LICENSE) © 2026 HCX0426
