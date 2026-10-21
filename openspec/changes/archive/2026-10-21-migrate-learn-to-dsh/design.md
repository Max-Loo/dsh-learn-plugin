# Design

## Context

**源系统**（`tmp/learn`，pi 配置）：2 个 skills（teach、visualize）+ 3 个 markdown agent 定义（researcher、mermaid-maker、svg-maker，带 tools 白名单与 model 覆盖）+ 4 个 TS 扩展。扩展深度依赖 pi `ExtensionAPI`：`registerTool`（typebox schema、execute、renderCall/renderResult）、TUI 弹窗（`ctx.ui.custom`）、事件钩子（session_start/message_end/tool_call/tool_result）、斜杠命令、会话条目持久化（`appendEntry`+`sessionManager`）、子代理工具注册钩子（`globalThis.__pi_interactive_subagents.registerToolExtension`）。

**目标平台事实**（DSH v0.2.1-rc.2，双证据源：① `tmp-dsh-extract/@deepseek-ai/*/README.md`，由 app.asar 提取的 302 个 cordis 插件包；② 官方文档站 https://deepseek-harness.github.io/deepseek-harness/ 与开源仓库 https://github.com/deepseek-ai/deepseek-harness/（MIT，技术预览阶段文档））：

- DSH 是 cordis 插件架构；官方扩展通道为 out-of-tree 插件包（Plugin Manager，支持 npm/git/`file:`/`link:`，`dsh.manifestVersion: 1` + `dsh.bundle.patch` + `engines.dsh` semver）。
- Skills：`.dsh/skills/<name>/SKILL.md`（frontmatter `name`+`description` 必填），项目级 rank 最高；技能目录可携带被正文引用的资源子目录。
- 自定义工具：进程内插件 `ctx.tools.register(defineTool({name, parameters, execute, ...}))`，带 pre/post-execute 事件管线（`dsh-tools/README.md`）。
- **人类交互 seam**：`ctx.userQuestions.ask()` 阻塞等待结构化作答（选项 + custom 文本、单选/多选），`dsh-tool-ask-user`（内置 ask_user_question）即基于它（`dsh-user-questions/README.md`）。子代理调用会被拒绝（"A live child agent cannot open a human interaction"）。
- Web GUI 客户端插件：`ctx.slots.register()` 向命名槽位贡献 React 组件；工具卡片经 `tool.call.toolview` 槽位选择渲染器，props 从**原始调用参数**派生（`dsh-tools/README.md:95`）。
- 会话事件溯源：`dsh-session` 为 append-only 事件流，插件可订阅 `session/event` 流（持久化后端即以此实现）；表面事件含 `user/message`、`assistant/message`、`tool/result`。
- **未发现**：markdown agent 定义文件、Claude Code 式用户 hooks、项目级 `.dsh/` 下 skills 之外的约定。

## Goals / Non-Goals

**Goals:**

- 在 DSH 上等价复刻 learn 的四项能力（teaching / graded-quiz / lesson-log / lesson-visuals），优先走官方插件与 skills 通道。
- 把迁移产物组织为可安装、可回滚的形态：项目级 skills + 本仓库内插件包。
- 明确记录降级点（相对 pi 版损失的能力）及其理由。

**Non-Goals:**

- 不修改 DSH 本体与 `tmp/learn` 参考仓库。
- 不追求 pi 专用工具（write_mermaid/edit_mermaid 等）的逐一对应——DSH 子代理有完整通用工具，专用三件套失去必要性。
- 不做 quiz 的 note 自由文本附注（见 D6）；不做事后追溯渲染历史会话。
- 不建 agent preset / 模型覆盖（v1 放弃 pi 的 per-agent model 指定）。

## Decisions

### D1. 组件映射总表

| learn 组件 | pi 机制 | DSH 承载 | 动作 |
|---|---|---|---|
| skills/teach | `.pi` skill | `.dsh/skills/teach/SKILL.md` | 改写：quiz/researcher 引用、Obsidian wikilink → markdown 图片、渲染约定 |
| skills/visualize | skill + `subagent(agent=)` | `.dsh/skills/visualize/SKILL.md` + 内置 `subagent` 工具 | brief + maker 提示词模板经 subagent prompt 派发 |
| agents/researcher.md | agent 定义（tools 白名单） | 提示词模板作为 teach skill 的引用资源 | `safe_bash`→`bash`；白名单变为提示词约束 |
| agents/*-maker.md | agent 定义 + registerToolExtension | 提示词模板作为 visualize skill 的引用资源 | 专用三件套工具 → `bash`(mmdc/rsvg-convert) + `read_image` + 内置 write/edit |
| extensions/ask-user-question.ts | registerTool + TUI | DSH 内置 `ask_user_question` | **删除不移植** |
| extensions/quiz.ts | registerTool + TUI + 评分 | **新插件**：`ctx.tools.register` + `ctx.userQuestions.ask()` + toolview 卡片 | 重写（D2） |
| extensions/md-log.ts | 事件钩子 + 命令 + 会话条目 | **新插件**：订阅 `session/event` 流 + `lesson_log`/`lesson_unlog` 工具 | 重写（D3） |
| extensions/visual-tools/ | registerToolExtension 钩子 | 不移植 | maker 用通用工具复刻回路（D4） |

### D2. quiz：进程内 cordis 插件 + userQuestions seam + 自定义 toolview

`quiz` 工具注册于进程内插件（`ctx.tools.register(defineTool(...))`）；`execute()` 内：校验参数（value 唯一、correctAnswer 按 value 解析、≥2 选项）→ 默认 Fisher-Yates 乱序 → 自动附加 "I don't know" 选项 → `ctx.userQuestions.ask()` 阻塞等待作答 → 本地按 value 集合精确匹配评分 → 返回结构化 details（status/answers/correctIndices/dontKnow/explanation/displayedOptions）。

**为什么不用备选：**
- *MCP 服务器*：MCP 工具无法接入 `userQuestions` 人类交互 seam，评分后的交互式作答 UI 无处安放。
- *ask_user_question 提示词模拟*（模型出题→自评）：评分非即时、非确定性，且 correctAnswer 会随题面明文进入转录，违反防泄漏 requirement。
- *仅 client plugin*：无进程内工具则无模型侧调用契约。

**防泄漏为硬门**：无 UI 展示方法的工具会回退到通用卡片，**以原始 args 作为输入展示**（官方[工具编写参考](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool/)），`correctAnswer`/`explanation` 会在作答前可见。因此 quiz 工具 MUST 声明纯展示投影：`presentCall(args)` 返回仅含问题（不含 rawInput/correctAnswer）的 PENDING 卡片，`presentResult()` 返回完整反馈卡（✓/✗/正确答案/解析），对齐 pi 版 renderCall/renderResult 的隐藏策略；并以 `output.presentationMeta(args, value)` 把乱序后展示顺序持久化到 `tool/result`，供卡片回放与 lesson-log 取真实展示顺序。若需更丰富的交互反馈（动画、逐项揭示），再引入 Web client plugin（`tool.call.toolview` 槽位，React 渲染器）作为可选增强，不作为启用前置。

### D3. lesson-log：进程内插件订阅会话事件流

同一插件订阅 `session/event` 流（官方 UI 插件模式：`ctx.on('session/event', (session, event) => ...)`，见[实操手册](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook/)），过滤 `user/message`、`assistant/message`、`tool/result`（quiz 与 ask_user_question）三类持久表面事件，格式化为 Obsidian callout 追加写入链接文件（写锁串行化保序，逻辑同 pi 版）。quiz 题面的乱序后真实顺序从持久化的 `tool/result`（含 `presentationMeta`）读取。链接状态持久化于插件自身 storage（键含 session 标识），会话恢复即重链。历史回填改用 `dsh-session-query` 查询接口（注意：`snapshotEvents()` 等同步读在 DSH 仓库内对新生产代码禁用，外部插件应走查询/projection 通道）。

链接/解除提供两个入口：官方归属表中"添加用户命令 → `ctx.commands` 注册，无需模型轮次即可分派"——`lesson-log`/`lesson-unlog` 用户命令是首选 UX（对应 pi 版斜杠命令）；同时保留模型可调用的 `lesson_log(file)` / `lesson_unlog` 工具（文件必须已存在，同 pi 版防 typo 策略），teach skill 引导会话开始时询问是否链接。

**备选（降级方案）**：技能驱动——teach skill 指示模型每轮用 write 工具追加日志。不作主方案：块格式与保序依赖模型自觉，回填不可靠；仅当插件通道受阻时回退。

### D4. makers：提示词模板 + 通用工具复刻"渲染-检查"回路

pi 的 write/edit/render 三件套是给无文件系统权限的子代理设的受限通道；DSH 子代理天然持有 `bash`/`read`/`read_image`/`write`/`edit`，故 maker 提示词（从 pi agent 定义移植）直接指示：`bash` 调 `mmdc`（mermaid，需 Chrome）或 `rsvg-convert`（回退 `magick`）渲染 → `read_image` 查看渲染 PNG → 迭代 → `bash` 发布唯一命名文件到 `viz/` → 返回路径。render-and-inspect 的正确性依赖 `read_image` 的真实视觉检查，语义与 pi 版一致（工具返回内联图片供子代理查看）。

工具白名单弱化为提示词约束（DSH 无 markdown agent 定义；agent preset 属用户 profile 层，v1 不依赖）。maker 提示词以 `references/` 资源形式放在 visualize skill 目录内，SKILL.md 引用。

### D5. 安装形态与版本约束

- **项目级**：`.dsh/skills/teach/`、`.dsh/skills/visualize/`（DSH 仅认 skills 为项目级约定）。
- **插件包**：本仓库 `plugins/learn-dsh/`（单包含 quiz 工具、lesson-log；后于 50f16c7 更名为 `dsh-learn-plugin/` 并移至仓库根），`package.json` 以 `dsh` 字段声明（`dsh.bundle` 指向组合包 patch 文件；对照 asar 版 `dsh-package-manifest` README 的 `dsh.manifestVersion: 1` 细节，实现期以两处文档核对为准）+ `engines.dsh` 指向 `0.2.x`。
- **开发期通道**（官方[第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)教程）：从 GitHub 源码检出运行，`cordis.yml` 覆盖层以绝对路径 `- insert` 插入本地插件 TS 模块，`pnpm dsh web --patch ./cordis.yml` 启动；自定义 profile 默认实时重载 patch，改插件即时生效。
- **安装期通道**：Plugin Manager / `dsh plugin` 以 `link:` 本地路径装入 desktop profile（asar 版 `dsh-plugin-manager` README；桌面版插件事务由壳内 pnpm 执行）。
- 提取副本 `tmp-dsh-extract/@deepseek-ai/` 留作 API 回归核对参考（约 100MB，不入库，加入 .gitignore）；官方文档站（技术预览）与 GitHub 仓库作为第二证据源。

### D6. 已知降级点（相对 pi 版）

1. **quiz note 字段**：`userQuestions` vocabulary 仅"选项 + custom 文本"，custom 在单选中会覆盖所选而非并列附注 → v1 丢弃 note（dontKnow 语义保留）。
2. **per-agent model 覆盖**（maker 用 claude-sonnet、researcher 用 glm）：DSH v1 子代理随会话模型，不覆盖。
3. **工具硬白名单**：maker/researcher 的 `tools:` 限定变为提示词约束。
4. **TUI 键盘交互细节**（Tab 切 note、Ctrl+J 换行等）随 note 一并消失。

## Risks / Trade-offs

- [默认工具卡片泄漏答案] → `presentCall`/`presentResult` 纯展示投影为 quiz 工具必配项（缺失即回退到展示原始 args 的通用卡片）；任务验收含"作答前 DOM 无答案文本"检查。
- [rc 版本 API 漂移（0.2.1-rc.2）] → `engines.dsh` semver 锁范围；以官方文档站 + GitHub 仓库 + `tmp-dsh-extract` 三源回归核对后再升级。
- [会话事件/查询接口对外部插件的稳定面未完全验证] → 实现首任务先做最小事件订阅 spike；若受阻，lesson-log 回退 D3 降级方案（行为契约不变，实现形态改变）。
- [渲染二进制缺失（Chrome/mmdc/rsvg-convert）] → maker 首步检测依赖并明确报告（spec 降级 requirement），README 提供安装指引。
- [子代理无 UI 权限导致 quiz 误用] → 工具 description 明示主会话专用；子代理调用返回不可用错误（平台已保证拒绝）。

## Migration Plan

阶段推进（每阶段可独立验收、独立回滚——卸载插件或删除 skills 目录即回滚）：

1. **P0 骨架**：插件包脚手架 + teach/visualize skills 落位（先引用"待建"工具，注明启用条件）。
2. **P1 quiz**：工具 + userQuestions 对接 + toolview 卡片 → 端到端验证防泄漏与评分。
3. **P2 lesson-log**：事件订阅 spike → 镜像/回填/恢复。
4. **P3 visuals**：maker 提示词 + 渲染链检测 → 端到端出图嵌入。
5. **P4 集成**：完整教学会话演练（摸底→计划→授课→日志+图示），对照 specs 验收。

## Open Questions

- DSH Web GUI 对 LaTeX 与 mermaid 代码块的渲染支持程度（影响 teaching 呈现细节与 plan 依赖图的展示形式；若不支持可回退为让 mermaid maker 出图，不改变行为契约）——实现期以一次实测确认。
- `lesson_log` 链接状态的插件 storage 具体 API 形态（实现期对照 `tmp-dsh-extract` 中 persistence/storages 包确定）。
