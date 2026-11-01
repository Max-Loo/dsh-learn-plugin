# Design

## Context

现状（`src/log.ts`）：`appendToFile` 每块全文件读+重写（前缀判断空文件用）；镜像水位 `link.lastSeq` 仅存内存，link record（`learn_dsh_lesson_log` v1 的 `links` 表）只存 `file`/`linkedAt`；`callMeta` 仅存内存，恢复后对 quiz/ask 的 `tool/result` 因查不到调用方而丢弃判定块；`linkSession` 只校验存在性与 `isFile`。约束：DSH `storageDomain` 提供 KV 表（`defineDomain`/`domainTable`，版本化 schema）；`sessionQuery.readSession` 可回读会话持久化事件；`userQuestions.ask` 可在工具执行内发起确认提问。

## Goals / Non-Goals

**Goals:**
- 镜像写入具备追加语义：不重写既有内容，崩溃不截断，O(1) 每块成本。
- 写入失败不静默丢块：水位只随成功推进，失败可补齐、可持续报告。
- 恢复以持久化水位为界：不重复镜像，且能补齐重启跨题的判定块。
- `lesson_log` 目标收敛到 `.md`；工作区外路径经用户确认。

**Non-Goals:**
- 不解决外部编辑器全文保存与追加的竞态（Obsidian 保存可能覆盖插件刚追加的行；文档提示即可）。
- 不做日志内容级去重/校验和（水位足够）。
- 不改变镜像范围、callout 格式与既有命令/工具接口形状。

## Decisions

**D1 真追加：`fsp.appendFile` + fstat 空文件判断。** 每块一次 `appendFile`；写前 `stat` 取 size，size 为 0 时省略 `\n\n` 前缀。替代：长持文件描述符自行 seek——与"链接可切换/文件可被用户删除"冲突，还需处理 fd 失效，否决。原全文件读改写方案的问题（非原子、O(n²)）即 A2 根因。`appendToFile` 不再内部吞错：失败向上抛，由调用方决定水位与重试。

**D2 失败可见：水位成功后推进 + 待写队列 + 会话级报告。** `withLock` 内追加抛错时：不推进 `link.lastSeq`，块留在每链接 `pending` 队列，退避重试；连续失败超过阈值（定 3 次）通过 `ctx.logger.error` 报告，并尽力向当前会话追加一条系统可见警告（`sessions` 服务可用时 `session.append`；不可用则仅日志——headless 场景兜底）。恢复成功后按序补写 `pending`。替代：失败即解链——过于激进，瞬时错误不值得丢链接，否决。

**D3 水位持久化：link record v2 增加 `lastSeq`，每块成功后 `table.put`。** 教学会话写入频率低（人机问答节奏），每块一次 KV put 的写放大可接受；换来崩溃后水位不回退。替代：定期/解链时批量持久化——崩溃丢水位即回到"重复镜像"风险，否决。

**D4 schema 迁移：`learn_dsh_lesson_log` domain version 1→2，v1 记录一次性迁移。** v1 无水位：迁移时对该会话执行一次 `sessionQuery.readSession`，取事件最大 seq 作为初始水位（宁可跳过上次运行末尾可能缺失的块，也不冒整段重复的风险；该缺口是 v1 固有，且按「重启跨题判定补齐」机制，重启后完成的判定仍会写入）。实现期需先核对 `dsh-storage-domain` 的版本迁移 API（自动迁移钩子或手动双开读旧写新），任务 1.1 专列。回滚：保留 v1 表不删除，插件版本回退后按 v1 语义继续（丢失新水位，行为等同升级前）。

**D5 恢复防重：以持久化 `lastSeq` 为唯一边界。** 恢复的 `linkFor` 读取 record 的 `lastSeq`；`session/event` 中 `seq <= lastSeq` 一律跳过——无论事件是新的还是平台重放的。这把"平台不重放历史事件"从隐式假设变为无关紧要。替代：内容指纹/题面去重——复杂度不成比例，否决。

**D6 判定补齐：`callMeta` 缺失时懒回查 `sessionQuery`。** `tool/result` 处理中查 `callMeta` 未命中且需判定块时，从 `readSession` 事件流中定位同 `callId` 的 `tool/call` 重建 `{name, args}` 并缓存。quiz 判定自带 `meta.displayedOptions`，仅 ask 需要原始 `questions`。回查带每会话一次的短缓存，避免每个结果全量读。替代：恢复时预载全部 tool/call——多数会话用不到，浪费，否决。

**D7 目标约束：扩展名校验 + 工作区外确认。** `linkSession` 校验 `path.extname(resolved).toLowerCase() === '.md'`，否则报错（含"仅接受 markdown 文件"）。`resolved` 不在 `session.header.cwd` 子树下且调用来自工具（代理）时，先经 `ctx.userQuestions.ask` 发起一次是/否确认，拒绝则返回未链接错误；`/lesson-log` 命令路径传入 `confirmedByUser: true` 跳过确认（用户亲手敲的命令即确认）。替代：一刀切禁止工作区外路径——挫败"笔记存放在项目外"的合法用法，否决。

## Risks / Trade-offs

- [appendFile 与外部编辑器保存竞态，用户编辑可能被编辑器全文回写覆盖] → README/DEVELOPMENT 提示"镜像期间避免在编辑器中保存全文回写"；不做代码级方案。
- [每块一次 `table.put` 的写放大] → 教学节奏低频，可接受；若未来成为问题再批量化。
- [v1 迁移取最大 seq 会固化 v1 末尾可能缺的块] → 缺口是现状固有问题，且选择"缺"优于"重复"；迁移是一次性事件。
- [确认提问在无 UI 会话（headless harness）不可用] → `ask` 失败时报错并提示改用命令路径；harness 增加对应断言。
- [`dsh-storage-domain` 迁移 API 形状未核实] → 任务 1.1 先行核对；若不支持版本内迁移，回退为"新表 + 启动时读旧表搬移，旧域保留不删除"（保留以支持回滚）。

## Migration Plan

1. 发布含 v2 domain 的插件版本；启动时打开 v2，检测 v1 数据则逐条迁移（D4）后保留 v1 表。
2. 回滚：装回旧版插件，旧版按 v1 表继续（无水位，行为同升级前）；v2 表成为孤儿数据，无副作用。
3. 存量行为变化：非 `.md` 目标与未确认的工作区外路径将被拒绝——工具描述同步更新，属预期收紧。

## Open Questions

（无——恢复初始水位、失败阈值等均已定，见 Decisions。）
