# Tasks

## 1. 依赖声明对齐

- [x] 1.1 `package.json` 六个 `@deepseek-ai/dsh-*` 的 peerDependencies 放宽为 `0.2.x`，devDependencies 同步；验证：`pnpm install` 成功、`pnpm run build` 通过、`pnpm ls --depth 0` 无 peer 告警
- [x] 1.2 README 前置条件与豁免段落更新（peer 为 `0.2.x` 范围，豁免仅针对更早运行时）；DEVELOPMENT.md 开发工作流增加"升级 DSH 后先跑全量 harness 再使用"的回归步骤；验证：文档声明与 `package.json` 一致

## 2. quiz 选项上限

- [x] 2.1 `src/quiz.ts` 的 `normalize` 增加 `options.length > 6` 校验，错误文案 `quiz supports at most 6 options (got N)`；验证：quiz-harness 新增断言——7 选项调用返回明确错误且不发起提问，6 选项正常出题
- [x] 2.2 `src/log.ts` 的 `textOfContent` 类型谓词修正为 `type: 'text'`；验证：`pnpm run build` 通过，log-harness 全项 PASS（行为不变）

## 3. 日志通道与文档一致性

- [x] 3.1 `src/index.ts` 与 `src/skills.ts` 的 `console.log` 改 `ctx.logger.info`，消息保留 `[dsh-learn-plugin]` 前缀；验证（经用户确认调整）：探针实测 CLI stdout 不显示 cordis 日志（宿主无 stdout exporter），日志进入 DSH 日志系统；README/DEVELOPMENT 安装判据同步改为"重启后 teach/visualize 出现在技能目录"，技能注册行为由 skills-harness 22/22 验证
- [x] 3.2 DEVELOPMENT.md 修正 overlay 路径说明为 checkout 相对路径，并按前两个变更实施后的实际输出核对更新 harness 通过计数（quiz/log/skills 三组数字）；验证：按文档命令可原样跑通，计数与实际一致（quiz 25/25、log 16/16、skills 22/22 实测核对）

## 4. 全量回归

- [x] 4.1 回归：`pnpm run build`、quiz-harness（含新断言全 PASS）、log-harness 全 PASS、skills-harness 22/22、restore-probe A/B OK；验证：全部命令输出全绿，无 peer 告警（quiz 25/25、log 16/16、skills 22/22、restore-probe A OK + B OK、`pnpm ls --depth 0` 无告警）
