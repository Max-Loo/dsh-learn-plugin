# Lesson Log Specification

## Purpose

将学习会话镜像为一份可渲染阅读的 markdown 课程日志（Obsidian callout 格式），记录用户输入、教学正文与问答块，支持链接已有笔记、追加保序、会话恢复与历史回填。

## Requirements

### Requirement: 链接已有文件为课程日志
系统 SHALL 支持将一个已存在的 markdown 文件链接为当前会话的课程日志并开始镜像；链接不存在的路径时 SHALL 报错且不创建文件或目录。

#### Scenario: 链接已有笔记
- **WHEN** 用户请求把 `lessons/tcp.md`（已存在）链接为课程日志
- **THEN** 链接生效，状态指示显示当前日志文件，会话内容开始追加镜像

#### Scenario: 路径不存在
- **WHEN** 用户给出的文件路径不存在
- **THEN** 返回错误信息，不创建任何文件

### Requirement: 镜像范围
日志 SHALL 只镜像阅读相关内容：用户文本输入（quote 块）、助手正文（abstract 块）、quiz 与 ask_user_question 的问答块（question/判定 callout）；其他工具调用与系统噪音 SHALL NOT 写入日志。

#### Scenario: bash 调用不记录
- **WHEN** 会话中代理执行了一次 bash 命令
- **THEN** 日志中不出现该调用的任何块

### Requirement: 题目先于答案且不泄漏
quiz 与 ask_user_question 的题面（含选项）SHALL 在用户作答前写入日志，且不含正确答案与解析；答案与判定反馈在作答后追加。

#### Scenario: 实时阅读日志
- **WHEN** 用户正在作答一道 quiz 题
- **THEN** 日志文件中已可见题面与选项，但看不到答案与解析

#### Scenario: 记录展示顺序
- **WHEN** quiz 选项被乱序展示
- **THEN** 日志中的选项顺序与用户屏幕上的顺序一致

### Requirement: 追加保序
日志 SHALL 以追加方式写入，且块顺序与会话中的实际顺序一致，即使多个事件几乎同时发生。

#### Scenario: 连续问答
- **WHEN** 一轮教学包含连续多组问答
- **THEN** 日志中题面块与对应判定块按发生顺序成对出现

### Requirement: 链接恢复
会话重启或恢复后，系统 SHALL 恢复既有的日志链接（继续镜像同一文件），无需用户重新链接。

#### Scenario: 重启恢复
- **WHEN** 用户重开一个曾链接过日志的会话
- **THEN** 镜像自动恢复到原文件，状态指示可见

### Requirement: 历史回填
新链接日志时，系统 SHALL 将当前会话分支的既有历史（按镜像范围）写入日志文件，使日志从链接时刻起即完整可读。

#### Scenario: 中途链接
- **WHEN** 会话进行到一半时用户链接日志
- **THEN** 日志文件包含链接前的对话与问答历史

### Requirement: 解除链接
系统 SHALL 支持解除日志链接并立即停止镜像；解除后同一会话可再次链接（可能不同的）文件。

#### Scenario: 解除后停止
- **WHEN** 用户解除链接后继续对话
- **THEN** 日志文件不再新增内容
