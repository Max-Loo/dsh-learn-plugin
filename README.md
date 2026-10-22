# dsh-learn-plugin

运行在 DeepSeek Harness (DSH) 上的个人学习系统：评分问答（quiz）工具 + 课程日志（lesson-log）插件，以及驱动它们的 `teach` / `visualize` 技能（内置于包内 `skills/` 目录，安装后经 DSH 技能注册表自动注册）。受 [`learn`](https://github.com/amosblomqvist/learn)（构建在 pi 编码代理上的个人学习系统）启发。

## 功能总览

| 组件 | 位置 | 说明 |
|---|---|---|
| teach 教学技能 | `skills/teach/`（随包分发） | probe→plan→teach 三阶段教学流程；引用 `references/researcher.md` 调研子代理提示词 |
| visualize 图示技能 | `skills/visualize/`（随包分发） | 按需委派 maker 子代理；`references/mermaid-maker.md`、`references/svg-maker.md` 为子代理提示词模板 |
| quiz 评分问答 | 进程内插件 | `ctx.tools.register` + `ctx.userQuestions.ask()`；纯展示投影防答案泄漏 |
| lesson-log 课程日志 | 进程内插件 | 订阅 `session/event` 流镜像 Obsidian callout；`lesson_log`/`lesson_unlog` 工具 + `/lesson-log`、`/lesson-unlog` 用户命令 |

## 前置条件

- DSH 桌面版（针对 `engines.dsh: "0.2.x"`，在 0.2.1-rc.2 上验证）。

> 插件 peerDependencies 锁 `0.2.1-rc.2`；在更早的 dsh 运行时上会被禁用，需 `dsh plugin allow-version "dsh-learn-plugin@<ver>" --dsh-version <runtime> --accept-risk --profile <profile>` 显式豁免。

## 安装

```sh
dsh plugin --profile desktop add dsh-learn-plugin
```

重启 DSH，启动日志出现 `[dsh-learn-plugin] plugin loaded` 即成功。从源码安装（开发迭代）的方式见 [DEVELOPMENT.md](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/DEVELOPMENT.md)。

## 使用

### 内置技能（teach / visualize）—— 安装即得

无需任何项目级文件：`teach` / `visualize` 已内置于本包（`skills/` 目录随发布包分发，经 `ctx.skills` 技能注册表注册），安装插件并重启 DSH 后，两个技能自动出现在会话技能目录中，对模型与用户两面均可调用（`/teach`、`/visualize` 可直接加载正文）。

- 正文中的 `references/` 提示词模板按各自技能在已安装插件包内的资源基址解析，在任何装了插件的项目里都可读取，不依赖目标项目或用户目录中存在对应文件。
- **项目级覆盖**：想定制就在目标项目放同名技能 `.dsh/skills/teach/`（或 `visualize/`）——项目级技能 rank（100）优先于内置副本 rank（600），加载的即是项目副本；删除项目级副本后，会话刷新技能目录即自动回落到内置副本，无需重装插件。

### quiz 评分问答

`quiz` 工具随插件出现在模型工具列表：主会话出题、作答、即时反馈。支持选项校验、乱序、IDK、多选判分；纯展示投影防答案泄漏，子代理拒绝出题。

### lesson-log 课程日志

- `/lesson-log <已有 markdown 文件>` 链接课程日志，`/lesson-unlog` 解除。
- 订阅 `session/event` 流，把教学事件镜像为 Obsidian callout；支持回填、保序、题面先于答案。

### 渲染依赖（lesson-visuals）

`visualize` 技能把图示委派给 maker 子代理在本地渲染 PNG。mermaid 渲染链默认由插件**自带**（见下），SVG 渲染链是系统级依赖——本插件不负责安装。每个 maker 的第一步（提示词的 Step 0）就探测自己的渲染链（冒烟渲染为最终裁决），缺失时返回明确的 `UNAVAILABLE` 报告：缺渲染器指向插件依赖安装方式，缺浏览器给浏览器安装指引；绝不静默失败或返回未验证的图。

#### mermaid 链（结构 / 关系 / 流程图）

**默认供给（vendored）**：插件以 `optionalDependencies` 内嵌 `@mermaid-js/mermaid-cli@^12`——正常安装（`dsh plugin add` 或源码 `pnpm install`）即得 `mmdc`，**无需任何全局安装**。代价是依赖树约 400MB；想跳过：

```sh
# npm 安装方式
dsh plugin --profile desktop add dsh-learn-plugin --no-optional
# 源码安装方式
pnpm install --no-optional
```

跳过后 quiz / lesson-log / teach / SVG 链不受影响。

maker 按序探测 `mmdc`：先 `command -v mmdc`（用户全局安装**优先**，作为可选覆盖——想固定用自己装的版本就 `npm install -g @mermaid-js/mermaid-cli`），再内嵌副本 `<插件根>/node_modules/.bin/mmdc`。

**浏览器供给**：安装期若 puppeteer 的构建脚本被放行，Chromium 随依赖落位（零浏览器要求）；被拦截（pnpm ≥10 默认拦截未白名单构建脚本）则无落位，maker 探测系统 Chrome/Chromium（macOS 应用路径 + Linux 常见路径 + `PATH` 兜底），探测到即写 puppeteer 配置（`executablePath` + `--no-sandbox`）复用系统浏览器渲染，**不下载任何 Chromium**。两类浏览器都不可得时，报告缺浏览器与安装指引（macOS 装 Google Chrome，Linux 装 `chromium` / `google-chrome` 发行版包）。

冒烟测试（源码检出在仓库根执行，任一浏览器供给方式下第 1 条或第 2 条应出 PNG）：

```sh
# 1) 直接渲染——内嵌浏览器已落位时即成功
printf 'graph TD\n  A-->B\n' > .mmdc-smoke.mmd && ./node_modules/.bin/mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png

# 2) 若第 1 条报找不到 chrome-headless-shell / Chrome（无内嵌浏览器），指向系统 Chrome 重试
printf '{\n  "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",\n  "args": ["--no-sandbox"]\n}\n' > .mmdc-puppeteer.json
./node_modules/.bin/mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png -p .mmdc-puppeteer.json
```

（Linux 上把 `executablePath` 换成 `chromium` / `google-chrome` 的实际路径。）

#### SVG 链（几何 / 空间图）

需要 `rsvg-convert`（首选）或 ImageMagick 的 `magick`（回退）：

```sh
brew install librsvg       # 提供 rsvg-convert
brew install imagemagick   # 回退：提供 magick
```

冒烟测试：`command -v rsvg-convert || command -v magick`。

#### 降级行为

- mermaid 链缺失 → mermaid 图示报告不可用并**分流**：缺 `mmdc`（内嵌可选依赖被跳过或安装失败）指向插件依赖安装（含“勿用 `--no-optional` 跳过”的反向说明，全局安装仅为可选覆盖）；缺浏览器给 Chrome/Chromium 安装指引。SVG 图示不受影响（反之亦然）。
- maker 无法验证渲染结果时报告 `UNAVAILABLE` + 缺失的依赖；教学会话随即跳过该图，而不是内嵌未验证的图。

## 卸载

- 卸载插件：`dsh plugin --profile desktop remove dsh-learn-plugin` 并重启 DSH —— quiz 与 lesson-log 同时下线。
- 移除技能：随插件卸载一并下线（teach / visualize 内置于包内）；若只想换掉某个技能，放项目级同名 `.dsh/skills/<name>/` 覆盖即可，不必卸载。
- 删除已发布的图示：清理 `viz/`；课程日志为普通 markdown，直接编辑或删除文件即可，卸载不影响既有日志。

## 许可证

[MIT](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/LICENSE)

## 开发

源码安装、覆盖层调试、行为验证 harness、npm 发布流程等见 [DEVELOPMENT.md](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/DEVELOPMENT.md)。
