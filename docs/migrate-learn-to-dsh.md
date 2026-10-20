# migrate-learn-to-dsh：迁移说明

本仓库把 [amosblomqvist/learn](https://github.com/amosblomqvist/learn)（构建在 pi 编码代理上的个人学习系统）迁移到了 DeepSeek Harness (DSH)。本文档说明迁移产物的安装、依赖、已知降级点与回滚方式。

迁移设计与决策见 `openspec/changes/migrate-learn-to-dsh/design.md`；行为契约见同目录 `specs/`（teaching / graded-quiz / lesson-log / lesson-visuals）。

## 组件清单

| 组件 | 位置 | 说明 |
|---|---|---|
| teach 教学技能 | `.dsh/skills/teach/` | probe→plan→teach 三阶段教学流程；引用 `references/researcher.md` 调研子代理提示词 |
| visualize 图示技能 | `.dsh/skills/visualize/` | 按需委派 maker 子代理；`references/mermaid-maker.md`、`references/svg-maker.md` 为子代理提示词模板 |
| quiz 评分问答 | `plugins/learn-dsh/`（进程内插件） | `ctx.tools.register` + `ctx.userQuestions.ask()`；纯展示投影防答案泄漏 |
| lesson-log 课程日志 | `plugins/learn-dsh/`（同插件） | 订阅 `session/event` 流镜像 Obsidian callout；`lesson_log`/`lesson_unlog` 工具 + `/lesson-log`、`/lesson-unlog` 用户命令 |

`tmp/learn/` 仅作只读参考源，`tmp-dsh-extract/`（asar 提取副本）仅作 API 核对参考，均不入库。

## 安装步骤

### 1. 前置条件

- DSH 桌面版（本迁移针对 `engines.dsh: "0.2.x"`，在 0.2.1-rc.2 上验证）。
- Node ≥ 24 与 pnpm（构建插件用）。
- 渲染链（可选，见下节）。

### 2. 安装项目级 skills（teach / visualize）

skills 是项目级约定，随仓库走：把 `.dsh/skills/teach/` 与 `.dsh/skills/visualize/` 放进目标项目仓库即可，DSH 会自动加载并在技能列表中显示。

### 3. 安装插件（quiz + lesson-log）

```sh
cd plugins/learn-dsh
pnpm install          # 安装对等依赖（zod + @deepseek-ai/*）
pnpm run build        # tsc 编译到 lib/
cd ../..
dsh plugin --profile desktop add link:./plugins/learn-dsh
```

重启 DSH 后启动日志出现 `[learn-dsh] plugin loaded` 即成功。会话内验证：

- `quiz` 工具出现在模型工具列表（主会话出题、作答、即时反馈）。
- `/lesson-log <已有 markdown 文件>` 链接课程日志，`/lesson-unlog` 解除。

### 4. 开发期通道（免安装实时加载）

从 DSH 源码检出版本运行时，可用 patch 覆盖层直接插入本地插件模块（改完即时生效）：

```sh
dsh web --patch ./plugins/learn-dsh/cordis.dev.yml
```

注：插件 peerDependencies 锁 `0.2.1-rc.2`；在更早的 dsh 运行时上会被禁用，需 `dsh plugin allow-version "learn-dsh@<ver>" --dsh-version <runtime> --accept-risk --profile <profile>` 显式豁免。

## 渲染依赖（lesson-visuals）

两条渲染链都是系统级依赖，插件与技能不负责安装；maker 子代理第一步会检测并在缺失时返回明确的 `UNAVAILABLE` 报告（附安装命令），不会静默失败或返回未验证的图。

- **mermaid 链**（结构/关系/流程图）：`npm install -g @mermaid-js/mermaid-cli`（提供 `mmdc`，经 puppeteer 驱动 Chrome）+ Chrome/Chromium。
- **SVG 链**（几何/空间图）：`brew install librsvg`（`rsvg-convert`，首选）或 `brew install imagemagick`（`magick`，回退）。

免全局安装的替代方案（本仓库验证过）：在仓库内 `npm install @mermaid-js/mermaid-cli`（配 `PUPPETEER_SKIP_DOWNLOAD=1`），渲染时带 `PUPPETEER_EXECUTABLE_PATH=<系统 Chrome>` 与 `--no-sandbox` 的 puppeteer 配置文件；把完整调用路径写进给 maker 的 brief 即可。

## 已知降级点（相对 pi 版）

来自 design.md D6，均为有意的取舍：

1. **quiz note 附注**：`userQuestions` 的 custom 文本在单选里覆盖所选而非并列附注 → v1 丢弃 note；"I don't know" 语义保留。
2. **per-agent 模型覆盖**：maker/researcher 不再指定专署模型，随会话模型。
3. **工具硬白名单**：pi 的 `tools:` 限定弱化为 maker/researcher 提示词约束（DSH 无 markdown agent 定义）。
4. **TUI 键盘交互细节**：随 note 一并消失（DSH Web GUI 用弹窗作答）。

## 验证方式

本仓库保留了两组可重复运行的开发验证（不随插件发布）：

```sh
# quiz 行为（校验、乱序、IDK、多选、防泄漏、子代理拒绝）：应 22/22 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./plugins/learn-dsh/test/quiz-harness.cordis.yml --no-open --port 0

# lesson-log 行为（回填、保序、题面先于答案、命令路径、解除）：应 16/16 PASS
DSH_HOME=<workspace dsh home> dsh web --patch ./plugins/learn-dsh/test/log-harness.cordis.yml --no-open --port 0
```

重启恢复镜像用 `test/restore-probe.ts` 两阶段探针验证（A 链接并退出；B 冷启动进程追加事件，断言恢复注记与新事件镜像）。端到端教学演练对照 `specs/` 各 Scenario 手工执行。

## 回滚方式

- 卸载插件：`dsh plugin --profile desktop remove link:./plugins/learn-dsh`（或 `pnpm remove`）并重启 DSH —— quiz 与 lesson-log 同时下线。
- 移除技能：删除 `.dsh/skills/teach/` 与 `.dsh/skills/visualize/`。
- 删除已发布的图示：清理 `viz/`；课程日志为普通 markdown，直接编辑或删除文件即可，卸载不影响既有日志。
