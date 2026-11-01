# Proposal

## Why

与原参考项目 `amosblomqvist/learn` 的一致性审计发现：迁移时 maker 子代理提示词模板的渲染命令行丢失了原版的 2x 渲染参数——原版 mermaid 链渲染带 `-s 2 -b white`（2 倍缩放、白底），SVG 链带 `rsvg-convert -z 2`（或 `magick -density 192 -background white`）；当前 [skills/visualize/references/mermaid-maker.md](../../../skills/visualize/references/mermaid-maker.md) 与 [svg-maker.md](../../../skills/visualize/references/svg-maker.md) 的渲染命令均为裸命令。结果是发布的 PNG 只有 1x 分辨率，嵌入 DSH 聊天与课程日志后文字与线条明显低于原版设计的清晰度。该退化未见于任何 openspec 变更文档，属静默丢失，应在规格层面补回并固化，防止后续演进再次丢失。

## What Changes

- mermaid-maker 模板中所有渲染调用（Step 0 冒烟测试、工作流预览、发布后的渲染命令说明）统一补回 `-s 2 -b white` 参数。
- svg-maker 模板的渲染命令补回缩放参数：`rsvg-convert -z 2`、`magick -density 192 -background white`。
- `lesson-visuals` 规格新增"渲染输出分辨率"Requirement：maker 发布的 PNG SHALL 以约 2 倍缩放渲染并使用白色（不透明）背景，使图示在嵌入显示尺寸下文字清晰。
- README 中 mermaid 冒烟测试示例命令同步带上渲染参数，保持文档与模板一致（冒烟测试仅验证链可用性，参数不影响其判定，仅示例一致性）。

不改变：渲染链探测顺序、UNAVAILABLE 降级协议、发布命名（`viz-<slug>-<时间戳>.png`）、渲染-检查回路、课程内嵌方式。无 `src/` 代码变更。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `lesson-visuals`: 新增 Requirement「渲染输出分辨率」——maker 渲染的 PNG SHALL 以约 2x 缩放渲染（mermaid `-s 2`；SVG `rsvg-convert -z 2` / `magick -density 192`）且使用白色不透明背景（mermaid `-b white`；magick `-background white`），保证嵌入后的可读性。其余 Requirement 不变。

## Impact

- `skills/visualize/references/mermaid-maker.md` — Step 0 冒烟渲染两处命令、工作流第 3 步预览命令补 `-s 2 -b white`。
- `skills/visualize/references/svg-maker.md` — Step 0 后的渲染命令说明补 `-z 2`（rsvg-convert）与 `-density 192 -background white`（magick）。
- `README.md` — mermaid 冒烟测试两条例子命令同步。
- `openspec/specs/lesson-visuals/spec.md` — 归档时合入新 Requirement。
- 副作用：发布 PNG 的像素尺寸约增至 4 倍（文件体积相应增大），嵌入显示尺寸不变；对 Obsidian / DSH 聊天的 markdown 渲染无兼容性影响。
- 依赖不变：`@mermaid-js/mermaid-cli`（optionalDependencies）、`rsvg-convert` / `magick` 系统二进制的版本要求不变——`-s`、`-b`、`-z`、`-density` 均为既有 CLI 参数。
