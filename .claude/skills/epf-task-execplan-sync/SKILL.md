---
name: epf-task-execplan-sync
description: "EPF ManagementのTaskを着手、review、完了へ進める際に、Task Markdownと関連ExecPlanの同期を確認・記録する。EPF-XXXXの状態変更、クローズ、またはTaskとExecPlanの同期が必要なときに使う。"
---

# TaskとExecPlanの同期（参照）

このファイルは参照経路である。手順の正本は次のファイルであり、ここに内容を複製しない。

[../../../.agents/skills/epf-task-execplan-sync/SKILL.md](../../../.agents/skills/epf-task-execplan-sync/SKILL.md)

## 使い方

1. 上記の正本SKILL.mdを読む。
2. そこに書かれた参照先、通知、実施手順、制約、完了報告に従う。
3. 正本を読めない場合は、Taskの状態を変更しない。

正本は`.agents/skills/`に置いており、Codexが自動検出する配置である。Claude Codeは`.claude/skills/`を探索するため、このファイルで同じSkillへ到達できるようにしている。配置方針は`../../../../epf-project/docs/design-docs/ai-skill-operation.md`を参照する。
