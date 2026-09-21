# ブラウザからVS CodeでTaskを開く

## 目的

EPF ManagementのKanbanで選択したTaskから、そのTask MarkdownをVS Codeで直接開けるようにする。利用者はVS Code上のTaskを起点に、既存の相対Markdownリンクを使ってExecPlanや設計文書をレビューできるようにする。

## 背景と判断

EPF-0026のように、ブラウザのTask詳細からレビュー対象のExecPlan・設計文書を確認したい場面がある。Task本文にはすでに関連文書への相対リンクがあり、VS Codeではそのリンクをそのまま辿れる。一方、現行のブラウザ詳細画面は編集用テキストエリアだけであり、Markdownリンクを開けない。

関連文書ごとのリンクをブラウザに再実装する方式は採用しない。リンクの解釈、表示、パス解決を二重管理することになるためである。

代わりに、Task詳細から当該 `tasks/EPF-xxxx.md` をVS Codeで開く。Task Markdownをレビューの入口かつ正本とし、そこから既存の相対リンクで関連文書へ移動する。ブラウザからの起動には、VS Code公式の `vscode://file/...` URLを利用する。

## 対象範囲

- Task詳細ダイアログに `VS CodeでTaskを開く` ボタンまたはリンクを追加する。
- 選択中の有効なTask IDだけを使い、そのTask Markdownの絶対パスから `vscode://file/...` URLを生成する。
- URLはサーバーが管理するEPF Managementのリポジトリルートを基準に生成する。Task MarkdownへPC固有の絶対パスを書き込まない。
- Task MarkdownをVS Codeで開いた後、本文の既存相対リンクからExecPlan・設計文書を辿れることを確認する。
- READMEに、この導線の使い方、VS Codeが必要であること、ブラウザが外部アプリ起動の確認を表示する場合があることを記載する。
- URL生成の単体テストと、既存のMarkdown I/O・Task詳細編集の回帰確認を行う。

## 対象外

- Task本文のMarkdownレンダリング、またはブラウザ内での設計書・ExecPlanプレビュー
- Task Markdown内の相対リンク形式やディレクトリ構成の変更
- VS Codeのインストール、拡張機能の導入、ブラウザ設定の自動変更
- VS Code Insiders向けの `vscode-insiders://` URL対応
- ブラウザからの任意ファイル・任意コマンド起動

## 設計方針

### Task Markdownを唯一のレビュー入口にする

Task詳細に表示するリンク先は常に `tasks/{Task ID}.md` とする。関連文書を列挙・解析しないため、Task本文の「関連」とVS CodeのMarkdownリンクがレビュー対象の正本になる。

### パス解決と安全性

サーバー側で、既存のTask ID検証と同じ `EPF-0000` 形式を通したIDからTaskファイルパスを求める。任意のパスをリクエストやHTMLから受け取らない。解決先がリポジトリ内の `tasks/` 配下であることを確認してから、Windows形式の絶対パスを `vscode://file/...` URLに変換する。

ブラウザ側はサーバーが返したURLを明示的な利用者操作で開くだけとする。カードクリックやTask詳細の表示時にVS Codeを自動起動しない。

### 画面の扱い

既存のカードクリックはTask詳細を開く挙動のまま維持する。Task詳細ダイアログの操作領域に、保存操作と区別できる二次ボタンとして `VS CodeでTaskを開く` を置く。VS Codeが未インストールの場合やブラウザが外部プロトコルを拒否した場合は、ブラウザ／OSの案内に従う前提とし、アプリからファイルを変更しない。

## 実装ステップ

1. Task IDからリポジトリ内のTask Markdownを安全に解決し、`vscode://file/...` URLへ変換する小さな関数を追加する。
2. `GET /api/tasks/:id` の応答へ、解決済みのVS Code URLを追加する。既存のTaskデータとMarkdown正本は変更しない。
3. Task詳細ダイアログへ `VS CodeでTaskを開く` 導線を追加し、明示クリック時だけ外部URLを開く。
4. URL生成の正常系、空白を含む親ディレクトリ、無効なTask ID・リポジトリ外パスをテストする。
5. READMEへ利用手順と前提を追記する。
6. `npm test` とブラウザで、EPF-0026からTask Markdownを開き、そこからBackend ExecPlanとProject Designのリンクを辿る操作を確認する。

## 検証

- EPF-0026の詳細から明示操作で `tasks/EPF-0026.md` をVS Codeに開ける。
- VS Codeで開いたTask本文から、Backend ExecPlanとProject Designの相対リンクを開ける。
- カードクリックとTask詳細の表示だけでは、VS Codeが自動起動しない。
- 無効なTask IDや任意パスを指定して、リポジトリ外のファイルを開けない。
- VS Code URLを生成できない・外部プロトコルが利用できない場合でも、Taskの閲覧・編集・保存は従来どおり行える。
- `npm test` が成功する。

## リスクと復旧

| リスク | 軽減策 |
| --- | --- |
| ブラウザが外部アプリ起動の確認を表示する | 初回確認はOS／ブラウザの通常動作としてREADMEに記載し、利用者の明示クリックだけで起動する。 |
| PCごとにWorkspaceの絶対パスが異なる | Task Markdownには相対リンクだけを保存し、実行中サーバーのリポジトリルートからローカルURLを都度生成する。 |
| URL生成の不備で意図しないファイルを開く | Task IDを固定形式で検証し、`tasks/` 配下の既知ファイルだけを解決する。 |
| 導線が不要または不安定 | APIの追加フィールドとTask詳細のボタンだけをrevertし、Task Markdownと既存リンクはそのまま維持する。 |

## 未決事項

なし。通常版VS Codeを前提とし、VS Code Insiders対応が必要になった場合は別Taskで扱う。
