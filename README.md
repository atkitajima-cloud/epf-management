# EPF Management

Markdown / GitをSingle Source of Truthにし、人間にはPlanner風Kanban、AIにはプロジェクト全体の文脈を提供するローカルプロジェクト管理PoCです。

```text
Markdown / Git  ── 正本・変更履歴
       │
       ├── Local Web UI ── 閲覧・編集・Drag & Drop
       └── Codex Adapter ── 分析・Task案・WBS生成
```

DBと外部SaaSは使用しません。UIでの変更は `tasks/*.md` へ直接反映されます。

## 起動

必要環境はNode.js 20以上です。外部npmパッケージのインストールは不要です。

```bash
npm start
```

ブラウザで <http://localhost:4173> を開きます。開発中は自動再起動付きで起動できます。

```bash
npm run dev
```

ポートを変える場合（PowerShell）:

```powershell
$env:PORT=5000; npm start
```

## AI Adapter

標準では、認証やCLI状態に依存せずPoCを試せる `MockCodexAdapter` を使います。

確認済みのCodex CLI 0.153.0では、次のように実際のCodexへ切り替えます。

```powershell
$env:AI_ADAPTER='codex'; npm start
```

アプリは `codex exec` を `--ephemeral --sandbox read-only --ask-for-approval never --output-schema` 付きで呼び出します。Codexはリポジトリを分析して構造化された操作候補を返し、実際のMarkdown更新はBackendが検証して実行します。CLI未導入・未認証・タイムアウトなどの場合はMockへフォールバックし、画面に理由を表示します。

## 使い方

- Kanban: `Backlog / Ready / Doing / Review / Done` のカードを一覧表示します。
- 状態変更: カードを別の列へDrag & Dropすると、対象Markdownの `status` が更新されます。
- 詳細編集: カードをクリックし、Front Matterと本文を編集して保存します。
- AI Chat: 「証票一覧に取引先名検索を追加するタスクを作って」のように依頼すると、新しいTask Markdownが作成され即時表示されます。
- 分析: タスク分割、優先順位、Requirementの抜け漏れは提案だけを表示し、既存データを自動変更しません。
- WBS: ヘッダーのボタン、またはChatの「現在のタスクからWBSを作って」で `views/wbs.md` を再生成します。
- ガント: ヘッダーの「ガント」または `http://localhost:4173/gantt.html` から開きます。開始日・期限・進捗・依存関係・日程判定を確認し、日程の編集はTask詳細で行います。
- Git: 現在のブランチと変更ファイルを右下に表示します。ヘッダーからPull、または確認後のCommit & Pushを実行できます。

## データ構造

```text
context/       背景・範囲・制約・用語
requirements/ 要求（REQ-xxxx）
decisions/    意思決定（ADR-xxxx）
meetings/     会議記録
tasks/        Taskの正本（EPF-xxxx、1タスク1ファイル）
plans/        大きな変更のPlan
views/        Taskから生成する派生View
templates/    Markdownテンプレート
app/          ローカルWebアプリ
```

Taskの必須Front Matterは `id`, `title`, `status`, `owner`, `priority`, `requirement` です。statusは `backlog`, `ready`, `doing`, `review`, `done` のいずれかです。ガント用の任意項目は `start`（開始予定日）、`due`（期限）、`depends_on`（先行Task IDをカンマ区切り）です。進捗率は本文の完了条件のチェックボックスから算出します。

## Taskの作成

Taskは次の2つの経路で作成できます。どちらも `tasks/EPF-nnnn.md` を新規作成します。

- **画面**: ボード見出し右の「新規Task」からフォームで作成します。タイトル、担当者、Requirementは必須で、不正な入力は補完せずエラーを表示します。Requirementは `requirements/` にあるものから選びます。先行Taskは存在するIDだけ指定できます。本文が空の場合は、背景・目的・完了条件・関連の見出しを持つ雛形を使います。Planは指定できず、Front Matterにも書きません。
- **AI Chat**: 「〜のタスクを作って」と依頼します。不足する項目は既定値で補います。

APIは `POST /api/tasks`（作成。成功は201、入力不正は400）と `GET /api/requirements`（Requirement一覧）です。

## 設計上の境界

- `app/lib/markdown.js`: Markdownの解析、検証、読み書き、WBS・ガント用データ生成
- `app/lib/adapters.js`: `CodexAdapter` / `MockCodexAdapter`
- `app/lib/git.js`: read-onlyなGit状態取得
- `app/server.js`: HTTP APIと静的ファイル配信
- `app/public/`: 依存なしのKanban UI

PoCでは単純なscalar値だけのFront Matterを扱います。ネストしたYAMLや複数人同時編集は対象外です。

## テスト

```bash
npm test
```

テストは一時ディレクトリ上でTask作成・更新・WBS生成を確認し、リポジトリの実データを変更しません。

## サンプルデータ

Requirement 2件、Task 8件、Decision 2件、Meeting Note 1件、Plan 1件を同梱しています。起動直後から全状態のKanbanとAI Chatの用途を確認できます。

## 今後の候補

Workload、営業日計算、クリティカルパス、Requirement Traceability、PR / Redmine連携、会議メモ解析、Risk、Milestone、Multi Project、Teams通知はPoC後の利用結果を見て追加します。
