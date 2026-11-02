# Proposal

## Why

DSH 官方为 npm 包插件引入了多语言展示元信息机制（`locale/` 语言文件 + 包 exports + 发布文件覆盖）：插件管理页、设置页等界面据此显示插件标题与描述，而非技术名称回退值。`dsh-learn-plugin` 尚未适配——安装后各页面只能回退到 `package.json.name` / Cordis 插件名（如 `dsh-learn-plugin`），没有面向用户的中英文标题与描述。本变更按官方规范补齐，使宿主能读取本包的中英文插件说明。

## What Changes

- **新增 `locale/en.json` 与 `locale/zh.json`**：各含 `meta.title` 与 `meta.description`（可选字段，填写时必须是非空字符串），`en.json` 作为发现入口，`zh.json` 提供中文文案——即"适配中英文插件说明"的全部内容。
- **`package.json` 导出与发布合并**：`exports` 合并 `"./locale/*.json": "./locale/*.json"`（保留既有运行时导出 `.` / `./client` 与已存在的 `./package.json`）；`files` 追加 `"locale/*.json"`，使语言文件进入发布包。
- **新增轻量静态校验**：按 `test/` 既有惯例新增一个无需 DSH 运行时的校验脚本——locale JSON 可解析、字段为非空字符串、`exports` / `files` 条目齐备；`pnpm pack --dry-run` 确认语言文件进入发布产物。官方 `pnpm run verify-package-meta` 运行在 DSH 宿主仓库根目录，不适用于本插件仓库，故以本地等价校验替代。
- **文档**：`DEVELOPMENT.md` 验证一节记录该校验方式与官方规范的对应关系。

**范围外（明确不做）**：

- **图标**：官方规范中为可选能力（清单 `icon` 字段或 `./icon` 导出），本变更仅适配文字说明；如需图标另行提案。
- **子路径插件**：本包只有单一包根插件（`src/index.ts`），不存在 `<包名>/search` 类子路径插件，不涉及子路径 locale / icon。
- **宿主侧行为**：读取语言链回退、设置页短名格式化、Install 界面 npm registry 信息、图标渲染等均由 DSH 宿主实现并承载；本变更只保证本包提供合规数据。

## Capabilities

### New Capabilities

- `plugin-meta`: 插件包多语言展示元信息 —— `locale/` 语言文件的内容契约（`meta.title` / `meta.description` 可选、非空字符串、`en.json` 为发现入口）、包 `exports` 暴露 `./locale/*.json` 与 `./package.json`、发布 `files` 覆盖语言文件、本地静态校验。

### Modified Capabilities

（无 —— `teaching` / `graded-quiz` / `lesson-log` / `lesson-visuals` / `bundled-skills` 的行为契约不变；本变更不触碰 `src/` 运行时代码。）

## Impact

- **新增文件**：`locale/en.json`、`locale/zh.json`、`test/` 下一个静态校验脚本（实施时定名，如 `test/meta-check.mjs`）。
- **修改文件**：`package.json`（`exports` 合并一条、`files` 追加一条）、`DEVELOPMENT.md`（验证一节）。
- **不受影响**：`src/` 与 `client/` 运行时代码、依赖声明（不新增任何 dependency）、五个既有能力的行为契约、`engines` / peer 版本约束。
- **兼容性**：无破坏性变更——新增 exports 子路径与发布文件均为增量；旧版宿主（不读取 locale 元信息的版本）忽略这些文件，行为不变。
- **验证前置**：宿主端可见效果（插件管理页 / 设置页显示中英文标题描述、逐字段回退）需在支持该机制的 DSH 版本下人工核对；本仓库内以静态校验 + `pnpm pack --dry-run` 覆盖可自动验证的部分。
