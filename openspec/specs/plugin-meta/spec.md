# plugin-meta Specification

## Purpose

为 `dsh-learn-plugin` 插件包建立多语言展示元信息契约：`locale/` 语言文件的内容规范、包 `exports` 的资源暴露与发布 `files` 覆盖，使 DSH 宿主的插件管理页与设置页能按官方机制显示本包的中英文标题与描述。

## Requirements

### Requirement: 中英文展示文案
包 SHALL 在 `locale/` 目录下提供 `en.json`（发现入口）与 `zh.json` 两个语言文件，且两者 SHALL 均含 `meta.title` 与 `meta.description` 字段；按官方规范，字段本身可选，但填写时 MUST 为非空字符串（去除首尾空白后仍非空），否则宿主将其判为无效并显示单插件诊断。

#### Scenario: 两语言文案齐备
- **WHEN** 读取 `locale/en.json` 与 `locale/zh.json` 并解析
- **THEN** 两者均为 JSON 对象，`meta.title` 与 `meta.description` 存在，且均为非空字符串（英文与中文各成一套完整文案）

#### Scenario: 文案与包功能对应
- **WHEN** 审阅两语言文件中的标题与描述内容
- **THEN** 均描述本包的实际能力（分级测验、课程日志镜像、内置 teach/visualize 技能），中文与英文语义一致

### Requirement: 包导出暴露元信息资源
`package.json` 的 `exports` SHALL 通过 `"./locale/*.json": "./locale/*.json"` 暴露语言文件、通过 `"./package.json": "./package.json"` 暴露包字段（供宿主做标题/描述回退），且 MUST 保留合并前已有的全部运行时导出条目。

#### Scenario: 语言文件经 exports 解析
- **WHEN** 以 `<包名>/locale/en.json` 与 `<包名>/locale/zh.json` 子路径经 Node 包导出规则解析
- **THEN** 分别解析到包内 `locale/en.json` 与 `locale/zh.json` 文件

#### Scenario: 既有运行时导出不受影响
- **WHEN** 合并 `./locale/*.json` 导出后检查 `exports`
- **THEN** `.`（含 types/default）、`./client`、`./package.json` 等原有条目原样保留

### Requirement: 发布包包含语言文件
`package.json` 的 `files` SHALL 含 `"locale/*.json"`，发布产物（`npm pack` / `pnpm pack` tarball）MUST 覆盖两个语言文件，使通过包安装的用户获得同样的展示元信息。

#### Scenario: 检查发布产物
- **WHEN** 对插件包执行 `pnpm pack --dry-run` 并检查产物清单
- **THEN** `locale/en.json` 与 `locale/zh.json` 均在发布包内

### Requirement: 本地静态校验
仓库 SHALL 提供一个无需 DSH 运行时的静态校验（官方 `verify-package-meta` 运行于宿主仓库，本仓库以等价检查替代），覆盖：语言文件 JSON 可解析、字段为非空字符串、`exports` 含 `./locale/*.json` 与 `./package.json`、`files` 含 `locale/*.json`；校验失败 MUST 以非零退出码结束并指出失败项。

#### Scenario: 校验通过
- **WHEN** 语言文件与 `package.json` 均合规时运行该校验
- **THEN** 全部断言通过，退出码为 0

#### Scenario: 拦截违规数据
- **WHEN** 校验输入存在 JSON 损坏、字段为空字符串、或 `exports` / `files` 条目缺失
- **THEN** 校验报告对应失败项并以非零退出码结束
