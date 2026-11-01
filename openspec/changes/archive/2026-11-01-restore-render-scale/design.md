# Design

## Context

渲染命令行位于两个 maker 提示词模板（`skills/visualize/references/mermaid-maker.md`、`svg-maker.md`），由 maker 子代理在运行时逐字执行；插件本身无渲染代码（`src/` 不涉及）。原参考项目 learn 的对应实现在 `extensions/visual-tools/tools/mermaid_tools.ts`（`mmdc … -s 2 -b white`）与 `svg_tools.ts`（`rsvg-convert -z 2` / `magick -density 192 -background white`）。见 proposal.md 的动机。

## Goals / Non-Goals

**Goals:**

- 发布的 PNG 恢复与原版一致的 2x 缩放与白色不透明背景，嵌入聊天/日志后清晰可读。
- 模板内所有渲染调用点（冒烟、预览、发布说明、README 示例）参数一致，消除"冒烟验证的链 ≠ 正式渲染的链"的缝隙。

**Non-Goals:**

- 不引入可配置的缩放倍数/背景色（无需求，YAGNI）。
- 不回填处理 `viz/` 下已发布的历史 1x PNG（生成产物，重开课重新生成即可）。
- 不改 `src/` 代码、渲染链探测顺序与 UNAVAILABLE 协议。

## Decisions

### D1 — 参数逐字补在模板命令行上，与原版 learn 逐参数对齐

mermaid 渲染统一为 `"$MMDC" -i <src>.mmd -o <out>.png -s 2 -b white`（需要系统浏览器配置时追加 `-p .mmdc-puppeteer.json`）；SVG 渲染为 `rsvg-convert -z 2 -o <out>.png <src>.svg`，回退 `magick -density 192 -background white <src>.svg <out>.png`。
**备选**：定义 `$RENDER_ARGS` 变量复用——拒绝：模板是给子代理照抄的 bash 指令，变量间接增加抄错面；逐字写全与原版实现一一对应，审计更容易。

### D2 — 冒烟测试与正式渲染带同一套参数（含系统浏览器重试分支）

mermaid-maker Step 0 的两次冒烟渲染（首次尝试、指向系统 Chrome 的重试）都补 `-s 2 -b white`。
**备选**：冒烟保持裸命令以最小化链探测变量——拒绝：spec 要求冒烟与正式渲染一致；且冒烟的意义就是裁决"正式渲染要用的那条命令"能否出图，参数不同则裁决失真。

### D3 — svg-maker 在"选定二进制"处连同缩放参数一并说明

svg-maker Step 0 现有"When rendering later, use whichever binary answered"一句，改为直接给出两条带参命令（`rsvg-convert -z 2 …` / `magick -density 192 -background white …`），工作流第 3 步的渲染说明同步引用。maker 之后每次渲染照抄即可，无需自行拼接参数。

### D4 — README 冒烟示例同步带参，文档其余不动

README「mermaid 链」的两条冒烟命令补 `-s 2 -b white`。冒烟只看是否出 PNG，参数不影响判定，但文档示例与模板不一致会误导排障者。SVG 链冒烟（`command -v`）与参数无关，不动。

## Risks / Trade-offs

- [PNG 像素约 4 倍、文件体积增大] → 接受：这正是清晰度目标的代价；显示尺寸由查看器决定，不受文件像素影响。
- [用户全局安装的旧版 mmdc 对 `-s`/`-b` 的兼容性] → 风险可忽略：两参数自 mermaid-cli 早期即存在，vendored `^12` 覆盖；若个别版本报错，maker 走既有的 render-error 报告路径，不会静默失败。
- [`-b white` / `-background white` 对自带背景的图源] → 无害：仅影响透明像素的合成底色。
- [模板改动后已安装插件不自动更新] → 与既有发布流程一致：需要重新 `dsh plugin add` / 升级版本；技能为静态包资产，无热更新预期。

## Migration Plan

无需数据迁移。发布新版插件即生效；回滚 = 还原两个模板的命令行文字，无状态残留。
