# Spec Delta

## MODIFIED Requirements

### Requirement: 答案不泄漏
在用户作答之前，正确答案与解析 SHALL NOT 出现在插件呈现的任何用户可见界面上，包括工具调用卡片、作答面板、判定前反馈与课程日志镜像；插件 SHALL NOT 在作答前于任何用户界面上渲染 quiz 的原始调用参数。平台对原始调用数据的持久化存储不属于插件的呈现面，本 requirement 对其不作约束。

#### Scenario: 作答前的工具卡片
- **WHEN** quiz 工具调用已发起、用户尚未作答
- **THEN** 界面卡片仅显示问题与选项，不显示 correctAnswer 与 explanation

#### Scenario: 原始参数不作答前渲染
- **WHEN** quiz 工具调用处于待作答状态，用户查看该调用的呈现
- **THEN** 插件提供的全部呈现（卡片与日志镜像）不含原始调用参数中的 correctAnswer 与 explanation

## ADDED Requirements

### Requirement: 跳过信号
用户未选择任何选项且未提供自定义答案时，系统 SHALL 产生未作答信号：判定既非正确也非错误，反馈不出现任何 ✗、仅揭示正确答案与解析，结构化结果 SHALL 向代理明确传达未作答（与 "I don't know" 同通道、区别于猜错）。

#### Scenario: 跳过面板
- **WHEN** 用户在 quiz 面板未选任何选项直接提交
- **THEN** 反馈不出现 ✗ 标记，仅以 ✓ 标出正确答案并显示解析，代理收到未作答的结构化信号
