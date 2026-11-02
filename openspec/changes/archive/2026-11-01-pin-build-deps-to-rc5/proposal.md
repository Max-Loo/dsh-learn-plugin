# Proposal

## Why

`pnpm install` 在 pnpm 12.15.0 上失败：供应链策略校验否决现有锁文件后，pnpm 弃用锁文件退回全新解析，而 devDependencies 的 `0.2.x` 裸范围匹配不到任何版本——`@deepseek-ai/dsh-*` 系列从未发布过 stable 0.2.x（版本线全为 alpha/rc 预发布，semver 裸范围不匹配预发布），全新解析必然以 `ERR_PNPM_NO_MATCHING_VERSION` 失败。当前锁文件能安装纯属旧解析（0.2.1-rc.2）的"粘性"续命，任何触发重解析的情况（策略校验失败、删除锁文件、新环境克隆）都会引爆。

同时，宿主 DSH（CLI 与桌面 App）已是 0.2.1-rc.5，构建锁文件仍停在 0.2.1-rc.2，落后 3 个 RC。已验证六个直接依赖在 rc.2 ↔ rc.5 间包内容逐字节一致（仅版本号不同），对齐宿主零功能风险，并已在本机 pnpm 12.15.0 上实测"钉精确版本 → 重锁 → 安装"全链通过。

## What Changes

- package.json 中六个 `@deepseek-ai/dsh-*` devDependencies specifier 由 `0.2.x` 改为精确 `0.2.1-rc.5`（与宿主一致）。
- 删除旧 `pnpm-lock.yaml` 并重新生成：六个直接依赖及其 `@deepseek-ai` 传递依赖全链对齐 0.2.1-rc.5。
- peerDependencies 保持 `0.2.x` 不变（宿主运行时宽松契约，DEVELOPMENT.md 既有策略）。
- 重装后按既有纪律回归：quiz / log / skills 三组 harness + restore-probe A/B。
- 文档更新：README "在 0.2.1-rc.2 上验证" 改为 rc.5；DEVELOPMENT.md 增补 devDeps 钉版策略与 DSH 升级时的改版手法。
- 本变更无任何运行时行为变化（`skip_specs: true`）。

## Capabilities

### New Capabilities

（无——纯构建依赖治理，不引入新的系统能力。）

### Modified Capabilities

（无——既有五个能力（teaching / graded-quiz / lesson-log / lesson-visuals / bundled-skills）描述插件对外行为，依赖钉版不改变其中任何需求；rc.2 ↔ rc.5 包内容逐字节一致已证实零行为影响。）

## Impact

- **修改**：`package.json`（6 项 devDependencies specifier）、`pnpm-lock.yaml`（重新生成）、`README.md`（验证版本注记）、`DEVELOPMENT.md`（钉版与升级手法说明）。
- **不动**：`peerDependencies` 与 `engines.dsh`（`0.2.x` 宽松宿主契约）、`@deepseek-ai/cordis ~4.0.5`（stable 最新且与宿主一致）、`zod 4.4.3`（与 dsh-storage-domain 钉版刻意对齐）、`typescript` / `@types/node` / `@mermaid-js/mermaid-cli`（均为当前线内最新）、`src/` 源码、`openspec/specs/`。
- **依赖面**：`node_modules` 当前缺失、`dist/` 已清空，重装后需 `pnpm run build` 恢复产物。
- **非目标**：npm 发布（走既有发布流程）、双 pnpm 共存的机器层清理（12.6.0 独立装 vs 12.15.0 nvm 全局，属开发者本机事务，仅在文档中提示）。
