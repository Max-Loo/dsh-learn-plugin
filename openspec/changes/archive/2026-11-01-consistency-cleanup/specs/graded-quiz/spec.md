# Spec Delta

## MODIFIED Requirements

### Requirement: 出题契约
系统 SHALL 提供 `quiz` 工具，接受单选或多选题：`question`（单问题）、2–6 个带稳定 `value` 的选项、按 `value`（而非位置）给出的 `correctAnswer`、必填 `explanation`，以及可选的 `shuffle`（默认开启）。参数不合法（选项少于 2 个、选项多于 6 个、`correctAnswer` 不匹配任何 `value`、value 重复）时 SHALL 返回明确的错误说明且不发起提问。

#### Scenario: 正确答案按 value 解析
- **WHEN** 模型传入 `correctAnswer: "mercury"` 且存在 `value: "mercury"` 的选项
- **THEN** 提问正常发起，评分以该选项为正确答案

#### Scenario: 正确答案不匹配
- **WHEN** 传入的 `correctAnswer` 不等于任何选项的 `value`
- **THEN** 工具返回错误并列出全部合法 `value`，不向用户展示题目

#### Scenario: 选项超上限
- **WHEN** 模型传入 7 个选项
- **THEN** 工具返回"选项数量须在 2–6 之间"的明确错误，不向用户展示题目
