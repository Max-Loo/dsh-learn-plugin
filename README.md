# dsh-learn-plugin

## 项目概述

本项目是运行在 DeepSeek Harness (DSH) 上的个人学习系统，受 [`learn`](https://github.com/amosblomqvist/learn)（构建在 pi 编码代理上的个人学习系统）启发：评分问答（quiz）工具 + 课程日志镜像插件，以及驱动它们的 `teach` / `visualize` 技能（内置于包内 `skills/` 目录，经 DSH 技能注册表注册）。仓库根即包根——本 README 同时是仓库文档与 npm 包文档。

| 组件 | 位置 | 说明 |
|---|---|---|
| teach 教学技能 | `skills/teach/`（随插件包分发） | probe→plan→teach 三阶段教学流程；引用 `references/researcher.md` 调研子代理提示词 |
| visualize 图示技能 | `skills/visualize/`（随插件包分发） | 按需委派 maker 子代理；`references/mermaid-maker.md`、`references/svg-maker.md` 为子代理提示词模板 |
| quiz 评分问答 | `src/`（进程内插件） | `ctx.tools.register` + `ctx.userQuestions.ask()`；纯展示投影防答案泄漏 |
| lesson-log 课程日志 | `src/`（同插件） | 订阅 `session/event` 流镜像 Obsidian callout；`lesson_log`/`lesson_unlog` 工具 + `/lesson-log`、`/lesson-unlog` 用户命令 |

`tmp/learn/` 仅作只读参考源，`tmp-dsh-extract/`（asar 提取副本）仅作 API 核对参考，均不入库（见 `.gitignore`）。

## 项目功能介绍

五个能力的行为契约（requirement 与 scenario）见 [`openspec/specs/`](openspec/specs/)，此处只作导览：

- **teaching** —— [`openspec/specs/teaching/spec.md`](openspec/specs/teaching/spec.md)：`teach` 技能的 probe→plan→teach 三阶段教学流程；researcher 调研子代理随会话模型执行，工具范围由提示词模板约束。
- **graded-quiz** —— [`openspec/specs/graded-quiz/spec.md`](openspec/specs/graded-quiz/spec.md)：quiz 评分问答工具；选项校验、乱序、IDK、多选判分、防答案泄漏、子代理拒绝出题。
- **lesson-log** —— [`openspec/specs/lesson-log/spec.md`](openspec/specs/lesson-log/spec.md)：课程日志镜像 Obsidian callout；回填、保序、题面先于答案、命令路径、解除链接。
- **lesson-visuals** —— [`openspec/specs/lesson-visuals/spec.md`](openspec/specs/lesson-visuals/spec.md)：`visualize` 技能委派 maker 子代理（mermaid / SVG）本地渲染 PNG 并验证后发布；maker 随会话模型执行，工具范围由提示词模板约束。
- **bundled-skills** —— [`openspec/specs/bundled-skills/spec.md`](openspec/specs/bundled-skills/spec.md)：技能随插件包分发与注册（目录字段、剥 frontmatter 正文、`references/` 资源基址），支持项目级同名覆盖。

## 使用说明

### 前置条件

- DSH 桌面版（针对 `engines.dsh: "0.2.x"`，在 0.2.1-rc.2 上验证）。
- Node ≥ 24 与 pnpm（构建插件用）。
- 渲染链（可选，见[渲染依赖](#渲染依赖lesson-visuals)）。

> 插件 peerDependencies 锁 `0.2.1-rc.2`；在更早的 dsh 运行时上会被禁用，需 `dsh plugin allow-version "dsh-learn-plugin@<ver>" --dsh-version <runtime> --accept-risk --profile <profile>` 显式豁免。

### 内置 skills（teach / visualize）—— 安装即得

无需任何项目级文件：`teach` / `visualize` 已内置于本包（`skills/` 目录随发布包分发，经 `ctx.skills` 技能注册表注册），安装插件（下一节）并重启 DSH 后，两个技能自动出现在会话技能目录中，对模型与用户两面均可调用（`/teach`、`/visualize` 可直接加载正文）。

- 正文中的 `references/` 提示词模板按各自技能在已安装插件包内的资源基址解析，在任何装了插件的项目里都可读取，不依赖目标项目或用户目录中存在对应文件。
- **项目级覆盖**：想定制就在目标项目放同名技能 `.dsh/skills/teach/`（或 `visualize/`）——项目级技能 rank（100）优先于内置副本 rank（600），加载的即是项目副本；删除项目级副本后，会话刷新技能目录即自动回落到内置副本，无需重装插件。

### 安装

两种加载通道，命令均在仓库根目录执行（仓库根即包根）：

#### 1. 安装进 profile（常规使用）

```sh
pnpm install          # 安装依赖（zod + @deepseek-ai/*）
pnpm run build        # tsc 编译到 dist/lib/
dsh plugin --profile desktop add link:.
```

重启 DSH 后启动日志出现 `[dsh-learn-plugin] plugin loaded` 即成功。会话内验证：

- `quiz` 工具出现在模型工具列表（主会话出题、作答、即时反馈）。
- `/lesson-log <已有 markdown 文件>` 链接课程日志，`/lesson-unlog` 解除。

注：link 方式安装的检出保留自己的 `node_modules` / 构建产物，改动源码后需在仓库根重新 `pnpm run build`。

#### 2. 覆盖层（免安装，开发期实时加载）

从 DSH 源码检出版本运行时，可用 patch 覆盖层直接插入本地插件模块（改完即时生效）：

```sh
dsh web --patch ./cordis.dev.yml
```

注意 `cordis.dev.yml` 以**绝对路径**插入插件模块——更换检出位置或在其他机器上使用时，需同步替换 yml 中的 `name:` 路径。

### 渲染依赖（lesson-visuals）

`visualize` 技能把图示委派给 maker 子代理在本地渲染 PNG。两条渲染链都是系统级依赖——本插件不负责安装。每个 maker 的第一步（提示词的 Step 0）就检测自己的渲染链，缺失时返回明确的 `UNAVAILABLE` 报告（点名缺失的二进制与安装命令）；绝不静默失败或返回未验证的图。

#### mermaid 链（结构 / 关系 / 流程图）

需要 `mmdc` CLI 及其可驱动的 Chrome/Chromium：

```sh
npm install -g @mermaid-js/mermaid-cli   # 提供 mmdc（经 puppeteer 驱动 Chrome）
```

Chrome 通常自动探测；裸机上需安装 Google Chrome 或 Chromium。冒烟测试：

```sh
printf 'graph TD\n  A-->B\n' > .mmdc-smoke.mmd && mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png && rm -f .mmdc-smoke.*
```

免全局安装的替代方案（本仓库验证过）：在仓库内 `npm install @mermaid-js/mermaid-cli`（配 `PUPPETEER_SKIP_DOWNLOAD=1`），渲染时带 `PUPPETEER_EXECUTABLE_PATH=<系统 Chrome>` 与 `--no-sandbox` 的 puppeteer 配置文件；把完整调用路径写进给 maker 的 brief 即可。

#### SVG 链（几何 / 空间图）

需要 `rsvg-convert`（首选）或 ImageMagick 的 `magick`（回退）：

```sh
brew install librsvg       # 提供 rsvg-convert
brew install imagemagick   # 回退：提供 magick
```

冒烟测试：`command -v rsvg-convert || command -v magick`。

#### 降级行为

- mermaid 链缺失 → mermaid 图示报告不可用；SVG 图示不受影响（反之亦然）。
- maker 无法验证渲染结果时报告 `UNAVAILABLE` + 缺失的依赖；教学会话随即跳过该图，而不是内嵌未验证的图。

### 卸载

- 卸载插件：`dsh plugin --profile desktop remove link:.`（仓库根执行）并重启 DSH —— quiz 与 lesson-log 同时下线。
- 移除技能：随插件卸载一并下线（teach / visualize 内置于包内）；若只想换掉某个技能，放项目级同名 `.dsh/skills/<name>/` 覆盖即可，不必卸载。
- 删除已发布的图示：清理 `viz/`；课程日志为普通 markdown，直接编辑或删除文件即可，卸载不影响既有日志。

## 项目贡献方式

### 验证方式（harness）

本仓库保留了三组可重复运行的开发验证（不随插件发布）：

```sh
# quiz 行为（校验、乱序、IDK、多选、防泄漏、子代理拒绝）：应 22/22 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/quiz-harness.cordis.yml --no-open --port 0

# lesson-log 行为（回填、保序、题面先于答案、命令路径、解除）：应 16/16 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/log-harness.cordis.yml --no-open --port 0

# 内置技能分发（目录字段、剥 frontmatter 正文、references 资源基址）：应 22/22 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./test/skills-harness.cordis.yml --no-open --port 0
```

重启恢复镜像用 `test/restore-probe.ts` 两阶段探针验证（A 链接并退出；B 冷启动进程追加事件，断言恢复注记与新事件镜像）。端到端教学演练对照 [`openspec/specs/`](openspec/specs/) 各 Scenario 手工执行。

> **注**：以上 overlay（`cordis.dev.yml` 与 `test/*.cordis.yml`）均以**绝对路径**插入插件模块——更换检出位置或在其他机器上复跑时，需把 yml 中的 `name:` 路径同步替换为当前仓库位置（本仓库更名自 `personal/dsh-learn/`，路径曾因此失配过一次）。

### 开发工作流

```sh
pnpm install        # 仓库根安装依赖
pnpm run build      # tsc 编译到 dist/lib/
pnpm run pack       # build 后打包，tgz 输出到 dist/
```

- 改 `src/` 后重新 `pnpm run build`；link 安装的检出与覆盖层（`--patch ./cordis.dev.yml`）都从 `dist/lib` 加载。
- 打包产物 `dist/dsh-learn-plugin-<version>.tgz` 含 `dist/lib/`、`client/`、`skills/`、`cordis.patch.yml` 与本 README；`src/`、`test/` 不入包。
- 行为契约变更走 OpenSpec：改动前先更新 [`openspec/`](openspec/) 下对应 change，归档时合入主 specs。
