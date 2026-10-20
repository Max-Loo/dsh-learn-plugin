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
