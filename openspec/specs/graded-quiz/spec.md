# Graded Quiz Specification

## Purpose

为学习会话提供有标准答案的评分问答能力：出题即评分，作答后即时给出 ✓/✗ 反馈、正确答案与解析，向代理返回结构化判定，且在任何用户可见界面上都不提前泄漏答案。

## Requirements

### Requirement: 出题契约
系统 SHALL 提供 `quiz` 工具，接受单选或多选题：`question`（单问题）、≥2 个带稳定 `value` 的选项、按 `value`（而非位置）给出的 `correctAnswer`、必填 `explanation`，以及可选的 `shuffle`（默认开启）。参数不合法（选项少于 2 个、`correctAnswer` 不匹配任何 `value`、value 重复）时 SHALL 返回明确的错误说明且不发起提问。

#### Scenario: 正确答案按 value 解析
- **WHEN** 模型传入 `correctAnswer: "mercury"` 且存在 `value: "mercury"` 的选项
- **THEN** 提问正常发起，评分以该选项为正确答案

#### Scenario: 正确答案不匹配
- **WHEN** 传入的 `correctAnswer` 不等于任何选项的 `value`
- **THEN** 工具返回错误并列出全部合法 `value`，不向用户展示题目

### Requirement: 即时评分与反馈
用户作答后，系统 SHALL 即时评分并向用户展示反馈：每个选项的 ✓/✗/正确未选标记、判定结果（正确/错误/"I don't know"）、正确答案与 `explanation`（无论对错均展示）。

#### Scenario: 答错反馈
- **WHEN** 用户选择了错误选项
- **THEN** 反馈标出该选项的 ✗、以 ✓ 标出正确答案，并显示解析

#### Scenario: 答对反馈
- **WHEN** 用户选中全部正确选项且无多余
- **THEN** 反馈显示 ✓ 与解析

### Requirement: 多选精确集合匹配
多选题 SHALL 仅在用户选中的选项集合与正确集合完全一致（不多不少）时判定为正确。

#### Scenario: 漏选
- **WHEN** 多选题用户选了正确选项中的一个但漏掉另一个
- **THEN** 判定为错误

### Requirement: "I don't know" 信号
系统 SHALL 自动为每题附加 "I don't know" 选择（模型不得自行提供），选择它产生 `dontKnow` 结果：既非正确也非错误，反馈只揭示正确答案而不显示任何 ✗，且向代理明确传达"真实知识缺口、非猜错"。

#### Scenario: 选择不知道
- **WHEN** 用户选择 "I don't know"
- **THEN** 反馈不出现 ✗ 标记，仅以 ✓ 标出正确答案并显示解析，代理收到 dontKnow 结构化信号

### Requirement: 选项乱序
选项 SHALL 默认在展示前随机乱序，评分基于 `value` 不受乱序影响；选项顺序有意义（如数值排序、"以上皆是"须居末）时模型可显式禁用乱序。

#### Scenario: 乱序后评分正确
- **WHEN** 选项被乱序后用户按屏幕所示序号作答
- **THEN** 评分与作者意图一致

### Requirement: 答案不泄漏
在用户作答之前，正确答案与解析 SHALL NOT 出现在任何用户可见的界面上，包括工具调用卡片与转录。

#### Scenario: 作答前的工具卡片
- **WHEN** quiz 工具调用已发起、用户尚未作答
- **THEN** 界面卡片仅显示问题与选项，不显示 correctAnswer 与 explanation

### Requirement: 结构化结果返回代理
作答完成后，工具 SHALL 向代理返回结构化结果：所选答案、判定（correct/incorrect/dontKnow）、正确答案、解析，作为后续教学的输入。

#### Scenario: dontKnow 驱动教学
- **WHEN** 代理收到 dontKnow 结果
- **THEN** 结果文本明确区分"未作答的知识缺口"与"答错"，供教学决策使用

### Requirement: 子代理内不可用
quiz SHALL 仅在主会话中发起人类交互；来自子代理的 quiz 调用 SHALL 返回不可用错误而不是挂起等待。

#### Scenario: 子代理调用
- **WHEN** 某子代理尝试调用 quiz
- **THEN** 返回明确的不可用错误，子代理继续运行
