# Spec Delta

## ADDED Requirements

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
