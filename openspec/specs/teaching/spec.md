# Teaching Specification

## Purpose

规范运行在 DeepSeek Harness 上的教学会话行为：以"建立可推导的依赖图理解"为目标，覆盖摸底、规划、授课三阶段流程、事实核查与子代理委派，使学习者获得经核实、可保留的理解而非记忆。

## Requirements

### Requirement: 教学技能可用
系统 SHALL 提供名为 `teach` 的教学技能（skill），在用户请求讲解、学习或澄清任何主题时被加载并指导会话行为，包括其中的两大教学原则与三阶段流程。

#### Scenario: 触发教学
- **WHEN** 用户请求学习一个主题或要求解释一个概念
- **THEN** 教学技能被加载，会话按其定义的 probe→plan→teach 流程进行

### Requirement: 教学原则
教学内容 SHALL 遵循两项原则：(i) 从学习者可直接接受的无条件真理建基，确认基础稳固后才在其上构建；(ii) 派生事实以"学习者本可以如何自己发现它"的动机化路径呈现，不出现无动机的断言。

#### Scenario: 派生事实的呈现
- **WHEN** 教到一个依赖既有节点的新事实
- **THEN** 讲解包含动机（为什么需要它）与从已建立事实出发的推导路径，并显式指出它挂在哪些已建立节点上

#### Scenario: 基础不稳固
- **WHEN** 某个被当作基础的真理未被学习者确认接受
- **THEN** 会话暂停向上构建，先修正或下挖基础

### Requirement: 摸底阶段必须先于授课
进入规划前，系统 SHALL 通过评分测验（graded quiz）定位学习者在与目标相关的每条知识线上的边界——既有做对的下限证据，也有做错或不知道的上限证据，并通过无标准答案的提问把学习目标澄清到具体。

#### Scenario: 全对不视为完成
- **WHEN** 学习者连续答对摸底问题
- **THEN** 难度继续上调直到出现错误或"不知道"，否则不进入规划阶段

#### Scenario: 单个错误不触发授课
- **WHEN** 学习者答错一道题
- **THEN** 先围绕该错误探查其性质（失误、孤立缺口还是系统性误解）并映射相关各条知识线，而非立即开始教学

#### Scenario: 目标模糊
- **WHEN** 学习者提出的学习目标宽泛或可作多种理解
- **THEN** 通过无标准答案的提问追问，直到目标具体到能决定教学内容

### Requirement: 规划呈现并等待确认
规划阶段 SHALL 先委派 researcher 子代理摸清领域（核心概念、真实的第一性原理、常见误区），然后向学习者呈现两部分计划——prose 方案与 mermaid 依赖图（无条件真理为根、目标为汇）——并停止等待学习者同意后才进入授课。

#### Scenario: 计划呈现
- **WHEN** 摸底与领域调研完成
- **THEN** 学习者收到 prose 方案与 mermaid 依赖图，会话在获得同意前不开始授课

#### Scenario: 根节点审计
- **WHEN** 计划中某 foundational 节点其实可由更简单的已接受事实推导
- **THEN** 计划将该节点下推并扩展依赖图，而非建立在中间层事实上

### Requirement: 逐节点授课循环
授课 SHALL 逐节点进行，每个节点（无条件真理与派生步骤同等对待）依次完成 motivate（动机）→ establish（建立）→ connect（连接到既有图）→ quiz-check（评分确认），未通过确认的节点 SHALL NOT 作为后续节点的构建基础。

#### Scenario: 节点未确认
- **WHEN** 某节点的 quiz-check 未通过
- **THEN** 停止在其上构建，先修复该节点

#### Scenario: 中途需要新基础
- **WHEN** 授课中途需要引入一个新的无条件真理
- **THEN** 该真理同样经过完整的 motivate→establish→connect→quiz-check 循环

### Requirement: 事实核查
对任何存在不确定的事实、名称、日期、公式或定义，系统 SHALL 先经 researcher 子代理核查后再向学习者陈述；核查修正了已讲内容时 SHALL 向学习者明示修正而非掩盖。

#### Scenario: 不确定即核查
- **WHEN** 教学中对某个事实只有部分把握
- **THEN** 陈述前先派发 researcher 子代理核实，宁可暂停也不凭记忆输出

### Requirement: researcher 子代理契约
researcher 子代理 SHALL 在隔离上下文中执行网络检索并产出独立成立的简报：2-3 句直接回答的 Summary、带引用的编号 Findings、保留/剔除来源清单与未解决的 Gaps。

#### Scenario: 委派检索
- **WHEN** 教学会话派发一个研究问题给 researcher
- **THEN** 返回的简报包含 Summary、带来源链接的 Findings、Sources 与 Gaps 四节，且不依赖会话历史即可读懂
