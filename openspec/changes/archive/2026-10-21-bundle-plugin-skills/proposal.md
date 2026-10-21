# Proposal

## Why

当前 `dsh-learn-plugin` 构建出的插件包只含 `lib`、`client`、`cordis.patch.yml` 与 `README.md`——配套的 `teach` / `visualize` 两个 skill 仍以项目级文件形式留在仓库根的 `.dsh/skills/`，并未随包分发。用户安装插件后能获得 `quiz`、lesson-log 工具，却得不到指导其使用的两个 skill，除非手动拷贝目录（`docs/migrate-learn-to-dsh.md` 第 26 节目前正是这样交代的）。DSH 存在官方的"插件内置 skill"分发机制（`ctx.skills.registerProvider`，第一方 `dsh-skill-office` / `dsh-skill-badge` 等包均采用），插件应当用它把 skill 一并送达。

## What Changes

- **skill 源码移入插件包**：`teach` / `visualize`（含各自 `references/` 提示词模板）从仓库根 `.dsh/skills/` 迁至 `dsh-learn-plugin/skills/`，成为唯一事实源；`package.json` 的 `files` 增加 `skills` 使其进入发布包（纯 markdown，不参与 tsc 编译）。
- **新增内置 skill provider**：在插件内实现一个静态内联 provider 并注册到 DSH 的 `ctx.skills` 技能注册表（`inject: ['skills']`），照第一方 `dsh-skill-office` 的模式：candidate 带 `source: "bundled"`、`rank: BUNDLED_SKILL_RANK`（600）、每个 skill 自带指向包内目录的 `resourceBase`（支撑 `references/` 相对引用）；`list`/`get` 读取并剥离 SKILL.md frontmatter。
- **依赖声明**：`@deepseek-ai/dsh-skill` 进入 `peerDependencies`（版本与其他 dsh 包一致，0.2.1-rc.2），devDependencies 同步。
- **删除仓库根的 `.dsh/skills/teach/` 与 `.dsh/skills/visualize/`**：项目级 root 的 rank（100）高于内置 rank（600），保留旧副本会永久遮蔽包内新版，导致开发期测不到真实分发物（openspec-* 等无关 skill 不动）。
- **更新 `docs/migrate-learn-to-dsh.md`**：安装方式由"手动拷贝 `.dsh/skills/` 到目标项目"改为"安装插件即得"；补充项目级覆盖语义的说明。

不改变 `teach` / `visualize` 的 skill 内容本身，也不引入文件监听——包内容随版本不可变，静态读取即可。

## Capabilities

### New Capabilities

- `bundled-skills`: 插件内置技能分发能力 —— `teach` / `visualize` 随 `dsh-learn-plugin` 包分发，插件安装即在会话技能目录中可用；项目级同名 skill 可覆盖内置副本；skill 内相对引用按包内资源基址解析；发布包包含 skill 文件。

### Modified Capabilities

（无 —— `teaching` 与 `lesson-visuals` 的既有需求是交付方式无关的：行为契约不变，仅技能来源从项目级文件变为插件内置，由新能力 `bundled-skills` 承载交付语义。）

## Impact

- **新增/修改文件**：`dsh-learn-plugin/skills/`（自 `.dsh/skills/` 迁入）；`dsh-learn-plugin/src/skills.ts`（provider）；`dsh-learn-plugin/src/index.ts`（注册子模块）；`dsh-learn-plugin/package.json`（files、peerDependencies）。
- **删除**：仓库根 `.dsh/skills/teach/`、`.dsh/skills/visualize/`。
- **文档**：`docs/migrate-learn-to-dsh.md` 安装章节重写。
- **依赖**：新增 peerDependency `@deepseek-ai/dsh-skill`（提供 `ctx.skills` 注册表服务；desktop profile 的宿主层常驻加载 `@deepseek-ai/dsh-skill`，服务在插件加载时可用）。
- **不受影响**：DSH 本体；`teaching` / `lesson-visuals` / `graded-quiz` / `lesson-log` 的行为契约。
- **验证前置**：desktop profile（`~/.dsh/profiles/desktop/package.json`）当前 `link:` 指向旧仓库路径 `/Users/luyuexing/Documents/projects/personal/dsh-learn/...`（现已空），验证前需改指向本仓库插件目录——属环境修正，不在本 change 的仓库编辑范围内。
- **风险**：`ctx.skills.registerProvider` 的 candidate 契约（字段、rank、resourceBase 形状）依据 app 实现反编译式调研得出，以第一方包行为为准；若 0.2.x 后续版本调整契约，需跟随调整（peer 版本约束会挡住大版本漂移）。
