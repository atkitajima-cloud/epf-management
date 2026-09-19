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

## Plan-Driven Development

- 小さな文言修正を除く機能追加、データ構造変更、外部連携、運用変更の前には、必ず `plans/` にPlanを作成または更新する。
- Planには目的、対象範囲、非対象、設計判断、実装ステップ、検証、リスク、未決事項を記載する。
- ユーザーが「Planのみ」「計画作成まで」と指定した場合は、Plan以外のコード、設定、Markdownデータ、Git操作を変更せず、レビューを待つ。
- Planレビュー後も、実装開始はユーザーの明示的な承認を受けてから行う。承認範囲を超える実装は行わない。
- Planで提案した機能は、実装済みであるかのようにUI、README、回答で扱わない。
- 専門用語、製品名、ファイル名、コマンド名は一般的な表記を使ってよい。説明文と見出しは平易な日本語で書き、不要な英語表現は避ける。

## Turn Commit Discipline

- 変更を伴う作業ターンは、完了前にそのターンで意図した変更を必ずGitコミットする。変更がない回答だけはコミットしない。
- コミット前に対象ファイル、差分、テストまたは確認結果を確認し、無関係な変更を混在させない。
- コミットメッセージは日本語を必須とし、そのターンの変更内容が履歴から分かる簡潔な命令形にする。
- このルールはCodexの作業に適用するものであり、Webアプリが利用者の操作を自動commit / pushすることを意味しない。