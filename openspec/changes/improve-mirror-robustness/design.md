# Design

## Context

`src/log.ts` 现状：`linkSession` 顺序为 校验 → `readSession` 回填 → `table.put` → `links.set`，期间 live 事件经 `linkFor` 查不到链接而丢弃，`table.put` 与 `links.set` 之间还可能被恢复路径插入伪 "restored" 注记；恢复注记每次重启无条件写入；`unlinkSession` 直接 `table.delete`，重链同文件即全量重复回填；`links`/`knownUnlinked`/`askedQuiz`/`callMeta` 四集合只增不减。`src/quiz.ts` 现状：空选且无自定义答案落入 `effective=[]` → `incorrect`。依赖：本变更在 `harden-lesson-log` 之后实施——重链续传与注记标志复用其 link record v2 的 `lastSeq`，「链接恢复」delta 基于其归档后文本。

## Goals / Non-Goals

**Goals:**
- 链接建立全程（占位→回填→放行）实时事件零丢失、零伪注记。
- 重链同一文件从水位续传；恢复注记每链接至多一条。
- 进程内镜像状态集合有界，长驻宿主无累积增长。
- quiz 跳过归入未作答通道；防泄漏 spec 措辞与插件可控面一致。

**Non-Goals:**
- 不引入跨进程镜像协调（多宿主进程写同一文件仍不在范围）。
- 不为跳过新增 `status` 枚举值（复用 dontKnow 通道，避免破坏客户端与日志格式）。
- 不改变回填的镜像范围与 callout 格式。

## Decisions

**D1 链接三段式（占位 → 回填 → 放行 + staging）。** `linkSession` 重排：先在 `links` 放 `linking` 占位态（file 已定、lastSeq 未知），live handler 见占位态即把事件块暂存进该会话 staging 队列（不查 `linkFor`，恢复路径无从触发——伪注记竞态随之消失）；随后 `readSession` 快照回填并取快照最大 seq；最后写入完整态 `lastSeq`、`table.put`、按序 flush staging 中 `seq > lastSeq` 的事件。回填抛错维持现状语义（记录警告、链接照常生效），staging flush 不受影响。替代：先 `table.put` 再回填——窗口事件仍会落入恢复路径造成注记与水位错乱，否决。

**D2 重链续传：解链记录搬入独立 `unlinked` 表。** `unlinkSession` 不再 `delete`，而是把 `{file, lastSeq, unlinkedAt}` 移入同 domain 新 KV 表 `unlinked`（键 sessionId）；重链时若 `unlinked` 表有同会话且 `file` 相同的记录，跳过全量回填、`lastSeq` 沿用该水位，随后删除该 `unlinked` 记录；重链不同文件则走正常全量回填。选独立表而非软删除字段：`harden-lesson-log` 版本的代码不认识新表，降级时不会把已解链会话误当有效链接恢复，向后兼容零成本。

**D3 恢复注记一次：record 可选字段 `restoredNotedAt`。** 首次恢复写入注记后置位并 `table.put`；后续恢复跳过注记、镜像照常。可选字段对 v2 记录向后兼容（旧记录无此字段视为未注记）。替代：完全不写注记——丧失"日志有中断"的读者提示，且 spec「链接恢复」要求状态指示可见，保留一次写，否决。

**D4 状态集合有界化。** 统一策略：`callMeta`/`askedQuiz`/`knownUnlinked` 改带上限 FIFO（定 1024 条，超出淘汰最旧——镜像只需要近期调用上下文，跨会话旧 callId 无判定块需求）；`links` 优先监听平台会话结束/清理事件移除对应态（实现期核对 DSH session 生命周期事件面，任务 1.1），无可用事件则退化为 LRU（保留最近 64 个链接态，恢复时 `linkFor` 会从持久化表重建，LRU 淘汰不丢数据）。替代：定时全量扫描清理——引入时钟与惊群，无收益，否决。

**D5 quiz 跳过通道：复用 dontKnow，文本层区分。** `execute` 中 `selected` 为空且无 `custom` 时：`dontKnow = true`、`status = 'dontKnow'`，代理反馈文本写明 `skipped (no answer given)`；不新增枚举。客户端与 `log.ts` 的 dontKnow 分支自然呈现（无 ✗、揭示正确答案）；`log.ts` 判定标题在 `dontKnow && answers 为空` 时显示 `Quiz — skipped`。替代：新增 `status: 'skipped'`——客户端、日志、下游教学判断都要加分支，收益仅是枚举语义更细，否决（spec 层面已通过"同通道、区别于猜错"表达）。

**D6 防泄漏措辞对齐：纯 spec 修订，无实现变更。** 现有实现（`presentCall` 仅问题投影、client PendingCard 仅渲染 question、asked 事件无答案）已满足收敛后的 requirement；quiz-harness 补一条"待作答状态插件呈现不含原始参数"断言即闭环。

## Risks / Trade-offs

- [staging 队列在回填长时间阻塞时暂存无界] → 教学场景回填为本地读、毫秒级；仍设 staging 上限（256 事件，超出时丢弃最旧并在日志留 warning callout）。
- [`unlinked` 表残留（重链不同文件后旧记录仍在）] → 残留仅数十字节/会话且被 FIFO 上限约束，可接受。
- [quiz 空选复用 dontKnow 后，代理无法区分"选了 IDK"与"跳过"] → 反馈文本与日志标题已区分（IDK 显式、skipped 注明未作答）；如教学侧确需结构化区分，后续再升枚举，本变更不做。
- [会话结束事件若平台缺失，links LRU 淘汰导致热会话重建] → `linkFor` 从持久化表恢复的成本是单次 KV 读 + 一次注记判断，可忽略。

## Migration Plan

1. 前置：`harden-lesson-log` 实施并归档（v2 `lastSeq` 就位）。
2. 本变更在其 v2 record 上新增可选字段（`restoredNotedAt`）与 `unlinked` 表——同 domain version 内演进，无数据迁移；旧记录无字段时按默认语义处理。
3. 回滚：无 schema 破坏，直接回退插件版本即可；`unlinked` 表残留数据对旧版本不可见。

## Open Questions

（无）
