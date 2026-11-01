# Tasks

## 1. 前置核对与存储扩展

- [x] 1.1 核对 DSH 会话生命周期事件面（cordis 事件或 `sessions` 服务中是否存在会话结束/清理可订阅项，读本包 node_modules 内 `@deepseek-ai/*` 类型声明），在 design D4 的"结束事件 vs LRU"两条路径中选定一条并记入代码注释；验证：结论与 `links` 清理实现一致
- [x] 1.2 domain 增加 `unlinked` 表（`sessionId → {file, lastSeq, unlinkedAt}`）与 `links` 记录可选字段 `restoredNotedAt`；验证：log-harness 断言旧 v2 记录（无新字段）恢复行为不变

## 2. 链接三段式与重链续传

- [x] 2.1 `linkSession` 重排为占位→回填→放行三段式，live 事件在占位期进入 staging、放行后按序 flush（staging 上限 256，超限丢最旧并写 warning callout）；验证：log-harness 新增断言——回填期间注入实时事件，链接生效后块按序出现且无 "restored" 注记
- [x] 2.2 `unlinkSession` 改为把记录搬入 `unlinked` 表；重链同文件时从该表恢复水位续传（跳过全量回填），重链不同文件走正常回填；验证：log-harness 新增断言——解除后重链同一文件，日志无重复块；重链不同文件时历史完整回填
- [x] 2.3 恢复注记一次性：首次恢复写注记并置位 `restoredNotedAt`，后续恢复跳过；验证：log-harness 连续两次模拟恢复，断言注记至多一条

## 3. 状态集合有界化

- [x] 3.1 `callMeta`/`askedQuiz`/`knownUnlinked` 实现带上限 FIFO（1024），`links` 按 1.1 结论实现结束清理或 LRU（64）；验证：log-harness 注入超上限事件序列后，镜像功能不回归（全项 PASS），进程内集合尺寸有界（可在 harness 中经诊断输出断言）

## 4. quiz 跳过通道

- [x] 4.1 `src/quiz.ts` 判分：空选且无自定义答案 → `dontKnow`/`status: 'dontKnow'`，反馈文本注明 skipped；工具描述同步；`src/log.ts` 判定标题在 `dontKnow && answers` 为空时显示 `Quiz — skipped`；验证：quiz-harness 新增断言——跳过场景返回 dontKnow 信号、无 ✗、揭示正确答案；log-harness 断言日志判定块标题与标记正确
- [x] 4.2 防泄漏措辞闭环：quiz-harness 增加断言——待作答状态下插件呈现（卡片文本、asked 事件、日志镜像）均不含 `correctAnswer`/`explanation`；验证：新增断言与既有 22 项全 PASS

## 5. 回归与文档

- [x] 5.1 全量回归：quiz-harness（扩展后全 PASS）、log-harness（扩展后全 PASS）、skills-harness 22/22、restore-probe A/B OK；验证：命令输出全绿
- [x] 5.2 更新 README 与 DEVELOPMENT：重链续传行为、恢复注记一次性、跳过信号语义、`unlinked` 表与回滚说明；验证：文档与实现一致
