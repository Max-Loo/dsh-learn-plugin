# Verification Log — vendor-mermaid-cli

实施与核验过程的实测记录（供 tasks 5.1 逐 Scenario 核验引用；归档时可随 change 一并处理）。

## 1.1 依赖声明与落位（2026-10-21）

- `package.json` 增 `optionalDependencies: { "@mermaid-js/mermaid-cli": "^12" }`。
- 仓库根 `pnpm install`（pnpm 12.6.0 / node v24.16.0）成功；实际解析 `@mermaid-js/mermaid-cli@12.0.0`，连带 peer `puppeteer@25.15.0` 自动安装（pnpm ≥8 行为）。
- `node_modules/.bin/mmdc` 落位，`mmdc --version` → `12.0.0`。
- 冒烟渲染（pnpm 符号链接结构下）：直接 `mmdc -i smoke.mmd -o smoke.png` 因无可用浏览器失败（见 1.2）；按探测链写 puppeteer 配置（系统 Chrome + `--no-sandbox`，`mmdc -p` 传入）后渲染成功，产出有效 PNG（`file` 确认 `PNG image data, 168 x 146, 8-bit/color RGB, non-interlaced`）。

## 1.2 postinstall 分叉实际结果（2026-10-21）

- **实际分支：拦截（未落位 Chromium）。** pnpm 12.6.0 安装输出：`Ignored build scripts: puppeteer@25.15.0`（需 `pnpm approve-builds` 才放行，未放行）→ puppeteer postinstall 未执行，Chrome-for-Testing / chrome-headless-shell 155.0.8059.84 **未随安装落位**。
- `~/.cache/puppeteer` 仅有历史版本 `mac_arm-146.0.7680.153` / `mac_arm-152.0.7977.54`，puppeteer 25.15.0 需 155，版本不匹配不可用 ⇒ 当前机器等效于"无内嵌浏览器"。
- 未落位分支验证：写 puppeteer 配置 `{ "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "args": ["--no-sandbox"] }` 后渲染可用（同 1.1 冒烟成功）。不写 `executablePath` 直接渲染确认失败（`Could not find chrome-headless-shell (ver. 155.0.8059.84)`）。
- "插件自带浏览器"分支在本机仓库根安装下不成立（postinstall 被拦截）；该 scenario 的可达性依赖 DSH 壳内 pnpm 事务是否放行构建脚本，属通道实测范围（见 §4 记录）。

## 2.1 模板探测链改造（2026-10-21）

- `mermaid-maker.md` Step 0 重构为：mmdc 两级探测（`command -v mmdc` → `{MMDC_DIR}/node_modules/.bin/mmdc`，字面 `{MMDC_DIR}` 视为"内嵌副本不存在"）→ 第一次冒烟（无配置，内嵌浏览器首选）→ 失败于浏览器错误时 Chrome 候选表（3 个 macOS 应用路径 + 5 个 Linux 常见路径）+ `command -v` 四名兜底 → 写 puppeteer 配置（`executablePath` + `--no-sandbox`）→ 带配置重试。冒烟渲染标注为最终裁决；成功方式（带/不带 `-p`）延续到后续每次渲染。UNAVAILABLE 文案两分支：缺 mmdc 指向插件依赖安装（明确"全局安装可用但非必需"），缺浏览器给 Chrome/Chromium 安装指引。
- 模板探测脚本在本机（拦截分支：无内嵌浏览器 + 有系统 Chrome）原样跑通：全局 mmdc 缺失 → 内嵌副本命中 → 首次冒烟浏览器报错 → 候选表命中 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` → 写配置重试 `CHAIN-OK`，出有效 PNG（168×146）。

## 2.2 SKILL.md 派发说明（2026-10-21）

- `Invoke` 一节改为占位符表：`{BRIEF}`（两 maker）、`{WORKDIR}`（两 maker）、`{MMDC_DIR}`（仅 mermaid-maker）各列替换来源；附 `{MMDC_DIR}` 推导说明（技能 resourceBase `<plugin-root>/skills/visualize/` 上溯两级）与两级兜底（基址不可得 → 由模板文件自身路径剥 `skills/visualize/references/mermaid-maker.md` 反推；再不可得 → 保留字面量，maker 按内嵌缺失处理）。尾部系统二进制注记同步为 vendored 供给 + 两级探测 + 分流语义。

## 2.3 harness 核对（2026-10-22）

- `test/skills-harness.ts` 对模板的断言仅为"文件存在于 resourceBase 下且非空"（`REFERENCES` 表 + `readFileSync(...).length > 0`）；SKILL.md 断言实时读文件比对，自动与新内容一致。**无需改，保留原断言。**
- 全量跑通：`DSH_HOME=~/.dsh dsh web --patch ./test/skills-harness.cordis.yml --no-open --port 0` → `SKILLS HARNESS RESULT: 22/22 passed`。

## 3.1 README 渲染依赖章节（2026-10-22）

- 改写为：vendored 默认供给（`optionalDependencies` 内嵌 `^12`，无需全局安装）+ 约 400MB 体积与 `--no-optional` 跳过方式 + mmdc 两级探测（全局安装为可选覆盖）+ 浏览器双供给（构建脚本放行 → 自带 Chromium；拦截 → 系统 Chrome 候选与 puppeteer 配置复用，不下载）+ 降级行为按缺渲染器/缺浏览器分流；删除旧的手动 `PUPPETEER_SKIP_DOWNLOAD` 替代方案段；安装一节注释同步。
- 冒烟命令照抄验证（仓库根）：第 1 条（直接渲染）在本机按预期失败于浏览器分支（exit 1，报缺 chrome-headless-shell）；第 2 条（指向系统 Chrome + `-p`）成功出 PNG（exit 0，`PNG image data, 168 x 146`）；产物已清理。

## 4.1 link: 通道端到端（2026-10-22）

- 通道确认：`dsh plugin --profile web add link:.`（pnpm 事务确认 `dsh-learn-plugin link:<本仓库>`）；`node_modules/dsh-learn-plugin` → 本仓库 symlink，经插件根 `node_modules/.bin/mmdc` → 12.0.0 可达；`dsh web`（web profile）加载日志 `[dsh-learn-plugin] plugin loaded` + `bundled skills registered: teach, visualize`。
- 派发 mermaid maker（按 SKILL.md 机制：模板 + `{BRIEF}`/`{WORKDIR}`=`/tmp/viz-e2e-link`/`{MMDC_DIR}`=本仓库根）：探测链内嵌 mmdc 命中 → 首次冒烟浏览器错误 → 系统 Chrome 候选命中 → 写 `.mmdc-puppeteer.json` 后 `CHAIN-OK`；渲染-检查-发布回路完成，`viz/viz-render-chain-20261022-083936.png`（360×273 有效 PNG，`file` 核验），`.viz-work/` 留 scratch。
- read_image 环境限制：会话模型（glm-5.3）不支持图像输入，maker 以结构化验证替代视觉检查（SVG 孪生解析节点标签/位置/箭头方向 + 发布文件与已验证渲染字节/SHA 一致）。属验证手段的环境限制，如实记录。

## 4.2 覆盖层通道端到端（2026-10-22）

- 通道确认：`dsh web --patch ./cordis.dev.yml --no-open --port 0` 加载日志同 4.1（插件经 dist/lib 绝对路径插入，依赖用本仓库 node_modules）。
- 同上派发一次（`{WORKDIR}`=`/tmp/viz-e2e-overlay`）：产出 `viz/viz-mmdc-supply-chain-20261022-084107.png`（552×209 有效 PNG）；渲染链、发布路径（`viz/` 唯一命名）、RESULT 回复格式与 4.1 完全一致；read_image 限制与 4.1 同，以 SVG DOM + 像素级结构验证替代。

## 4.4 Plugin Manager（npm-tgz）通道（2026-10-22）

- `pnpm run pack` 产出 `dist/dsh-learn-plugin-0.1.0.tgz`，包内 `package.json` 含 `optionalDependencies: {"@mermaid-js/mermaid-cli": "^12"}`，`skills/visualize/*` 为改造后模板。
- headless profile `dsh plugin --profile headless add <tgz>` 实测：mermaid-cli 及 bin 落位（profile 根 `node_modules/.bin/mmdc`），但 **(a)** 插件包内无自己的 `node_modules`（pnpm 隔离提升）⇒ `{MMDC_DIR}/node_modules/.bin/mmdc` 探测不命中；**(b)** mermaid-cli 的 peer `puppeteer` 未随传递依赖自动安装（pnpm `auto-install-peers` 仅覆盖根项目直接依赖的 peer）⇒ 直接调用该 bin 报 `ERR_MODULE_NOT_FOUND: puppeteer`。
- 行为归宿（模拟 maker 探测链实测）：两级探测皆空 → UNAVAILABLE **缺渲染器**分支（指向插件依赖安装）——恰为 spec"可选依赖被跳过"scenario 的规定行为；peer 缺失仅限 mermaid-cli 子树，插件其余功能与 SVG 链不受影响。
- **端到端出图在此通道不可行，原因如上（记录，不算失败）**；git 来源未实测（无远端仓库可引用；其安装事务与 npm-tgz 同为 pnpm add 机制）。可能的后续变更方向（超出本变更范围）：显式声明 `puppeteer` 为 optionalDependency、探测链追加"插件根上溯至宿主 node_modules/.bin"层级。

## 4.3 双降级路径（2026-10-22）

**a) 缺 mmdc（可选依赖被跳过）**
- 第一轮（仅移走 `node_modules/.bin/mmdc`，包本体保留）暴露真实绕过风险：maker 子代理自行定位 `node_modules/@mermaid-js/mermaid-cli` 包本体并以 `node src/cli.js` 直驱渲染成功——违反模板"do NOT try workarounds"但未触发 UNAVAILABLE。教训：(i) 该中间态不真实（`--no-optional` 时整个包不存在）；(ii) 强模型会主动绕过探测失败，模板需写明禁止翻包。**模板加固**：Step 0 探测段追加"do not dig into `node_modules` beyond these two probe levels … a probe miss IS the unavailable answer"（两级探测/两类文案/冒烟裁决结构不变）。
- 第二轮（移走 `node_modules/@mermaid-js` 整包 + bin，等价 `--no-optional`；prompt 的 `{MMDC_DIR}` 保留字面量，顺带覆盖注入失败兜底）：maker 严格返回 `RESULT: UNAVAILABLE` + `mmdc not found — the plugin's optional dependency @mermaid-js/mermaid-cli did not install; reinstall the plugin without skipping optional dependencies (a global npm install also works but is not required)`——两级探测落空、明确"no workaround attempted per instructions"、未产出任何文件。与 spec"可选依赖被跳过"scenario 对应。
- SVG 链隔离实证：同窗口期并行派发 svg maker（rsvg-convert 链），正常出图 `viz/viz-right-triangle-3-4-20261022-084409.png`（像素级几何验证）——mermaid 降级不影响 SVG。
- quiz / lesson-log 不受影响：渲染链为 mermaid 子树专用（optionalDependencies 仅引入 mermaid-cli；插件本体加载与技能注册在 4.1/4.2 加载日志和 harness 22/22 中均正常）。

**b) 缺浏览器（mmdc 在、两类浏览器皆无）**
- 受控模拟（未真实移走系统 Chrome，如实记录方式）：Chrome 候选表替换为不存在路径 + `PATH=/usr/bin:/bin`（无浏览器命令）跑模板探测链——第一次冒烟真实失败（`Could not find chrome-headless-shell (ver. 155.0.8059.84)`，本机无内嵌浏览器），Chrome 探测 `CHROME=<empty>`，配置回退被跳过，无任何 CHAIN-OK → 归入 UNAVAILABLE **缺浏览器**分支，文案即模板例句（安装 Google Chrome / chromium 指引）。与 spec"无系统浏览器且无内嵌浏览器"scenario 对应；SVG 不受影响同 a) 实证。

## 5.1 逐 Scenario 核验（2026-10-22）

**本变更 spec delta：**

| Scenario | 佐证 |
|---|---|
| 全新机器免全局安装 | 4.1 / 4.2 端到端：本机无全局 mmdc，内嵌 mmdc + 系统 Chrome 渲染发布成功，全程无 npm 全局安装（本机有系统 Chrome，scenario 判定点"免全局安装"成立） |
| 用户全局安装优先 | shim 实测：PATH 前置全局 mmdc，探测链第一级命中全局副本（内嵌不启用） |
| 可选依赖被跳过 | 4.3a 第二轮（UNAVAILABLE 缺渲染器文案指向插件依赖安装）+ 4.4 npm 通道（peer 缺失同分支）；quiz/lesson-log/SVG 不受影响（4.3a svg 出图 + 加载日志 + harness 22/22） |
| 系统 Chrome 复用 | 4.1 / 4.2：`executablePath` 指向系统 Chrome + `--no-sandbox` 完成渲染；全程无 Chromium 下载（postinstall 拦截、缓存无 155 版本） |
| 无系统浏览器且无内嵌浏览器 | 4.3b 受控模拟：探测全空 → 缺浏览器分支文案（安装指引）；SVG 不受影响 |
| 插件自带浏览器 | 手动执行 puppeteer `install.mjs`（等价放行 postinstall）→ Chromium 155 落位 → **不写 `executablePath` 直接渲染成功**（无配置时 puppeteer 只用自带缓存浏览器，不依赖系统 Chrome）；实测后已删缓存恢复基线 |

**既有 lesson-visuals requirements 无回归：** 按需判定、委派机制、模型随会话、工具范围由模板约束、渲染-检查回路、唯一命名发布、课程内嵌、渲染依赖降级——承载结构（SKILL.md 委派流程、模板工作流与 RESULT 格式、`viz/` 发布约定、降级报告框架）均未触动；实测佐证：4.1/4.2 唯一命名发布与 RESULT 格式、4.3a/b 降级报告行为、harness 22/22（bundled-skills 契约）。已知环境限制：本会话模型无图像输入，maker 的"实际查看"以结构化验证（SVG 孪生解析 + 像素/字节校验）替代并如实报告——模型能力限制而非本变更引入，模板的查看约束保留（图像能力模型下恢复完整视觉验证）。

**npm 通道（4.4）补充 scenario 佐证：** "可选依赖被跳过"在 npm-tgz 通道的实测形态为"探测两级皆空（bin 提升至宿主根 + peer 缺失致启动失败）→ UNAVAILABLE 缺渲染器分支"，行为与 spec 一致；端到端出图不可行的原因与可能的后续变更方向见 §4.4。
