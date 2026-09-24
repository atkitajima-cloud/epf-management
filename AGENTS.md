# リポジトリの作業規則

## 正本

- Markdown / GitがSingle Source of Truthである。
- DBを導入しない。UI固有の永続データを作らない。
- `tasks/*.md` は1タスク1ファイルとし、必須Front Matterを維持する。
- UI都合でMarkdownのデータ構造や意味を壊さない。

## 情報のつながり

- Context → Requirement → Task → Planの関係を維持する。
- WBSは `tasks/*.md` から生成する派生Viewであり、正本として編集しない。
- ガントチャートも `tasks/*.md` から生成する派生Viewであり、表示用データを正本として保存しない。
- `epf-project` のExecPlanに関連するTaskは、本文の「関連」からExecPlanへリンクする。Taskを `review` または `done` にするときは、実施内容と検証結果がExecPlanにも記録されていることを確認する。
- TaskとExecPlanの同期ルールは `../epf-project/docs/design-docs/task-execplan-sync.md` を参照する。
- 設計・判断Taskを完了する前に、後続実装Taskと依存関係、または実装不要理由を記録する。
- 再利用するAI作業のSkill運用は `../epf-project/docs/design-docs/ai-skill-operation.md` を参照する。
- AI作業で検出された不備・記録漏れ・再発防止事項は、`../epf-project/docs/design-docs/ai-work-defect-record-and-improvement-loop.md` と `../epf-project/docs/references/ai-work-defect-log.md` に従って記録・追跡する。
- 事実と推測・提案を明確に分ける。

## AIの安全性

- AIは既存Requirementを勝手に変更しない。
- 利用者がTask、WBS、Planの変更を明示的に依頼した場合は、対象と変更内容を検証したうえで反映し、適用結果を表示する。提案だけで止めない。
- 「Backlogを全てReadyへ移動」のように複数Taskを対象とする明示指示も、対象一覧・件数・適用結果を示して実行する。
- Requirementの変更、削除、大規模な一括変更など、影響範囲が読み取りにくい操作は、変更案を示して承認を待つ。
- Codex CLIは分析に利用できる。Markdownへの変更はアプリ側で入力・対象・結果を検証して行い、利用者の明示指示を実現する。

## 変更の管理

- 大きな変更の前に `plans/` のPlanを作成または更新する。
- Taskの追加、編集、状態変更、日程・担当・依存関係の変更は、`tasks/*.md` とGit差分で追跡する。これらのTaskデータ変更だけを理由にPlanを作成する必要はない。
- TaskをMarkdownで直接 `done` に変更する場合は、同時に日本時間の当日を `completed_at`（`YYYY-MM-DD`）へ記録する。`done` 以外へ戻す場合は `completed_at` を空にする。
- Git履歴とユーザーの未コミット変更を尊重する。
- commit / pushを自動実行しない。
- 変更後はMarkdown I/O、API、主要UIフローを検証する。

## 計画に基づく開発

- 小さな文言修正を除く機能追加、データ構造変更、外部連携、運用変更の前には、必ず `plans/` にPlanを作成または更新する。
- Planには目的、対象範囲、非対象、設計判断、実装ステップ、検証、リスク、未決事項を記載する。
- ユーザーが「Planのみ」「計画作成まで」と指定した場合は、Plan以外のコード、設定、Markdownデータ、Git操作を変更せず、レビューを待つ。
- Planレビュー後も、実装開始はユーザーの明示的な承認を受けてから行う。承認範囲を超える実装は行わない。
- Planで提案した機能は、実装済みであるかのようにUI、README、回答で扱わない。
- 専門用語、製品名、ファイル名、コマンド名は一般的な表記を使ってよい。説明文と見出しは平易な日本語で書き、不要な英語表現は避ける。

## 作業ターンごとの記録

- 変更を伴う作業ターンは、完了前にそのターンで意図した変更を必ずGitコミットする。変更がない回答だけはコミットしない。
- コミット前に対象ファイル、差分、テストまたは確認結果を確認し、無関係な変更を混在させない。
- コミットメッセージは日本語を必須とし、そのターンの変更内容が履歴から分かる簡潔な命令形にする。
- このルールはCodexの作業に適用するものであり、Webアプリが利用者の操作を自動commit / pushすることを意味しない。

## 規約検査

- 作業開始時に `git config core.hooksPath .githooks` を設定する。commit前に `scripts/check-records.mjs` が4repoの記録を検査する。
- 実装差分のcommitでは `EPF_TASK_ID` に対象Task IDを指定する。手動確認は `node scripts/check-records.mjs` で行う。
- このローカル検査を迂回できる経路のサーバー側対策はEPF-0039で扱う。
