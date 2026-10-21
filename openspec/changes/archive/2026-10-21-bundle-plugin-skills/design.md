# Design

## Context

见 proposal.md 的动机。约束要点：DSH 桌面端的宿主层常驻加载 `@deepseek-ai/dsh-skill`（提供 `ctx.skills` 注册表服务），`skill-filesystem` 与 `tool-skill` 仅在特定 agent composition 内启用；第一方包（`dsh-skill-office`、`dsh-skill-badge`）以"包内静态 assets + 内联 provider 注册到 `ctx.skills`"的模式分发内置技能，bundled 来源在注册表中排最低优先级（rank 600），项目级 root（rank 100）可覆盖。本插件的 skill 内容随包版本不可变，无监听需求。项目测试习惯为 `test/` 下 dev-only 的 cordis harness 插件（配 `*.cordis.yml` 手动运行）。

## Goals / Non-Goals

**Goals:**

- `teach` / `visualize` 随插件包分发，安装即入会话技能目录（spec 见 `specs/bundled-skills/spec.md`）。
- 保留项目级同名技能覆盖内置副本的语义（免费获得：bundled rank 最低）。
- 包内 `references/` 相对引用在任意安装位置可解析。
- 单一事实源：skill 源码只存在于插件包目录一处。

**Non-Goals:**

- 不修改 `teach` / `visualize` 的技能内容本身（本次纯分发机制变更）。
- 不引入文件监听 / 热更新（包内容随版本不可变）。
- 不改 `teaching` / `lesson-visuals` 的行为契约。
- 不处理 `~/.dsh` 下 desktop profile 的 link 指向修正（环境问题，验证前置条件，见 proposal Impact）。

## Decisions

### D1：内联静态 provider（方案 A），不复用 `dsh-skill-filesystem`

`src/skills.ts` 实现 `{ name, list, get }` provider 并 `ctx.skills.registerProvider(() => provider)`，照 `dsh-skill-office` 的既有范式。

- 选 A 的理由：只新增一个 peerDependency；不依赖 `skill-filesystem` 是否在当前 composition 中启用（它在部分 composition 里是 disabled 的）；静态包内容不需要监听/失效机制，`list` 在 apply 时构造一次即可。
- 备选 B（以子插件方式再 apply 一次 `dsh-skill-filesystem`，配唯一 `providerName` + `includeDefaultRoots: false` + `bundledSkillDir`）被否：多一个宿主已提供的运行时依赖、版本漂移面更大，且在 composition 未启用 filesystem provider 的会话里我们无法保证它被拉起。
- 备选 D（安装后拷入 `~/.dsh/skills`）被否：非平台惯例、污染全局、卸载残留。

### D2：candidate 契约照抄第一方实现

每个 skill 一个 candidate：`name` / `description` 取自 frontmatter；`invocation: { modelInvocable: true, userInvocable: true }`（现有两个 SKILL.md 无 `disable-model-invocation` / `user-invocable` 键，双面开放即现状）；`provider: 'dsh-learn-plugin'`（注册表内唯一名）；`source: 'bundled'`；`rank: BUNDLED_SKILL_RANK`（从 `@deepseek-ai/dsh-skill` 导入常量，不硬编码 600）；`resourceBase: { kind: 'directory', path: <技能目录> }`（每技能各自指向，支撑 `references/` 解析，path 用正斜杠）；`locator` 指向 SKILL.md。`get` 每次现读文件、剥 frontmatter 返回 `{ ...summary, content }`，definition 的 `name` 与 candidate 一致（注册表以此做失效校验）。

依据：`dsh-skill-badge` / `dsh-skill-office` 在 app 实现中的源码形状；契约若随 0.2.x 演进，由 peer 版本约束暴露而非静默漂移。

### D3：skill 目录放包根 `skills/`，编译产物经 URL 定位

- 布局：`dsh-learn-plugin/skills/teach/`、`dsh-learn-plugin/skills/visualize/`（SKILL.md + references/）；`package.json` `files` 增加 `"skills"`。纯 markdown 不参与 tsc，无构建步骤改动。
- 定位：`src/skills.ts` 编译为 `lib/skills.js`，用 `fileURLToPath(new URL('../skills/', import.meta.url))` 解析包根 `skills/`——npm 安装与 `link:` 安装都落在包目录内，`import.meta.url` 两种情形均正确。
- 备选 `assets/` 前缀（skill-office 惯例）被否：`dsh-agent-preset` 亦用包根 `skills/`，对本包更直白，少一层目录。

### D4：frontmatter 用零依赖的最小解析

沿用 skill-office 的 `parseSkill` 形状：正则剥 `--- ... ---` 块，只提取 `name` / `description` 两个单行键；apply 时解析失败即抛错使插件加载失败（快速暴露打包缺失），`get` 复用同一解析。不为此引入 `yaml` 依赖——现有两个 SKILL.md 的 frontmatter 均为单行键值，若未来需要复杂 frontmatter 再升级。

### D5：删除仓库根副本，文档改写安装语义

删除 `.dsh/skills/teach/`、`.dsh/skills/visualize/`：项目级 rank 100 会永久遮蔽内置副本，开发期测不到真实分发物。`docs/migrate-learn-to-dsh.md` 第 26 节改为"安装插件即得"，并写明项目级覆盖语义（想定制就放项目级副本，删除后回落内置）。

### D6：验证走 test/ harness 惯例

新增 `test/skills-harness.ts`（dev-only cordis 插件，`inject: ['skills']`）+ `skills-harness.cordis.yml`：加载本插件的 provider 后断言 (i) 目录含 `teach`/`visualize` 且字段符合 D2；(ii) `get` 返回剥掉 frontmatter 的正文；(iii) resourceBase 下 `references/*.md` 可读。端到端（真实会话技能目录出现且可 `/teach`）在 desktop profile 修正 link 后人工验证。

## Risks / Trade-offs

- [candidate 契约依据 app 实现调研而非公开文档] → 逐字段对齐 `dsh-skill-badge` 源码；harness 断言字段形状，0.2.x 升级时测试先红。
- [frontmatter 最小解析遇多行值会失败] → 现有 SKILL.md 均单行；解析失败在插件加载期抛错，不会静默错。
- [`skills` 目录漏出 `files` 导致发布包缺技能] → spec 场景"检查发布产物"以 `npm pack --dry-run` 作为任务验收步骤。
- [仓库根副本删除后，本仓库会话改用内置副本（rank 600）] → 行为等价（同一份内容迁入包内）；若需在本仓库试验 skill 改动，直接改包内文件，DSH 技能目录按会话刷新。
- [profile link 指向旧仓库] → 属环境前置，不修则验证测到旧代码；在 tasks 的验证任务中显式列出检查步骤。

## Migration Plan

1. 实施顺序：包目录迁移 → provider → package.json → 删旧副本 → 文档 → harness 验证 → `npm pack --dry-run` 验证。
2. 回滚：还原 `.dsh/skills/` 两个目录、`package.json` 与 `src/` 改动即可；无持久化状态、无外部系统变更。

## Open Questions

（无——契约细节已在探索期对第一方实现核实完毕。）
