# Design

## Context

见 proposal.md 的 Why。当前约束：仓库根 = git/OpenSpec 根，npm 包在 `dsh-learn-plugin/` 子目录；8 个 overlay yml 内嵌指向 `.../dsh-learn-plugin/lib/index.js` 的绝对路径（历史上因仓库更名失配过一次）；根 `.gitignore` 已含 `dist/`；`prepare` 钩子在 install/pack 时自动 build。

## Goals / Non-Goals

**Goals:**

- 仓库根即包根，消除一层目录嵌套；git 历史经 `git mv` 保留。
- 构建与打包产物（`dist/lib/`、`.tgz`）统一收敛到 `dist/`，且天然被现有 `.gitignore` 覆盖。
- 两份 README 合并为一份四段式文档；「与原版 learn 的差异」中未入 specs 的两条行为事实（子代理模型随会话、提示词约束工具范围）沉淀进 specs。
- 搬迁后三组 harness 验证照常可跑。

**Non-Goals:**

- 不改 `src/` 逻辑、`client/` 与 `skills/` 内容。（例外：`src/skills.ts` 的 `SKILLS_ROOT` 相对路径常量随 outDir 由 `lib` 改 `dist/lib` 需从 `../skills/` 调整为 `../../skills/`——这是构建布局的机械后果，非逻辑变更，见 Decisions 7。）
- 不发布到 npm registry（仍是本地 link / pack 安装）。
- 不引入 CI、不调整 openspec 目录结构。

## Decisions

1. **`git mv` 上移，产物与依赖原地重建**：`node_modules/`、`lib/`、`.tgz`、`.tmp-npm-cache/` 不搬——依赖在根目录 `pnpm install` 重装，产物按新配置重建。替代方案「连 node_modules 一起 mv」省一次安装但留下路径可疑的软链树，弃。
2. **产物目录选 `dist/lib/` 而非 `dist/` 平铺**：与「lib 文件夹放入 dist」的原始诉求一致；`main`/`types`/`exports`/`files` 统一改指 `dist/lib/...`，`.tgz` 经 `pnpm pack --pack-destination dist` 落在 `dist/`。平铺方案少一层嵌套但与诉求不符，弃。
3. **pack 走脚本而非手工命令**：`package.json` 增加 `pack: pnpm run build && pnpm pack --pack-destination dist`（build 显式前置，避免依赖 `prepare` 的隐式触发语义）。`prepare` 钩子保持原样，覆盖 link 安装路径。
4. **README 合并在搬迁之后、以全新文件落盘**：根 README.md（未跟踪）与包 README.md（跟踪中、已修改）的内容先合并成新文稿，再一次性写入根 `README.md`；不试图让任何一个旧文件"原地演化"。时序上放在 `git mv` 之后，避免与搬迁竞争同名冲突。
5. **specs 增补落在既有 capability 内**：子代理执行环境要求分别加进 `teaching`（researcher 契约旁）与 `lesson-visuals`（maker 委派旁），而非新建 `subagent-environment` capability——要求只对这两类子代理成立，归属其既有契约边界更内聚。
6. **overlay 路径统一替换**：8 个 yml 的绝对路径做同一模式替换（`.../dsh-learn-plugin/dsh-learn-plugin/lib/index.js` → `.../dsh-learn-plugin/dist/lib/index.js`），并顺带更新 yml 注释里的相对路径示例。
7. **`SKILLS_ROOT` 随 outDir 加深一层**（实施中发现，用户已确认）：`src/skills.ts` 以 `new URL('../skills/', import.meta.url)` 从编译产物定位包根 `skills/`；outDir 改 `dist/lib` 后该相对层级失效（解析到不存在的 `dist/skills/`，skills harness 0/3）。修正为 `../../skills/`（仅路径常量与注释，不改逻辑）。替代方案「构建期把 `skills/` 复制进 `dist/`」重复静态资产且偏离 files 清单模型，弃。

## Risks / Trade-offs

- [未跟踪的根 README 内容在合并落盘前仅存在于工作区] → 合并文稿作为同一任务内的单一步骤写入，写前两份原文均在 git 或磁盘上可对照。
- [绝对路径再次失配（历史已发生一次）] → 替换后立即以一个 harness overlay 冷启动验证插件加载日志，再跑全量验证。
- [`pnpm install` 于根目录可能触发 prepare → build，此时 tsconfig 已改而旧 `lib/` 尚存] → 顺序上先改配置、删旧产物、再 install；build 失败即任务失败，无隐性状态。
- [git mv 后 `files`/入口字段改动使包内路径变化，link 安装的旧检出指向旧 lib] → 变更内统一重建并重装 link，验证任务覆盖。

## Migration Plan

1. `git mv` 包内容至根；删除 `dsh-learn-plugin/` 残留（旧 `lib/`、`.tgz`、`.tmp-npm-cache/`）。
2. 改 `tsconfig.json`（outDir `dist/lib`）、`package.json`（入口字段、`files`、`pack` 脚本）、`.gitignore`（删 `dsh-learn-plugin/lib/` 行）。
3. 根目录 `pnpm install` → `pnpm run build`，确认 `dist/lib/` 产出。
4. 统一替换 8 个 overlay yml 的绝对路径；冷启动一个 harness 验证加载。
5. 写合并后的根 `README.md`（四段式），同步修正文档内全部路径引用；`docs/migrate-learn-to-dsh.md` 因整体基于嵌套布局且职责已被 README 与归档变更覆盖，直接删除而非逐条修正。
6. 全量验证：三组 harness + restore-probe 两阶段 + `pnpm pack` 确认 `dist/*.tgz`。
7. 回滚策略：整个变更收敛在连续提交内，`git reset` 回搬迁前提交即可（未跟踪产物无回滚负担）。
