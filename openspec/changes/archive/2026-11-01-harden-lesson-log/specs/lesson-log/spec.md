# Spec Delta

## MODIFIED Requirements

### Requirement: 链接已有文件为课程日志
系统 SHALL 支持将一个已存在的 markdown 文件链接为当前会话的课程日志并开始镜像；链接不存在的路径时 SHALL 报错且不创建文件或目录。链接目标 SHALL 为 `.md` 扩展名文件；代理经工具链接会话工作区之外的路径时 SHALL 先获得用户确认，用户经命令发起的链接视为已确认。

#### Scenario: 链接已有笔记
- **WHEN** 用户请求把 `lessons/tcp.md`（已存在）链接为课程日志
- **THEN** 链接生效，状态指示显示当前日志文件，会话内容开始追加镜像

#### Scenario: 路径不存在
- **WHEN** 用户给出的文件路径不存在
- **THEN** 返回错误信息，不创建任何文件

#### Scenario: 非 markdown 目标被拒绝
- **WHEN** 代理以 `~/.config/app.json`（已存在但非 `.md`）调用 `lesson_log`
- **THEN** 工具返回错误说明仅接受 markdown 文件，不开始镜像，目标文件不被读写

#### Scenario: 代理链接工作区外路径需确认
- **WHEN** 代理以会话工作区之外的绝对路径 `/Users/me/Documents/notes/tcp.md` 调用 `lesson_log`
- **THEN** 系统先向用户确认该路径，确认后链接生效，拒绝则返回未链接

#### Scenario: 用户命令链接任意路径
- **WHEN** 用户自己运行 `/lesson-log /Users/me/Documents/notes/tcp.md`
- **THEN** 链接直接生效，无需再次确认

### Requirement: 链接恢复
会话重启或恢复后，系统 SHALL 恢复既有的日志链接（继续镜像同一文件），无需用户重新链接；恢复 SHALL 以持久化的镜像水位为界，已镜像内容 SHALL NOT 因恢复而重复写入，即使平台重放了历史事件。

#### Scenario: 重启恢复
- **WHEN** 用户重开一个曾链接过日志的会话
- **THEN** 镜像自动恢复到原文件，状态指示可见

#### Scenario: 历史事件重放不重复
- **WHEN** 会话恢复时平台把重启前的历史事件重新投递给镜像
- **THEN** 已镜像过的事件不再次写入日志，文件内容与重启前保持前缀一致

## ADDED Requirements

### Requirement: 追加语义完整性
镜像写入 SHALL 以追加语义进行：既有文件内容 SHALL NOT 被重写、截断或重排；写入中断后既有内容 SHALL 保持完好。

#### Scenario: 写入中断
- **WHEN** 一次块写入因进程崩溃而中断
- **THEN** 日志文件中该次写入之前的内容保持完好，不出现截断

#### Scenario: 外部编辑保留
- **WHEN** 用户在编辑器中修改了日志文件较早位置的内容
- **THEN** 后续镜像追加不覆盖该修改

### Requirement: 写入失败不静默丢失
块写入失败时，镜像水位 SHALL NOT 推进；重试仍失败时 SHALL 向会话可见地报告错误，写入能力恢复后 SHALL 按原顺序补齐未写入的块。

#### Scenario: 瞬时失败后补写
- **WHEN** 一次追加因瞬时错误（如权限或磁盘暂时不可写）失败，随后恢复
- **THEN** 对应块按原顺序补写入日志，不出现缺块

#### Scenario: 持续失败可见
- **WHEN** 追加持续失败
- **THEN** 会话收到明确的镜像失败报告，而不是日志静默落后于会话

### Requirement: 重启跨题判定补齐
宿主重启前已写入题面、重启后完成的 quiz 或 ask_user_question，其判定块 SHALL 写入恢复后的日志，不遗留无判定的悬空题面。

#### Scenario: 重启跨题
- **WHEN** quiz 题面写入日志后宿主重启，用户在恢复的会话中作答
- **THEN** 日志中该题面之后出现对应的判定块
