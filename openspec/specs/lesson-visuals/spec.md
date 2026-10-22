# Lesson Visuals Specification

## Purpose

为课程按需生成"创作者已亲眼验证正确"的图示（mermaid 结构图 / SVG 几何图），发布为唯一命名 PNG 并内嵌到课程回复中，替代 pi 版专用可视化子代理工具集。

## Requirements

### Requirement: 按需判定是否作图
系统 SHALL 仅在想法以图更清楚（结构、关系、流程、几何、空间）时生成图示；prose 或单个公式已能承载时 SHALL NOT 生成装饰性图示。

#### Scenario: 结构图需求
- **WHEN** 课程讲到依赖图或系统组成
- **THEN** 可委派生成一张对应的最小图示

#### Scenario: 无图更优
- **WHEN** 概念用一句话或一个公式已表达清楚
- **THEN** 不生成图示

### Requirement: 委派 maker 子代理创作
图示创作 SHALL 委派给隔离子代理（结构/关系类为 mermaid maker，几何/空间类为 svg maker）：父会话提供单一想法、最少元素的 brief，maker 负责编写源码、渲染、检查、发布并返回文件，父会话不得自行手绘或伪造图示。

#### Scenario: 结构图委派
- **WHEN** 需要一张依赖关系图
- **THEN** brief 发给 mermaid maker，返回发布的 PNG 文件路径

#### Scenario: maker 无法完成
- **WHEN** maker 返回无法制作正确图示
- **THEN** 父会话简化 brief 重试或放弃该图示，不自行替代绘制

### Requirement: maker 子代理模型随会话
maker 子代理（mermaid maker 与 svg maker）SHALL 随派发它的会话当前模型执行，不指定、也不要求为 maker 单独配置模型。

#### Scenario: 不同会话模型下委派作图
- **WHEN** 两个会话分别以不同模型各委派一张同类图示
- **THEN** 两次 maker 均正常完成创作与发布，无需按模型对 maker 做任何配置

### Requirement: maker 工具范围由提示词模板约束
maker 的操作范围 SHALL 由其提示词模板约定（通用文件与渲染工具、不使用人类交互工具）；系统 SHALL NOT 依赖平台级工具白名单限定 maker。

#### Scenario: 委派不携带工具白名单
- **WHEN** 父会话以 `subagent` 工具向 maker 发出 brief
- **THEN** brief 不携带工具白名单，maker 的职责边界（编写源码、渲染、检查、发布）由其提示词模板承载

### Requirement: 渲染-检查回路
maker SHALL 在返回前渲染 PNG、实际查看图片并迭代至正确且清晰；未经查看确认的图 SHALL NOT 发布或返回。

#### Scenario: 错误箭头被修正
- **WHEN** maker 查看渲染结果发现箭头方向与事实不符
- **THEN** 修改源码并重新渲染检查，直到正确后才发布

### Requirement: 唯一命名发布
发布 SHALL 以唯一文件名（`viz-<slug>-<时间戳>.png` 格式）写入项目 `viz/` 目录，避免嵌入解析歧义。

#### Scenario: 发布
- **WHEN** maker 完成一张主题为 internet-packets 的图
- **THEN** `viz/` 下生成唯一命名的 PNG，路径返回给父会话

### Requirement: 课程内嵌
课程回复 SHALL 以标准 markdown 图片语法内嵌返回的 PNG 文件，使图示随课程渲染显示。

#### Scenario: 内嵌显示
- **WHEN** maker 返回发布文件
- **THEN** 教学回复包含指向该文件的图片引用，图示随课程内容渲染

### Requirement: 渲染依赖降级
渲染依赖（mermaid 渲染链或 SVG 渲染链）缺失时，系统 SHALL 明确报告该类图示当前不可用及所需依赖，而不是静默失败或返回未验证图片。

#### Scenario: 缺少渲染器
- **WHEN** 系统未安装 SVG 渲染二进制
- **THEN** svg maker 明确报告不可用与所需依赖，mermaid 类图示不受影响

### Requirement: mermaid 渲染器内嵌与按序探测
mermaid 渲染器（mmdc）SHALL 由插件以可选依赖内嵌提供；maker SHALL 按序探测——用户全局安装的 mmdc 优先，其次插件内嵌副本——两者均缺失时 SHALL 明确报告不可用并指向插件依赖安装方式，而不是要求用户全局安装。内嵌渲染器缺失 SHALL NOT 影响插件其余功能与 SVG 图示。

#### Scenario: 全新机器免全局安装
- **WHEN** 用户机器未全局安装 mmdc，插件以默认方式安装
- **THEN** mermaid 图示正常渲染发布，全程无需用户执行任何 npm 全局安装

#### Scenario: 用户全局安装优先
- **WHEN** 机器上同时存在全局 mmdc 与插件内嵌副本
- **THEN** maker 使用全局版本渲染

#### Scenario: 可选依赖被跳过
- **WHEN** 插件安装时可选依赖未落位（被跳过或安装失败）
- **THEN** quiz、lesson-log 与 SVG 图示不受影响；mermaid maker 报告不可用并指向插件依赖安装方式

### Requirement: 复用系统浏览器渲染
mermaid 渲染 SHALL 探测系统已安装的 Chrome/Chromium（常见安装路径与 PATH），探测到时 SHALL 以该浏览器完成渲染且 SHALL NOT 下载独立 Chromium；插件依赖若已自带浏览器，SHALL 直接使用而不再要求系统浏览器；两类浏览器均不可得时 SHALL 报告缺浏览器及安装指引。

#### Scenario: 系统 Chrome 复用
- **WHEN** 机器装有 Chrome 且 maker 执行渲染
- **THEN** 渲染通过该系统 Chrome 完成，过程中不出现 Chromium 下载

#### Scenario: 无系统浏览器且无内嵌浏览器
- **WHEN** 机器无 Chrome/Chromium 且插件依赖未自带浏览器
- **THEN** mermaid maker 明确报告缺浏览器与安装指引；SVG 类图示不受影响

#### Scenario: 插件自带浏览器
- **WHEN** 插件依赖安装时已落位自带 Chromium 且系统无浏览器
- **THEN** mermaid 图示仍可正常渲染
