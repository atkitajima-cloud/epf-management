# AI Chat廃止と変更履歴パネル

## 目的

Webアプリを人間向けのProject Viewer / Editorに整理し、Webアプリ内のAI ChatとCodex Adapterを削除する。空いた右ペインにはGit履歴を正本とする直近の変更履歴を表示し、Kanbanを見ながら誰が・いつ・何を変更したか確認できるようにする。

## 対象範囲

- AI Chatの画面、API、Adapter初期化、Adapter実装、schema、専用CSS・JavaScriptの削除
- `app/lib/git.js` への直近20件の履歴取得とTask変更解析の追加
- `GET /api/git/history` の追加
- 右ペインを変更履歴と既存Git状態パネルの構成に変更
- 初回表示、手動更新、Pull成功後、Commit & Push成功後の履歴再取得
- READMEとテストの更新

## 対象外

- Task・Requirementのデータ形式変更
- Git以外の履歴保存先やDBの追加
- 未コミット変更を変更履歴として表示する機能
- 複雑なMarkdown本文diffや複数Taskをまたぐ変更内容の完全な意味解析
- Kanban、Task作成・編集、ガント、WBS、既存Git同期仕様の変更

## 設計判断

- Gitの直近commitを `git log` から取得し、履歴データを保存しない。
- commitごとの変更ファイルは `git diff-tree`、Taskの変更前後は `git show` で取得する。
- Task Front Matterは既存の単純なscalar形式に合わせ、`title`, `status`, `owner`, `priority`, `start`, `due`, `requirement`, `depends_on` のみ比較する。
- 新規Taskは「Taskを追加」、既存Taskは変更前後を返す。解析できない場合もcommit情報と変更ファイル数を返して表示を継続する。
- root commitを含めて扱い、Git repositoryでない場合と履歴0件の場合は正常な空結果として返す。
- 右ペイン幅は現状を維持し、履歴領域だけを縦スクロールさせる。

## 実装ステップ

1. Git履歴取得・Task Front Matter比較を `app/lib/git.js` に実装する。
2. `GET /api/git/history` を追加し、AI Chat・meta API・Adapter初期化を削除する。
3. 右ペインのHTML、CSS、JavaScriptを変更履歴表示へ置き換える。
4. PullとCommit & Pushの成功後にTask・Git状態・履歴を再取得する。
5. Adapter実装とresponse schemaを削除する。
6. READMEを人間向けWeb UIとVS Code + Codexの役割分担に合わせて修正する。
7. 一時Git repositoryを使う履歴テストを追加し、既存テストを実行する。

## 検証

- Git repositoryでないディレクトリが空の履歴結果を返すこと。
- commitがないrepositoryが空の履歴結果を返すこと。
- 通常commitのauthor・日時・message・short hash・変更ファイルを取得できること。
- Task新規作成commitを「Taskを追加」と解析できること。
- Task Front Matter変更commitで対象項目のbefore / afterを取得できること。
- `npm test` が成功すること。
- AI Chat / Adapterへの参照がコード、CSS、README、テストに残っていないこと。
- Task作成・編集、WBS、ガント、Git状態と同期の既存経路が維持されていること。

## リスク

- 古いcommitに不正なTask Markdownがある場合は詳細解析できないため、commitメッセージと変更ファイル数へフォールバックする。
- renameや複雑なmerge commitは簡易解析の対象外になりうるが、履歴自体は表示する。
- commit件数分のGit呼び出しが発生するため、上限を20件に固定する。

## 未決事項

なし。表示件数は20件、対象Front Matterは依頼で指定された8項目とする。
