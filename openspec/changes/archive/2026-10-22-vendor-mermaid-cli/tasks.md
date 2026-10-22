# Tasks

## 1. 依赖声明与落位

- [x] 1.1 `package.json` 增 `optionalDependencies`: `"@mermaid-js/mermaid-cli": "^12"`，仓库根 `pnpm install`；验证 `node_modules/.bin/mmdc` 落位，且在 pnpm 符号链接结构下冒烟渲染成功（`printf 'graph TD\n  A-->B\n' > smoke.mmd && mmdc -i smoke.mmd -o smoke.png` 出 PNG）
- [x] 1.2 记录 postinstall 分叉实际结果：puppeteer 的 Chromium 是否随安装落位（查其缓存/安装输出）；若落位，验证不写 `executablePath` 直接渲染也可用（"插件自带浏览器"路径）；若未落位，验证写 puppeteer 配置指向系统 Chrome 后渲染可用

## 2. maker 模板与派发说明

- [x] 2.1 `skills/visualize/references/mermaid-maker.md` Step 0 改造：mmdc 两级探测（`command -v mmdc` → `{MMDC_DIR}/node_modules/.bin/mmdc`）、Chrome 候选表（macOS 应用路径 + Linux 常见路径 + `command -v` 兜底）、探测到即写 puppeteer 配置（`executablePath` + `--no-sandbox`）、UNAVAILABLE 文案按缺 mmdc / 缺浏览器分流；验证：模板含两级探测与两类文案，冒烟渲染步骤保留为最终裁决
- [x] 2.2 `skills/visualize/SKILL.md` 派发说明更新：新增 `{MMDC_DIR}` 占位符（父会话从插件资源基址推导插件安装根后替换，机制同 `{WORKDIR}`），并写明兜底（基址不可得时由模板路径反推）；验证：派发说明同时列出 `{BRIEF}` / `{WORKDIR}` / `{MMDC_DIR}` 三个占位符及各自替换来源
- [x] 2.3 核对 `test/skills-harness.ts` 对模板的断言是否需要同步；验证：harness 全部跑通，若断言仅覆盖文件存在性则记录"无需改"并保留原断言

## 3. 文档

- [x] 3.1 `README.md` 渲染依赖章节改写：vendored 为默认供给、全局安装降为可选覆盖、Chrome 候选与降级行为、约 400MB 体积说明与 `--no-optional` 跳过方式；验证：README 中列出的安装与冒烟命令逐条照抄可执行成功

## 4. 通道与降级端到端

- [x] 4.1 `link:` 通道端到端：重新安装（或刷新）插件后派发一次 mermaid maker（渲染 → `read_image` 检查 → 发布 `viz/` → 内嵌回复）；验证：`viz/` 下出现唯一命名 PNG 且为验证过的图
- [x] 4.2 覆盖层通道端到端（`dsh web --patch ./cordis.dev.yml` 同环境）：同上派发一次；验证：产出路径与内嵌行为与 4.1 一致
- [x] 4.3 双降级路径实测：a) 以 `--no-optional` 重装（或临时移走内嵌 bin）→ mermaid maker 返回 UNAVAILABLE 且文案指向插件依赖安装，svg maker 出图不受影响；b) 隔离系统 Chrome 且无内嵌浏览器 → UNAVAILABLE 给出浏览器安装指引；验证：两条路径的报告文案与 spec scenario 对应
- [x] 4.4 Plugin Manager 通道（npm/git 安装）实测 optionalDependencies 落位与端到端出图；不可行则记录未验证的具体原因，不算失败

## 5. 验收

- [x] 5.1 对照本变更 spec delta 逐 Scenario 核验（含"用户全局安装优先""可选依赖被跳过""插件自带浏览器"），并核对既有 lesson-visuals requirements 无回归；验证：每个 scenario 有对应的实测记录或既有 harness 断言支撑

## Workflow follow-up

- 实现完成并经核验（`/openspec-verify-change` 或人工复核）后归档本变更。
- 归档时 spec delta 合入主 spec（`openspec archive` 流程处理）。
