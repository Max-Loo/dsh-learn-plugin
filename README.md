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

- DSH 桌面版（`engines.dsh: "0.2.x"`，在 0.2.1-rc.5 上验证）。

> 插件 peerDependencies 允许 `0.2.x` 范围（与 `engines.dsh` 一致）：0.2.x 系列内的补丁运行时可正常安装使用，升级后建议按 [DEVELOPMENT.md](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/DEVELOPMENT.md) 跑一遍验证 harness；仅在更早的 dsh 运行时（0.2 系列之前，如 0.1.x）上会被禁用，需 `dsh plugin allow-version "dsh-learn-plugin@<ver>" --dsh-version <runtime> --accept-risk --profile <profile>` 显式豁免。

## 安装

```sh
dsh plugin --profile desktop add dsh-learn-plugin
```

重启 DSH 后 `teach` / `visualize` 出现在会话技能目录即安装成功（插件的加载与注册日志——`[dsh-learn-plugin] plugin loaded`、`[dsh-learn-plugin] bundled skills registered: teach, visualize`——统一走 DSH 日志系统，不打印到终端 stdout）。从源码安装（开发迭代）的方式见 [DEVELOPMENT.md](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/DEVELOPMENT.md)。

## 使用

### 内置技能（teach / visualize）—— 安装即得

无需任何项目级文件：`teach` / `visualize` 已内置于本包（`skills/` 目录随发布包分发，经 `ctx.skills` 技能注册表注册），安装插件并重启 DSH 后，两个技能自动出现在会话技能目录中，对模型与用户两面均可调用（`/teach`、`/visualize` 可直接加载正文）。

- 正文中的 `references/` 提示词模板按各自技能在已安装插件包内的资源基址解析，在任何装了插件的项目里都可读取，不依赖目标项目或用户目录中存在对应文件。
- **项目级覆盖**：想定制就在目标项目放同名技能 `.dsh/skills/teach/`（或 `visualize/`）——项目级技能 rank（100）优先于内置副本 rank（600），加载的即是项目副本；删除项目级副本后，会话刷新技能目录即自动回落到内置副本，无需重装插件。

### quiz 评分问答

`quiz` 工具随插件出现在模型工具列表：主会话出题、作答、即时反馈。支持选项校验、乱序、IDK、多选判分；纯展示投影防答案泄漏，子代理拒绝出题。**跳过不算答错**：面板上未选任何选项、未填自定义文本直接提交，判定走"未作答"通道（`dontKnow` + `skipped` 标记）——界面无 ✗、仅以 ✓ 揭示正确答案并显示解析，代理收到的反馈也会注明 skipped，与"猜错"和"I don't know"都区分开。

### lesson-log 课程日志

- `/lesson-log <已有 markdown 文件>` 链接课程日志，`/lesson-unlog` 解除。
- 订阅 `session/event` 流，把教学事件镜像为 Obsidian callout；支持回填、保序、题面先于答案。
- **目标约束**：只接受已存在的 `.md` 文件（其他扩展名一律拒绝，目标不会被读写）；文件必须已存在——从不创建文件。
- **工作区外路径需确认**：模型经 `lesson_log` 工具链接**会话工作目录之外**的路径时，会先向你发起一个是/否确认提问（无回答 UI 时该调用直接失败并提示改用命令）；你亲手运行 `/lesson-log` 命令链接任意路径即视为已确认，不再重复询问。
- **可靠追加**：镜像以追加语义写入（既有内容不重写、不截断）；写入失败时镜像水位不推进、失败块按序排队重试，连续 3 次失败会向会话报告错误，文件恢复可写后自动按序补齐——不会静默丢块。
- **重启恢复不重复**：镜像水位持久化在存储域中，会话重启/恢复后以水位为界继续镜像——即使平台重放历史事件，已镜像内容也不会重复写入；重启前已出题、重启后完成的 quiz/提问判定块也会自动补齐，不留悬空题面。恢复注记（"lesson-log restored"）对同一链接**至多写入一次**（持久化标志），反复重启不再往日志里堆注记。
- **链接建立不丢事件**：链接日志的瞬间（历史回填尚未读完时）到达的实时消息会先暂存，链接生效后按发生顺序补进日志——窗口期不丢块、也不触发伪恢复注记。
- **解除后重链同一文件不重复回填**：`/lesson-unlog` 会把该链接的水位搬入 `unlinked` 表保存；再次把**同一个文件**链接为课程日志时从既有水位续传（历史不重复回填），重链**不同**文件则照常全量回填。
- **编辑器竞态提示**：镜像期间请避免在 Obsidian 等编辑器中"全文保存回写"该日志文件——编辑器的全文保存可能覆盖插件刚追加的行（追加与外部全文回写之间的竞态不做代码级仲裁）。

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
printf 'graph TD\n  A-->B\n' > .mmdc-smoke.mmd && ./node_modules/.bin/mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png -s 2 -b white

# 2) 若第 1 条报找不到 chrome-headless-shell / Chrome（无内嵌浏览器），指向系统 Chrome 重试
printf '{\n  "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",\n  "args": ["--no-sandbox"]\n}\n' > .mmdc-puppeteer.json
./node_modules/.bin/mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png -s 2 -b white -p .mmdc-puppeteer.json
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
- 课程日志的链接记录存储在 `<DSH_HOME>/storages/learn_dsh_lesson_log_v2.json`；卸载插件不影响日志文件本身。

### 存储域版本与回滚

课程日志的链接记录经历了一次 schema 升级（v1 `learn_dsh_lesson_log` → v2 `learn_dsh_lesson_log_v2`，新增镜像水位 `lastSeq`）：

- 升级为含 v2 域的插件版本后，首次启动会把 v1 单元里的链接记录搬移到 v2 域（v1 记录没有水位，恢复时按该会话持久化事件的最大 seq 回填初始水位——宁可跳过上一轮末尾可能缺失的块，也不冒整段重复的风险）；**v1 存储文件保留不删除**。
- 回滚到旧版插件：旧版按保留的 v1 存储继续工作（无水位，行为与升级前完全一致）；升级期间 v2 域写入的新水位在回滚后丢失，属预期。
- v2 域的数据也可直接删除（`<DSH_HOME>/storages/learn_dsh_lesson_log_v2.json`），下次启动会从 v1 存储重新搬移（水位回填为当前最大 seq）。
- v2 域内后续演进（均在 version 2 内，无迁移）：链接记录新增可选字段 `restoredNotedAt`（恢复注记一次性标志）；新增 `unlinked` 表（`sessionId → {file, lastSeq, unlinkedAt}`，解除链接时保存水位供重链续传）。旧记录没有新字段时按默认语义处理，行为不变。**回滚到不含这些特性的旧版插件同样安全**：旧版不读 `restoredNotedAt`（注记退回"每次恢复都写"的旧行为），也看不见 `unlinked` 表（已解链会话不会被误当有效链接恢复，重链走全量回填），残留数据仅每会话数十字节。

## 许可证

[MIT](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/LICENSE)

## 开发

源码安装、覆盖层调试、行为验证 harness、npm 发布流程等见 [DEVELOPMENT.md](https://github.com/Max-Loo/dsh-learn-plugin/blob/main/DEVELOPMENT.md)。
