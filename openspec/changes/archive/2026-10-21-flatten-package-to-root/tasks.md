# Tasks

## 1. 拍平目录与构建配置改造

- [x] 1.1 将未跟踪的根 `README.md` 暂存为 `README.repo.md`（供合并任务取材），随后 `git mv dsh-learn-plugin/{package.json,tsconfig.json,pnpm-lock.yaml,README.md,client,skills,src,test,cordis.dev.yml,cordis.patch.yml}` 至仓库根，删除残留的旧 `lib/`、`dsh-learn-plugin-0.1.0.tgz`、`.tmp-npm-cache/` 与空目录；验证 `git status --short` 仅显示 R（重命名）与 D（删除）记录、根目录无同名冲突
- [x] 1.2 改 `tsconfig.json` 的 `outDir` 为 `dist/lib`；改 `package.json` 的 `main`/`types`/`exports`/`files` 指向 `dist/lib` 并新增 `pack` 脚本（`pnpm run build && pnpm pack --pack-destination dist`）；删除 `.gitignore` 中的 `dsh-learn-plugin/lib/` 行；验证 `node -e "require('./package.json')"` 可解析、`grep -rn '"lib' package.json tsconfig.json` 无旧路径残留
- [x] 1.3 在仓库根执行 `pnpm install && pnpm run build`；验证 `dist/lib/` 下产出 `index`/`quiz`/`log`/`skills` 的 `.js`/`.d.ts`/`.js.map`，且根目录未生成旧式 `lib/`

## 2. overlay 绝对路径修复与加载验证

- [x] 2.1 统一替换 `cordis.dev.yml` 与 `test/` 下 7 个 `*.cordis.yml` 的绝对路径（`…/dsh-learn-plugin/dsh-learn-plugin/lib/index.js` → `…/dsh-learn-plugin/dist/lib/index.js`；`…/dsh-learn-plugin/dsh-learn-plugin/test/*.ts` → `…/dsh-learn-plugin/test/*.ts`），并同步更新 yml 注释中的 `--patch` 相对路径示例（`./dsh-learn-plugin/test/…` → `./test/…`）；验证 `grep -rn "dsh-learn-plugin/dsh-learn-plugin" cordis.dev.yml test/` 无匹配
- [x] 2.2 以 `quiz-harness.cordis.yml` 冷启动一次 `dsh web --patch`（`--no-open --port 0`）；验证启动日志出现插件从 `dist/lib` 加载、harness 自检开始执行

## 3. README 合并与文档路径修正

- [x] 3.1 以 `README.repo.md`（原仓库文档）与根 `README.md`（原包文档）为素材，按「项目概述 / 项目功能介绍 / 使用说明 / 项目贡献方式」重写根 `README.md`：两段开头合并、组件清单入概述、五能力各一小节并链接 `openspec/specs/`、前置条件/安装/渲染依赖/卸载入使用说明、harness 验证与开发工作流入贡献方式；删除「与原版 learn 的差异」整节（第 1、4 条已覆盖/无保留价值，第 2、3 条已沉淀为 specs delta）；完成后删除 `README.repo.md`；验证新 README 无 `cd dsh-learn-plugin`、`../README.md`、`dsh-learn-plugin/README.md` 式失效引用且四个段落标题齐全
- [x] 3.2 处理其余文档中的旧路径引用：删除过时的 `docs/migrate-learn-to-dsh.md`（其安装/验证指引全部基于嵌套布局，逐条修正不如删除——职责已由根 `README.md` 与归档变更 `openspec/changes/archive/2026-10-21-migrate-learn-to-dsh/` 覆盖，且无其他文件引用它）；验证 `git grep -n "dsh-learn-plugin/dsh-learn-plugin" -- ':!openspec/changes'` 无匹配

## 4. specs 核对与全量验证

- [x] 4.1 对照新增 specs 要求核对现状：`skills/teach/references/researcher.md`、`skills/visualize/references/mermaid-maker.md` 与 `svg-maker.md` 已含工具范围约束文本且未指定专属模型，各 SKILL.md 派发说明不含工具白名单；验证三个模板文件中能定位到对应约束语句（无需改代码，本条为契约符合性核对）
- [x] 4.2 全量行为验证：三组 harness 逐一冷启动（quiz 应 22/22 PASS、log 应 16/16 PASS、skills 应 22/22 PASS）+ `restore-probe` 两阶段（A 链接退出、B 冷启动断言恢复注记）；验证各组输出达到预期 PASS 数
- [x] 4.3 执行 `pnpm run pack`；验证 `dist/` 下生成 `dsh-learn-plugin-0.1.0.tgz`，`tar -tzf` 列表含 `dist/lib/`、`client/`、`skills/`、`cordis.patch.yml`、`README.md` 且不含 `src/`、`test/`

## Workflow follow-up

- 归档变更（`openspec archive`）：teaching 与 lesson-visuals 的 delta 合入主 specs 后复核两条新 requirement 的 scenario 完整性
- 归档后重跑一次 `openspec validate`，确认主 specs 与变更清单一致
