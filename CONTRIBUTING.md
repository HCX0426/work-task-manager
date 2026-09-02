# 参与贡献

感谢你考虑为「工作任务管理」贡献力量！这是一个**纯静态、无构建步骤**的本地优先 PWA，技术栈就是原生 JavaScript + localStorage。

## 本地开发

```bash
# 方式一：直接双击 index.html（file:// 也能跑）
# 方式二：本地静态服务（调试 PWA / Service Worker 推荐）
python -m http.server 8080
# 或
npx serve .
```

访问 http://localhost:8080 即可。

## 代码约定

- **原生 JavaScript**，不使用框架、不引入打包器。
- 新增运行时依赖需谨慎——优先考虑原生 API；Excel 导出已用仓库内置的 `exceljs.min.js`（异步按需加载）。
- 数据**只存浏览器本地**（localStorage），任何代码都不得上传用户数据。
- 改动尽量小且聚焦，避免一次性大重构。

## 测试

回归测试位于 `tests/`，纯 Node 运行、零第三方依赖（仅用内置 `fs`/`path` 与仓库内 `exceljs.min.js`）：

```bash
node tests/_dash_reg.js      # 看板/PDF 回归
node tests/_export_reg.js    # 导出回归
# 其余 _cfg_reg / _fix_ab_reg / _monthly_reg / _restore_reg / _review_reg 同理
```

推送到 `main` 会触发 GitHub Pages 部署，部署前 CI 会自动跑全部回归测试，任一失败将阻断发布。

## 提交规范

提交信息建议采用 `type: 简述` 形式，例如：

- `fix: 修复导出追加去空行`
- `feat: 新增甘特图视图`
- `docs: 补充 README`
- `chore: 清理临时脚本`

## 提交流程

1. Fork 并创建分支。
2. 改动 + 跑相关测试。
3. 发起 Pull Request，填写模板，关联 Issue。
