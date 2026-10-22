# Proposal

## Why

mermaid 渲染链是本插件最重的使用门槛:用户机器需要全局安装 `mmdc`（npm + 约 400MB 依赖树）加 Chrome。原版 learn 将 mmdc 内嵌在扩展自己的 `node_modules` 里（vendored，随 `git clone` + `npm install` 就位），迁移到 DSH 时该机制丢失，只留下了文档与降级路径。经探索确认（对照原版 `mermaid_tools.ts` 的 vendored `MMDC_BIN` + `findChrome` 实现，及本仓库 `tmp/mermaid-render` 沙盒实测），DSH 插件安装事务可承载同等方案，能把用户侧 mermaid 依赖缩减到"机器上有 Chrome"一条。

## What Changes

- 插件 `package.json` 以 **`optionalDependencies`** 引入 `@mermaid-js/mermaid-cli`（`^12`）：正常安装即得 mmdc，无需全局安装；安装失败或被跳过时插件其余功能（quiz / lesson-log / teach / svg 链）不受影响。
- `mermaid-maker.md` 模板 Step 0 重构为探测链：
  - mmdc：`command -v mmdc`（用户全局安装优先）→ 插件内嵌 `{MMDC_DIR}/node_modules/.bin/mmdc` → 都没有则 UNAVAILABLE；
  - Chrome：macOS/Linux 固定候选路径 + `command -v` 探测；探测到则写 puppeteer 配置复用系统浏览器（`--no-sandbox`，语义同原版 `PUPPETEER_SKIP_DOWNLOAD=1`——不下载 Chromium）；冒烟渲染保留为最终检查。
- 模板新增 `{MMDC_DIR}` 占位符，`visualize` SKILL.md 派发说明同步更新（父会话在派发时替换，机制同现有 `{WORKDIR}`）。
- UNAVAILABLE 报告分流：缺 mmdc（指向插件安装/可选依赖问题）与缺 Chrome（系统依赖，给浏览器安装指引）分开报告。
- README 渲染依赖章节更新：全局安装从"必选"降为"可选覆盖"，vendored 成为默认。
- 三条安装通道（`link:`、Plugin Manager、覆盖层）下的依赖落位与渲染冒烟验证。

## Capabilities

### New Capabilities

（无 —— 本变更不引入新能力边界，渲染链供给属于既有 lesson-visuals 能力）

### Modified Capabilities

- `lesson-visuals`: 渲染链供给方式变更 —— mermaid 渲染器 SHALL 由插件内嵌提供并按序探测（用户全局安装优先，内嵌兜底），用户侧系统依赖缩减为 Chrome；降级报告 SHALL 按缺 mmdc 与缺 Chrome 分流。

## Impact

- **资产/代码**：`package.json`（新增 optional 依赖）、`skills/visualize/SKILL.md`（派发说明）、`skills/visualize/references/mermaid-maker.md`（Step 0 探测链、`{MMDC_DIR}` 占位符）、`README.md`（渲染依赖章节）。
- **依赖**：新增 `@mermaid-js/mermaid-cli@^12`（optional），连带其 peer `puppeteer`（pnpm ≥8 默认自动安装）；puppeteer 的 postinstall 是否执行（即是否下载 Chrome-for-Testing）取决于壳内 pnpm 的脚本策略——两种结果均导向可用状态（拦截 → 复用系统 Chrome；放行 → 自带 Chromium，连 Chrome 依赖也消失），详见 design。
- **不影响**：quiz、lesson-log、svg 渲染链、teaching 行为契约；`.viz-work/` staging 与 `viz/` 发布约定不变。
