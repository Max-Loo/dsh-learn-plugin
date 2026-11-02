# Tasks

## 1. 钉版与重锁

- [x] 1.1 将 `package.json` 中六个 `@deepseek-ai/dsh-*` devDependencies specifier 由 `0.2.x` 改为精确 `0.2.1-rc.5`（dsh-commands / dsh-session-query / dsh-skill / dsh-storage-domain / dsh-tools / dsh-user-questions）；验证：`node -e` 断言六项均为 `0.2.1-rc.5`，且 `peerDependencies` 与 `engines.dsh` 仍为 `0.2.x` 未动
- [x] 1.2 删除 `pnpm-lock.yaml` 后执行 `pnpm install` 重新生成锁文件；验证：安装退出码 0，新锁文件 importer 中六项 `version: 0.2.1-rc.5`，传递依赖（`@deepseek-ai/dsh-llm` / `dsh-scope` / `dsh-storage` 等）同在 0.2.1-rc.5，`@deepseek-ai/cordis` 仍为 4.0.5
- [x] 1.3 二次执行 `pnpm install`（本机 pnpm 12.15.0）；验证：秒级完成且供应链策略校验通过，不再出现 `ERR_PNPM_NO_MATCHING_VERSION`

## 2. 构建恢复

- [x] 2.1 执行 `pnpm run build`；验证：tsc 零错误，`dist/lib/index.js` 与 `.d.ts` 产物生成（`cordis.dev.yml` 指向的入口恢复可用）

## 3. 回归验证（完成门槛）

- [x] 3.1 按 DEVELOPMENT.md 验证方式一节运行三组 harness（`DSH_HOME=<workspace dsh home> dsh web --patch ./test/<quiz|log|skills>-harness.cordis.yml --no-open --port 0`）；验证：quiz 34/34、log 62/62、skills 22/22 全 PASS
- [x] 3.2 运行 restore-probe 两阶段（同 cwd，A 后新进程跑 B）；验证：B 阶段四行输出全 OK

## 4. 文档同步

- [x] 4.1 README 第 16 行"在 0.2.1-rc.2 上验证"更新为 0.2.1-rc.5；验证：README 中不再残留 rc.2 版本声明，第 18 行 peer 宽松策略说明保持原样
- [x] 4.2 DEVELOPMENT.md 开发工作流一节补记 devDeps 精确钉版策略与升级手法（改 6 行 specifier → 删锁 → `pnpm install` → 全量回归）；验证：文档所写步骤与 tasks 1–3 实际操作一致、命令可照抄执行

## Workflow follow-up

- 三组 harness 与 restore-probe 全绿、文档更新完成后归档本变更。
- npm 发布不在本变更范围，需要时走既有流程（`npm version patch` + `npm publish --registry https://registry.npmjs.org`）。
