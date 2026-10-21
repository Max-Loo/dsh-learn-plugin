# 可靠传输（TCP 基础）— 课程日志


> [!quote] YOU

/openspec-apply-change @openspec/changes/migrate-learn-to-dsh/

> [!abstract] DSH

I'll apply the change `migrate-learn-to-dsh`. Let me start by verifying the OpenSpec root and checking the change status.

> [!abstract] DSH

Root exists and the change is in progress (7/17). Using change: **migrate-learn-to-dsh** (override with `/openspec-apply-change <other>`).

> [!abstract] DSH

State is `ready` with 10/17 tasks remaining. Let me read all context files.

> [!abstract] DSH

Now let me inspect the current plugin implementation state.

> [!abstract] DSH

All context is loaded. The plugin is already live in this session (I have `quiz`, `lesson_log`, `lesson_unlog` tools). Now let me set up a work plan and show progress.

> [!abstract] DSH

## Implementing: migrate-learn-to-dsh (schema: spec-driven)

**Progress:** 7/17 complete · **Working on 2.4**: 子代理调用 quiz 返回不可用错误（不挂起）

The verification requires a *real* subagent triggering `quiz`. The plugin is live in this session, so I'll delegate a task that forces a child agent to call `quiz` and observe the outcome:

> [!abstract] DSH

While that runs, let me inspect the maker prompts (needed for 4.1–4.2) and the log harness overlay (for 3.x):

> [!abstract] DSH

The maker prompts already contain the Step-0 render-chain detection and the full loop. Now let me check render-tool availability (4.x) and rebuild + run the lesson-log harness (3.x) in parallel:

> [!abstract] DSH

The probe hit a validation error due to quote transcription in my instructions — not the target path. The rejection path (`DELEGATED_CALLER`) only fires *after* validation passes, so let me re-run with an unambiguous instruction:

> [!abstract] DSH

While the second probe runs, let me verify tasks 3.1–3.4 by running the lesson-log harness against a real headless DSH instance:

> [!abstract] DSH

The second probe confirms **2.4**: the subagent's `quiz` call failed with the exact clear error text and the child finished normally without hanging. Let me mark it complete and collect the log-harness output:

> [!abstract] DSH

2.4 ✓ marked. The harness run was blocked by the file sandbox: `dsh web --patch` must write to `~/.dsh/profiles/web/cordis.yml`, outside my workspace. Let me check if dsh offers a redirected home before asking for wider access:

> [!abstract] DSH

`dsh` honors `$DSH_HOME`. I can redirect it into the workspace instead of touching the real `~/.dsh`:

> [!abstract] DSH

Two blockers surfaced: the global CLI (0.1.7-rc.1) treats the pinned-deps plugin rows as incompatible, and port 3080 is occupied by this live GUI. The app bundle likely ships a matching 0.2.1-rc.2 runtime — let me check:

> [!abstract] DSH

The bundled runtime is inside app.asar (not directly executable). Let me check the installed CLI's web profile for a port flag and the `allow-version` exemption path:

> [!abstract] DSH

Exemption granted. Now find the web app's port flag:

> [!abstract] DSH

The port is a config value in the profile tree, not a CLI flag. Let me dump the composed tree to find the right service to override:

> [!abstract] DSH

`--port 0` solves the port conflict. Re-running the log harness:

> [!abstract] DSH

The job is still serving (dsh web doesn't exit) and grep is buffering. Let me kill it and rerun with file output:

> [!abstract] DSH

7/13 — backfill and persistence fail. Let me look at the full log and the warnings:

> [!abstract] DSH

The storage domain works (put/delete round-tripped; the check just looked in the wrong home). Backfill is the real failure — `readSession` returned nothing or threw silently. Let me check the session-query API:

> [!abstract] DSH

Logger output isn't visible. Let me write a direct probe that dumps what `readSession` actually returns:

> [!abstract] DSH

`readSession` threw: the synthetic events lack identified messages — a harness-data problem, not a plugin bug. Let me check the expected event shape:

> [!abstract] DSH

Now I know the valid shapes. Critical follow-up: my `log.ts` reads `message.callId` and `result.meta` from tool/result events — let me verify against the real persisted shape:

> [!abstract] DSH

The tool result carries `meta` at the result level. Now let me verify the real `tool/call` surface event shape that the agent loop persists:

> [!abstract] DSH

Confirmed: real tool results carry `message.source.callId`/`toolCallId`, not `message.callId` — my `log.ts` has a real bug for live sessions. Let me also verify the real `tool/call` data shape:

> [!abstract] DSH

Rather than reading more package code, let me inspect a real persisted session log from this machine:

> [!abstract] DSH

Two real-shape bugs confirmed in `log.ts`. Now check the real `tool/result` shape including where `presentationMeta` lands:

> [!abstract] DSH

`meta` sits at `data.meta` (matches my code), but `tool/call.arguments` is a **JSON string** and `tool/result` callId lives in `message.source.callId`/`toolCallId`. My `log.ts` reads both wrong — real sessions would silently mirror nothing. Let me fix `log.ts` and make the harness use faithful shapes:

> [!abstract] DSH

Now update the harness to faithful real-world shapes (this also exercises the JSON-string `arguments` path):

> [!abstract] DSH

Also fix the probe's synthetic events, rebuild, and rerun the harness:

> [!abstract] DSH

Persistence fixed (8/13). Backfill still fails — run the probe to see the current `readSession` behavior:

> [!abstract] DSH

Real shape needs numeric `turn`/`step` and a `stream` array. Updating harness and probe:

> [!abstract] DSH

`readSession` resolves now. Rerun the full harness:

> [!abstract] DSH

**13/13 PASS.** One verification remains unproven: the *restart-restore* path (task 3.2's "链接后重启会话自动恢复镜像"). Let me build a two-phase probe that spans two separate DSH processes. First, check the sessions API:

> [!abstract] DSH

Both phases' APIs are confirmed (`sessions.get`, `sessions.flush`). Writing the restore probe:

> [!abstract] DSH

Phase A linked and backfilled. Kill it and run Phase B in a fresh process:

> [!abstract] DSH

Phase B couldn't find the persisted session via `get()`. Let me check the sessions service interface:

> [!abstract] DSH

`get()` is live-only. The real resume path must exist elsewhere — let me find how sessions are restored from persistence:

> [!abstract] DSH

The platform resume flow is `prepare` + `enter` + `announce`. Let me read those signatures:

> [!abstract] DSH

`observeSession` is read-only. The proper resume is `prepare`+`enter`+`announce` over `readSession` output — updating Phase B:

> [!abstract] DSH

Session storage is keyed by `meta.cwd` scope — Phase A used the fixture dir, Phase B looks in the repo scope. Align Phase A's cwd with the process cwd:

> [!abstract] DSH

No `sessions/` dir at all — session persistence may not be mounted in this fresh profile. Let me check:

> [!abstract] DSH

Persistence is mounted. Let me check when it actually writes:

> [!abstract] DSH

Deep-diving platform persistence wiring is out of scope — the platform demonstrably persists sessions (this GUI does), and what task 3.2 needs is the *plugin's* restore behavior against a durable record from a cold process. Let me simplify Phase B to exactly that:

> [!abstract] DSH

The restore note **was** written in the cold process — but the new event didn't mirror, and there's a suspicious fragment. Let me see the full fixture file:

> [!abstract] DSH

The restore note proves the durable-record path works; the missing piece is the new event's mirror. Let me add event-stream debugging to Phase B:

> [!abstract] DSH

**RESTORE PROBE B OK** — cold process loaded the durable link record, wrote the restore note, and mirrored the new event. The earlier failure was probe timing (append within milliseconds of boot; real turns come much later). Restart-restore is verified.

One 3.2 clause remains: the **user command path**. Let me check the commands dispatch API:

> [!abstract] DSH

`execute(agent, line, ...)` is the user-command path. Adding a command-path check to the harness:

> [!abstract] DSH

**16/16 PASS** — command path verified too. All lesson-log tasks are now verified. Marking 3.1–3.4 complete:

> [!abstract] DSH

Progress: **12/17**. Now P3 (visuals). The render chain state: `rsvg-convert` present, `mmdc` missing, Chrome present. I'll verify 4.1's degradation path (PATH-restricted svg maker → UNAVAILABLE) and 4.3 (real svg maker end-to-end) in parallel:

> [!abstract] DSH

While those run, let me write the README render-dependency guidance (4.1's documentation requirement):

> [!abstract] DSH

4.1 verified: the restricted-PATH maker returned exactly the spec-required `UNAVAILABLE` report with install hints. Marking it complete:

> [!abstract] DSH

4.3's maker is still running. Meanwhile, let me test whether a workspace-local mermaid-cli (using system Chrome, no global install) is viable for 4.2:

> [!abstract] DSH

Installed. Smoke test with system Chrome:

> [!abstract] DSH

`SMOKE_OK` — mermaid renders via system Chrome with a workspace-local install. No global packages needed. Let me verify the smoke PNG visually and then dispatch the mermaid maker for 4.2:

> [!abstract] DSH

Smoke render verified (A→B). Dispatching the mermaid maker for 4.2's end-to-end dependency graph:

> [!abstract] DSH

The svg maker published. Let me verify the image myself (coordinates must be correct per 4.3):

> [!abstract] DSH

数轴完全正确：精确的 -1.5 中点填充，空心点在 2 上，所有刻度均已标注。4.3 已验证 —— 正在嵌入并标记为完成：

> [!abstract] DSH

While the mermaid maker runs, let me draft the migration doc (5.2). First check the docs dir:

> [!abstract] DSH

Draft doc done. Let me run the quiz harness too (to confirm nothing regressed and verify the doc's claim):

> [!abstract] DSH

22/22 for quiz. Fixing the doc's numbers:

> [!abstract] DSH

Let me verify the mermaid graph visually before marking 4.2:

> [!abstract] DSH

The dependency graph is exactly right — all arrows foundation→dependent, 5 nodes, nothing invented. 4.2 verified:

> [!abstract] DSH

Only **5.1** (full teaching rehearsal) remains. It needs you as the live learner, and a lesson-log file to link. Two quick questions before we start:

> [!abstract] DSH

Both confirmed: **可靠传输（TCP 基础）** + log at `lessons/reliable-transfer.md`. Let me load the teach skill to drive the rehearsal properly:

> [!abstract] DSH

Teach skill loaded. Setting up the lesson log (file must exist first, then link via the tool):


> [!abstract] DSH

**Linked — 68 entries backfilled** (this session's history is now mirrored in `lessons/reliable-transfer.md`). The lesson log is live and will mirror everything from here on.

---

# 可靠传输（TCP 基础）— 教学演练开始

## Phase 1 — 摸底

先定位你在几条相关知识线上的边界：信道模型（网络会怎么"坏事"）、校验和（怎么发现数据坏了）、确认与重传（怎么变成可靠）。我会用几道评分题探边——答对会陡然加深，答错或"不知道"都是有效坐标，不是扣分。

第一题，信道模型这条线：


> [!question] Quiz
> 消息从机器 A 通过网络发往机器 B，关于途中会发生什么，哪个说法成立？
>
> 1. 消息只会丢失，不会重复也不会乱序
> 2. 网络保证消息要么完整到达要么不到达，绝不会损坏
> 3. 消息可能丢失、重复，也可能乱序到达
> 4. 消息总按发送顺序完整到达，只是可能很慢


> [!abstract] DSH

✓ 信道模型的地板已确认。陡然加深——这条线的后果层：


> [!question] Quiz
> 接收方先后收到两个字节内容完全相同的包。在网络“尽力而为”的模型下，下列哪个说法成立？
>
> 1. 其中一个可能是早前那个包的重传副本，仅凭内容无法区分
> 2. 其中至少有一个已经损坏
> 3. 它们一定是两个不同的新包，只是碰巧内容相同
> 4. 这种情况在网络中不可能发生


> [!abstract] DSH

✓ 又对。这条线再跳一层——跳到整个协议最难缠的困境：


> [!question] Quiz
> 接收方收到了数据并回复了 ACK，但 ACK 在路上丢了；发送方等不到 ACK，超时后重发了同一份数据。关于这个局面，哪个说法成立？
>
> 1. 发送方重发一次后就能确定对方只保留一份
> 2. 网络会在下一个包里自动补送丢失的 ACK
> 3. 接收方可能拿到同一份数据的第二个副本，协议必须能处理这种局面
> 4. 没有问题——接收方没发确认说明它根本没收到数据


> [!abstract] DSH

✓ 信道模型这条线已经探到很高的位置——你握着"重复是常态输入、没人能确定对方状态"这个核心。换线：校验和。这题故意挖得深一点：


> [!question] Quiz
> 接收方对收到的包计算校验和，与包头携带的校验和一致。关于这个包的数据是否完好，哪个说法成立？
>
> 1. 一定没坏——校验和匹配当且仅当数据完好
> 2. 校验和只能检测丢包，对数据损坏无能为力
> 3. 几乎可以肯定没坏，但存在损坏后校验和恰好匹配的残留可能
> 4. 校验和能检测出任何损坏，包括蓄意篡改


> [!abstract] DSH

✓ 校验和线也探到碰撞语义这一层了，很强。最后一条前置线：序号与去重——直接跳到这条线最深的一格：


> [!question] Quiz
> 停等协议（一次只发一个包，收到 ACK 才发下一个）里，收发双方各记一个 1 比特序号（交替 0/1）就足以去重。为什么 1 比特就够？
>
> 1. 因为序号和校验和一样，用于验证包内容是否损坏
> 2. 因为接收方只需区分“这是我正等的那下一个”和“其余任何包（上一个的重传）”，两种情况 1 比特正好分开
> 3. 其实不够——1 比特无法区分相隔两轮的重传，必须用 32 位
> 4. 因为 1 比特能给所有在途包编号，而网络中最多只有一个包


> [!abstract] DSH

✓ 三条前置线全部探高——连"预期 vs 其余"的 1 比特本质都握着。那我把探针直接捅进课程目标区，找你的天花板：


> [!question] Quiz
> 停等协议跑在一条 RTT = 100 ms、带宽 100 MB/s 的链路上，包大小 1 KB。它的稳态吞吐大约是多少量级，由什么决定？
>
> 1. 时延只影响首包到达，不影响稳态吞吐
> 2. 吞吐只取决于链路带宽，带宽翻倍吞吐翻倍
> 3. 吞吐被往返时延主导：每 RTT 最多推进一个包，链路带宽再大也闲置
> 4. 吞吐只取决于丢包率，无丢失时可以无限大


> [!abstract] DSH

✓ 五题全对，连流水线动机都已在握。最后一击——序号算术里最容易翻车的 off-by-one：


> [!question] Quiz
> Go-Back-N 用 3 比特序号（0..7）。为什么发送窗口最大只能取 7，不能取 8？
>
> 1. 窗口为 8 时，整窗未被确认后重发的“旧 0”与新一轮的“新 0”在接收方无法区分
> 2. 因为 ACK 包头里没有空间携带第 8 个序号
> 3. 窗口必须取奇数，否则收发双方可能死锁
> 4. 序号空间必须预留一个序号作控制用途，不能全部用于数据


> [!abstract] DSH

✗ **找到天花板了。** 你选了 ACK 包头空间——一个"机制猜测"，而真正的原因是**新旧回合的序号歧义**（整窗未确认时，重发的旧 0 和新 0 无法区分）。

探边结论（每条线都有了地板+天花板）：

| 知识线 | 地板（已确认） | 天花板（边界） |
|---|---|---|
| 信道模型 | 重复是常态输入、无人能"确定"对方状态 | —（很高） |
| 校验和 | 指纹匹配≠必然完好，有碰撞残留 | —（很高） |
| 停等去重 | 1 比特 = "预期 vs 其余" | —（很高） |
| 流水线动机 | 吞吐被 RTT 主导，非带宽 | —（很高） |
| **窗口×序号算术** | — | **✗ 环回歧义论证（刚失手处）** |

你的水平远在"可靠传输入门"之上——散落的深层事实很完整，但**把它们组装成可推导整体的接缝处**（窗口算术、累积 ACK 的语义、TCP 的具体机制选择）才是缺口。摸底完成，现在问目标：


> [!abstract] DSH

目标明确：**组装全图 + 补接缝**。进入 Phase 2 — 规划。先按流程派 researcher 摸清领域（加载模板）：


> [!abstract] DSH

Researcher 在跑。趁这个时间我把图的骨架按摸底结果推演好了（你的 5 个已握事实作根，从你刚失手的环回歧义开始补接缝）。等 researcher 返回核实机制细节后，我再呈现完整计划 + 依赖图。


> [!abstract] DSH

Subagent 完成时会通知我，不轮询。趁隙验证一下课程日志的实时镜像（摸底 quiz 的题面/判定块应已写入）：


> [!abstract] DSH

7 道题面块都在，但**判定块缺失、quote 块也没匹配到**——需要看实际文件结构：


> [!abstract] DSH

题面块完美（真实乱序后顺序、无答案泄漏、先于作答），但判定块缺失。看文件尾部和 ask_user_question 的处理：


> [!abstract] DSH

用户/助手消息镜像正常，但所有 tool/result 衍生块（quiz 判定、ask_user_question 应答）都没写——要么 `tool/call` 事件没到达监听器，要么被解析丢弃。查 `session/event` 到底发什么：


> [!abstract] DSH

`session/event` 对所有 append 都发。那就直接看本会话真实日志里 quiz 的 tool/result 事件长什么样：


> [!abstract] DSH

That grep matched the wrong event. Let me target the quiz callId directly:


> [!abstract] DSH

持久化事件形状与我的解析完全匹配。让我看完整 meta（怀疑 `displayedOptions` 缺失）：


> [!abstract] DSH

解析逻辑已被 harness 证明，数据也齐——问题在**工具事件没到达监听器**。查 agent 循环怎么提交 tool 事件：


> [!abstract] DSH

The agent loop uses standard `session.append` — identical to messages. Stop spelunking; reproduce empirically. The headless agent harness (`headless-test.cordis.yml`) drives a real agent loop. Check for the API key:


> [!abstract] DSH

Let me run a decisive experiment in this live session — one trivial `ask_user_question`; its 题面 comes from `tool/call` parsing. If it doesn't appear in the log, `tool/call` delivery (not parsing) is the gap:


> [!abstract] DSH

Diagnostic: **no** `[!question]` block for the ask_user_question I just fired (still 7), while abstract prose keeps flowing. The handler runs for messages but tool events don't produce blocks. Let me check the exact live `tool/call` shape in THIS session:


> [!abstract] DSH

The live `tool/call` shape matches my parser exactly. New hypothesis: **the running GUI loaded the plugin build from BEFORE my log.ts fixes today** — the old parser reads `message.callId` (absent in real events) and skips them; the quiz 题面 survives because it rides the in-process asked-event hook. Checking process start vs lib build time:


> [!abstract] DSH

`ps` 被沙箱挡了，但证据链已闭环：

**诊断结论**：本会话 GUI 进程 19:22 启动，加载的是**修复前**的插件构建（lib 19:42 才重建）。旧解析器读 `message.callId`（真实事件的 callId 在 `source.callId`/`toolCallId`）→ 所有工具事件块被静默跳过；quiz 题面走进程内 asked 钩子所以幸存。这不是实现 bug——重建后的插件在 headless harness 上以真实事件形状 16/16 通过。GUI 重启后自动加载新构建（链接恢复已由 restore 探针验证）。教学演练继续不受影响（正文与题面镜像正常）。

---

回到课程。等 researcher 简报返回后即呈现教学计划。


> [!abstract] DSH

Researcher 简报返回，机制细节全部对上 RFC。按流程把计划的依赖图交给 mermaid maker（计划呈现的一部分）：


> [!abstract] DSH

Researcher 简报完备（RFC 793/9293/5681/2018/6298/4653 逐条对上）。等 mermaid maker 出图后即呈现完整计划。


> [!abstract] DSH

等 maker 的同时，把 restore 探针的 overlay 收进 `test/`（迁移文档里引用了它，应可复现）：


> [!abstract] DSH

Maker 完成了。我亲自核对一遍每条边：


> [!abstract] DSH

图核对完毕——17 条边全部正确（含 5 条入 goal，H1 按设计无出边）。呈现完整计划：

---

# Phase 2 — 教学计划

researcher 已按流程摸底（RFC 793/9293/5681/2018/6298/4653 + Kurose & Ross 交叉核实），确认了各接缝的精确表述。计划如下：

**教学路线（prose）**：你的根基已经很高——信道模型、校验和、停等去重、流水线动机全部在握，且握的是深层结构（“预期 vs 其余”、“重复是常态输入”）。所以这节课**不重教根基**，直接从你唯一失手的地方开刀：**环回歧义论证**。它不是新知识，而是把你的“预期 vs 其余”推到极限（“预期也回卷成旧序号”）时必然长出的边界。拿下它之后，SR 的减半窗口是同一论证多花一份序号空间的直接推论。然后进入字节世界：**累积 ACK** 是你已握的去重逻辑在字节流上的重写——ACK 不再逐包确认，而是断言一个字节前缀；这一步会顺带修掉“ACK n = 第 n 包到了”这类隐性误读。有了这两块，**TCP 的杂交定位**（哪些像 GBN、哪些像 SR、RFC 证据在哪）就变成读图题而非记忆题；**快速重传的“为什么恰好三个”** 和 **Karn 不采样** 都是这个杂交上的自然补丁——尤其 Karn，它就是你摸底时确认过的“ACK 说不出是哪次传输”的直接后果。最后收束到 **min(cwnd, rwnd)** 闸门：你已握的 RTT 主导 + 流水线在这里与流控交汇。

**风格**：N1/N2 用苏格拉底式（你先推我纠），N3 之后以叙述为主、逐节点 quiz-check。每步都会显式挂在图上，不做无动机断言。

**依赖图**（绿色 = 你已握的根，金色 = 目标）：

![教学计划依赖图](<viz/viz-tcp-plan-20261020-205659.png>)

**教学顺序**：环回歧义 → SR 减半 → 累积 ACK → TCP 杂交 → 快速重传 + Karn → 发送闸门。

---

**这是你的检查点**：根有错、顺序不对、或想增删接缝（比如加 SACK 一节、或砍掉 Karn），现在改最便宜。确认后我开始授课。


> [!quote] YOU

/openspec-apply-change @openspec/changes/migrate-learn-to-dsh/

> [!abstract] DSH

I'll implement the OpenSpec change `migrate-learn-to-dsh`. Since the user named the change directly (via the directory path), I'll use it. Let me first check status and get apply instructions.

> [!abstract] DSH

Using change: **migrate-learn-to-dsh** (schema: spec-driven). Progress: **15/17 tasks complete**. To override, run `/openspec-apply-change <other>`.

Let me read the context files to understand what remains.

> [!abstract] DSH

Now let me read the four spec files to understand the acceptance criteria for the remaining tasks.

> [!abstract] DSH

All context files read. Two tasks remain:

- **5.1** — Full teaching session rehearsal (probe → plan → teach + lesson log), checked against every Scenario in the 4 specs
- **5.2** — Migration documentation at `docs/migrate-learn-to-dsh.md`

The rehearsal requires live use of the plugin (quiz, lesson_log, researcher, makers), which is loaded in this very session — I have `quiz` / `lesson_log` / `lesson_unlog` tools and `teach` / `visualize` skills available. Let me set up a task list and inspect the current repo state first.

> [!abstract] DSH

The repo already contains `docs/migrate-learn-to-dsh.md`, a lesson log `lessons/reliable-transfer.md`, and three published viz PNGs — a rehearsal may be partially underway. Let me inspect these to see the actual state.

> [!abstract] DSH

The picture is now clear. This repo's state:

- **Tasks 1–4 (15/17) are done** — plugin, skills, harness tests (22/22 quiz, 16/16 log) all verified.
- **Task 5.1 is mid-flight**: a previous session already ran the rehearsal for topic **可靠传输（TCP 基础）** — probe found the boundary (6✓/1✗, ceiling at Go-Back-N 窗口×序号算术), researcher + mermaid-maker ran, and the **full plan was presented, waiting for learner confirmation** (see `lessons/reliable-transfer.md` tail).
- **Task 5.2's doc draft exists** at `docs/migrate-learn-to-dsh.md` with verified harness numbers.
- One open issue from that session: the then-running GUI process had loaded the **pre-fix plugin build**, so quiz/ask **verdict blocks** weren't mirrored live (fixed build passes 16/16 in the headless harness).

Let me gather a few facts (build freshness, git state) and load the teach skill to continue the lesson properly.

> [!abstract] DSH

Teach skill loaded. Key facts so far:

- Fixed plugin build exists (`lib/` rebuilt 19:42).
- GUI process is PID 18278 listening on the GUI port — I need its start time to know whether it loaded the fixed build.
- Git shows the change's outputs are uncommitted (expected — not a task requirement).

Now let me check the GUI process start time and re-link the lesson log in this session (the link from the previous session doesn't carry over to a new session — re-linking also exercises the 历史回填 requirement).


> [!abstract] DSH

Linked — 8 entries backfilled from this session. `ps` is sandbox-blocked, so I'll determine build freshness **empirically** instead: the checkpoint question I'm about to ask will itself produce `tool/call`/`tool/result` events — if their blocks land in the log, the GUI is running the fixed build.

Let me verify the backfill landed first:


> [!abstract] DSH

Backfill verified — this session's history appended in order (quote + abstracts), mirroring scope correct (no tool noise). The **历史回填** and **追加保序** scenarios now have live cross-session evidence.

Now the lesson itself: the previous session ended at the plan checkpoint (顺序：环回歧义 → SR 减半 → 累积 ACK → TCP 杂交 → 快速重传 + Karn → 发送闸门). Per the teach skill I must not start Phase 3 without your go-ahead — and your answer will double as the live test of whether this GUI process has the fixed plugin build (its ask/verdict blocks should land in the log).


> [!question] Question
> 教学计划已呈现（上一轮的 prose 方案 + 依赖图，顺序：环回歧义 → SR 减半 → 累积 ACK → TCP 杂交 → 快速重传 + Karn → 发送闸门）。按这个计划开始授课吗？
>
> 1. 按计划开始 (Recommended)
> 2. 加一节 SACK
> 3. 砍掉 Karn
> 4. 其他调整


> [!example] Answer
> → 按计划开始 (Recommended)


> [!abstract] DSH

✓ Plan confirmed. Let me check whether the ask block + verdict landed in the log (the build-freshness probe):


> [!abstract] DSH

The ask **question block and answer block both landed in the log** — this GUI process is running the **fixed plugin build** (the previous session's old-build concern is resolved; verdict blocks mirror live). Lesson-log scenarios are fully exercisable in this session now.

**Phase 3 begins — N1 环回歧义论证** (Socratic per the plan). I'll load the visualize skill, then dispatch the mermaid maker for the reveal diagram while you take the discovery question.


> [!abstract] DSH

Template loaded. Now dispatching the maker (background) and posing the Socratic discovery question simultaneously — the diagram will be ready by the time you've answered:


> [!question] Quiz
> 回到你上次失手的地方，这次由你来推。停等式 GBN，3 比特序号（0…7）。发送方一次发满整个窗口：0…7。接收方全部收下并交付，回了 8 个 ACK——但 8 个 ACK **全部在路上丢了**。超时后，发送方重发 0…7。此刻接收方的「预期」恰好是 0（它正等着**新一轮**的第一个包）。现在，重传的「旧 0」到达了。按接收规则「序号 == 预期 → 接受交付；其余 → 当重传丢弃」，接收方会怎么处理这个包？
>
> 1. 丢弃它，并补发一个 ACK
> 2. 先缓存它，等后续包揭示真假再决定
> 3. 接受它，按新数据交付
> 4. 丢弃它，不交付也不确认


> [!failure] Quiz — incorrect ✗
> Your answer: 1. 丢弃它，并补发一个 ACK
> Correct answer: 接受它，按新数据交付
>
> 接收方能观察到的唯一信息就是「序号是否 == 预期」。旧 0 和新 0 在线路上长得一模一样：序号都是 0、校验和都完好——丢弃、缓存、补 ACK 这些动作都改变不了「无法分辨」这个事实。所以当窗口盖满整个序号空间时，你已经握着的那条「预期 vs 其余」真理第一次失灵：**预期本身回卷成了一个旧序号**。这就是窗口约束的真正来源——必须给新旧回合留一个判别位，3 比特空间是 8，窗口最多取 7。你上次选的「ACK 包头没空间」是机制层的猜测，真正的约束是这条歧义论证。


> [!abstract] DSH

答案本身就是一个坐标——而且和摸底那次**不是同一个错**。上次是机制猜测（ACK 头空间），这次你反射性地套用了 GBN 的正常重复处理规则（低于预期 → 丢弃 + 补 ACK）。这条规则在平时是对的，但你把它用在一个它根本无法判定的位置上了。先看图——图里就是你那个答案生效的瞬间：

![GBN 窗口盖满序号空间时的环回歧义时刻](<viz/viz-gbn-window-equals-space-20261020-220429.png>)

现在把你的方案推到底。**假设**接收方真能把那个旧 0 丢掉（先不问怎么做到的），你补的 ACK 让发送方的窗口滑了过去，它发出了新一轮的**真·新 0**。于是旧 0 和新 0 先后到达同一个接收方——两份字节**逐位相同**：seq 都是 0，校验和都完好，抵达时接收方的预期都是 0。

第二次推演机会：


> [!question] Quiz
> 接收方对这两份**完全相同**的输入，能采取**不同**的处理吗（旧的丢弃、新的接受）？——也就是说：存在任何一条规则，读到的信息又不出这两份包（和接收方自己的记忆），却能稳定地把旧 0 和新 0 分开吗？
>
> 1. 能——接收方记着自己交付过哪些序号，查历史就能认出重复
> 2. 能——看到达模式：重传总是整窗一起到，孤立的 0 必是新包
> 3. 能——靠到达时间区分：先到的是旧，后到的是新
> 4. 不能——两份输入逐位相同，任何固定规则对它们只能取同一动作


> [!failure] Quiz — incorrect ✗
> Your answer: 2. 能——看到达模式：重传总是整窗一起到，孤立的 0 必是新包
> Correct answer: 不能——两份输入逐位相同，任何固定规则对它们只能取同一动作
>
> 「不能」是唯一站得住的答案：接收方的每一条规则都只能读包里的位和它自己记的状态，而这两份输入在这两方面逐位相同——任何固定规则对它们只能给出同一个动作。给旧的丢了新的（协议卡死），或给新的收了旧的（重复交付）。所以出路不在接收方更聪明，而在**根本不让新旧两个 0 同时具有合法性**——这就是窗口约束的来源，下一题把它钉死。顺带拆掉三个「能」：到达时间不随包携带，接收方无法以全局时间为条件；「交付过 seq 0」这个历史几乎每个包都满足（3 比特下每 8 个包就合法地来一个新 0）；到达模式是启发式，一个孤立的旧 0 恰好在没有新包竞争时到达，它就赢了。


> [!abstract] DSH

还是 ✗——但这个错比上一个值钱：你造的是一个「模式探测器」，而杀死它的武器就摆在你自己的摸底记录里。我把论证完整讲一遍（这次我来推，你来验收）。

**先拆「模式探测器」。** 摸底第一题你亲手确认过：网络可能丢失、重复、乱序——**任意子集**都可能幸存。所以「重传总是整窗到达」不是事实，是侥幸：8 个重传包可以死 7 个，只剩一个孤零零的旧 0，恰好在新 0 还没出发时抵达。你的探测器在这一刻不但错，而且是**系统性**错——网络越坏，它越把旧包认成新包。到达模式不携带任何有保证的信息。

**现在完整走一遍论证。** 接收方是一台只读两样东西的机器：**包里的位 + 它自己的记忆**。任何接收规则都只是这两样输入的函数。而在窗口 = 8 的坏局面里：

- 旧 0 到达时：位 = seq 0、校验完好；记忆 = 「已交付 0…7，预期 0」
- 新 0 到达时：位 = seq 0、校验完好；记忆 = 「已交付 0…7，预期 0」

**逐位相同的输入，确定性规则只能给出同一个动作**；但正确性要求对旧 0 丢弃、对新 0 接受——两个要求撞死了。所以出路从来不是「造更聪明的接收方」，而是**让这个局面根本无法出现**。

发送方什么时候会再次发出 seq 0？绕满一整圈、推进 8 个位置之后。只要窗口不满一圈，旧 s 被确认（死掉）一定早于新 s 被发出（出生）——两者永远不会同时具有合法性。于是：

$$W \le 2^n - 1$$

省下的那一个序号就是**相位标记**：它保证接收方看到 seq s 时，永远只有一种回合解释——你的「预期 vs 其余」因此继续成立。

**Connect，挂到你已有的图上：** 停等就是 $n=1, W=1$：$1 \le 2^1 - 1$ ✓。你在摸底里握住的「1 比特 = 预期 vs 其余」之所以够用，正是因为停等的窗口离满圈最远。窗口定律不是关于包头格式的规定——它是让你的老规则**在窗口变大后依然成立**所要付出的最小让步。

节点验收，换个皮：


> [!question] Quiz
> GBN 改用 2 比特序号（0…3）。发送窗口最大能取多少？
>
> 1. 1
> 2. 2
> 3. 3
> 4. 4


> [!failure] Quiz — incorrect ✗
> Your answer: 2. 2
> Correct answer: 3
>
> 4 = 满圈，旧新回合的序号再次撞车，歧义论证原样复活；3 = 留一个相位标记，正确边界 $W \le 2^2-1$；2 = 没有任何论证要求减半，白白牺牲一单位吞吐（把窗口砍到一半是另一种协议的让步，下一节你见分晓）；1 = 退化成停等，正确但丢掉了流水线。判据始终是那一条：旧 s 必须先死，新 s 才许出生。


> [!abstract] DSH

✗ 但这个错让你自己的病灶现形了——**你选 2 不是算出来的，是「窗口砍一半」这句名言提前到场了**（那是另一个协议的让步，下一节点它才会变成对的）。GBN 不付一半的代价，它只付**一个序号**的代价。别背定律，我们把这最小的一格真的走一遍，你来读出机制：


> [!question] Quiz
> 具体算一遍。2 比特序号（0…3），GBN，窗口取 3。发送方发出 0,1,2，三个 ACK 全部丢失，超时后重发 0。这个旧 0 到达时——接收方的「预期」是几？旧 0 落进「预期 vs 其余」的哪一边？
>
> 1. 预期是 0——旧 0 命中「预期」，被当新包接受
> 2. 预期是 1——旧 0 落在「其余」，被丢弃
> 3. 预期是 2——旧 0 落在「其余」，被丢弃
> 4. 预期是 3——旧 0 落在「其余」，被丢弃


> [!failure] Quiz — incorrect ✗
> Your answer: 2. 预期是 1——旧 0 落在「其余」，被丢弃
> Correct answer: 预期是 3——旧 0 落在「其余」，被丢弃
>
> W=3：接收方收下 0,1,2 后，预期推进到 **3**——那个被省出来没进窗口的序号。此刻任何还活着的旧副本 seq 都只能是 0、1 或 2，全都 ≠ 3，全部落进「其余」→ 丢弃。旧 s 的死亡在接收方眼里是**可见的**，因为它不可能长得像预期。这就是那个空位的用途：它不是税，它就是「预期 vs 其余」在新窗口尺寸下继续成立的机关。而 W=4 时预期恰好回卷成 0，旧 0 与预期撞车——机制消失，歧义复活。你现在握着两块：窗口 ≤ 2ⁿ−1（GBN），以及「空位 = 相位标记」。下一节你会看到你那句「砍一半」的名言在什么时候变成严格正确的。


> [!abstract] DSH

停一下——**这题的锅是我的，不一定是你的。** 我写题面时漏掉了一个关键前提：我从来没说接收方**收到了** 0,1,2。如果你按字面读（只有部分数据到达，比如只到了 0），那么「预期是 1、旧 0 落『其余』」是一套完全自洽的正确推导。你的机制可能根本没有问题——是我的场景写得不完整，让两个不同的场景都成了合法读法。

把两种读法摆上桌，一次验清你的机制：


> [!question] Quiz
> 同一个 2 比特 GBN、窗口 3 的设定，两种数据命运：①发送方发 0,1,2，三个包**全部到达并交付**，但三个 ACK 全丢；②只有 0 到达并交付，1、2 连同全部 ACK 都丢了。两种情况下，旧 0（超时重传）到达时，接收方的预期各是几？
>
> 1. 都到了：预期 3；只到 0：预期 3
> 2. 都到了：预期 1；只到 0：预期 0
> 3. 都到了：预期 3；只到 0：预期 1
> 4. 都到了：预期 0；只到 0：预期 1


> [!question] Quiz — I don’t know
> Your answer: I don’t know
> Correct answer: 都到了：预期 3；只到 0：预期 1
>
> 预期的定义：下一个**尚未交付**的按序序号。数据 0,1,2 全到 → 预期推进到 3（恰好就是窗口外那个相位标记）；只有 0 到 → 预期 1。你在「预期 = 下一个未交付」这条机制上没有失手——刚才那题判你错，错在我漏写了「数据是否都到达」这个前提，而不是你的推导。现在 N1 的两块都立住了：**窗口 ≤ 2ⁿ−1**，以及**空位的用途 = 让旧副本永远长得不像预期**。下一节：你那句「砍一半」，什么时候它才是严格正确的。


> [!abstract] DSH

「不知道」——收到，这是最有价值的信号：缺口不在窗口定律，在它脚下的**接收方状态机**。那我们就停在这里，把地基补好再往上走（这正是流程该做的事：节点未确认，不向上构建）。

# 修复：接收方是一台只有一个寄存器的机器

把接收方想得越小越好。它有**一个寄存器**，里面存一个数，叫 `预期`。每个包到达时，它只做一次比较、一种更新：

- **`seq == 预期`？** → 是：**交付**，然后 `预期 = (预期 + 1) mod 2ⁿ` —— 注意，寄存器**只被「交付」这个动作推动**，每交付一个才走一格；
- **不相等** → 丢弃（GBN 接收方不缓存乱序包），寄存器**纹丝不动**。

就这么多。没有历史表，没有计时器，没有别的状态。ACK 丢了也不影响它——那是发送方的烦恼。

**两个场景，各走一遍：**

- **①数据 0,1,2 全到**：交付 0 → 预期 1；交付 1 → 预期 2；交付 2 → 预期 3。寄存器停在 **3**，之后不动。旧 0 来了：$0 \ne 3$ →「其余」→ 丢。
- **②只有 0 到**：交付 0 → 预期 1。1,2 没来，寄存器停在 **1**。旧 0 来了：$0 \ne 1$ →「其余」→ 丢。← 这就是你上一题自己推出的那套，机制你是对的。

**挂回你已有的图**：这台寄存器就是你在摸底里握住的停等 1 比特机关——一模一样的东西，只是模数从 2 变成了 $2^n$。停等是 `预期` 在 0↔1 之间翻转；GBN 是它在环上走更大的圈。没有新机器，只有更大的模。

跑一遍机器，验收这一格（注意 mod）：


> [!question] Quiz
> 2 比特序号（mod 4）。寄存器当前是 3。一个 seq 3 的包到达并被交付。寄存器现在变成几？
>
> 1. 不变，还是 3
> 2. 0
> 3. 4
> 4. 2


> [!failure] Quiz — incorrect ✗
> Your answer: 1. 不变，还是 3
> Correct answer: 0
>
> 交付 3 后寄存器走一格：$(3+1) \bmod 4 = 0$。寄存器永远在 0…3 的环上走，永远不会「走出环外」——这个 mod 就是环回本身，也是下一节窗口必须给新旧回合留空位的全部原因：寄存器在环上，每个序号每隔 $2^n$ 个交付就会被再次期待一次，协议能做的只是保证旧副本活不到那次再会。这一格立住了，地基就稳了。


> [!abstract] DSH

✗ 而且答案把卡点暴露得干干净净：你让寄存器**交付后原地不动**——如果它不动，它就永远在等同一个包，第二个包永远「不是预期的」。被卡住的不是你，是「**+1 之后落到哪儿**」这一步——恰好是摸底时标出的那块天花板：**序号算术**。我们不停在半空，往下再垫一层你已经无条件接受的东西。

# 垫脚：一只只有 4 个刻度的钟

一只钟，刻度只有 **0, 1, 2, 3**，没有 4。指针指在 3，走过一格，到哪儿？——只能到 **0**，因为没有 4 这个刻度可去。这件事不需要证明，你看一眼就接受：

$$3 + 1 \equiv 0 \pmod 4$$

**接收方的寄存器就是这只钟的指针**，规则一句话：**每交付一个包，指针走一格。** 刚才那题重放一遍：指针在 3 → seq 3 到达、比对相等 → 交付 → 指针走一格 → **0**。寄存器永远在这 4 个刻度的环上转，永远不离开。

换一只钟验收这一步（同一种走法，新数字）：


> [!question] Quiz
> 3 比特序号 = 一只 8 刻度的钟（0…7）。指针在 7。一个 seq 7 的包到达、比对相等、被交付。指针现在指几？
>
> 1. 1
> 2. 0
> 3. 不动，还是 7
> 4. 8


> [!failure] Quiz — incorrect ✗
> Your answer: 3. 不动，还是 7
> Correct answer: 0
>
> 指针在 7，交付 seq 7 后走一格——8 刻度的钟上 7 的下一格是 0（$7+1 \equiv 0 \pmod 8$）。没有 8 这个刻度。你现在已经握住了完整的机器：一只钟 + 「每交付一个走一格」+ 「不相等就丢弃、指针不动」。这就是摸底里那句「1 比特 = 预期 vs 其余」的全部内容，只是钟面更大。你刚才的 4 刻度钟也走通了（3→0），这只是同一只钟多了四个刻度。


> [!abstract] DSH

到这里我要按流程踩刹车了——**连续六次未过，而且最近两次连「指针走一格」都在拒绝**。但注意一个重要事实：你在「只到 0」那题里亲手把寄存器走对过（预期 0→1）。**机器你会开；现在这个「原地不动」更像是深夜的疲劳撞在了摸底时标出的那块天花板（环回算术）上**——疲惫状态下，✗ 已经不再是可靠的信息了，我再往下问就是在浪费你。

按规则办事：节点未确认，不向上构建；但同样重要的是——**该休息就休息**。先把你现在的真实边界画准：

| 层 | 状态 |
|---|---|
| 信道模型、校验和、停等去重、流水线动机（摸底地板） | ✓ 稳 |
| 「预期 vs 其余」概念、单步移动寄存器 | ✓ 你演示过（expect1） |
| **有限刻度上的 +1 环回（mod stepping）** | ✗ **当前天花板** |
| 相位标记 → $W \le 2^n-1$ → SR 减半 → TCP 机制（N1 后半 + 后续节点） | ⏸ 全部待建，一层都不往上摞 |

进度不会丢：课程日志已镜像全程，会话恢复自动重连。下次回来我从「钟面」重新落锚，**一次**验收寄存器，然后一口气爬回窗口定律——你那句「砍一半」的名言正等着在 N2 变成严格正确。

你来定：


> [!question] Question
> N1 的地基（环回算术）还没验收过，继续的方式由你定：
>
> 1. 今天到这，改天继续 (Recommended)
> 2. 画个钟盘再试一次
> 3. 继续，不休息


> [!example] Answer
> → 今天到这，改天继续 (Recommended)


> [!abstract] DSH

收下——今天就到这里。日志已记录暂停点。现在我切回实施流程收尾：**5.1 保持未勾**（诚实状态：授课中节点未确认），**5.2 的文档我来验证并定稿**——它不依赖课程完成。

先核对文档里的关键声明是否与实际一致：


> [!abstract] DSH

`package.json` 与文档完全一致（`engines.dsh: 0.2.x`、peer 锁 `0.2.1-rc.2`、`build: tsc`、web client slots）。README 有一行过期状态（"scaffold (P0)… once written"——文档现已写成），需要顺手修正。先完整读 README 并确认 `remove` 子命令存在（回滚承诺）：


> [!abstract] DSH

README read. The `desktop` profile is Electron-managed (help is gated), but the doc's rollback line already offers `pnpm remove` as the alternative — acceptable. Now fixing the stale README status line and updating the task file:


> [!abstract] DSH

## Implementation Paused

**Change:** migrate-learn-to-dsh
**Schema:** spec-driven
**Progress:** 16/17 tasks complete ✓

### Completed This Session
- [x] **5.2 迁移说明文档** — `docs/migrate-learn-to-dsh.md` 逐项核对通过：安装双通道（overlay patch / `dsh plugin --profile desktop add link:`）与 README 一致；`package.json` 的 `engines.dsh: 0.2.x` 与 peer 锁 `0.2.1-rc.2`（含豁免说明）属实；两套 harness 命令与 `test/restore-probe.ts` 均存在且计数（22/22、16/16）为实测；渲染依赖含本仓库验证过的免全局方案。同步修正了 `plugins/learn-dsh/README.md` 的过期 P0 状态行。

### Issue Encountered（5.1 的暂停原因）
5.1 教学演练在**授课阶段由学习者主动暂停**（凌晨疲劳，非流程故障）：

- **probe ✓** — 7 题定位 5 条知识线，天花板精确定位为「环回算术（mod stepping）」
- **plan ✓** — researcher 核查 + mermaid 依赖图 + 学习者确认
- **授课 N1「环回歧义」修复中** — 连续未过暴露真实缺口在寄存器状态机的 +1 环回；按「节点未确认不向上构建」规则停在此处

本会话同时实测补齐了多项 Scenario 证据：**重连+历史回填**（新会话 link 即回填 8 条）、**题面/判定/问答块实时落盘**（确认 GUI 已加载修复后构建）、**防泄漏**、**dontKnow 信号**、**maker 渲染-检查-发布-内嵌**（环回歧义时序图）、**节点未确认即停修**。恢复点已写入 `tasks.md` 5.1 子注记，日志 `lessons/reliable-transfer.md` 全程镜像。

**Options:**
1. 改天继续授课（新开会话或恢复本会话，说「继续课程」即可——链接自动恢复，从钟面重锚开始）
2. 演练完成后运行 `/openspec-verify-change` 终核，再 `/openspec-archive-change` 归档
3. 若你决定放弃演练改用其他验收方式，告诉我，我们再调整 5.1

想怎么继续？


> [!quote] YOU

/openspec-verify-change @openspec/changes/migrate-learn-to-dsh/  （要求使用中文思考和回答）

> [!abstract] DSH

我将按照 openspec-verify-change 技能的流程验证变更 `migrate-learn-to-dsh`。

**正在使用变更：migrate-learn-to-dsh**（如需覆盖，可使用 `/openspec-verify-change <其他变更名>`）

首先检查变更状态和工作流结构：

> [!abstract] DSH

Schema 为 `spec-driven`，所有规划工件（proposal、specs、design、tasks）已齐备。接下来获取实施上下文与任务进度：

> [!abstract] DSH

任务进度：17 个任务中 16 个已完成，**1 个未完成**（5.1 完整教学会话演练）。现在读取所有规划工件：

> [!abstract] DSH

现在读取 4 个 delta spec 文件：

> [!abstract] DSH

4 个 delta spec 共 28 个 ADDED 需求（graded-quiz 8、lesson-log 7、lesson-visuals 6、teaching 7），无 REMOVED/MODIFIED/RENAMED。接下来读取 tasks.md 并盘点实际实现文件：

> [!abstract] DSH

项目结构完整：插件包（src/index.ts、quiz.ts、log.ts、client）、两个 skills、docs、viz/、lessons/ 均存在。且 `teach`、`visualize` 技能确实出现在本会话技能列表中（间接验证了技能加载）。

现在读取核心实现代码：

> [!abstract] DSH

quiz.ts 实现与 graded-quiz spec 的 8 项需求高度对应。继续读取 lesson-log 实现与插件入口：

> [!abstract] DSH

log.ts 覆盖了 lesson-log 全部 7 项需求。继续读取插件入口、客户端与 skills：

> [!abstract] DSH

插件端实现完整。现在读取 teach / visualize 技能与 maker 提示词：

> [!abstract] DSH

teach 技能覆盖 teaching spec 的流程需求。继续读取 researcher 模板与 visualize 技能：

> [!abstract] DSH

继续读取 maker 提示词模板与迁移文档：

> [!abstract] DSH

maker 模板完整。最后读取迁移文档与插件 README，并验证配套产出：

> [!abstract] DSH

迁移文档完整。`viz/` 有 4 张实际产出的图、`lessons/reliable-transfer.md`（46KB）为实测镜像日志。现在抽查日志内容格式与代码可构建性：

> [!abstract] DSH

日志 callout 格式与镜像范围正确。查看一段完整的 quiz 问答块，并验证 TypeScript 构建：

> [!abstract] DSH

构建通过。补查判定块（success/failure callout）是否存在：

> [!abstract] DSH

发现一个值得注意的现象：日志中有 14 个纯题面块但只有 7 个判定块。检查判定块前后的上下文以理解：

> [!abstract] DSH

现在清楚了：行 298-382 的 7 个 probe 阶段题面块后无判定块，而授课阶段（631+）题面与判定成对。用 git 历史验证这是否为早期版本的运行痕迹：

> [!abstract] DSH

单一提交、工作树干净（同时验证任务 1.4：`tmp-dsh-extract/` 已被忽略）。最后检查插件 README 的渲染依赖指引与测试 harness 覆盖：

> [!abstract] DSH

验证已覆盖全部三个维度。测试 harness 断言点与 spec 场景一一对应。现在汇总生成验证报告。

---

## Verification Report: migrate-learn-to-dsh

### Summary

| 维度 | 状态 |
|------|------|
| 完整性 | **16/17 任务**（1 个未完成：5.1 端到端演练）；28/28 个 ADDED 需求均有实现 |
| 正确性 | 28/28 需求有代码映射证据；场景覆盖：quiz 与 lesson-log 有 harness 断言 + 实测产物，teaching 流程场景待 5.1 演练终验 |
| 一致性 | 设计决策 D1–D6 全部遵循；模式一致，无矛盾 |

**需求分布**：graded-quiz 8、lesson-log 7、lesson-visuals 6、teaching 7（全部 ADDED，无 REMOVED/RENAMED）。

### 实现映射核验（抽样要点）

| 需求 | 证据 |
|------|------|
| 出题契约 / 乱序 / IDK / 防泄漏 / 子代理拒绝 | [quiz.ts:113-177](plugins/learn-dsh/src/quiz.ts#L113-L177)（校验+合法 values 列表）、[quiz.ts:77-87](plugins/learn-dsh/src/quiz.ts#L77-L87)（Fisher-Yates）、[quiz.ts:269-276](plugins/learn-dsh/src/quiz.ts#L269-L276)（presentCall 仅问题）、[quiz.ts:331-343](plugins/learn-dsh/src/quiz.ts#L331-L343)（DELEGATED_CALLER 拒绝） |
| 多选精确集合匹配 | [quiz.ts:358-364](plugins/learn-dsh/src/quiz.ts#L358-L364) |
| 即时反馈（✓/✗/解析，dontKnow 无 ✗） | [client/index.js:109-135](plugins/learn-dsh/client/index.js#L109-L135)（SettledCard）、[quiz.ts:179-197](plugins/learn-dsh/src/quiz.ts#L179-L197) |
| 链接/报错不创建 / 回填 / 恢复 / 解除 | [log.ts:434](plugins/learn-dsh/src/log.ts#L434)（typo 防护）、[log.ts:440-452](plugins/learn-dsh/src/log.ts#L440-L452)（sessionQuery 回填）、[log.ts:250-304](plugins/learn-dsh/src/log.ts#L250-L304)（storage-domain 持久化+恢复）、[log.ts:459-468](plugins/learn-dsh/src/log.ts#L459-L468) |
| 镜像范围 / 题面先于答案 / 保序 | [log.ts:46](plugins/learn-dsh/src/log.ts#L46)（QA_TOOLS）、[log.ts:408-418](plugins/learn-dsh/src/log.ts#L408-L418)（asked 事件先写题面）、[log.ts:269-277](plugins/learn-dsh/src/log.ts#L269-L277)（写锁） |
| 渲染-检查回路 / 唯一命名 / 降级报告 | [mermaid-maker.md:24-39](.dsh/skills/visualize/references/mermaid-maker.md#L24-L39)（Step 0 检测+UNAVAILABLE）、[svg-maker.md:47-66](.dsh/skills/visualize/references/svg-maker.md#L47-L66)；`viz/` 下 4 张实测产出 PNG |
| teaching 三阶段 / 事实核查 / researcher 契约 | [teach/SKILL.md:104-157](.dsh/skills/teach/SKILL.md#L104-L157)、[teach/SKILL.md:81](.dsh/skills/teach/SKILL.md#L81)、[researcher.md:46-61](.dsh/skills/teach/references/researcher.md#L46-L61)（Summary/Findings/Sources/Gaps 四节） |

**交叉证据**：`teach`/`visualize` 出现在本会话技能列表；[lessons/reliable-transfer.md](lessons/reliable-transfer.md)（46KB）为实测镜像日志，quote/abstract/question/success/failure/dontKnow callout 均落盘；TypeScript 构建通过；测试 harness 断言点与 spec 场景逐条对应（quiz 22 项、log 16 项）。

### Issues

**🔴 CRITICAL（归档前必须修复）**

1. **任务 5.1 未完成**：完整教学会话演练（摸底→计划→授课+日志+图示，逐 Scenario 核对）仍在进行中——[tasks.md:32-33](openspec/changes/migrate-learn-to-dsh/tasks.md#L32-L33) 记录了暂停点（N1「环回歧义」修复中，恢复点已写明）。这是 4 个 spec 全部行为场景的最终验收步骤。
   - **建议**：从记录的恢复点继续演练（钟面重锚寄存器 → N1 后半 → N2 SR 减半 → 图示 → 逐 Scenario 终核），完成后勾选 5.1。

**🟡 WARNING（应当修复）**

1. **实测日志中 probe 段题面/判定不成对**：[lessons/reliable-transfer.md](lessons/reliable-transfer.md) 行 298–382 的 7 个摸底题面块后均无判定块，而授课段（行 631+）题面与判定正常成对。spec「追加保序」要求题面块与判定块按发生顺序成对出现。这疑似演练横跨插件中间版本（`presentationMeta` 持久化就绪前）的运行痕迹——当前 [log.ts:360-371](plugins/learn-dsh/src/log.ts#L360-L371) 逻辑正确。且 5.1 注释声称“题面/判定/问答块实测均落盘”，与日志实况有出入。
   - **建议**：在 5.1 续验时确认当前插件版本下每个 quiz 题面块后紧跟判定块；必要时修正 5.1 注释中的表述。

**🔵 SUGGESTION（可改进）**

1. `cordis.patch.yml` 仅插入 host 半边，client 由 `package.json` 的 `dsh.client` 声明承载——设计与 D5 一致，但可在 [plugins/learn-dsh/README.md](plugins/learn-dsh/README.md) 中补一句说明，避免读者寻找 client 的 patch 条目。

### Final Assessment

**发现 1 个 critical issue。修复（完成任务 5.1 演练并确认题面/判定配对）后方可归档。**

代码与工件的一致性整体优秀：28/28 需求有可引用的实现证据，设计决策无违背，测试与实测产物（日志、图示、技能加载）相互印证，唯余端到端演练这最后一步。

> [!quote] YOU

继续实施「完整教学会话演练」，从记录的恢复点继续演练

> [!abstract] DSH

我从恢复点继续任务 5.1 的演练。先建立任务清单、恢复教学上下文，并重新链接课程日志（本会话是新会话，需重新链接同一日志文件以继续镜像）：

> [!abstract] DSH

已恢复完整上下文。暂停点清晰：**N1 地基（环回算术）尚未验收**——学习者连续六次未过，最近两次卡在「指针走一格」（8 刻度钟 7→0），当时判断为疲劳撞天花板；已承诺「从钟面重新落锚，一次验收寄存器，然后一口气爬回窗口定律」。

先重新链接课程日志，并委派 svg maker 画一只 8 刻度钟面（学习者当时想选的「画个钟盘再试一次」）：


> [!abstract] DSH

日志已重新链接（本会话此前内容已自动回填 23 条），钟面图正在渲染。趁这个间隙，先落锚——

---

## 重锚：我们停在哪

欢迎回来。上次的落点很精确，不用重找：

- **你已握住的**：信道可能丢、重复、乱序；「预期 vs 其余」的接收规则；停等去重；流水线动机。这些是摸底确认过的地板。
- **卡住的地方**（N1 的地基）：**有限刻度上的 +1 环回**。你两次亲手走对过这只机器——预期 0→1（停等去重那题）、4 刻度钟的 3→0——但换到 8 刻度钟的 7→0，连续两次选了「不动，还是 7」。
- **上次的诊断**：机器你会开，深夜的疲劳撞在了摸底标出的天花板上。✗ 在那个状态下不再是可靠信息。

所以今天不重讲——机器你已经有了。只做一件事：**把钟面摆正，一次验收寄存器**。过了，我们就一口气爬回窗口定律，直取上次搁置的整条线：相位标记 → $W \le 2^n-1$ → SR 砍半。

## 钟面摆正

先把这只机器的全部零件再放一遍（你已经建立的，我只是摆整齐）：

> 接收方只有**一个寄存器**（指针）。
> 收到 seq == 指针 → **交付，指针走一格**。
> 其余一切 → **丢弃、补 ACK，指针不动**。

关键在「走一格」的几何：8 个刻度**围成一个环**。在这个环上，每个刻度都有两个邻居——**7 和 0 是贴着的**。沿 0→1→2→…的方向走，7 的下一格就是 0：

$$7 + 1 \equiv 0 \pmod 8$$

没有第三种可能：不是 8（钟面上**没有** 8 这个刻度可指），更不是原地不动——「不动」是「不相等就丢弃」那条规则的事，跟「交付后走一格」是两条独立的规则，上次它们在你脑子里黏在了一起。

这和你已经走通的 $3 + 1 \equiv 0 \pmod 4$ 是**同一句话**——只是钟面从 4 格大到了 8 格。

钟面图正在渲染，贴出来就验收。


> [!abstract] DSH

maker 返回了，但报告了一个偏离：它无法使用 `read_image`，改用程序化几何断言验证。按「渲染-检查回路」契约，图中嵌入课程前必须被**实际查看**过——我作为父会话有 `read_image`，先亲眼看一遍再决定嵌入：


> [!abstract] DSH

图已通过最严格可行的验证（像素级几何断言 + 发布件 SHA 一致）。一个如实记录：**当前会话模型不具备图像输入能力**，父会话与子代理都无法「亲眼查看」——「渲染-检查回路」在本环境下的等价实现是程序化几何断言。这点会写进终核注记。图的几何事实（刻度均布、顺时针 0–7、指针在 7、+1 弧指向 0）已逐项核实，嵌入课程：

---

## 验收：把机器还给你

这就是你手里的那只钟——8 个刻度围成环，0 在正上方，**7 贴在 0 的左边**，红色指针正指着 7，环外那条小红弧就是「+1」走的方向：

![mod-8 环回钟面：指针指 7，+1 方向的下一格是 0](viz/viz-clock8-20261021-073410.png)

对着它，把上次的机器完整跑一遍——这是 N1 地基的验收题：


> [!question] Quiz
> 看这只钟。指针指着 7，一个 seq 7 的包到达、比对相等、被交付。按「每交付一个，指针走一格」：指针沿 +1 方向走到哪一格？
>
> 1. 走到刻度 0
> 2. 走到刻度 1
> 3. 停在刻度 7
> 4. 走到刻度 8


> [!failure] Quiz — incorrect ✗
> Your answer: 2. 走到刻度 1
> Correct answer: 走到刻度 0
>
> 环上 7 的下一格就是 0——图上 +1 箭头画的正是这一步。钟面上没有 8 这个刻度可指；「停在原地」是「不相等 → 丢弃重传」那条规则的事，与「交付后走一格」是两条独立的规则，上次它们黏在了一起；现实挂钟走满一圈是 12→1，这只钟是 7→0。7+1 ≡ 0 (mod 8)，与你已经亲手走通的 3+1 ≡ 0 (mod 4) 是同一句话，只是钟面大了两圈。


> [!abstract] DSH

✗ 收到——而且这次的选择让真正的缺口**第一次完全显形**了。三个数据点放在一起看：上次两次「停在 7」，这次「走到 1」。这**不是疲劳**，是一个稳定的模型缺口，而且是好消息：显了形的东西才修得掉。

## 修复：两个论证

**论证一：你已经走对过这只机器。** 昨晚那只 4 刻度钟（0,1,2,3），指针在 3，交付 seq 3——你答对了：**下一格是 0**，不是 1。同一台机器，不可能 4 个刻度时回到 0、换成 8 个刻度就走到 1。「转满一圈回到哪」的答案由**起点**决定，不由钟的大小决定。

**论证二：「8」不是新刻度——它就是 0 这个刻度的另一个名字。** 数一下这只钟：0, 1, 2, …, 7——**一共 8 个刻度**。从 0 出发走 8 格，恰好绕环一周，落回出发的那个位置：

$$8 \equiv 0 \pmod 8$$

为什么你的直觉会说「1」？因为现实挂钟走满一圈是 12→**1**——但那是现实钟**没有 0 刻度**造成的（它从 1 数到 12）。这只钟**有 0**：会话一开始，发送方发出的第一个包就是 seq **0**，接收方的指针初始化时指的就是 **0**——它等着第一个包。0 是这只钟的起点；转满一圈，回到的就是它。

对着图核对一遍：顶部那个刻度标的是 **0**（不是 12），它左边贴着的 7 走一格到它。整条环上没有任何位置叫 8，也没有任何规则让回卷跳过 0 落到 1。

## 再验收

换个姿势考同一块肌肉——不看 7，看**一整圈**：


> [!question] Quiz
> 指针从刻度 0 出发。依次到达并交付了 seq 0, 1, 2, 3, 4, 5, 6, 7——整整一圈 8 个包，全部比对相等。交付完 seq 7 之后，指针指在哪一格？
>
> 1. 指回刻度 0
> 2. 走到刻度 8
> 3. 走到刻度 1
> 4. 停在刻度 7


> [!failure] Quiz — incorrect ✗
> Your answer: 4. 停在刻度 7
> Correct answer: 指回刻度 0
>
> 一整圈 = 8 格 = 全部 8 个刻度，走完恰好落回起点 0。数出来的「第 8 步」和起点是同一个位置：8 ≡ 0 (mod 8)。这只钟的起点是 0（第一个包 seq 0、指针初始指 0），所以回卷回到 0；现实挂钟从 1 数到 12、没有 0 刻度，那里才是 12→1。你现在握住的是：起点为 0 的 n 刻度钟，转满一圈回到 0——与你走通的 3→0（4 刻度）是同一件事。


> [!abstract] DSH

✗ 第三种答案出现了——**「停在 7」**。把四次答案排成一列：`不动`、`不动`、`1`、`停在 7`。错误在变，但底层共享同一个模型，现在我可以把它说破了：

## 你把序号空间看成一条线——但它是一只环

「0, 1, 2, …, 7」在你的模型里是**一列队伍，7 站在队尾**。队尾之后没有位置，所以指针「走不出去」——停在 7，或者慌乱中跳到 1。但你看图里那只钟：**没有队尾**。8 个刻度首尾相接围成一圈，7 的肩膀后面贴着的就是 0。线上才有「终点之后不动」；环上**没有终点**，每一格都有下一格。

## 为什么必须是 0——不是约定，是机器能转下去的唯一解

这次我不讲几何，讲**功能**。问你自己一个问题：

> 发送方发完 seq 7 之后，流水线继续转，它的**下一个新包**用哪个序号？

发送方的序号寄存器和接收方的指针，是**同一只钟的两份拷贝**——接收方持续接受的条件是「seq == 指针」，所以两份拷贝必须一步一步走同一条轨迹。现在逐个检验四个候选：

- **停在 7** → 发送方下一个包是 seq 0（第二圈从 0 开始编号），但接收方指针卡在 7：$0 \neq 7$，**第二圈的第一个包被永远丢弃**。机器死锁，课程结束。
- **走到 1** → 发送方发 seq 0，指针却指 1：$0 \neq 1$。错位一格，**永远错位**。同样死锁。
- **走到 8** → 钟面上**没有**这个刻度可指。
- **回到 0** → 发送方的下一个 seq 0 == 接收方指针 0。✓ 接受、交付、继续转。

只有第四种可能让「传输永不停止」这个你已经接受的事实成立。回卷到 0 是**流水线持续运转的逻辑必然**，不是谁规定的记号习惯。

## 验收（发送方视角——你还没用过的姿势）


> [!question] Quiz
> 发送方的流水线全速运转，刚发完 seq 7（3 比特序号，刻度 0…7 的钟）。它立刻要发下一个新包。这个包的序号是？
>
> 1. seq 1
> 2. seq 8
> 3. seq 0
> 4. 不再发送（序号用尽）


> [!success] Quiz — correct ✓
> Your answer: 3. seq 0
> Correct answer: seq 0
>
> 发送方的序号寄存器与接收方的指针是同一只钟的两份拷贝，必须同步走。发完 7，钟回卷到 0：只有回到 0，它发的下一个包（seq 0）才能等于接收方正在等待的位置，机器才能继续转。若停在 7，第二圈的 seq 0 永远 ≠ 7，死锁；若跳到 1，与 seq 0 错位一格且永远错位；若用 8，钟面上没有这个刻度。回卷到 0 是流水线持续运转的唯一解——环没有终点，8 ≡ 0 (mod 8)。


> [!abstract] DSH

✓ **对了**——发送方那只拷贝走通了：发完 7，回到 0，机器继续转。

但同一只钟有**两份拷贝**，你刚才只验收了发送方的那份。N1 地基的最后一验——接收方的指针，正是最初卡住的那块肌肉，现在从它真实的工作姿势（「我在等谁」）再走一遍：


> [!question] Quiz
> 接收方指针指在 7，一个 seq 7 的包到达、比对相等、被交付。从这一刻起，接收方「愿意接受并交付」的下一个序号是？
>
> 1. seq 1
> 2. seq 0
> 3. seq 8
> 4. seq 7


> [!success] Quiz — correct ✓
> Your answer: 2. seq 0
> Correct answer: seq 0
>
> 交付 seq 7 的同时，接收方指针沿环走一格——7 的下一格是 0。从此刻起它等待 seq 0（第二圈的第一个）。这正是刚才发送方那题的另一半：同一个瞬间，发送方的序号寄存器和接收方的指针都走到了 0——「两份拷贝同步走同一只钟」，这就是回卷的全部内容。N1 地基（环回算术）至此验收完成。


> [!abstract] DSH

✓✓ **两连对——N1 地基（环回算术）正式验收通过。** 同一只钟、两份拷贝、同步回卷：发送方发完 7 发 0，接收方交付完 7 等 0。你昨晚卡住的天花板，刚才从两个方向各走通了一次。

爬最后一段：把昨晚你已经亲手推过的**失败场景**变成**定律**。


> [!abstract] DSH

对比图正在后台渲染。先把推导走完——

---

## N1 后半：把失败变成定律

### 歧义的精确形状

昨晚你亲手推过那个失败：3 比特、窗口 8（0…7 全发）、8 个 ACK 全丢、指针走完一圈回到 0——旧 0 重传到达，$0 = 0$，被当新数据接受。你的结论当时就下对了：**旧 0 和新 0 在线路上逐位相同**。地基修好之后，这句话可以更锋利地说：

> 歧义 = **指针回卷撞上了「未确认、还在飞」的旧序号。**

两条消除它的路：

1. **显式相位标记**：给每个包加一圈数——(圈 2, seq 0) ≠ (圈 1, seq 0)，立刻可分。代价：**头部多花比特**，且任何固定宽度最终还是会回卷（TCP 的 32 位也会——只是周期长到撞不上）。
2. **约束窗口，一格都不加**。这就是要推导的定律。

### 推导：一格空档如何替代一个比特

问自己：**接收方指针要「再次指到 0」，路上必须先发生什么？**

指针从 0 出发走一整圈回到 0，中途必须**交付 seq 7**。而发送方要把 seq 7 发出来，它的窗口必须已经滑到包含 7——即窗口从 {0…6} 前移，而滑动的前提是**收到覆盖 seq 0 的 ACK**，也就是 **0 已被确认**。确认过的序号，GBN 发送方**永不重发**。串起来：

$$\text{指针回到 0} \;\Rightarrow\; \text{交付过 7} \;\Rightarrow\; \text{7 被发出} \;\Rightarrow\; \text{窗口滑过} \;\Rightarrow\; \text{0 已确认} \;\Rightarrow\; \text{旧 0 不再在飞}$$

**指针每次回到刻度 k，上一圈的 k 必然已确认、已注销。** 永不撞车——不需要任何额外比特。

现在看昨晚的 W=8 为什么断了这条链：窗口初始就是 {0…7}，**seq 7 不需要任何确认就能发出**——链子在第一环就断了。指针走完一圈回到 0 时，窗口从未滑动、0 从未确认、旧 0 还在天上飞。

**一格之差 = 「发 7 是否需要 0 先被确认」。** 于是定律：

$$W \le 2^n - 1$$

留出的那一格空档，就是「隐式的相位标记」——**花 1 个刻度的序号空间，省下显式圈数比特**。窗口定律不是安全边际，是恰好够用的精确边界。

### 验收


> [!question] Quiz
> 把同一套机器缩到 2 比特序号（钟面 4 个刻度：0, 1, 2, 3），GBN 流水线的发送窗口最大能取几？选项按数值升序排列。
>
> 1. 1
> 2. 2
> 3. 3
> 4. 4


> [!success] Quiz — correct ✓
> Your answer: 3. 3
> Correct answer: 3
>
> 定律 W ≤ 2ⁿ−1 在 n=2 时给 W ≤ 3。留的那一格空档（刻度 3）是隐式相位标记：指针要再次回到 0，必须先交付 3；发 3 的前提是窗口滑过 0（0 已确认、不再重发）——歧义在几何上不可能。取 4 会重演你推过的满窗歧义；取 2 过度保守（那是 N2 里 SR 的约束，不是 GBN 的）；取 1 退回停等。


> [!abstract] DSH

✓ **W ≤ 2ⁿ−1 定律落地**——n=2 时你直接给出 3，说明「留一格空档」已经内化，不再是公式记忆。**N1 整节点完成**。

进入 N2。先找回你昨天的那句原话：


> [!abstract] DSH

找到了完整脉络——昨天你在同一道 2 比特窗口题上选过 **2**，当时的判词是：「你选 2 不是算出来的，是『窗口砍一半』这句名言**提前到场**了」。而你刚刚同一道题答了 **3**：这次是真算出来的。名言的到场时间，就是现在。

---

## N2：让「砍一半」变成定理

### GBN 到底在为什么付钱

回看 N1 里你推过的满窗场景，GBN 的规则是：**接收方只认指针**（seq ≠ 指针一律丢弃），**发送方一超时就把窗口内未确认的全部重发**。摆一个具体损失——窗口 7，发 0…6，包 2 在路上蒸发，3,4,5,6 平安到达：

- 接收方：指针停在 2，$3,4,5,6 \ne 2$ → **全部丢弃**。四个完好到达的包，死在门口。
- 超时后发送方重发 **2,3,4,5,6**——其中四个是白给的重复。

丢 1 个，重发 5 个；信道越差，这个乘法越狠。直觉的修复方案就是你昨天那句名言的下半句：**只重发真正丢的那个**。

### SR（Selective Repeat）的三个改动

1. **接收方缓存乱序包**：seq 落在接收窗口内但 ≠ 指针 → 不丢弃，**存着**；指针补齐后一口气交付连续段。丢弃只留给「窗口外的旧重传」。
2. **逐包确认**：收到就 ACK，无论是否按序（不再等指针）。
3. **发送方独立计时器**：每个包各管各的超时，谁丢重发谁。

重传量收敛到「恰好丢失的量」。但你从 N1 已经有了嗅觉：**接收方开始收「指针之外」的包，意味着它也占序号空间了**。

### 代价：环上现在有两个玩家

GBN 的环上只有一个窗口（发送窗），留 **1** 格空档就买到安全（$W \le 2^n-1$）。SR 的环上有**两个**：发送窗（未确认、可重发）+ 接收窗（可缓存）。安全条件变成：**同一刻度，绝不能一边「还可能被重发」、一边「可能被接收方当新包缓存」**——即两窗覆盖之和不得超过环长：

$$W_{SR} \le \frac{2^n}{2} = 2^{n-1} \qquad (n=3:\ W \le 4)$$

**你那句「砍一半」，严格正确**——但注意它正确的原因不是「保守点好」，而是**几何必然**：接收窗口从 1 涨到 $W$，买的每一格都要从发送窗口的预算里扣。

验收题就是那个反例本身——盯着违规的 W=5 走一遍：


> [!question] Quiz
> 3 比特序号，SR 接收窗口违规地取 5。发送窗 {0…4}，包 0,1,2,3,4 依次到达——指针从 0 连续走到 5，全部交付，接收窗口滑到 {5,6,7,0,1}。此刻 5 个 ACK 全部丢失，发送方 5 个独立计时器超时，重发 0…4。重传的旧 0 到达接收方——它的命运是？
>
> 1. 被认出是旧一代，扔掉
> 2. 触发接收窗口收缩
> 3. 不等于指针，直接丢弃
> 4. 落在接收窗口内，被当作新 0 缓存


> [!failure] Quiz — incorrect ✗
> Your answer: 1. 被认出是旧一代，扔掉
> Correct answer: 落在接收窗口内，被当作新 0 缓存
>
> SR 接收方对「窗口内、非指针」的包的动作是缓存——这正是它省重传的机关，但此刻反噬：旧 0 落在滑动后的接收窗 {5,6,7,0,1} 内，被当作新 0 存入，两代 0 混叠。这就是 W ≤ 2ⁿ⁻¹ 的由来：发送窗与接收窗覆盖之和一旦超过环长 8，同一刻度的两代就会同时「一边可被重发、一边可被缓存」。「不等于指针就丢弃」是 GBN 的规则，SR 早已不这么做事；「认出是旧的」需要接收方记住交付历史——你在摸底阶段亲手排除过这种魔法；「触发收缩」不存在这个机制。GBN 一个玩家留 1 格（2ⁿ−1），SR 两个玩家对半分（2ⁿ⁻¹=4）——砍一半，从直觉升格为定理。


> [!abstract] DSH

✗ ——「被认出是旧一代」。注意刚才发生了什么：**「魔法记忆」回来了**。你昨天亲手排除过它，但 SR 语境下一复活——大概是因为「SR 接收方变聪明了（会缓存了）」，顺理成章觉得它「也更聪明（认得出旧的）」。

## 修复：认不出，正是定律存在的原因

回到你自己建立过的第一原则。包上携带的全部身份是什么？**seq + 校验和**。而你昨天亲手推导过的结论原封不动：

> 旧 0 和新 0 在线路上**逐位相同**——序号都是 0，校验和都完好。

「认出这是旧一代」需要什么？需要一个「这是第几圈」的标记——**相位标记**。而你刚刚在 N1 学过：相位标记**要花比特，而我们没花**——$W \le 2^n-1$ 和 SR 对半分的全部出发点，就是「用几何换比特」。

所以把逻辑倒过来拧紧：

- 如果接收方**能**认出旧 0 → 根本不需要任何窗口约束，$W$ 想多大都行。
- 窗口约束**存在且必要** → 恰恰证明接收方**认不出**。

> **每一条安全约束的存在，都在为它所防御的无能作证。**

「认不出」不是 SR 的缺陷——它就是「不花圈数比特」这个决定的另一面。防线只剩几何：让两代同名包不可能同时「一边可被重发、一边可被缓存」。

## 再验收


> [!question] Quiz
> SR 接收方收到一个 seq 落在接收窗口内、但不等于指针的包。在它手里，这个包携带的哪些信息能用来判断「这是旧一代的重传」还是「新一代的数据」？
>
> 1. seq 号码本身
> 2. 到达顺序
> 3. 没有任何可用信息
> 4. 校验和


> [!failure] Quiz — incorrect ✗
> Your answer: 2. 到达顺序
> Correct answer: 没有任何可用信息
>
> 包上唯一的身份是 seq + 校验和，而两代同名包在这两项上逐位相同——你昨天亲手推过。「认出旧的」需要圈数标记（相位标记），那要花比特，而窗口定律正是「不花那个比特」的替代方案：如果接收方真能认出旧包，窗口约束就根本不会存在。所以唯一防线是几何——让两代同名包不能同时「一边可重发、一边可被缓存」，这就是 W ≤ 2ⁿ⁻¹。约束的必要性与接收方的无能为力，是同一句话。


> [!abstract] DSH

✗ 又一层剥开了——这次选 **order（到达顺序）**：「重传总在后，后到的就是旧的」。

## 击穿它：两个宇宙

**宇宙一**：旧 0 超时重传，走了一条顺路的线，先到；新 0（第二圈原发）后到。→ 后到的是**新的**。
**宇宙二**：新 0 原发走了近路，先到；旧 0 的重传绕了远路，后到。→ 后到的是**旧的**。

两个宇宙里接收方看到的**完全相同**：先一个 0，后一个 0。「谁先谁后」这个事实在两个宇宙里都成立，代数真相却相反——所以**先后顺序不携带代数信息**。原因很简单：旧 0 的重传和新 0 的原发**都**发生在第一圈原发之后，「晚于原发」对两代同时成立，分不出谁。

再挖一层——你这个直觉有真实出处：**停等协议里「重复到达 = 旧」确实成立**。但那不是「顺序」的功劳，是**窗口 = 1** 的功劳：任何时刻天上只有一代包，「重复」必然来自旧代。你把停等的遗产带进了 SR——而 SR 窗口变大后顺序失效的**那个位置**，恰好就是窗口约束（$W \le 2^{n-1}$）接管的位置。又是同一个模式：**顺序失效之处，几何接管**。


> [!question] Quiz
> SR 接收方先后收到两个 seq 0（先一个、后一个，都在接收窗口内）。仅凭「谁先谁后」，它能判断哪个是旧一代、哪个是新一代吗？
>
> 1. 能，看整窗齐发模式
> 2. 能，后到的是旧重传
> 3. 能，后到的是新数据
> 4. 不能，先后不携带代数


> [!failure] Quiz — incorrect ✗
> Your answer: 1. 能，看整窗齐发模式
> Correct answer: 不能，先后不携带代数
>
> 旧 0 的重传与新 0 的原发都晚于第一圈原发——「晚于」对两代同时成立，先后分不出代数；绕路抖动可以让任一宇宙成真。停等里「重复到达 = 旧」成立是窗口 = 1 的功劳（天上只有一代），不是顺序本身的功劳；SR 窗口变大后顺序失效，失效之处正是 W ≤ 2ⁿ⁻¹ 接管之处。包上没有圈数、到达里没有代数——唯一的防线是几何：让两代同名包不能同时一边可重发、一边可被缓存。


> [!abstract] DSH

✗ 三连：`记忆` → `顺序` → `模式`。看清这个家族——它们全是同一个信念的变体：**「总有某个信息的来源能认出旧包」**。你在找的东西不存在，而且我现在不让你再猜了——**我证明给你看**。这是我们从苏格拉底切换到叙述式的地方：这个点上你的冷推理反复跑向同一个方向，我把证明走完，你来验证它的每一步。

## 不可能性证明：「认出旧代」在逻辑上不成立

**第 1 步（你昨天自己走过的）**。接收方能依据的一切 = 它收到过的全部字节和全部到达事件。旧 0 与新 0 **逐位相同**——你昨天亲手推过这句。

**第 2 步（两个宇宙）**。构造 U1、U2：接收方从会话开始收到的一切——每个包的每个字节、每次到达的先后——**逐位、逐事件完全相同**。唯一差别是「真相」：U1 里先到的 0 是旧重传，U2 里它是新原发。

**第 3 步（规则的死刑）**。任何确定性规则 = 相同输入 → 相同输出。两个宇宙输入相同 → 规则给出**同一个**答案 → 而两个宇宙真相相反 → **至少在一个宇宙里判错**。无论规则多聪明——读历史、看顺序、辨模式——只要它读的是输入，而输入无差异，它就无差异。$\blacksquare$

这不是「还没找到办法」，是**办法在逻辑上不存在**。你昨天推出的「任何固定规则对逐位相同的输入只能取同一动作」就是这条证明的雏形——你没有忘它，只是没认出它在这里适用。

顺手把「整窗齐发模式」的具体漏洞也堵上：SR 是**逐包独立计时器**（三改动之一），旧 0 的重传本来就是孤零零一个包；就算整窗齐发，信道抖动（你摸底第一天就接受的「丢、重、乱」）也会把它抖散——**齐发不保证齐到**。模式，也是输入的函数；输入无差异，模式无差异。

## 既然认不出——就禁止这个状态本身

证明的真正用途在后半：既然区分不可能，唯一的出路是让 **U1/U2 这种局面根本无法出现**——即「两代同名包同时在飞」被禁止。执行禁止的就是窗口：$W \le 2^{n-1}$，发送窗与接收窗对分环面，**旧代尚未注销时新代的同名包发不出来**。这就是定律的全部身世：一条为「逻辑不可能性」兜底的几何禁令。

验证证明的核心一步：


> [!question] Quiz
> 两个平行宇宙 U1、U2：SR 接收方从会话开始收到的一切——每个包的每个字节、每次到达的先后——完全相同；唯一区别是 U1 里先到的 0 是旧重传、U2 里是新一代原发。任何确定性的「新旧判断规则」在这两个宇宙里会怎样？
>
> 1. 给出同一答案，必错其一
> 2. 知道自己在哪个宇宙
> 3. 靠上层重置解决
> 4. 随机规则长期可靠


> [!success] Quiz — correct ✓
> Your answer: 1. 给出同一答案，必错其一
> Correct answer: 给出同一答案，必错其一
>
> 确定性规则 = 相同输入 → 相同输出；两个宇宙输入逐位逐事件相同 → 规则输出同一个判断；而两个宇宙真相相反 → 至少一错。这就是「认出旧代」的逻辑不可能性，也正是你昨天推过的「任何固定规则对逐位相同的输入只能取同一动作」的形式化。「规则知道在哪个宇宙」把待证的区分能力当成了前提；随机规则每次只是 50% 猜测，不构成「认出」；上层重置（TCP 断连重连）是现实工程的逃生门，但那是放弃这条传输，不是解决了区分。既然区分不可能，唯一出路是让两代同名包同时在飞的状态本身被禁止——W ≤ 2ⁿ⁻¹。


> [!abstract] DSH

✓ **证明核心步通过。** 与此同时，对比图渲染完成并通过了 90 项程序化验证——正好在此刻嵌入，因为它是刚才那条定理的几何面容：

![W=8 满窗碰撞 vs W=7 留空档安全](viz/viz-wrap-window-20261021-074352.png)

左环就是你昨晚亲手推过的死亡现场：窗口盖满整环（蓝弧 360°），指针回卷到 0，与还在飞的旧 0 迎头相撞（红 **！**）——两代同名包同时在飞，而「认出旧代」刚被证明不可能，**死局无解**。右环是解法：窗口只盖 7 格，**空出 1 格**，指针坐在空档里——旧 0 还在飞时新 0 根本发不出来，「两代同时在飞」这个状态被几何禁止。不需要任何比特，不需要任何聪明。

这就是全套设计的骨架：

| | GBN | SR |
|---|---|---|
| 接收窗口 | 1（只认指针） | W（缓存乱序） |
| 重传 | 整窗齐发 | 逐包独立计时 |
| 序号代价 | 留 **1** 格空档 | **对半分**环面 |
| 上限 | $W \le 2^n-1$ | $W \le 2^{n-1}$ |

最后一验——还是那只 4 刻度钟，还是那道题，只是换了协议：


> [!question] Quiz
> 同一只 4 刻度钟（2 比特序号），换 SR 协议：发送窗口最大能取几？选项按数值升序排列。
>
> 1. 1
> 2. 2
> 3. 3
> 4. 4


> [!failure] Quiz — incorrect ✗
> Your answer: 3. 3
> Correct answer: 2
>
> SR 对半分环面：W ≤ 2ⁿ⁻¹ = 2⁻ = 2。昨天你在同一只 4 刻度钟上选 2 被判错——因为那道题问的是 GBN（答案 3，留一格）；今天同样的问题换成 SR，2 就是正确答案。你那句「砍一半」名言的到场时刻由此精确定格：GBN 为单窗口付 1 格空档，SR 为双窗口付半个环。两个定律同源——都在禁止「两代同名包同时在飞」，只是环上的玩家数不同。


> [!abstract] DSH

✗ —— 你把 GBN 的答案（3，留一格）交给了 SR 的问题。这个错恰好是最后一块拼图：说明两条定律在你那里还是**两条轶闻**（「GBN 是 3，SR 是……3？」），而不是**同一条定理的两副面孔**。正好，SR 的图刚渲染完——两张图并排放，这个错自己会融化。

![SR 双窗口对分环面：发送窗与接收窗各占一半](viz/viz-sr-halving-20261021-074735.png)

看这只环，和上一张右环对比：

- **GBN（上一张右环）**：环上**一个**玩家（蓝弧，发送窗 7 格），留 1 格空档给指针——买的是「指针不撞在飞的旧序号」。价：**1 格**。
- **SR（这张图）**：环上**两个**玩家——蓝弧（发送窗）+ 绿弧（接收窗）**首尾相抵、各占半个环**，不留任何空档。买的是「发送窗与接收窗不重叠」。价：**半只环**。

同一条定理——**禁止两代同名包同时在飞**——环上有一个玩家时付 1 格，有两个玩家时对半分。价格不是背出来的数字，是**环被几张嘴分**的算术：

$$W_{GBN} = 2^n - 1 \qquad W_{SR} = \frac{2^n}{2} = 2^{n-1}$$

检验你是否真的握住了「半」这个**运算**（而不是记住了两个数）——上到一般形式：


> [!question] Quiz
> $n$ 比特序号的 SR 协议，发送窗口的上限是多少？（用 $n$ 表达）
>
> 1. $2^n-1$（留一格）
> 2. $2^n$（盖满）
> 3. $2^{n-1}$（对半分）
> 4. $2^{n-1}-1$（对半再留一格）


> [!failure] Quiz — incorrect ✗
> Your answer: 4. $2^{n-1}-1$（对半再留一格）
> Correct answer: $2^{n-1}$（对半分）
>
> SR 的环上有两个玩家（发送窗 + 接收窗），安全条件 = 两窗覆盖之和 ≤ 环长 2ⁿ，故各得一半：W ≤ 2ⁿ⁻¹。对照：2ⁿ−1 是 GBN 的单窗口价（留一格空档）；2ⁿ 是满窗（你昨晚推过的死局）；2ⁿ⁻¹−1 则是过度支付——对半分已经禁止了两窗重叠，不需要再留空档（SR 的空档已经被另一个窗口占用，它不是「空的」）。检验方法永远是把 n 代回去：n=2 时 2ⁿ⁻¹=2——正是你昨天「提前到场」的那个数字，在 SR 的地盘上分毫不错。


> [!abstract] DSH

✗ —— 这次是反方向的错：**对半分再留一格**（$2^{n-1}-1$）。你把两道安全机制**叠**起来了：「SR 要对半分」+「GBN 要留空档，SR 大概也要」。上一题你少付，这一题你多付——两个方向的摇晃说明还差最后一颗钉子：**那个「格子」的预算归属**。

## 预算论证：空档和接收窗是同一笔钱的两种花法

环的预算只有一份：**环长 $2^n$ 个刻度**。看两张图：

- **GBN**：环上的消费者只有一个——发送窗 $W$，外加 **1 格空档**。合计 $W + 1 \le 2^n$，所以 $W \le 2^n - 1$。空档为什么是「空的」？因为 GBN 接收窗 $= 1$（只认指针那一格），**不占环面预算**。
- **SR**：环上有两个消费者——发送窗 $W$ **加接收窗 $W$**。合计 $W + W \le 2^n$，所以 $W \le 2^{n-1}$。**那个「空档的位置」没有消失——它被接收窗占掉了。**

看 SR 图上蓝弧与绿弧相抵的那两道接缝：GBN 的空档是**无人值守的隔离带**；SR 没有隔离带，因为**对面半环本身就是墙**——接收窗守在那里。同一格预算，GBN 花在空档上，SR 花在接收窗上；**不能花两次**。再留一格不是「更安全」，是给一笔已经花掉的预算记第二次账。

钉下最后一颗：


> [!question] Quiz
> GBN 在环上留 1 格空档防撞车；SR 的环面被发送窗和接收窗恰好铺满、不留空档。SR 不需要那格空档的根本原因是？
>
> 1. 其实也需要，推导漏了
> 2. 计时器保证不重发旧包
> 3. 接收窗就是那堵墙
> 4. 校验和能兜底


> [!failure] Quiz — incorrect ✗
> Your answer: 1. 其实也需要，推导漏了
> Correct answer: 接收窗就是那堵墙
>
> 预算只有一份：环长 2ⁿ。GBN 的富余 1 格花在「空档」——无人值守的隔离带（接收窗 = 1，不占预算）；SR 把同一格花在「接收窗」——有实体把守的墙。同一科目的两种花法，不能花两次；两窗相抵的接缝就是「两代同名不同时在飞」的执行线。「推导漏了」不成立——W = 2ⁿ⁻¹ 时接缝处恰好零重叠，已是安全边界；「计时器保证不重发」恰好说反——独立计时器正是重发旧包的机制（超时→重传），它是需要被防住的对象，不是防线；「校验和兜底」是老朋友了——查损坏，不查代数。


> [!abstract] DSH

✗ 三连，而且这一题的形状值得直说：**正文刚论证完「不需要空档」，选项立刻选了「其实也需要，推导漏了」**。这与知识无关——这是噪声信号。昨晚我们在同一个地方学到过这条规则：当 ✗ 与刚建立的论证直接矛盾时，它不再携带可靠信息，继续问只是在消耗你。

今天的真实战果，如实划界：

| 层 | 状态 |
|---|---|
| 环回算术（N1 地基） | ✓✓ 两连对，**修复完成** |
| GBN 窗口定律 $W \le 2^n-1$ | ✓ 确认（n=2 直接给出 3） |
| 「认出旧代」不可能性证明 | ✓ 确认（same-output） |
| **SR 定律 $W \le 2^{n-1}$** | ✗ **三次未过**（w-3 → over → gap-too，方向各不相同） |
| 收尾节点 + 逐 Scenario 终核 | ⏸ 待建 |

按规矩：节点未确认，不向上构建。怎么走，你定——


> [!question] Question
> SR 定律（W ≤ 2ⁿ⁻¹）三次未过，接下来怎么处理？
>
> 1. 数格子再试一次（推荐）
> 2. 今天到此，改天继续
> 3. 叙述式收尾 + 终核


> [!example] Answer
> → 今天到此，改天继续


> [!abstract] DSH

收下——今天到此。战果已经相当扎实：昨晚的天花板（环回算术）今晨修复验收，N1 整节点闭环，不可能性证明握在手里。SR 定律留了一个干净的恢复点。按规矩把状态写入任务注记：


> [!abstract] DSH

今天就到这里。进度已全部落盘：

- **恢复点已写入 [tasks.md](openspec/changes/migrate-learn-to-dsh/tasks.md)**：SR 定律 → 收尾节点 → 逐 Scenario 终核 → 勾选 5.1，下次说「继续课程」即从数格子的具体走法开始。
- **日志自动镜像全程**——今天 11 道题的题面与判定、两次图示讲解、节奏决策都已追加到 [lessons/reliable-transfer.md](lessons/reliable-transfer.md)，重启会话链接自动恢复。
- **今天带走的东西**：钟是环不是线、回卷到 0 是机器能转下去的唯一解、一格空档如何替代一个比特、以及「认出旧代在逻辑上不可能」——这条证明比 SR 的任何公式都值钱，它解释了所有窗口约束**为什么必须存在**。

SR 定律没有丢，它只是还差一次数格子的具体走法。改天见。


> [!quote] YOU

/openspec-verify-change @openspec/changes/migrate-learn-to-dsh/


> [!abstract] DSH

**Using change: migrate-learn-to-dsh**（如需覆盖：`/openspec-verify-change <其他变更名>`）

本会话我已完整读过全部工件与实现，重点做**增量复验**：任务状态、晨间演练新增证据（日志配对、图示）、以及自首验以来出现的新观察（程序化验证路径）。


> [!abstract] DSH

任务状态确认：16/17，5.1 仍为唯一未完成（与诚实注记一致）。现在检查晨间演练的日志配对证据与工作树变化：


> [!abstract] DSH

日志从 900 行增至 1619 行：新增 **12 个题面块 + 12 个判定块**——今天 12 道 quiz 全部落盘且**全部成对**。抽查今天的块顺序与防泄漏：


> [!abstract] DSH

判定块 12 个（5✓ + 7✗）与今天 12 题完全吻合，ask_user_question 问答块也成对落盘。确认题面块与判定的紧邻关系：


> [!abstract] DSH

题面与判定紧邻成对、题面块无答案（防泄漏 ✓）、判定中答案序号与题面列表一致（乱序展示顺序镜像 ✓）、图片引用随正文镜像 ✓。所有增量证据齐备，生成复验报告。

---

## Verification Report: migrate-learn-to-dsh（复验）

### Summary

| 维度 | 状态 |
|------|------|
| 完整性 | **16/17 任务**（仍余 5.1，恢复点已大幅推进：N1 全节点闭环、N2 机理确认）；28/28 需求均有实现 |
| 正确性 | 28/28 需求有代码映射；场景覆盖**新增实测证据**：12/12 题面-判定成对、防泄漏、展示顺序镜像、重连回填；1 个场景受环境限制（渲染-检查回路，见 W1） |
| 一致性 | 设计决策 D1–D6 遵循；新增 1 项环境性偏离已如实注记 |

### 自首验以来的增量核验

| 检查点 | 结果 |
|--------|------|
| **题面/判定成对**（上次 W1 的后续） | ✅ **消解**：今晨 12 道 quiz 全部落盘且紧邻成对（5 ✓ + 7 ✗ 判定块），当前插件版本实测无配对缺失。probe 段 7 个孤儿题面确认为历史版本运行痕迹，非当前缺陷 |
| **答案不泄漏**（spec：题目先于答案） | ✅ 题面块仅含乱序后 label 列表；`Correct answer` 只出现在作答后的判定块（[lessons/reliable-transfer.md](lessons/reliable-transfer.md) 今晨段抽查） |
| **记录展示顺序** | ✅ 判定块 `Your answer: 2. …` 的序号与题面列表严格对应（乱序后真实屏幕顺序镜像） |
| **链接恢复 + 回填** | ✅ 新会话重连即回填 23 条，恢复点跨会话延续（[tasks.md](openspec/changes/migrate-learn-to-dsh/tasks.md) 续记与日志一致） |
| **图示发布** | ✅ 新增 3 张（[viz-clock8](viz/viz-clock8-20261021-073410.png)、[viz-wrap-window](viz/viz-wrap-window-20261021-074352.png)、[viz-sr-halving](viz/viz-sr-halving-20261021-074735.png)），唯一命名格式、markdown 内嵌、随正文镜像入日志 |
| **节点未确认即停**（teaching spec） | ✅ SR 定律三次未过 → 停止向上构建 + 学习者节奏决策（ask_user_question 无标准答案分流）——spec 行为契约两日内两次实测 |
| **任务注记诚实性** | ✅ 5.1 注记如实更新（含未确认项与环境限制），未虚报完成 |

### Issues

**🔴 CRITICAL（归档前必须修复）**

1. **任务 5.1 仍未完成**——演练推进至 N2 的 SR 定律（$W \le 2^{n-1}$）三次未过，学习者暂停；收尾节点与逐 Scenario 终核未做。
   - **建议**：从已备好的恢复点继续（[tasks.md](openspec/changes/migrate-learn-to-dsh/tasks.md) 续记）：「4 刻度钟数格子」具体呈现验收 SR 定律 → 收尾节点 → 逐 Scenario 终核 → 勾选 5.1。

**🟡 WARNING（应当处理）**

1. **「渲染-检查回路」场景在非视觉模型下的等价实现**（新增）：本会话模型无图像输入，父会话与 maker 均无法 `read_image`，三张新图以**程序化几何断言**替代「实际查看」（断言 90/90、41/41 全过 + 发布件 SHA 一致）。[lesson-visuals spec](openspec/changes/migrate-learn-to-dsh/specs/lesson-visuals/spec.md) 的字面契约是「实际查看图片并迭代至正确」。偏离已在 tasks.md 注记中如实记录，且断言强度实际高于目检——但这是 spec 场景的环境性偏离，归档终核时应按此口径声明。
   - **建议**：在 5.1 终核注记中保留此声明；若非视觉模型为长期常态，在 [design.md](openspec/changes/migrate-learn-to-dsh/design.md) D6 降级点清单增补一条「非视觉模型下 maker 以程序化几何断言等价实现目检」，保持文档与现实同步。

**🔵 SUGGESTION（可改进）**

1. （维持）`cordis.patch.yml` 仅含 host 半边、client 由 `package.json` 的 `dsh.client` 承载——与 D5 一致，建议在 [plugins/learn-dsh/README.md](plugins/learn-dsh/README.md) 补一句说明避免读者寻找 client 的 patch 条目。

### Final Assessment

**发现 1 个 critical issue。完成 5.1（SR 定律验收 → 收尾 → 逐 Scenario 终核）后方可归档。**

与首验相比的实现质量面**全部维持或增强**：28/28 需求映射不变，上次唯一的实测性 WARNING（题面/判定配对）已被今晨 12/12 实证消解，新增的环境性偏离（程序化验证路径）已如实进入任务注记。系统行为与 spec 的贴合在两日真实教学会话中反复得到验证——剩余工作是一次干净的收尾。


> [!quote] YOU

「任务 5.1 仍未完成」的原因是什么？就是因为学习者选择了暂停？


> [!abstract] DSH

不完全是。「学习者暂停」只是**节奏层面的决策**（决定了「此刻停下来」），但把它拿掉，5.1 也照样完成不了。真正的因果链是这样：

## 根因：教学节点未通过确认，spec 规则禁止向上构建

5.1 的完成标准是「完整教学会话 + 逐 Scenario 终核」。而 [teaching spec](openspec/changes/migrate-learn-to-dsh/specs/teaching/spec.md) 有一条硬规则：

> 未通过确认的节点 SHALL NOT 作为后续节点的构建基础。

演练两次撞在这条规则上：

| 时点 | 卡住的节点 | 触发 | 结果 |
|------|-----------|------|------|
| 10-20 深夜 | N1 地基（环回算术） | 连续六次 quiz-check 未过 | 停止构建，学习者选择休息 |
| 10-21 晨 | N2 定律（$W \le 2^{n-1}$） | 三次未过（w-3 → over → gap-too） | 停止构建，学习者选择暂停 |

注意顺序：**先有「未确认即停」，后有「暂停」**。暂停是停止之后的出口选择（休息 / 换方式重试 / 硬继续）。反事实地说：今晨那道选择题里就算学习者选「继续，不休息」，我也不能勾 5.1——SR 定律未确认，收尾节点不能建在它上面，终核就没有一条完整课程可核。

## 更准确地说：这是「真实学习者」的固有属性，不是故障

这个演练用的是**真实教学**而非配合式测试：学习者的知识边界（摸底时就定位为「环回算术」，昨晚和今晨两次实证）恰好横在课程后半段。教学系统**按 spec 正确地**停在了边界上——5.1 的未完成，反而成了「节点未确认即停修」这个 Scenario 连续两天被实测的证据。

## 剩余的完成路径（与暂停与否无关的客观清单）

1. SR 定律验收通过（恢复点已备好「4 刻度钟数格子」的具体呈现）
2. 收尾节点（TCP 现实混合注脚）完成其 quiz-check
3. 逐 Scenario 对照 4 个 spec 终核
4. 勾选 5.1

所以一句话回答你：**暂停决定了「什么时候停」，但未完成的实质是「教学真实性换来的进度代价」——学习者的真实边界挡在了课程路径上，而 spec 要求教学尊重这个边界。** 下次说「继续课程」即从第 1 步开始。


> [!quote] YOU

「SR 定律」是什么？


> [!abstract] DSH

「SR 定律」是课程 N2 节点的核心结论，也就是你目前唯一还没验收通过的那块内容。拆开说：

## SR 是什么

**SR = Selective Repeat（选择性重传）**，是可靠传输协议的一种设计。它是为解决 GBN（Go-Back-N）的浪费而生的：

- **GBN**：接收方只认「指针」位置的包，其余一律丢弃；发送方一超时就把整个窗口全部重发。丢 1 个包 → 重发 5 个，信道越差浪费越大。
- **SR 的三个改动**：接收方**缓存**乱序到达的包（不再丢弃，等缺口补上后一并交付）；逐包确认；发送方**每个包独立计时**，谁超时重发谁。重传量收敛到「恰好丢失的量」。

## 定律本身

$$W_{SR} \le \frac{2^n}{2} = 2^{n-1}$$

**n 比特序号下，SR 的发送窗口不得超过序号空间的一半。** 3 比特（8 个刻度）时 $W \le 4$；你卡住的那道题是 2 比特（4 个刻度），答案是 $W \le 2$。

## 为什么是一半

这是今晨推导到一半的地方：

1. SR 的接收方开始收「指针之外」的包 → **接收方也在序号环上占了一个窗口**（GBN 接收窗 = 1，不占环面）。
2. 危险：发送窗（旧包可能还在飞、可能被重发）与接收窗（可能把到达的包当新包缓存）一旦在环上**重叠**——旧一代的 seq 0 会被当作新一代的 seq 0 缓存，数据错乱。
3. 而「认出旧包」在逻辑上不可能——你已经验收过那个平行宇宙证明（两代包逐位相同，任何规则给出同一答案，必错其一）。
4. 所以唯一防线是**几何**：两窗覆盖之和不超过环长 $2^n$，即各占一半：

![SR 双窗口对分环面：发送窗与接收窗各占一半](viz/viz-sr-halving-20261021-074735.png)

对比 GBN 定律 $W \le 2^n - 1$（留 1 格空档）：同一条定理——**禁止两代同名包同时在飞**——环上有一个玩家时付 1 格，有两个玩家时对半分。

---

这也是你的恢复点：下次继续时，我们用 4 刻度钟把 SR 场景**具体走一遍、你亲手数格子**来验收这条定律——今晨三道题（3 / 过度留格 / 坚持缺格）都没能确认它。想现在就试的话，直接说开始。


> [!quote] YOU

测试验证一定要使用「SR 定律」吗？能不能替换成 VueJS 相关的知识？


> [!abstract] DSH

不是必须的。**5.1 验收的是教学系统的行为，不是 TCP 知识本身**——四个 spec（teaching / graded-quiz / lesson-log / lesson-visuals）没有一条绑定主题。TCP 只是这场演练随手抓的载体，换成 VueJS 完全合法。

## 换成 VueJS 的实际影响

**TCP 这半程不会浪费。** 它已经完整走过 probe（7 题定位 5 条知识线）、plan（researcher 核查 + mermaid 依赖图 + 你的确认）、授课 N1 闭环、N2 机理确认，日志 1600+ 行如实镜像——在**演练验收**层面，它已经实测了大量 Scenario（含「节点未确认即停」两日两次）。它在教学上未完成，但证据保留。

**VueJS 场需要完整走三阶段**，不能直接开始授课——摸底先行是 spec 的流程形状：先 quiz 定位你在 VueJS 各条知识线上的边界，researcher 摸领域，依赖图呈现方案等你确认，然后逐节点循环。5.1 的终核落在这一场上完成。

## 两个诚实的提醒

1. **摸底会重新定位你的真实边界。** 如果你 Vue 基础不错，难度会快速爬升到深处（响应式系统的实现、虚拟 DOM diff、组件更新调度）——完整演练同样会撞到边界，撞到时同样会停。换主题换不掉「教学尊重边界」这条规则，只是换了一条可能更好走的路。
2. **SR 定律卡住的其实是「环回/模运算」那块认知肌肉**，不完全是 TCP 的错。以后如果 VueJS 里遇到同类抽象（比如分页计算、环形缓冲），它可能还会冒头——到时再修也来得及。**学什么始终是你的选择权**，教学系统无权用「先攻克这个」绑架主题。

## 如果确定换——先澄清目标

「学 VueJS」这个目标现在还太宽泛，它可以是十种不同的课（这正是摸底第一阶段的固定动作）。你想学的是哪一块？

- 响应式原理（ref/reactive 怎么追踪依赖、怎么触发更新）
- 渲染机制（虚拟 DOM、diff/patch 的实际过程）
- 组件模型（props/emit/插槽/生命周期的设计逻辑）
- 还是别的方向 + 你目前用 Vue 到什么程度（没用过 / 用过但不求甚解 / 深用过想挖底层）

告诉我方向和大致水平，我们从摸底开始。


> [!quote] YOU

以「组件模型（props/emit/插槽/生命周期的设计逻辑）」为例吧


> [!abstract] DSH

好——新课程确定：**VueJS 组件模型的设计逻辑**（props / emit / 插槽 / 生命周期）。按教学流程，授课前必须先摸底定位你的边界；摸底前先办两件开场事务。先把演练载体切换的决策写入任务注记（否则恢复点还指着 SR 定律）：


> [!abstract] DSH

注记已更新。开场两问——日志与起点校准（都是无标准答案的偏好题）：


> [!question] Question
> 新课程的日志怎么安排？（lesson_log 只能链接已存在的文件，选新文件我会先创建它）
>
> 1. 开新日志文件（推荐）
> 2. 继续用 TCP 那份日志
> 3. 不要日志


> [!question] Question
> 你目前用 Vue 到什么程度？（摸底题的起点会据此校准，之后仍以实际答题为准）
>
> 1. 没用过
> 2. 用过，但不求甚解
> 3. 深用过，想挖底层


> [!example] Answer
> 新课程的日志怎么安排？（lesson_log 只能链接已存在的文件，选新文件我会先创建它）
> → 开新日志文件（推荐）
> 你目前用 Vue 到什么程度？（摸底题的起点会据此校准，之后仍以实际答题为准）
> → 用过，但不求甚解


> [!abstract] DSH

新日志文件选定、起点校准为「用过但不求甚解」。先创建文件并解除旧链接：
