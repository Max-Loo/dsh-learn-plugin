# Spec Delta

## ADDED Requirements

### Requirement: researcher 子代理模型随会话
researcher 子代理 SHALL 随派发它的会话当前模型执行，不指定、也不要求为 researcher 单独配置模型。

#### Scenario: 会话切换模型后委派
- **WHEN** 教学会话以模型 A 派发一次 researcher 检索，切换到模型 B 后再派发一次
- **THEN** 两次简报分别随派发时会话的模型生成，全程无需任何子代理级模型配置

### Requirement: researcher 工具范围由提示词模板约束
researcher 的操作范围 SHALL 由其提示词模板约定（以 web 检索为工作工具、bash 仅作辅助、不使用人类交互工具）；系统 SHALL NOT 依赖平台级工具白名单限定 researcher。

#### Scenario: 委派不携带工具白名单
- **WHEN** 教学会话以 `subagent` 工具派发 researcher
- **THEN** 派发只含研究问题与提示词模板正文，不含工具白名单；researcher 的行为边界全部由模板文本承载
