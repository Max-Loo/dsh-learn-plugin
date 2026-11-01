# Tasks

## 1. 存储域 v2 与迁移前置

- [ ] 1.1 核对 `@deepseek-ai/dsh-storage-domain` 的版本迁移能力（读本包 node_modules 内类型声明与 README：domain `version` 升级时是否有迁移钩子），在 design D4 的两条路径中选定一条并记入代码注释；验证：结论写入 `src/log.ts` domain 定义处的注释，与实现一致
- [ ] 1.2 `linkRecord` 升级为 v2（新增 `lastSeq: number`），domain version 1→2，实现 v1 记录迁移（迁移时经 `sessionQuery.readSession` 取该会话事件最大 seq 为初始水位）；验证：log-harness 新增断言——预置 v1 记录 + 会话历史后启动插件，链接恢复的水位等于最大 seq，v1 行为不破坏

## 2. 真追加与写入失败可见

- [ ] 2.1 重写 `appendToFile` 为 `fsp.appendFile` + 写前 `stat` size 判空（size 为 0 省略 `\n\n` 前缀），移除内部 catch、失败上抛；验证：log-harness 既有 16 项全部 PASS，且新增断言"追加前修改文件头部内容，追加后头部修改保留"（追加语义完整性）
- [ ] 2.2 实现失败处理：`link.lastSeq` 仅在块写入成功后推进，失败块进入每链接 pending 队列按序重试；连续 3 次失败 `ctx.logger.error` 并在 `sessions` 服务可用时向会话追加系统警告；验证：log-harness 用只读目标文件模拟持续失败，断言水位不推进、错误报告出现，恢复可写后块按序补齐

## 3. 恢复边界与重启跨题补齐

- [ ] 3.1 `linkFor` 恢复路径读取持久化 `lastSeq`（不再硬编码 0），`session/event` 对 `seq <= lastSeq` 一律跳过；每块成功写入后 `table.put` 更新水位；验证：restore-probe 两阶段探针新增断言——B 阶段重放 A 阶段历史事件时文件内容与 A 结束时保持前缀一致（无重复）
- [ ] 3.2 `tool/result` 处理中 `callMeta` 未命中且为 quiz/ask 时，经 `readSession` 按同 `callId` 回查 `tool/call` 重建 `{name, args}` 并缓存；验证：restore-probe 扩展为跨重启 quiz 场景（A 阶段写入题面后退出，B 阶段投递判定结果），断言判定块出现在题面之后

## 4. lesson_log 目标约束

- [ ] 4.1 `linkSession` 增加扩展名校验（仅 `.md`，报错说明仅接受 markdown）与会话工作区外路径的用户确认（工具路径经 `userQuestions.ask` 是/否确认，`/lesson-log` 命令路径传 `confirmedByUser: true` 跳过），同步更新 `lesson_log` 工具描述；验证：log-harness 新增三断言——非 `.md` 拒绝且目标不被读写、代理越界路径需确认、命令路径直接生效

## 5. 回归与文档

- [ ] 5.1 全量回归：quiz-harness 22/22、扩展后的 log-harness 全 PASS、skills-harness 22/22、restore-probe A/B 两阶段 OK；验证：四组命令输出全绿
- [ ] 5.2 更新 README 与 DEVELOPMENT：`.md` 约束、工作区外确认行为、外部编辑器全文回写的竞态提示、存储域 v2 迁移与回滚说明；验证：文档含上述四点且与实现一致
