# Tasks

## 1. 语言文件与包清单

- [x] 1.1 创建 `locale/en.json` 与 `locale/zh.json`：各含 `meta.title` 与 `meta.description`，中英文文案齐备、语义一致且对应包实际能力（分级测验、课程日志镜像、内置 teach/visualize 技能；措辞基准见 design.md 决策 4）；以 `node -e` 解析两文件、四个字段均为去除首尾空白后非空的字符串为验收
- [x] 1.2 `package.json` 合并条目：`exports` 追加 `"./locale/*.json": "./locale/*.json"`（保留 `.` / `./client` / `./package.json` 原样），`files` 追加 `"locale/*.json"`；以 Node 经 exports 解析 `<包名>/locale/en.json`、`<包名>/locale/zh.json`、`<包名>/package.json` 子路径均成功，且 `pnpm pack --dry-run` 产物清单含 `locale/en.json` 与 `locale/zh.json` 为验收

## 2. 静态校验

- [x] 2.1 实现 `test/meta-check.mjs`（导出接受包根路径、返回失败项列表的检查函数 + 校验真实仓库的 CLI 入口，零 DSH 依赖）：覆盖语言文件 JSON 可解析、字段非空字符串、`exports` 四条目齐备、`files` 含 `locale/*.json`；以 `node test/meta-check.mjs` 退出码 0 且逐项通过为验收
- [x] 2.2 违规拦截自测：在临时目录构造三类违规副本（JSON 损坏、字段为空字符串、`exports` / `files` 条目缺失），分别调用检查函数；以每类违规均被报告为具名失败项（对应 spec"拦截违规数据"场景）、不触碰真实仓库文件为验收

## 3. 文档

- [x] 3.1 `DEVELOPMENT.md` 验证一节补充元信息校验：记录 `node test/meta-check.mjs` 的运行方式、与官方 `pnpm run verify-package-meta`（宿主仓库脚本，本仓不可直接运行）的对应关系，以及 `pnpm pack --dry-run` 产物核对；以文档所载命令原样可执行且结果与描述一致为验收

## 4. 集成核对

- [x] 4.1 仓库级三连验证：`pnpm run build` 通过（确认 locale 纯 JSON 资产不影响构建）、`node test/meta-check.mjs` 全绿、`pnpm pack --dry-run` 产物含语言文件且既有发布物（`dist/lib`、`client`、`skills`、`cordis.patch.yml`、`README.md`）无缺失；以三项全部通过为验收
- [x] 4.2 宿主侧人工核对（前置：安装了支持 locale 元信息机制的 DSH 版本，本包以 `link:.` 或发布包安装）：在插件管理页与设置页插件清单切换中英文语言，核对标题与描述分别取自 `zh.json` / `en.json`、插件管理页保留完整技术名称；结果记录于会话（对应官方验证清单"对已安装插件切换中英文"项；宿主未支持时记录环境限制并留待升级后补验）

## Workflow follow-up

- 实施完成后运行 `/openspec-verify-change` 核对，再以 `/openspec-archive-change` 归档（`plugin-meta` 主 spec 将由归档生成，DEVELOPMENT.md 能力导览同步补一条）。
