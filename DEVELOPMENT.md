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

重启 DSH 后 `teach` / `visualize` 出现在会话技能目录即成功（插件日志统一走 DSH 日志系统：`[dsh-learn-plugin] plugin loaded` 与技能注册消息不再打印到终端 stdout）。link 方式安装的检出保留自己的 `node_modules` / 构建产物，改动源码后需在仓库根重新 `pnpm run build`。

## 覆盖层（免安装，开发期实时加载）

从 DSH 源码检出版本运行时，可用 patch 覆盖层直接插入本地插件模块（改完即时生效）：

```sh
dsh web --patch ./cordis.dev.yml
```

注意 `cordis.dev.yml` 以 **checkout 相对路径**插入插件模块——`./`、`../` 开头的 `name:` 锚定到 patch 文件自身目录（dsh-app-boot 的 `anchorInsertedPluginNames` 语义），更换检出位置、整体移动或更名仓库目录都无需改路径；只有调整 patch 文件与 `dist/lib` 之间的相对位置时才需同步修改 `name:`。

## 验证方式（harness）

本仓库保留了三组可重复运行的开发验证（不随插件发布）：

```sh
# quiz 行为（校验、乱序、IDK、多选、防泄漏、子代理拒绝、选项上限）：应 25/25 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/quiz-harness.cordis.yml --no-open --port 0

# lesson-log 行为（回填、保序、题面先于答案、命令路径、解除）：应 16/16 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/log-harness.cordis.yml --no-open --port 0

# 内置技能分发（目录字段、剥 frontmatter 正文、references 资源基址）：应 22/22 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/skills-harness.cordis.yml --no-open --port 0
```

重启恢复镜像用 `test/restore-probe.ts` 两阶段探针验证（A 链接并退出；B 冷启动进程追加事件，断言恢复注记与新事件镜像）。端到端教学演练对照 [`openspec/specs/`](openspec/specs/) 各 Scenario 手工执行。

> **注**：以上 overlay（`cordis.dev.yml` 与 `test/*.cordis.yml`）均以 **checkout 相对路径**插入插件模块——`name:` 以 `./` / `../` 开头时锚定到 patch 文件自身目录（`anchorInsertedPluginNames`），更换检出位置、整体移动或更名仓库目录都可原样复跑，无需替换路径；只有改动 patch 文件与 `dist/lib` 的相对位置时才需同步调整（本仓库更名自 `personal/dsh-learn/`，失配发生在绝对路径时代）。

## 开发工作流

```sh
pnpm install        # 仓库根安装依赖
pnpm run build      # tsc 编译到 dist/lib/
pnpm run pack       # build 后打包，tgz 输出到 dist/
```

- 改 `src/` 后重新 `pnpm run build`；link 安装的检出与覆盖层（`--patch ./cordis.dev.yml`）都从 `dist/lib` 加载。
- **升级 DSH 后先回归再使用**：插件 peer 已放宽为 `0.2.x` 范围（与 `engines.dsh` 一致），DSH 补丁升级不再被 peer 失配硬拦截。因此每次升级 DSH 后、日常使用前，先跑全量验证（见"验证方式"一节）：quiz / log / skills 三组 harness 全 PASS + restore-probe A/B OK，确认 API 契约未漂移后再继续使用。
- 打包产物 `dist/dsh-learn-plugin-<version>.tgz` 含 `dist/lib/`、`client/`、`skills/`、`cordis.patch.yml` 与 README；`src/`、`test/` 不入包。
- 行为契约变更走 OpenSpec：改动前先更新 [`openspec/`](openspec/) 下对应 change，归档时合入主 specs。

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
