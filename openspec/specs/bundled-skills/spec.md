# Bundled Skills Specification

## Purpose

让 `dsh-learn-plugin` 插件包自己携带 `teach` / `visualize` 两个教学技能：用户安装插件后无需任何项目级文件即可使用，同时保留项目级同名技能覆盖内置副本的能力。

## Requirements

### Requirement: 安装即用
插件在 DSH profile 中安装并加载后，`teach` 与 `visualize` SHALL 出现在会话的技能目录中（对模型与用户两面均可调用），且在目标项目不存在任何项目级技能文件的前提下，加载 SHALL 返回完整的技能正文。目录条目的名称与描述 SHALL 取自各 SKILL.md 的 frontmatter。

#### Scenario: 空项目安装插件
- **WHEN** 用户在一个没有 `.dsh/skills/` 目录的项目中打开装载了本插件的会话
- **THEN** 技能目录包含 `teach` 与 `visualize`，两者的名称与描述与包内 SKILL.md frontmatter 一致

#### Scenario: 加载技能正文
- **WHEN** 会话按名称加载 `teach` 或 `visualize`
- **THEN** 返回该技能 SKILL.md 去除 frontmatter 后的正文内容

### Requirement: 项目级覆盖优先
当项目存在与内置技能同名的项目级技能（`.dsh/skills/<name>/`）时，SHALL 以项目级副本为准；移除项目级副本后，内置副本 SHALL 自动生效，无需重装插件。

#### Scenario: 项目副本遮蔽内置副本
- **WHEN** 项目 `.dsh/skills/teach/` 存在自定义版本
- **THEN** 会话加载的 `teach` 为项目级副本的内容

#### Scenario: 移除后回落
- **WHEN** 删除该项目级副本后会话刷新技能目录
- **THEN** 加载 `teach` 返回插件内置副本的内容

### Requirement: 包内相对引用解析
技能正文中的相对资源引用（如 `references/` 提示词模板）SHALL 相对各自技能在已安装插件包内的资源基址解析，在任何安装了插件的项目中均可读取，不依赖目标项目或用户目录中存在对应文件。

#### Scenario: 引用 researcher 模板
- **WHEN** `teach` 技能指示按 `references/researcher.md` 委派 researcher 子代理
- **THEN** 该路径解析到已安装插件包内 `teach` 技能目录下的文件并可正常读取

### Requirement: 发布包包含技能文件
插件的发布产物（`npm pack` 产出的 tarball）SHALL 包含两个技能的 SKILL.md 及其 `references/` 文件，使上述行为对通过包安装（含 link 方式安装）的用户同样成立。

#### Scenario: 检查发布产物
- **WHEN** 对插件包执行 `npm pack` 并检查 tarball 内容
- **THEN** `skills/teach/SKILL.md`、`skills/teach/references/`、`skills/visualize/SKILL.md`、`skills/visualize/references/` 均在包内
