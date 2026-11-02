# Design

## Context

见 proposal.md 的 Why。补充影响手法的现状事实：

- 六个 `@deepseek-ai/dsh-*` 包在 0.2.1-rc.2 ↔ rc.5 间**包内容逐字节一致**（全目录 diff 仅 package.json 版本号不同），对齐动作无功能风险。
- 本机存在两个 pnpm：`~/Library/pnpm/bin/pnpm`（12.6.0）与 nvm 全局（12.15.0）。12.15.0 的锁文件供应链校验呈网络相关的非确定性（同文件快败 196–225ms / 慢过 1.5s），失败即弃用锁文件退回全新解析。
- `node_modules` 当前缺失、`dist/` 已清空；重装后需重新 `pnpm run build`。
- peerDependencies 的 `0.2.x` 由宿主插件加载器宽松判定（README 已验证策略），语义与 pnpm 解析无关。

## Goals / Non-Goals

**Goals:**

- `pnpm install` 在任何 pnpm 12.x、任何触发路径（新克隆、删锁、策略校验失败）下确定性成功。
- 构建类型面与宿主 DSH 0.2.1-rc.5 完全对齐（含 `@deepseek-ai` 传递依赖）。
- 保留既有宿主兼容契约（peers `0.2.x`）与"升级后先回归"纪律。

**Non-Goals:**

- 不改 `src/` 源码与五个能力的既有行为（specs 不动，`skip_specs: true`）。
- 不清理开发者本机的双 pnpm 共存（机器层事务，文档提示即可）。
- 不做 npm 发布（走既有发布流程，另行 `npm version` + `npm publish`）。

## Decisions

1. **devDependencies 精确钉 `0.2.1-rc.5`（方案 A），而非预发布兼容范围（方案 C）**
   - 备选 C（`>=0.2.1-rc.0 <0.3.0`）实测同样解析到 rc.5，且 semver tuple 规则保证不会漂到 `0.2.2-alpha.2`；但重锁时会自动跟随最新版本，升级成为隐式行为。
   - 选 A 的理由：与 DEVELOPMENT.md"升级 DSH 后先回归再使用"纪律同构——每次升级是显式的、带回归验证的决定；构建可复现性最强；specifier 意图一目了然。代价是 DSH 每出一个 RC 需手动改 6 行，已被该纪律覆盖。
   - 其余备选均实测排除：`pnpm.overrides`（救不了根依赖的无解范围，12.15.0 下失败）、`--trust-lockfile`（跳过校验后仍重解析失败）、仅换回 pnpm 12.6.0（回避不修复，新克隆/CI 照炸）、换官方 registry（semver 与镜像无关，镜像版本数据完整）。

2. **只钉 devDependencies；peerDependencies 与 `engines.dsh` 保持 `0.2.x`**
   - devDeps 是构建期契约（pnpm 解析用）；peers 是运行时契约（宿主加载器宽松判定，rc.5 宿主今日即在正常运行本插件）。钉 peers 会把旧补丁宿主硬拦，违背 README 记录的宽松策略。
   - 实测确认：钉 devDeps 后 pnpm `autoInstallPeers` 将传递 peer（dsh-llm / dsh-scope / dsh-storage 等）自动带到 rc.5，无需 overrides。

3. **改 specifier → 删旧锁 → `pnpm install` 重锁，而非 `pnpm update`**
   - `pnpm update` 会先按旧 `0.2.x` specifier 重解析，直接 `ERR_PNPM_NO_MATCHING_VERSION`。正确顺序是先改 specifier 再重锁；该路径已在本机 pnpm 12.15.0 全链实测通过（含二次安装 12ms 过校验）。

4. **重锁后以回归作为完成门槛**
   - `pnpm run build` 恢复 `dist/lib`，随后 quiz(34) / log(62) / skills(22) 三组 harness + restore-probe A/B 全绿。rc.2 ↔ rc.5 字节一致 ⇒ 预期零行为差异，回归是纪律性的确认而非修复预期。

5. **文档同步两处**
   - README L16"在 0.2.1-rc.2 上验证"→ rc.5；L18 的 peer 宽松策略行不变。
   - DEVELOPMENT.md 开发工作流一节补记：devDeps 为精确钉版，DSH 升级手法 = 改 6 行 specifier → 删锁 → `pnpm install` → 全量回归。

## Risks / Trade-offs

- [未来 DSH RC / stable 发布后 devDeps 落后于宿主] → 有意为之（显式升级 + 回归纪律）；手法写入 DEVELOPMENT.md。
- [双 pnpm 校验行为差异带来的环境噪音] → 仓库层无解也无需解：钉版后两个版本的解析均成功；文档提示开发者收敛到单一 pnpm。
- [npmmirror 镜像对新版本同步滞后] → 实测镜像已含 rc.5（2026-10-29 发布）；若未来滞后可临时 `--registry https://registry.npmjs.org`，与 specifier 策略无关。
- [锁文件体积/解析时间变化] → 传递依赖从 rc.2 整体平移到 rc.5，条目数不变（247 项），无实质影响。

## Migration Plan

1. 改 `package.json` 六个 specifier → `0.2.1-rc.5`
2. `rm pnpm-lock.yaml && pnpm install`（任一 pnpm 12.x；12.15.0 已实测）
3. `pnpm run build` 恢复 `dist/lib`
4. 三组 harness + restore-probe 全绿
5. 文档更新后单提交
- **回滚**：`git revert` 单提交即可；无数据迁移、无行为变化，旧锁文件在 git 历史中可恢复。

## Open Questions

（无——影响方案的所有分支均已实验验证，无安全搁置的未知项。）
