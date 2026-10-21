# Tasks

## 1. 骨架与素材（P0）

- [x] 1.1 创建插件包 `plugins/learn-dsh/` 脚手架：`package.json`（`dsh` 字段指向 patch 文件、`engines.dsh: "0.2.x"`）+ 空 patch yml；按官方教程验证两条通道可用——① 从源码检出 `pnpm dsh web --patch` 绝对路径 insert 加载；② `dsh plugin --profile desktop link:./plugins/learn-dsh` 安装——且 DSH 启动无报错
- [x] 1.2 将 `tmp/learn/skills/teach/SKILL.md` 移植为 `.dsh/skills/teach/SKILL.md`：改写 quiz/researcher/ask_user_question 引用、Obsidian wikilink → 标准 markdown 图片、LaTeX/mermaid 渲染约定按 DSH Web GUI 实测调整；验证技能出现在本会话技能列表且触发描述完整
- [x] 1.3 将 `tmp/learn/skills/visualize/SKILL.md` 移植为 `.dsh/skills/visualize/SKILL.md`，并把 mermaid-maker / svg-maker / researcher 三份提示词放入技能 `references/` 目录（由 `tmp/learn/agents/*.md` 移植：删除 pi frontmatter、`safe_bash`→`bash`、专用三件套工具→`bash`+`read_image`+write/edit）；验证 SKILL.md 可引用资源路径且子代理 prompt 模板完整
- [x] 1.4 在仓库 `.gitignore` 追加 `tmp-dsh-extract/`；验证 `git status` 不再显示该目录

## 2. quiz 评分问答（P1）

- [x] 2.1 实现插件内 `quiz` 工具注册（`ctx.tools.register` + `defineTool`）：参数 schema（question/options(value)/correctAnswer/explanation/shuffle/multiSelect）、value 校验与错误返回、Fisher-Yates 乱序、自动附加 "I don't know"；对照 `tmp-dsh-extract/@deepseek-ai/dsh-tools/README.md` 核对 API 签名后编码
- [x] 2.2 对接 `ctx.userQuestions.ask()`：阻塞作答、单选/多选、dontKnow 判定、按 value 集合精确匹配评分；验证：主会话出题→作答→返回结构化 details（answers/correctIndices/correct/dontKnow/explanation/displayedOptions）
- [x] 2.3 实现 quiz 的纯展示投影：`presentCall(args)` PENDING 卡片只显示问题+选项（隐藏 correctAnswer/explanation，不透传 rawInput），`presentResult()` 显示 ✓/✗/正确答案/解析反馈卡，`output.presentationMeta` 持久化乱序后展示顺序；验证：作答前检查页面 DOM/卡片无答案文本，作答后反馈完整且回放一致
- [x] 2.4 子代理调用 quiz 返回不可用错误（不挂起）；验证：通过 subagent 工具触发 quiz 调用，收到明确错误文本且子代理正常结束

## 3. lesson-log 课程日志（P2）

- [x] 3.1 会话事件订阅 spike：最小插件订阅 `session/event` 流并打印 `user/message`/`assistant/message`/`tool/result` 事件；验证：真实会话中三类事件均被捕获；若通道受阻，记录结论并切换 design.md D3 降级方案（技能驱动写文件）
- [x] 3.2 实现 `lesson_log(file)` / `lesson_unlog` 模型工具与 `lesson-log` / `lesson-unlog` 用户命令（`ctx.commands`，无需模型轮次）：仅接受已存在文件、报错不创建；链接状态写入插件 storage（按 session 标识）；验证：命令与工具两条路径均可链接，链接不存在路径报错；链接后重启会话自动恢复镜像
- [x] 3.3 实现镜像写入：quote/abstract/question/判定 callout 格式（对照 `tmp/learn/extensions/md-log.ts` 的 callout 结构）、写锁保序、quiz 题面取乱序后展示顺序且不含答案；验证：完整一轮含 quiz 的教学后，日志块顺序与内容符合 spec 各 Scenario
- [x] 3.4 实现历史回填：链接时经 `dsh-session-query`（或 spike 确定的等价投影通道）回放当前分支历史写入日志；验证：会话中途链接，日志包含链接前对话与问答

## 4. lesson-visuals 图示（P3）

- [x] 4.1 渲染链检测与文档：maker 提示词首步检测 `mmdc`+Chrome / `rsvg-convert`（回退 `magick`）并明确报告缺失；在插件 README 写安装指引；验证：卸载 PATH 中的 rsvg-convert 后 maker 返回明确不可用报告
- [x] 4.2 打磨 maker 提示词：write→render(bash)→read_image 检查→迭代→`bash` 发布 `viz/viz-<slug>-<timestamp>.png`→返回 RESULT 块；验证：mermaid maker 端到端产出一张正确依赖图并内嵌课程回复
- [x] 4.3 svg maker 端到端：验证一张几何图（如数轴/向量）经渲染-检查回路发布、内嵌显示、坐标正确

## 5. 端到端集成验收（P4）

- [x] 5.1 完整教学会话演练：摸底（quiz 定位边界）→ 计划（researcher + mermaid 依赖图呈现并等待确认）→ 授课（逐节点循环 + 图示）+ 全程课程日志；逐条核对 `specs/teaching`、`specs/graded-quiz`、`specs/lesson-log`、`specs/lesson-visuals` 的每个 Scenario
  - 演练进行中（2026-10-20 暂停）：probe ✓（7 题，5 条知识线定位，天花板 = 环回算术）；plan ✓（researcher 核查 + mermaid 依赖图 + 学习者确认）；授课 N1「环回歧义」修复中——缺口精确定位为「有限刻度 +1 环回（mod stepping）」，学习者选择休息。日志 `lessons/reliable-transfer.md` 已链接并镜像全程（题面/判定/问答块实测均落盘）
  - 载体切换（2026-10-21）：学习者决定将 5.1 演练载体从 TCP 可靠传输切换为「VueJS 组件模型设计逻辑」（5.1 验收对象是教学系统行为，spec 不绑定主题）。TCP 场保留为部分证据（probe/plan/N1/机理 + 两日「未确认即停」实测），教学状态如实标记未完成；5.1 终核落在 VueJS 场上完成
  - 演练终核（2026-10-21，Vue 场完成）：载体课程「VueJS 组件模型设计逻辑 → 边缘机制与新演进」完整走完 probe→plan→teach：摸底 7 题（六主干线连对至实现机制层 + watch-flush 深水题 dontKnow 定位断点）；plan = researcher 一手简报（vapor 现状核实至 3.6.0-rc.12/2026-10-16）+ prose + mermaid 依赖图（maker 100/100 断言）后学习者确认；授课六节点全部 quiz-check 确认——N1 flush 三队列（四连未过后换呈现「useEffect 先验对质 + 逐行时间线」通过）、N2 三小节（KeepAlive 泄漏面/Suspense 只盯根/Teleport 两棵树）、N4 effectScope await 逃逸、N6 v-model 展开、N7 vapor v-memo 之死，均一次通过；共 quiz 17 题（12✓/4✗/1 dontKnow）、ask_user_question 5 次（日志/水平/方向/节奏×2）、新图 3 张（deep-plan/flush-timeline/vapor-vs-vdom，41–100 项程序化断言全过）。**逐 Scenario 终核**：teaching 15 场景 ✓（含全对不视为完成、未确认即停修×2、不确定即核查、目标澄清）；graded-quiz 12 场景 ✓（dontKnow 真实触发并驱动课程定形；防泄漏经日志题面块抽查）；lesson-log 11 场景 ✓（本会话 unlog→重链 Vue 日志、回填 74 条、两场题面/判定全成对）；lesson-visuals 9 场景 ✓（7 张图全经 maker+程序化验证、无图更优场景实测）。如实注记三项：①「渲染-检查回路」在本会话为程序化几何断言等价实现（模型无图像输入，read_image 不可用），非字面目检；②「根节点审计」为隐式覆盖（依赖图根全部采用摸底实证机制）；③ 个别低频场景（correctAnswer 不匹配、多选集合、子代理拒 quiz、路径不存在、maker RESULT:NONE、渲染链 UNAVAILABLE）未在本场直接触发，由 test/quiz-harness.ts、test/log-harness.ts 断言及前场记录覆盖。5.1 勾选，17/17
  - 演练续记（2026-10-21 晨，学习者主动暂停）：N1 地基「环回算术」修复并验收 ✓——钟面重锚 + 功能必然性论证（死锁反证）后发/收两视角两连对；N1 后半「相位标记 → W≤2ⁿ−1」完成 ✓（n=2 应用题直接给出 3；推导链：指针回到 k ⇒ 途中交付过窗口尾 ⇒ 窗口滑过 ⇒ k 已确认不再重发）；N2 机理「认出旧代在逻辑上不可能」✓（平行宇宙不可能性证明，学习者验证核心步通过）；N2 定律「W≤2ⁿ⁻¹」三次未过（GBN 公式误用 / 对半再留格 / 与刚给论证矛盾的三种方向——判为噪声信号而非知识缺口），按「未确认不向上构建」停在此处，学习者选择暂停。新增图示 3 张（`viz/viz-clock8-*`、`viz/viz-wrap-window-*`、`viz/viz-sr-halving-*`）：本会话模型无图像输入，maker 以程序化几何断言替代 read_image 目检（90/90 与 41/41 项全过、发布件 SHA 一致）——「渲染-检查回路」在非视觉模型下的等价实现，终核时须作为环境限制如实记录。日志重连 + 回填 23 条实测。原恢复点（TCP 场，备用）：SR 定律 4 刻度钟数格子呈现 → 收尾节点 → 逐 Scenario 终核
- [x] 5.2 编写迁移说明文档（`docs/migrate-learn-to-dsh.md`）：安装步骤、降级点清单（design.md D6）、渲染依赖、回滚方式（卸载插件/删除 skills）；验证：按文档从零安装可复现 5.1 演练

## Workflow follow-up

- 全部任务完成后运行 `/openspec-verify-change` 校验实现与工件一致，再视需要 `/openspec-archive-change` 归档。
