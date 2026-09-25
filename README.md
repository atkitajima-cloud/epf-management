# EPF Management

Markdown / GitをSingle Source of Truthにする、人間向けのProject Viewer / Editorです。Webアプリ自身はAI機能を持ちません。

```text
Markdown / Git    正本・変更履歴
       │
       ├── EPF Management   人間による閲覧・Task作成・編集・状態更新
       └── VS Code + Codex  AIによる横断分析・計画・Task分解・最適化
```

DBと外部SaaSは使用しません。UIでの変更は `tasks/*.md` へ直接反映されます。

## このシステムについて

### なぜあるのか

要求・Task・PlanをMarkdownとGitに置くことで、人とAIが同じ情報を直接読めるようにします。人はEPF ManagementのKanban・ガント・変更履歴で閲覧や日常の更新を行い、AIによるプロジェクト横断分析・計画・Task分解・最適化はVS Code + CodexからMarkdown / Gitを直接参照して行います。

EPF Managementは人間向けの薄いProject Viewer / Editorです。AI作業の実行環境とは分離します。

### 位置づけ

```text
EPF Management   人間向けProject Viewer / Editor
VS Code + Codex  AIによるプロジェクト横断分析・計画・Task分解・最適化
```

- GitとNode.jsを利用できるチームが、Taskの閲覧・追加・編集・状態更新に使います。
- 同じTaskをPlannerなどと両方に入れると、状態が食い違います。粒度で分けて、二重に管理しないでください。
- Plannerなどへの報告は、必要なときに「WBSを生成」で作った `views/wbs.md` を見て行います。

### 使い方の流れ

1. `context/` と `requirements/` に、背景と要求をMarkdownで書きます（`templates/` を使えます）。
2. 画面の「新規Task」からTaskを作ります。
3. Kanbanで、カードを列へ動かして状態を更新します。詳細は、カードをクリックして編集します。
4. ガントで、日程、進捗、遅延、先行Taskとの関係を確認します。日程は、Taskの開始日と期限で決まります。
5. 報告や記録が必要なときに、「WBSを生成」で `views/wbs.md` を作ります。
6. 変更を共有するときは、Commit & Pushを押します。他の人の更新は、Pullで取り込みます。

AIによる保守はVS Code + Codexから行い、[AGENTS.md](AGENTS.md) の作業規則に従います。

### 対象外

- チーム全員向けの、通知やコメント、モバイル対応を備えた管理ツール。
- Requirementを画面から作成・編集する機能（Markdownを直接編集します）。
- 複数のTaskを、AIが一括で生成して登録する機能（Taskは1件ずつ作成します）。

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

## 使い方

- Kanban: `Backlog / Ready / Doing / Review / Done` のカードを一覧表示します。
- 状態変更: カードを別の列へDrag & Dropすると、対象Markdownの `status` が更新されます。
- 詳細編集: カードをクリックし、Front Matterと本文を編集して保存します。
- 新規Task: ボード見出しの「新規Task」からTask Markdownを作成します。
- VS Codeで確認: Task詳細の「VS CodeでTaskを開く」を押すと、該当する `tasks/EPF-xxxx.md` をVS Codeで開きます。Task本文の相対リンクからExecPlanや設計文書を確認します。通常版VS Codeが必要で、ブラウザが外部アプリ起動の確認を表示する場合があります。
- 変更履歴: 右ペインにGitの直近20件を表示します。Taskの追加や主要なFront Matter変更は内容を要約し、↻で再取得できます。
- WBS: ヘッダーの「WBSを生成」で、既存Taskから派生Viewの `views/wbs.md` を再生成します。
- ガント: ヘッダーの「ガント」または `http://localhost:4173/gantt.html` から開きます。開始日・期限・進捗・依存関係・日程判定を確認し、日程の編集はTask詳細で行います。
- Git: 現在のブランチと変更ファイルを右下に表示します。ヘッダーからPull、または確認後のCommit & Pushを実行できます。詳しくは「Gitの同期」を参照してください。

## データ構造

```text
context/       背景・範囲・制約・用語
requirements/ 要求（REQ-xxxx）
tasks/        Taskの正本（EPF-xxxx、1タスク1ファイル）
masters/      担当者マスタ（owners.md）
plans/        このアプリ自体の大きな変更のPlan（管理対象のTaskとは無関係）
views/        Taskから生成する派生View
templates/    Markdownテンプレート
app/          ローカルWebアプリ
```

### ステータスの意味

Kanbanの5つの列は、次の意味で使います。画面でも、各列の見出しの下に短い説明を表示し、列にマウスを重ねると定義を表示します。

| ステータス | 意味 |
|---|---|
| Backlog | まだ確認していない候補。完了条件・担当者・先行Taskが未確認で、着手の順番も決まっていない。 |
| Ready | 人が確認済みで、いつでも着手できる状態。完了条件が書かれ、担当者が決まり、先行Taskが終わっているか待つ必要がない。 |
| Doing | 着手して、作業している。 |
| Review | 作業は終わり、完了条件を満たしているかの確認（レビュー・検証）を待っている。 |
| Done | 完了条件をすべて満たし、確認が済んだ。 |

Readyにする条件はアプリでは確認しません。Doneへの変更には、人間受入の事前記録が必要です。

Taskの必須Front Matterは `id`, `title`, `status`, `owner`, `priority`, `target_repo` です。`target_repo` は `epf-project`, `epf-management`, `epf-backend`, `epf-frontend`, `common` のいずれかです。`requirement`（REQ-0000形式）は任意で、空欄でも構いません。statusは `backlog`, `ready`, `doing`, `review`, `done` のいずれかです。`done`には`completed_at`（YYYY-MM-DD）、`accepted_by`、`actual_completed_at`が必要です。`actual_started_at`と`actual_completed_at`はタイムゾーン付きISO 8601形式で記録します。ガント用の任意項目は `start`（開始予定日）、`due`（期限）、`depends_on`（先行Task IDをカンマ区切り）です。進捗率は本文の完了条件のチェックボックスから算出します。

新しいTask IDは、日本時間の年月日時分秒とミリ秒3桁を使います（例: `EPF-20260925120405006`）。既存の4桁IDはそのまま使えます。

人間が成果物を受け入れるときは、TaskをReviewにして詳細画面の「人間受入を記録」を押します。アプリはTaskのownerを`accepted_by`、サーバー時刻を`actual_completed_at`へ保存します。その後、別の操作でDoneへ変更します。受入とDoneの同時送信は拒否されます。現在のアプリには利用者認証がないため、この記録は操作者本人の証明にはなりません。導入前に完了したTaskは`config/task-validation-baseline.json`に限定して経過措置を記録しています。

## Taskの作成

Taskは画面の「新規Task」から作成し、`tasks/EPF-nnnn.md` として保存します。

ボード見出し右の「新規Task」からフォームで作成します。タイトルと担当者は必須で、不正な入力は補完せずエラーを表示します。Requirementは任意で、指定する場合は `requirements/` にあるものから選びます。先行Taskは存在するIDだけ指定できます。本文欄には、背景・目的・完了条件・関連の見出しを持つ雛形が最初から入っており、編集して作成できます。空にして作成した場合も、同じ雛形を保存します。Planは指定できず、Front Matterにも書きません。

APIは `POST /api/tasks`（作成。成功は201、入力不正は400）と `GET /api/requirements`（Requirement一覧と本文の雛形）です。

## 担当者マスタ

Taskの担当者は、`masters/owners.md` に登録した担当者から選びます。作成・編集ダイアログの担当者欄は、このファイルから選択肢を作ります。

- 担当者は `- ID` の形式で1行に1人書きます。IDは半角英数字、`-`、`_` で指定します。これ以外の行（見出し、説明文）は読み込まれません。
- 担当者を追加するときは、`masters/owners.md` に行を足して保存します。画面を再読込しなくても、次にダイアログを開いたときに反映されます。画面からの追加・変更・削除はできません。
- `unassigned` は担当者未定を表し、作成時の既定値です。
- 担当者を変更するときだけ、マスタにあるか確認します。担当者を変えない更新（状態のドラッグ操作など）は、マスタにない担当者のTaskでも実行できます。編集ダイアログでは、マスタにない現在の値が「（マスタ未登録）」付きで残ります。
- マスタがない、または空の場合は、Taskの作成と担当者の変更ができません。

APIは `GET /api/owners`（担当者IDの一覧）です。

## Gitの同期

画面のボタンだけで、他の人の更新の取り込みと、自分の変更の共有ができます。

- **Commit & Push**: 変更をcommitし、共有側の最新を取得して、自分の変更をその上に置き直してから送信します。他の人が先に送信していても、同じ場所を変更していなければ、1回押すだけで共有されます。
- **同じTaskが先に共有された場合**: Commit & Pushを止めます。確認して最新版へ更新すると、この作業ツリーに保存した該当Taskの変更は失われます。最新版を開いて変更をやり直します。本文、日付、状態などTask全体が対象です。
- **共有側を確認できない場合**: commitせず、ローカルの変更を残します。pushに失敗してcommitが残った場合は、Commit & Pushをもう一度押せます。
- **Pull**: 他の人の更新を取り込みます。共有していない自分のcommitがある場合は、その上に置き直します。未コミットの変更があるときは実行できません。先にCommit & Pushしてください。
- **同じ場所を変更していた場合**: 自動では取り込まず、操作前の状態に戻して、対象ファイルを表示します。自分の変更は失われません。詳しい人に相談してください。
- **`views/wbs.md` だけが競合した場合**: Taskから再生成して、自動で解決します。
- **状態表示**: Gitパネルに、pushしていないcommitの件数と、共有側の更新の件数を表示します。共有側の確認（通信）は、パネルの更新ボタン（↻）、Pull、Commit & Pushを押したときに行います。
- **変更履歴**: 右ペインに直近20件のcommitを新しい順で表示します。日時、author、short hash、commit message、変更ファイル数に加え、Task追加や主要なFront Matter変更を取得できた場合はTask ID・タイトル・変更内容を表示します。履歴は初回表示、履歴の更新ボタン、Pull成功後、Commit & Push成功後に再取得します。
- force pushとmerge commitは使いません。操作は、ボタンを押したときだけ実行されます。
- IDに使う時刻が別々なら、別cloneでも異なるIDになります。同じミリ秒のID衝突に対する追加処理はありません。

## 設計上の境界

- `app/lib/markdown.js`: Markdownの解析、検証、読み書き、WBS・ガント用データ生成
- `app/lib/git.js`: Git状態・変更履歴の取得と、Pull・Commit & Pushによる同期
- `app/server.js`: HTTP APIと静的ファイル配信
- `app/public/`: 依存なしのKanban UI

PoCでは単純なscalar値だけのFront Matterを扱います。ネストしたYAMLや複数人同時編集は対象外です。

## テスト

```bash
npm test
```

テストは一時ディレクトリ上でTask作成・更新・WBS生成を確認し、リポジトリの実データを変更しません。

## サンプルデータ

RequirementとTaskのサンプルを同梱しています。起動直後から全状態のKanban、ガント、変更履歴を確認できます。

## 今後の候補

Workload、営業日計算、クリティカルパス、Requirement Traceability、PR / Redmine連携、会議メモ解析、Risk、Milestone、Multi Project、Teams通知はPoC後の利用結果を見て追加します。
