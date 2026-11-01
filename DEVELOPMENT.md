# 开发指南

本文件面向仓库开发者，不随 npm 包发布；安装与使用教程见 [README.md](README.md)。

## 仓库布局参考

`tmp/learn/` 仅作只读参考源，`tmp-dsh-extract/`（asar 提取副本）仅作 API 核对参考，均不入库（见 `.gitignore`）。

## 行为契约（OpenSpec）

五个能力的行为契约（requirement 与 scenario）见 [`openspec/specs/`](openspec/specs/)，此处只作导览：

- **teaching** —— [`openspec/specs/teaching/spec.md`](openspec/specs/teaching/spec.md)：`teach` 技能的 probe→plan→teach 三阶段教学流程；researcher 调研子代理随会话模型执行，工具范围由提示词模板约束。
- **graded-quiz** —— [`openspec/specs/graded-quiz/spec.md`](openspec/specs/graded-quiz/spec.md)：quiz 评分问答工具；选项校验、乱序、IDK、多选判分、防答案泄漏、子代理拒绝出题。
- **lesson-log** —— [`openspec/specs/lesson-log/spec.md`](openspec/specs/lesson-log/spec.md)：课程日志镜像 Obsidian callout；回填、保序、题面先于答案、命令路径、解除链接。
- **lesson-visuals** —— [`openspec/specs/lesson-visuals/spec.md`](openspec/specs/lesson-visuals/spec.md)：`visualize` 技能委派 maker 子代理（mermaid / SVG）本地渲染 PNG 并验证后发布；maker 随会话模型执行，工具范围由提示词模板约束。
- **bundled-skills** —— [`openspec/specs/bundled-skills/spec.md`](openspec/specs/bundled-skills/spec.md)：技能随插件包分发与注册（目录字段、剥 frontmatter 正文、`references/` 资源基址），支持项目级同名覆盖。

## 从源码安装（开发迭代）

```sh
pnpm install          # 安装依赖（zod + @deepseek-ai/*；可选含内嵌 mermaid 渲染器 ~400MB，见 README 渲染依赖一节）
pnpm run build        # tsc 编译到 dist/lib/
dsh plugin --profile desktop add link:.
```

重启 DSH 后启动日志出现 `[dsh-learn-plugin] plugin loaded` 即成功。link 方式安装的检出保留自己的 `node_modules` / 构建产物，改动源码后需在仓库根重新 `pnpm run build`。

## 覆盖层（免安装，开发期实时加载）

从 DSH 源码检出版本运行时，可用 patch 覆盖层直接插入本地插件模块（改完即时生效）：

```sh
dsh web --patch ./cordis.dev.yml
```

注意 `cordis.dev.yml` 以**绝对路径**插入插件模块——更换检出位置或在其他机器上使用时，需同步替换 yml 中的 `name:` 路径。

## 验证方式（harness）

本仓库保留了三组可重复运行的开发验证（不随插件发布）：

```sh
# quiz 行为（校验、乱序、IDK、跳过通道、多选、防泄漏卡片与 asked 事件、子代理拒绝）：应 31/31 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/quiz-harness.cordis.yml --no-open --port 0

# lesson-log 行为（回填、保序、题面先于答案、命令路径、解除、外部编辑保留、
# v1→v2 记录迁移水位、只读失败可见与按序补齐、非 .md 拒绝、越界需确认、
# 命令外链、链接窗口暂存放行、重链同文件水位续传、旧 v2 记录恢复 + 恢复注记
# 一次性（模拟重启三轮）、跳过判定块镜像、作答前镜像无泄漏、四集合 FIFO 有界、
# session/disposed 清理）：应 62/62 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/log-harness.cordis.yml --no-open --port 0

# 内置技能分发（目录字段、剥 frontmatter 正文、references 资源基址）：应 22/22 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/skills-harness.cordis.yml --no-open --port 0
```

重启恢复镜像用 `test/restore-probe.ts` 两阶段探针验证（A 阶段链接、写题面、持久化 quiz 调用后退出；B 阶段冷启动进程，从 v2 存储读取持久化水位，断言恢复注记与新事件镜像、水位下重放的历史不重复镜像（3.1），以及水位下重放的 quiz 调用其判定块在重启后补齐且出现在题面之后、题面不重复（3.2））。两阶段都必须与 A 同 cwd 运行（会话存储按 meta.cwd 键控），B 阶段探针会自行从 `<DSH_HOME>/storages/learn_dsh_lesson_log_v2.json` 读水位并以占位事件抬升 seq 越过水位，模拟真实重启的 seq 延续：

```sh
DSH_HOME=<workspace dsh home> RESTORE_PHASE=A dsh web --patch ./test/restore-probe.cordis.yml --no-open --port 0   # 等 "RESTORE PROBE A OK" 后结束该进程
DSH_HOME=<workspace dsh home> RESTORE_PHASE=B dsh web --patch ./test/restore-probe.cordis.yml --no-open --port 0   # 新进程；四行输出应全 OK
```

端到端教学演练对照 [`openspec/specs/`](openspec/specs/) 各 Scenario 手工执行。

> **注**：以上 overlay（`cordis.dev.yml` 与 `test/*.cordis.yml`）均以**绝对路径**插入插件模块——更换检出位置或在其他机器上复跑时，需把 yml 中的 `name:` 路径同步替换为当前仓库位置（本仓库更名自 `personal/dsh-learn/`，路径曾因此失配过一次）。

## 开发工作流

```sh
pnpm install        # 仓库根安装依赖
pnpm run build      # tsc 编译到 dist/lib/
pnpm run pack       # build 后打包，tgz 输出到 dist/
```

- 改 `src/` 后重新 `pnpm run build`；link 安装的检出与覆盖层（`--patch ./cordis.dev.yml`）都从 `dist/lib` 加载。
- 打包产物 `dist/dsh-learn-plugin-<version>.tgz` 含 `dist/lib/`、`client/`、`skills/`、`cordis.patch.yml` 与 README；`src/`、`test/` 不入包。
- 行为契约变更走 OpenSpec：改动前先更新 [`openspec/`](openspec/) 下对应 change，归档时合入主 specs。

## 存储域版本迁移（lesson-log）

链接记录的 schema 升级采用"**新域名 + 启动时搬移、旧域保留**"的手动迁移（`src/log.ts` 的 task 1.1 注释记录了完整审计过程）：

- `@deepseek-ai/dsh-storage-domain` 0.2.1-rc.2 **没有自动迁移钩子**（version 不匹配 open 直接 `version-mismatch`），且 `compatibleVersions` 对宿主 json backend 的 `single` layout 整档文件**不生效**（实测严格精确版本）——同域名 v1→v2 升级无法打开旧数据，同域双开也会撞同一个版本戳。
- 因此 v2 域使用独立域名 `learn_dsh_lesson_log_v2`：启动先开 v2 域，再以精确的 v1 spec 打开旧域 `learn_dsh_lesson_log`，把 v2 缺失的记录搬移过去，然后**关闭但不删除**旧域——旧版插件回滚后照常打开 v1 数据（只丢新水位，行为同升级前）。
- 搬移的记录不带水位；`linkFor` 恢复链接时发现记录缺 `lastSeq`，经 `sessionQuery.readSession` 取该会话事件最大 seq 回填并 `table.put` 持久化（一次性）。

## v2 域内演进与回滚（improve-mirror-robustness）

在 v2 域 version 2 内演进（不加版本号、无数据迁移），两处新特性对旧记录向后兼容：

- 链接记录新增可选字段 `restoredNotedAt`：恢复注记落地后置位并 `table.put`，同一链接的后续重启不再追加注记。旧记录没有该字段视为"未注记"，首次恢复照常写注记——行为与升级前一致。
- 新增 `unlinked` 表（`sessionId → {file, lastSeq, unlinkedAt}`）：`/lesson-unlog` 不再只删除链接记录，而是把 `{file, lastSeq}` 搬入该表；重链**同一文件**时跳过全量回填、从该水位续传，重链**不同**文件走正常回填并清掉旧表项。选独立表而非软删除字段：旧版代码不认识该表，回滚后已解链会话不会被误当有效链接恢复（重链退化为全量回填，功能正确）。

回滚总述：v2 域版本号未变，旧版插件直接打开现有 `learn_dsh_lesson_log_v2.json`——不读 `restoredNotedAt`（注记退回每次恢复都写）、不见 `unlinked` 表（续传退化为全量回填），其余行为不变；残留数据每会话仅数十字节。

另外两处镜像健壮性行为（无存储 schema 参与）：链接建立期（占位→回填→放行）实时事件暂存于每链接 staging 队列（上限 256，超限丢最旧并写 warning callout）；进程内簿记集合（`callMeta`/`askedQuiz`/`knownUnlinked`）为 1024 条 FIFO，`links` 在 `session/disposed`（会话离开进程内 store，`@deepseek-ai/dsh-session` 声明的事件面）时清理对应条目。测试侧诊断通道：`globalThis[Symbol.for('dsh-learn-plugin.log.diagnostics')]` 暴露四集合（仅 harness 使用）。

## 发布到 npm

```sh
npm login --registry https://registry.npmjs.org    # 仅首次；npm whoami 验证登录状态
npm version patch                                  # 0.1.0 → 0.1.1（每次发布必须先升版本号）
npm publish --registry https://registry.npmjs.org  # publish 自动执行 prepare → tsc 构建
```

注意事项：

- 本机 registry 若指向镜像（如 npmmirror）**无法发布**，必须以 `--registry` 显式覆盖为官方源。
- 开启 2FA 时 `npm publish` 会要求输入一次性验证码。
- 发布后校验：`npm view dsh-learn-plugin version`。
