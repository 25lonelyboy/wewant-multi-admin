# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## 常用命令

- 仓库命令、协作约定与应用入口见 [docs/engineering/commands-and-conventions.md](docs/engineering/commands-and-conventions.md)。

## 文档治理

- 读取顺序：本文件 → [docs/README.md](docs/README.md) → 对应领域 README → 最小主题文件；按需读取，不要求通读。在某个应用内工作时，优先读该应用的 AGENTS.md。
- 事实源：架构事实在 `docs/architecture/`，工程实践在 `docs/engineering/`，决策ADR在 `docs/decisions/`，过程材料在 `docs/tasks/`，backlog 在 `docs/governance/`。
- 架构事实、工程实践等终态事实单个文档不得超过400行，每行不得超过200字符，每个文档按主题专注特定内容，不需要长篇大论关联一堆过程信息。
- 「文档」不止 `docs/`：echo 串、CI step 名、日志文案、注释都是文档，改事实时须与 `docs/` 一并扫过；被改值的引用清单要**在仓库里搜旧值**得到，凭记忆列举的不算扫描。
- 文档与代码冲突时以代码为准，并修复文档；架构事实、工程实践、代码注释只准写入与源码对应的终态事实；文档变更后跑 `pnpm doc:lint` 验收。
- 新文档必须归位到对应层目录，并登记进该目录 README 索引。
- 改变已文档化行为的代码变更，必须在同一提交内更新对应文档。

## 严格禁止的红线

以下每一条规则都是强制性的。违反任何一条规则都会遭受毁灭性打击。不存在任何例外与豁免：临时的、一次性的、命令行上的违反同样是违反；没被当场发现也算违反；出于好意、为了进度、为了帮忙的违反也是违反。

- AGENTS.md 内容不得擅自更改，如认为有值得更改的内容，需要显式提出建议，并由用户确认
- 文档命名、内容、注释、git commit mesaage、最终回复给用户的答复严禁使用T1、D2、增量1等非具体含义词汇，这些词汇在非具体场景下不可读
- 文档改动必须通读全篇，不允许留下矛盾、重复内容
- 这是你的一种行为模式（下文"我"为 user，"它"为 Agent）：

> 我让它做一盘番茄炒蛋，它往里还加了东坡肉。
> 我说有必要加东坡肉吗？它说你说得对，然后把东坡肉去掉。
> 我说好，你提 PR 吧。再一看，它 PR 写着「番茄炒蛋（无东坡肉）」并且注释里会写一大堆为什么本道菜不需要加东坡肉。

严厉禁止这种行为模式。输出不允许包含任何残留痕迹。ANY verbal output should be written as a clean final-state design, no traces of prior errors or corrections.
