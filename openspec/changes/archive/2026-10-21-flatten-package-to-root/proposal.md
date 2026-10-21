# Proposal

## Why

仓库当前是「git/OpenSpec 根目录里嵌套同名包目录」的布局：所有文档、overlay 与安装命令都背着 `dsh-learn-plugin/` 前缀，构建产物（`lib/`、`.tgz`）散落在包根且游离于版本控制之外，仓库文档与包文档拆成两份 README，拍平后会争抢同一个文件名。项目目前仅本地 link 安装、无外部消费者，正是消除这层嵌套的最低成本窗口。

## What Changes

- **拍平目录**：`dsh-learn-plugin/` 下的包内容（`package.json`、`tsconfig.json`、`pnpm-lock.yaml`、`src/`、`client/`、`skills/`、`test/`、`cordis.dev.yml`、`cordis.patch.yml`、包 README）用 `git mv` 上移至仓库根目录，删除空目录；依赖在根目录重装（`node_modules`、`.tmp-npm-cache/` 不搬移，旧 `lib/` 与 `.tgz` 不迁移而是重建）。
- **构建产物统一入 `dist/`**：`tsconfig.json` 的 `outDir` 由 `lib` 改为 `dist/lib`；`package.json` 的 `main`/`types`/`exports`/`files` 同步改指 `dist/lib`；打包脚本以 `--pack-destination dist` 将 `.tgz` 输出到 `dist/`；根 `.gitignore` 已含 `dist/`（无需新增），删除失效规则 `dsh-learn-plugin/lib/`。
- **修正绝对路径引用**：`cordis.dev.yml` 与 `test/` 下 7 个 `*.cordis.yml` 内嵌的绝对路径改为新根位置下的 `dist/lib/index.js`。
- **合并两份 README**：仓库文档与包文档合并为单一根 `README.md`，按「项目概述 / 项目功能介绍 / 使用说明 / 项目贡献方式」编排；安装指引随拍平后的目录更新；删除「与原版 learn 的差异」整节。
  同时删除整体基于嵌套布局的过时迁移文档 `docs/migrate-learn-to-dsh.md`。
- **specs 增补**（承接被删 README 小节中未覆盖的行为事实）：`teaching` 与 `lesson-visuals` 各新增一条子代理执行环境要求——子代理不指定专属模型、随会话模型；工具范围由提示词约束而非硬白名单。

插件对外行为不变（入口路径经 `main`/`exports` 内部消化，overlay 引用在本次一并修正），无 BREAKING 变更。

## Capabilities

### New Capabilities

（无——目录、构建与文档调整不构成新的系统行为契约。）

### Modified Capabilities

- `teaching`: 「researcher 子代理契约」新增执行环境要求：不指定专属模型（随会话模型），工具范围经提示词约束而非平台级硬白名单。
- `lesson-visuals`: 「委派 maker 子代理创作」新增同等的执行环境要求（模型随会话继承、提示词约束工具范围）。

## Impact

- **仓库布局**：`dsh-learn-plugin/` 目录消失，根目录即包根；`pnpm install` 位置变为根目录。
- **构建与发布**：`tsc` 产物路径、npm 入口字段、`files` 清单、pack 输出目的地全部改指 `dist/`；旧 `lib/` 与根下散落的 `.tgz` 删除后由新流程重建。
- **开发验证**：8 个 overlay yml 的绝对路径需同步更新，三组 harness 与 restore-probe 的运行命令中的路径前缀随之变化。
- **文档**：两份 README 合并为一；文档内所有 `cd dsh-learn-plugin`、`../README.md` 式引用随布局更新。
  删除过时的 `docs/migrate-learn-to-dsh.md`（其安装/验证指引全部基于嵌套布局，职责已由合并后的根 `README.md` 覆盖，设计决策保留于归档变更 `openspec/changes/archive/2026-10-21-migrate-learn-to-dsh/`）。
- **specs**：`teaching`、`lesson-visuals` 各新增一条 requirement（含 scenario）。
- **不受影响**：`src/` 逻辑、`client/`、`skills/` 内容、`openspec/` 结构、`.gitignore` 中 `dist/` 既有规则。
