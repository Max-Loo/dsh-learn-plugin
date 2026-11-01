# Proposal

## Why

调研发现的五个轻微一致性/维护性问题：`engines.dsh` 声明 `"0.2.x"` 而 6 个 peerDependencies 精确锁 `0.2.1-rc.2`，两者矛盾——任何未来 0.2.x 补丁运行时都会因 peer 失配禁用插件，engines 形同虚设，且每个 DSH 补丁版都强迫插件发新版；DEVELOPMENT.md 声称所有测试 overlay"以绝对路径插入、换检出需手工替换路径"，而 commit `dc2bfa2` 已改为 checkout 相对路径（实测 `../dist/lib/index.js`），文档误导贡献者；quiz 工具描述写 "2–6 answer options" 但校验只查下限 `>=2`，承诺与行为不符；`src/log.ts` 的 `textOfContent` 类型谓词写成 `type: 'string'`（应为 `'text'`，运行时无害但误导维护者）；`index.ts`/`skills.ts` 用 `console.log` 而 `log.ts` 用 `ctx.logger`，日志通道不一致。单独都不紧急，累积起来抬高维护与信任成本，适合一个小变更集中清理。

## What Changes

- peerDependencies 从精确 `0.2.1-rc.2` 放宽到 `0.2.x` 范围，与 `engines.dsh` 对齐（devDependencies 同步）；DSH 升级时的契约回归改由验证 harness 承担，不再靠 peer 失配硬拦截。README 的版本豁免段落同步简化。
- quiz 选项校验补上限：`options` 多于 6 个时返回明确错误，与工具描述 "2–6" 一致。
- DEVELOPMENT.md 修正 overlay 路径说明（checkout 相对路径，无需手工替换），并核对文中 harness 通过计数。
- `textOfContent` 类型谓词修正为 `type: 'text'`。
- 插件加载日志统一走 `ctx.logger`，保留 `[dsh-learn-plugin]` 可 grep 前缀文本。

调研报告中的 C16（teaching / lesson-visuals 无自动化 harness）不纳入本变更：它是文档中已注明"手工验证"的已知缺口，补齐属于独立工作，不适合与清理混编。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graded-quiz`: 「出题契约」补选项上限（>6 个选项报错且不发起提问），使校验与工具描述一致。

## Impact

- `package.json`：peerDependencies 与 devDependencies 的 6 个 `@deepseek-ai/*` 版本范围；`engines.dsh` 不变。
- `src/quiz.ts`：`normalize` 增加上限分支与错误文案；`test/quiz-harness.ts` 增加 >6 选项断言。
- `src/log.ts`：类型谓词笔误修正（无行为变化）。
- `src/index.ts`、`src/skills.ts`：日志通道统一。
- `README.md`：前置条件的 peer 锁说明与豁免指引更新；`DEVELOPMENT.md`：overlay 路径说明修正。
- 兼容性：peer 放宽为放宽型变更（旧运行时行为不变），发布需 `npm version patch`。
