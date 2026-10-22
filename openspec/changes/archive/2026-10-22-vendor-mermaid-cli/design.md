# Design

## Context

**原版参考**（[amosblomqvist/learn](https://github.com/amosblomqvist/learn) `extensions/visual-tools`，已核实源码）：`mermaid_tools.ts` 在代码层用 `__dirname` 推导 `MMDC_BIN = <扩展目录>/node_modules/.bin/mmdc`（依赖声明 `@mermaid-js/mermaid-cli: ^11`）；`findChrome()` 探测两个 macOS 应用路径，写临时 puppeteer 配置（`executablePath` + `--no-sandbox`）；渲染时 `PUPPETEER_SKIP_DOWNLOAD=1`。原版缺安装文档且 Linux 无 Chrome 候选——本设计不复制这两点。

**DSH 侧事实**：
- 插件包安装（`link:` / Plugin Manager）的依赖由壳内 pnpm 事务落位；覆盖层通道用本仓库 `node_modules`。
- skills 随包分发，`references/` 模板按"已安装插件包内的资源基址"解析（bundled-skills spec）——父会话读模板时知道该基址；maker 模板是静态 markdown，**没有执行期 `__dirname`**，这是与原版的唯一结构性差异。
- 现有派发已有 `{WORKDIR}` 占位符替换机制（visualize SKILL.md）；maker Step 0 冒烟渲染已存在且是最终裁决。

**沙盒实测**（`tmp/mermaid-render`，mermaid-cli `^12`）：依赖树约 400MB+（mermaid 本体 126MB）；puppeteer 是 peerDependency（`^25`，pnpm ≥8 默认自动安装）；`PUPPETEER_SKIP_DOWNLOAD=1` 时无 Chromium 落盘。

PNG 管线、`.viz-work/` staging、`viz/` 发布与渲染-检查回路不变（见 lesson-visuals 既有 requirements）。

## Goals / Non-Goals

**Goals:**
- 用户侧 mermaid 依赖缩减为"机器上有 Chrome"（若安装期 Chromium 落位则为零）
- 可选依赖失败/被跳过时插件完整可用（mermaid 类图示走既有降级路径）
- 三条安装通道（`link:`、Plugin Manager、覆盖层）行为一致

**Non-Goals:**
- 不引入远程渲染（mermaid.ink / kroki）与替代绘图语言（graphviz / D2）——探索中已评估，留作未来变更
- 不动 svg 链、staging 与发布约定
- 不做 npx 现拉方案（可作为未来探测链的追加层级）

## Decisions

### D1. `optionalDependencies` 而非 `dependencies`
约 400MB 重依赖不应成为插件安装的前置条件；`--no-optional` 或安装失败时其余功能完整，探测链把缺失翻译为 UNAVAILABLE（既有降级 requirement 兜底）。
备选：硬依赖（更简单，但任何安装问题都破坏插件）；peerDependencies（把安装义务推回用户，退化回现状全局安装）。

### D2. `{MMDC_DIR}` 占位符：派发期注入等价原版 `__dirname` 推导
父会话从插件资源基址（读模板处）推导插件安装根，派发时替换 `{MMDC_DIR}`——机制与现有 `{WORKDIR}` 替换完全相同。模板内探测命令引用 `{MMDC_DIR}/node_modules/.bin/mmdc`。
备选：模板写死路径（静态 markdown 不知道安装位置）；maker 自行全盘搜索（慢且不可靠）。

### D3. 探测链与冒烟的两级裁决
- mmdc：`command -v mmdc`（用户显式全局安装优先，尊重用户环境）→ `{MMDC_DIR}/node_modules/.bin/mmdc` → UNAVAILABLE（指向插件依赖安装方式）
- Chrome：候选表（Google Chrome / Chromium 的 macOS 应用路径 + Linux 常见路径）+ `command -v` 兜底；探测到 → 写 puppeteer 配置（`executablePath` + `--no-sandbox`）经 `mmdc -p` 传入
- 冒烟渲染保留为最终裁决（内嵌 mmdc 存在但 peer 缺失等启动失败在冒烟处暴露，归入对应 UNAVAILABLE 分支）

### D4. postinstall 分叉按"双可达"设计，不赌一边
壳内 pnpm 若拦截未白名单构建脚本 → 无 Chromium 落盘，走系统 Chrome 路线；若放行 puppeteer postinstall → Chrome-for-Testing 落位，系统 Chrome 依赖消失（安装重约 170MB）。两种结果都满足 spec（对应"插件自带浏览器" scenario）；验证任务只记录实际分支，不改变设计。

### D5. 版本锁定与文案分流
锁 `^12`（与沙盒实测一致；原版 `^11` 已落后一个大版本）。UNAVAILABLE 文案分两类：缺 mmdc → 指向插件依赖安装（含 `--no-optional` 跳过的反向说明）；缺浏览器 → 给 Chrome/Chromium 安装指引。

## Risks / Trade-offs

- [插件资源基址在三通道下不稳定，`{MMDC_DIR}` 注入失败] → 探测链最后一级加"从模板自身路径反推插件根"的 bash 兜底；三通道各设验证任务
- [pnpm 符号链接 `node_modules` 下 mmdc bin 转发脚本或字体解析异常] → 安装后冒烟渲染验证（任务 1.1）；失败则记录具体报错再议，不预设绕法
- [约 400MB 安装体积劝退] → optional 可跳过 + README 明示体积与取舍；全局安装用户不受影响（探测链第一级）
- [peer puppeteer 在某些 pnpm 配置下未自动安装] → 内嵌 mmdc 启动失败走冒烟失败路径，如实报告 UNAVAILABLE，不额外兜底
- [UNAVAILABLE 文案与既有 spec scenario 措辞漂移] → 验收任务逐 scenario 核对既有 requirement 不回归

## Migration Plan

1. 依赖声明与落位验证（仓库内 `pnpm install` + 冒烟渲染）
2. 模板与 SKILL.md 改造（探测链、占位符、分流文案）
3. README 渲染依赖章节更新
4. 三通道端到端 + 双降级路径验证
5. 回滚：移除 optionalDependencies 与模板/文档改动即回到现状——纯声明与文本变更，无状态迁移

## Open Questions

- 壳内 pnpm 对 postinstall 的实际处理（D4 已按双可达设计，任务 1.2 实测记录，不阻塞）
- Plugin Manager npm/git 通道下 optionalDependencies 的落位细节（任务 4.4 实测，或在不可行时记录为未验证）
