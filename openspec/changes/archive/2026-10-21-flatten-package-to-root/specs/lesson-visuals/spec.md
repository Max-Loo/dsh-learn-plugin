# Spec Delta

## ADDED Requirements

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
