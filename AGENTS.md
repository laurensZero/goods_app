# AGENTS.md

本项目的完整约定见 [CLAUDE.md](./CLAUDE.md)，请先读它。

## 测试策略（硬性约定）

全量测试（223 个文件）很慢，**默认不要跑 `npm run test` 全量**：

1. 改完代码定向跑：`grep -rln "<改动的导出名/关键字>" src --include="*.test.js"` 找出受影响的测试文件，`npx vitest run <文件...>`。
2. 或 `npx vitest run --changed HEAD`，只跑与未提交改动相关的测试。
3. 全量仅限：提交前涉及共享工具（`utils/`、`stores/`、`services/sync`）的改动、批量重构后；跑时放后台。
