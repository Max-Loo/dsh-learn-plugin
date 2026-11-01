# Design

## Context

`package.json` 现状：`engines.dsh: "0.2.x"`，六个 `@deepseek-ai/dsh-*` peer/dev 依赖精确锁 `0.2.1-rc.2`（归档 design `migrate-learn-to-dsh` 记录其意图为"契约漂移由 peer 版本约束暴露而非静默"）；DSH 侧 peer 失配时禁用插件、需 `dsh plugin allow-version ... --accept-risk` 豁免（README 有载）。`src/quiz.ts` 的 `normalize` 只校验 `options.length >= 2`，工具描述却写 "2–6"。测试 overlay 已全部为 checkout 相对路径（`../dist/lib/index.js`），DEVELOPMENT.md 仍描述为绝对路径。

## Goals / Non-Goals

**Goals:**
- `engines.dsh` 与 peer 声明一致，插件在 0.2.x 补丁运行时上不被版本机制误杀。
- quiz 校验与工具描述一致（2–6）。
- 文档与代码事实一致；日志通道统一。

**Non-Goals:**
- 不升级依赖版本本身（仍基于 0.2.1-rc.2 开发验证，仅放宽声明范围）。
- 不为 teaching / lesson-visuals 补自动化 harness（独立工作）。
- 不改变 quiz 其余校验行为与错误文案风格。

## Decisions

**D1 peer 放宽为 `0.2.x`（与 engines 对齐），而非收窄 engines。** 备选是保持精确锁、把 `engines.dsh` 收窄为 `0.2.1-rc.x`——诚实但使每个 DSH 补丁版都强制插件发版，与"个人学习插件"的维护节奏不匹配。选放宽：DSH 0.2.x 系列内部包按同版本线发布，跨补丁的 API 面预期稳定；契约回归责任从"安装期硬拦截"转移到"升级后跑验证 harness"（DEVELOPMENT 的三组 harness + restore-probe 即回归面）。风险见 R1。devDependencies 同步放宽，避免开发环境与声明面漂移。

**D2 quiz 上限校验：`normalize` 增加 `options.length > 6` 分支。** 错误文案与下限同风格：`quiz supports at most 6 options (got N)`。选校验上限而非放宽描述：教学技能本身强调少选项（distractor 构造法），>6 选项是出题质量缺陷，早失败优于渲染超长面板。工具描述维持 "2–6" 不变。

**D3 类型谓词与日志通道：机械修正。** `textOfContent` 谓词改 `block is { type: 'text'; text: string }`（无行为变化）；`index.ts`/`skills.ts` 的 `console.log` 改 `ctx.logger.info`，消息保留 `[dsh-learn-plugin]` 前缀——README 以"启动日志出现 `[dsh-learn-plugin] plugin loaded`"作为安装成功判据，前缀文本不变即可继续 grep。

**D4 文档修正以仓库事实为准。** DEVELOPMENT.md 的"绝对路径需手工替换"段改写为 checkout 相对路径说明（并保留更名仓库时 anchor 语义的提示）；harness 通过计数按扩展后的实际数量核对更新（联动 `harden-lesson-log` / `improve-mirror-robustness` 扩展的断言数，以实施时实际计数为准）。README 的 peer 豁免段落改写：peer 为 `0.2.x` 范围后，豁免仅用于更早（0.1.x/0.2.0 之前）运行时。

## Risks / Trade-offs

- [R1 peer 放宽后，DSH 0.2.x 补丁引入的 API 漂移不再被安装期拦截，可能在运行时才暴露] → 升级 DSH 后必须跑全量 harness + restore-probe 再日常使用；在 DEVELOPMENT.md 的开发工作流中写明该回归步骤。
- [R2 上限校验拒绝历史上曾可用的 7+ 选项调用] → 属有意收紧且与既有工具描述一致，破坏面极小（描述从未承诺 >6）。
- [R3 文档计数与最终实施时 harness 实际断言数不符] → 文档更新任务排在两个行为变更实施之后执行，以实际输出为准。

## Migration Plan

1. 实施顺序：本变更最后实施（在 `harden-lesson-log`、`improve-mirror-robustness` 之后），文档计数联动更新。
2. 发布：`npm version patch` 后正常发布；peer 范围放宽对已安装用户无感（下次升级时生效）。
3. 回滚：直接回退版本；无数据与 schema 影响。

## Open Questions

（无——D1 的方向性取舍已定，备选与代价已记录于 Decisions/R1。）
