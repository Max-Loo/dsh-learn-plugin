# Proposal

## Why

`tmp/learn`（amosblomqvist/learn，已克隆）是一套构建在 **pi 编码代理** 上的个人 AI 学习系统：教学哲学 skill、评分问答、Obsidian 课程日志、带"渲染-检查"回路的可视化子代理。本项目的目标是在 **DeepSeek Harness (DSH)** 上获得同等的学习系统。

初步可行性分析结论：**整体可行性高**。learn 的大部分核心能力 DSH 已原生具备（`ask_user_question` 弹窗问答、`subagent` 子代理、`read_image` 图片查看、`web_search`/`web_fetch`、`.dsh/skills/` 技能机制），但 learn 深度绑定 pi 的扩展 API（TUI 弹窗、会话事件钩子、子代理工具注册钩子 `registerToolExtension`），其中 **quiz（评分问答）与 md-log（课程日志）是 DSH 侧的主要缺口**，需要选择合适的 DSH 机制重建或降级模拟。因此需要一次系统性迁移，而非直接复用。

## What Changes

- **移植 `teach` 教学技能**为 DSH skill：保留两大教学原则与 probe→plan→teach 三阶段流程，改写其中的工具引用（`quiz`、`researcher` 子代理、`ask_user_question`）与渲染约定（LaTeX/mermaid 按 DSH Web GUI 的渲染能力调整）。
- **移植 `visualize` 技能与两个 maker 子代理**（mermaid-maker / svg-maker）：pi 的专用子代理工具（`write_mermaid`/`edit_mermaid`/`render_mermaid` 及 svg 版）改由 DSH 子代理使用通用工具（`bash` 调 mmdc / rsvg-convert、`read_image` 检查、发布到 `viz/`）复刻同样的"渲染-检查-迭代"回路，并在课程回复中内嵌图片。
- **迁移 `researcher` 子代理定义**：web 检索与引用格式原样保留，`safe_bash` 等 pi 专有工具引用替换为 DSH 等价物。
- **以 DSH 机制实现 graded quiz（评分问答）**：保留行为契约 —— 单选/多选、按 value 给正确答案、即时 ✓/✗ 反馈、揭示正确答案与解析、自动附加 "I don't know"（区别于猜错）、选项乱序、可选 note 字段、答案不得在作答前泄漏到界面/日志。实现载体（DSH 自定义工具/客户端插件/基于 `ask_user_question` 的技能内模拟）由 design.md 决定。
- **以 DSH 机制实现 lesson log（课程日志）**：会话中的用户输入、教学正文、问答块镜像追加到已存在的 markdown 文件（Obsidian callout 格式），支持重新链接与回填；实现载体同样由 design.md 决定。
- **文档化系统依赖**：mermaid 渲染链（Node + `@mermaid-js/mermaid-cli` + Chrome）与 SVG 渲染链（`rsvg-convert`，回退 `magick`）的安装与检测。
- 不修改 `tmp/learn` 原仓库（仅作参考源）。

## Capabilities

### New Capabilities

- `teaching`: 教学会话的行为契约 —— probe（quiz 摸底 + 目标澄清）→ plan（依赖图与方案呈现、等待确认）→ teach（逐节点 motivate→establish→connect→quiz-check 循环），以及事实核查（不确定即调 researcher）与作答反馈适配。
- `graded-quiz`: 评分问答能力 —— 有标准答案的提问、即时评分与反馈、乱序、"I don't know"信号、note 附注、防答案泄漏约束。
- `lesson-log`: 课程日志能力 —— 会话内容按块（用户/正文/问答 callout）镜像到既有 markdown 文件、追加式、可重连与回填。
- `lesson-visuals`: 图示能力 —— 按需生成"创作者已亲眼验证过"的 mermaid/SVG 图示，发布唯一命名 PNG 到 `viz/` 并在课程中内嵌。

### Modified Capabilities

（无 —— 项目当前无既有 specs）

## Impact

- **新增文件**：`.dsh/skills/` 下的 teach / visualize（及 maker 相关提示词）；quiz 与 lesson-log 的实现组件（位置待 design.md 定）；`viz/` 输出目录约定。
- **依赖**：系统级渲染二进制（Chrome + mermaid-cli；rsvg-convert 或 magick），在无渲染环境时可视化能力需可检测地降级。
- **不影响**：DSH 本体（不修改 `/Applications/DeepSeek Harness.app` 检出）；`tmp/learn` 参考仓库只读。
- **风险**：DSH 是否存在自定义工具/事件钩子等价机制直接决定 quiz 与 lesson-log 的实现形态（重建 vs 模拟），已在 design.md 中按调研结论裁决。
