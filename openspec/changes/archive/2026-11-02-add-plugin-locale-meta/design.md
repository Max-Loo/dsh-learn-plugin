# Design

## Context

当前 `package.json` 已导出 `.`（条件导出含 types/default）、`./client`、`./package.json`，`files` 含 `dist/lib`、`client`、`skills`、`cordis.patch.yml`、`README.md`；仓库无 `locale/` 目录。包为单一包根插件（`src/index.ts`，`name: 'dsh-learn-plugin'`），无子路径插件。官方机制下，宿主经 Node 包导出规则解析 `<包名>/locale/en.json` 作为发现入口、按 locale 语言链读取 `<包名>/locale/<lang>.json`，字段回退读 `<包名>/package.json`；官方校验脚本 `verify-package-meta` 运行在 DSH 宿主仓库根目录，本插件仓库无法直接运行。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals:**

- 提供官方规范合规的中英文 `meta.title` / `meta.description`，两语言文案齐备且语义一致。
- 最小增量：两个 JSON 文件、`package.json` 两处条目、一个静态校验脚本、文档补充；不触碰 `src/` 与 `client/`。
- 校验零环境依赖：任何机器 `node test/meta-check.mjs` 即可跑，不需要 DSH_HOME / harness overlay。

**Non-Goals:**

- 图标（清单 `icon` 字段或 `./icon` 导出）——官方规范中可选，另行提案。
- 子路径插件的 locale / icon 暴露——本包不存在子路径插件。
- 宿主端行为（语言链回退、设置页短名格式化、Install 界面 registry 信息）——宿主实现承载。
- 修改 `package.json.description`（npm registry 元数据，Install 界面显示它，保持英文原样）；locale 文案独立成文。
- 版本号与发布节奏——沿用既有 `npm version patch` → `npm publish` 流程，不在本变更内发布。

## Decisions

1. **校验形态：纯 Node 静态脚本 `test/meta-check.mjs`，不进 cordis harness 体系。**
   元信息是纯静态包数据（JSON + 清单条目），无需插件加载与 DSH 运行时；现有 harness（quiz / log / skills）都需 `dsh web --patch` 启动开销与 DSH 环境。备选方案：并入 `skills-harness`（否——混入无关运行时依赖，且 harness 无法覆盖 `pnpm pack` 产物检查）；依赖宿主 `verify-package-meta`（否——宿主仓库脚本，本仓不可执行）。脚本结构：导出无副作用的检查函数（接受包根路径，返回失败项列表）+ CLI 入口（校验真实仓库根，非零退出报全部失败项）——"拦截违规"场景用临时目录副本调用检查函数验证，不污染真实文件。
2. **exports 合并：追加 `"./locale/*.json": "./locale/*.json"`，`./package.json` 已存在不重复加。**
   按官方文档字面使用通配模式（Node exports 模式匹配）；`./package.json` 既有条目恰好满足"需要包字段回退时开放 package.json"的要求。合并只增不改：`.` 的条件导出形状与 `./client` 原样保留，静态校验锁定这四个条目的存在。
3. **files 追加 `"locale/*.json"`（非 `locale` 整目录）。**
   与官方文档条目一致，明确发布物仅为语言 JSON；`pnpm pack --dry-run` 作为产物覆盖的自动化验收。
4. **文案内容：两语言齐备、语义对应包的真实能力。**
   候选措辞——en：title `Learn Tools`，description 围绕 graded quizzes / lesson-log mirror / bundled teach & visualize skills；zh：title `学习工具`，description 为对应中文。规格只约束非空字符串与语义一致，最终措辞 apply 时定稿（可在 verify 阶段人工审阅）。zh 文案由 `zh.json` 直接提供，实践中不走语言链回退；回退链（zh → en → package.json.name / description）由宿主承载，本包不实现。
5. **不做图标导出。** 官方规范图标是独立可选能力（清单 `icon` 或 `./icon` 导出、256 KiB 限制、data URL 返回等）；本变更聚焦文字说明，避免扩大验证面。

## Risks / Trade-offs

- [宿主版本未普及该机制或解析细节与文档有出入] → 旧宿主忽略新增文件与导出，无副作用（纯增量）；`engines.dsh: 0.2.x` 保持不动，不为展示层能力强行提升引擎约束。
- [通配 exports 与宿主未来解析规则漂移] → 静态校验锁定官方文档字面量，规则变化时校验失败即可发现。
- [本地校验与官方 `verify-package-meta` 规则漂移] → 校验只覆盖文档明示且适用本包的字段子集（非空字符串、exports、files、pack 覆盖），不试图复刻宿主全部规则（图标等不在范围）；以官方文档为单一事实源。
- [文案措辞主观] → 语义一致性与非空是硬约束，具体措辞留待人工审阅，成本低可随时改。

## Migration Plan

纯增量变更：新增文件与条目即生效，无数据迁移；回滚 = 删除 `locale/`、`test/meta-check.mjs` 与 `package.json` 两处条目及文档段落。locale 文件不参与 tsc 构建（纯 JSON 资产），`prepare` 构建流程与发布流程不变。

## Open Questions

（无——文案最终措辞在 apply 时定稿，不影响规格、方案与任务结构。）
