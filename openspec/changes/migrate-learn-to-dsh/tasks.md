# Tasks

## 1. 骨架与素材（P0）

- [ ] 1.1 创建插件包 `plugins/learn-dsh/` 脚手架：`package.json`（`dsh` 字段指向 patch 文件、`engines.dsh: "0.2.x"`）+ 空 patch yml；按官方教程验证两条通道可用——① 从源码检出 `pnpm dsh web --patch` 绝对路径 insert 加载；② `dsh plugin --profile desktop link:./plugins/learn-dsh` 安装——且 DSH 启动无报错
- [ ] 1.2 将 `tmp/learn/skills/teach/SKILL.md` 移植为 `.dsh/skills/teach/SKILL.md`：改写 quiz/researcher/ask_user_question 引用、Obsidian wikilink → 标准 markdown 图片、LaTeX/mermaid 渲染约定按 DSH Web GUI 实测调整；验证技能出现在本会话技能列表且触发描述完整
- [ ] 1.3 将 `tmp/learn/skills/visualize/SKILL.md` 移植为 `.dsh/skills/visualize/SKILL.md`，并把 mermaid-maker / svg-maker / researcher 三份提示词放入技能 `references/` 目录（由 `tmp/learn/agents/*.md` 移植：删除 pi frontmatter、`safe_bash`→`bash`、专用三件套工具→`bash`+`read_image`+write/edit）；验证 SKILL.md 可引用资源路径且子代理 prompt 模板完整
- [ ] 1.4 在仓库 `.gitignore` 追加 `tmp-dsh-extract/`；验证 `git status` 不再显示该目录

## 2. quiz 评分问答（P1）

- [ ] 2.1 实现插件内 `quiz` 工具注册（`ctx.tools.register` + `defineTool`）：参数 schema（question/options(value)/correctAnswer/explanation/shuffle/multiSelect）、value 校验与错误返回、Fisher-Yates 乱序、自动附加 "I don't know"；对照 `tmp-dsh-extract/@deepseek-ai/dsh-tools/README.md` 核对 API 签名后编码
- [ ] 2.2 对接 `ctx.userQuestions.ask()`：阻塞作答、单选/多选、dontKnow 判定、按 value 集合精确匹配评分；验证：主会话出题→作答→返回结构化 details（answers/correctIndices/correct/dontKnow/explanation/displayedOptions）
- [ ] 2.3 实现 quiz 的纯展示投影：`presentCall(args)` PENDING 卡片只显示问题+选项（隐藏 correctAnswer/explanation，不透传 rawInput），`presentResult()` 显示 ✓/✗/正确答案/解析反馈卡，`output.presentationMeta` 持久化乱序后展示顺序；验证：作答前检查页面 DOM/卡片无答案文本，作答后反馈完整且回放一致
- [ ] 2.4 子代理调用 quiz 返回不可用错误（不挂起）；验证：通过 subagent 工具触发 quiz 调用，收到明确错误文本且子代理正常结束

## 3. lesson-log 课程日志（P2）

- [ ] 3.1 会话事件订阅 spike：最小插件订阅 `session/event` 流并打印 `user/message`/`assistant/message`/`tool/result` 事件；验证：真实会话中三类事件均被捕获；若通道受阻，记录结论并切换 design.md D3 降级方案（技能驱动写文件）
- [ ] 3.2 实现 `lesson_log(file)` / `lesson_unlog` 模型工具与 `lesson-log` / `lesson-unlog` 用户命令（`ctx.commands`，无需模型轮次）：仅接受已存在文件、报错不创建；链接状态写入插件 storage（按 session 标识）；验证：命令与工具两条路径均可链接，链接不存在路径报错；链接后重启会话自动恢复镜像
- [ ] 3.3 实现镜像写入：quote/abstract/question/判定 callout 格式（对照 `tmp/learn/extensions/md-log.ts` 的 callout 结构）、写锁保序、quiz 题面取乱序后展示顺序且不含答案；验证：完整一轮含 quiz 的教学后，日志块顺序与内容符合 spec 各 Scenario
- [ ] 3.4 实现历史回填：链接时经 `dsh-session-query`（或 spike 确定的等价投影通道）回放当前分支历史写入日志；验证：会话中途链接，日志包含链接前对话与问答

## 4. lesson-visuals 图示（P3）

- [ ] 4.1 渲染链检测与文档：maker 提示词首步检测 `mmdc`+Chrome / `rsvg-convert`（回退 `magick`）并明确报告缺失；在插件 README 写安装指引；验证：卸载 PATH 中的 rsvg-convert 后 maker 返回明确不可用报告
- [ ] 4.2 打磨 maker 提示词：write→render(bash)→read_image 检查→迭代→`bash` 发布 `viz/viz-<slug>-<timestamp>.png`→返回 RESULT 块；验证：mermaid maker 端到端产出一张正确依赖图并内嵌课程回复
- [ ] 4.3 svg maker 端到端：验证一张几何图（如数轴/向量）经渲染-检查回路发布、内嵌显示、坐标正确

## 5. 端到端集成验收（P4）

- [ ] 5.1 完整教学会话演练：摸底（quiz 定位边界）→ 计划（researcher + mermaid 依赖图呈现并等待确认）→ 授课（逐节点循环 + 图示）+ 全程课程日志；逐条核对 `specs/teaching`、`specs/graded-quiz`、`specs/lesson-log`、`specs/lesson-visuals` 的每个 Scenario
- [ ] 5.2 编写迁移说明文档（`docs/migrate-learn-to-dsh.md`）：安装步骤、降级点清单（design.md D6）、渲染依赖、回滚方式（卸载插件/删除 skills）；验证：按文档从零安装可复现 5.1 演练

## Workflow follow-up

- 全部任务完成后运行 `/openspec-verify-change` 校验实现与工件一致，再视需要 `/openspec-archive-change` 归档。
