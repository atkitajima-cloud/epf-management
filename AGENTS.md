# Repository Instructions

## Source of Truth

- Markdown / GitがSingle Source of Truthである。
- DBを導入しない。UI固有の永続データを作らない。
- `tasks/*.md` は1タスク1ファイルとし、必須Front Matterを維持する。
- UI都合でMarkdownのデータ構造や意味を壊さない。

## Information Model

- Context → Requirement → Task → Planの関係を維持する。
- Taskは対応するRequirementを明記する。
- WBSは `tasks/*.md` から生成する派生Viewであり、正本として編集しない。
- 事実と推測・提案を明確に分ける。

## AI Safety

- AIは既存RequirementやDecisionを勝手に変更しない。
- Task追加のような明示的な依頼以外は、原則として変更案を提示して承認を待つ。
- Codex CLIにはread-onlyで分析させ、書き込みはアプリ側で検証して行う。

## Change Management

- 大きな変更の前に `plans/` のPlanを作成または更新する。
- Git履歴とユーザーの未コミット変更を尊重する。
- commit / pushを自動実行しない。
- 変更後はMarkdown I/O、API、主要UIフローを検証する。
