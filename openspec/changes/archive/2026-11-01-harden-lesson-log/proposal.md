# Proposal

## Why

深度调研发现 lesson-log 镜像管线存在四个较严重缺陷：`lesson_log` 工具接受任意已存在文件（不校验 `.md`、不限路径），模型可借它读写会话工作区之外的任意文件；`appendToFile` 以全文件读改写冒充追加（非原子、O(n²)，失败时块被静默丢弃且水位已推进）；quiz 出题后宿主重启、恢复会话中作答时，判定块因 `callMeta` 仅存内存而永久丢失（日志留下悬空题面）；链接恢复水位硬编码 `lastSeq: 0` 且不持久化，正确性完全依赖"平台重启后不重放历史事件"这一未声明不变量，一旦重放则整段日志重复写入。前三者破坏文件安全与日志完整性，后者使"链接恢复"这一招牌特性在边界路径下不可靠，需要优先加固。

## What Changes

- `lesson_log` 目标约束：链接目标 SHALL 为 `.md` 文件；相对路径仍相对会话工作目录解析。模型经工具链接**会话工作区之外**的绝对路径时 SHALL 先经用户确认（`ask_user_question`）；用户经 `/lesson-log` 命令发起的链接视为已确认，不受此限。
- 真追加写入：块写入改为标准追加盐水（`fs.appendFile` 类语义），不再全文件读改写；写入失败 SHALL NOT 静默丢块——镜像水位只在写入成功后推进，失败重试仍失败时向会话报告错误并在恢复后补齐。
- 持久化镜像水位：link record 增加持久化 `lastSeq`（含写入成功语义），重启恢复以它为界，既不重复镜像已写入内容，也不依赖"平台不重放事件"的隐式假设。
- 重启跨题补齐：恢复后的镜像 SHALL 能补写重启前已出题、重启后完成的 quiz / `ask_user_question` 判定块（`callMeta` 丢失时从 `sessionQuery` 持久化事件重建调用上下文），日志不再留下悬空题面。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `lesson-log`: 「链接已有文件为课程日志」增加目标类型（`.md`）与越界确认要求；「追加保序」升级为含写入失败可见性的可靠追加；「链接恢复」升级为基于持久化水位的恢复——不重复、不丢失、补齐重启窗口的判定块。

## Impact

- `src/log.ts`：`appendToFile` 重写为真追加；`linkSession` 增加 `.md` 校验与越界确认；`linkFor` 恢复路径改为读取持久化水位；`blocksForEvent` 在 `callMeta` 缺失时回查重建；镜像水位推进时机移到写入成功之后。
- 存储域：`learn_dsh_lesson_log` 的 `links` 表 schema 升级（新增 `lastSeq` 字段），需要版本迁移（v1 → v2）。
- 测试：`test/log-harness.ts` 增加目标约束与失败可见断言；`test/restore-probe.ts` 增加历史不重复断言与跨重启判定补齐断言。
- 兼容性：既有 v1 link record 在升级后首次恢复时按"无水位"处理（等同现状，一次性全量信任持久化事件边界），不破坏已有链接。
