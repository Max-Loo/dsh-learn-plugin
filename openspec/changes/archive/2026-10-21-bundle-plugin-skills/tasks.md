# Tasks

## 1. Skill 源码迁入插件包

- [x] 1.1 将 `.dsh/skills/teach/` 与 `.dsh/skills/visualize/`（SKILL.md 及 `references/`）原样迁至 `dsh-learn-plugin/skills/` 下；以 `git status` 仅见 rename、`git diff --find-renames` 无内容改动为验收
- [x] 1.2 删除仓库根 `.dsh/skills/teach/` 与 `.dsh/skills/visualize/`（openspec-* 等其余目录不动）；以 `ls .dsh/skills/` 不再含两者、其余完好为验收

## 2. Provider 实现

- [x] 2.1 `package.json` 的 `peerDependencies` 与 `devDependencies` 加入 `@deepseek-ai/dsh-skill: 0.2.1-rc.2` 并安装；以 `pnpm install` 成功且 `node -e "import('@deepseek-ai/dsh-skill').then(m => console.log(typeof m.BUNDLED_SKILL_RANK))"` 输出 `number` 为验收
- [x] 2.2 实现 `src/skills.ts`：零依赖 frontmatter 解析（name/description，失败即抛错）+ 内联 provider（`name: 'dsh-learn-plugin'`、candidate 含 `source: 'bundled'`、`rank: BUNDLED_SKILL_RANK`、per-skill `resourceBase`、`locator`，`get` 现读剥壳）；以 `pnpm run build` 通过为验收
- [x] 2.3 `src/index.ts` 注册 skills 子模块（`inject` 并入 `'skills'`）；以构建产物 `lib/index.js` 含注册调用、`pnpm run build` 通过为验收

## 3. Harness 验证

- [x] 3.1 按 `test/` 既有惯例新增 `test/skills-harness.ts` + `test/skills-harness.cordis.yml`：断言目录含 `teach`/`visualize` 且名称、描述与 frontmatter 一致、`get` 返回无 frontmatter 的正文、resourceBase 下 `references/*.md` 可读；以 harness 运行（与现有 probe 同法）全绿为验收
- [x] 3.2 `package.json` `files` 加入 `"skills"`；以 `npm pack --dry-run` 输出含 `skills/teach/SKILL.md`、`skills/teach/references/researcher.md`、`skills/visualize/SKILL.md`、`skills/visualize/references/`（对应 spec 场景"检查发布产物"）为验收

## 4. 文档

- [x] 4.1 改写 `docs/migrate-learn-to-dsh.md` 第 26 节：安装方式改为"安装插件即得"，补项目级覆盖语义与回落行为；以文档描述与 3.1/3.2 实测行为一致为验收

## 5. 端到端验证

- [x] 5.1 修正 `~/.dsh/profiles/desktop/package.json` 中 `dsh-learn-plugin` 的 `link:` 指向本仓库 `dsh-learn-plugin/`（环境前置），重启 DSH；在一个无 `.dsh/skills/` 的临时项目里开会话，验证技能目录出现 `teach`/`visualize`、`/teach` 可加载正文（对应 spec"空项目安装插件"与"加载技能正文"场景），结果记录于会话
  - 完成（2026-10-21 verify 跟进）：desktop profile 指向本仓库并重启 DSH 后，验证会话技能目录出现 `teach` / `visualize`（bundled 来源，provider `dsh-learn-plugin`），`/teach` 可加载剥 frontmatter 的完整正文。旁证：本仓库自身（`.dsh/skills/` 已无两者）重启后技能列表同样出现两者，即内置 provider 在无项目级副本环境下生效；skills harness 于隔离 `DSH_HOME` 实测 22/22。

## Workflow follow-up

- 实施完成后运行 `/openspec-verify-change` 核对，再以 `/openspec-archive-change` 归档（`bundled-skills` 主 spec 将由归档生成）。
