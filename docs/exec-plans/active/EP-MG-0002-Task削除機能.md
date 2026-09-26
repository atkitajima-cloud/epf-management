# Task details画面からTaskを削除できるようにする

## 状態

- 状態: active
- 計画承認状態: pending
- 作成日: 2026-09-26
- 対象リポジトリ: epf-management
- 関連Task: [EPF-20260925-205351-453](../../../tasks/EPF-20260925-205351-453.md)
- 人間の計画承認: 未承認

## 目的

Task details画面から不要なTaskを削除できるようにする。

## 対象範囲

- `app/lib/markdown.js`に`deleteTask(root, id, expectedRevision)`を追加する。revision照合（楽観ロック）を行い、対象Taskのファイルを削除する。
- `app/server.js`に`DELETE /api/tasks/:id`を追加する。リクエストbodyの`revision`を使う。
- `app/public/index.html`のTask details画面（編集ダイアログ）へ削除ボタンを追加する。
- `app/public/app.js`に削除ボタンのクリック処理を追加する。`window.confirm`で確認し、成功したら一覧を再読込してダイアログを閉じる。
- 削除対象を他のTaskが`depends_on`で参照している場合、確認ダイアログにその旨を表示する（削除自体は止めない。既存のガントチャートは`depends_on`が存在しないTaskを指すと警告を出す設計に既になっているため、それに合わせる）。

## 対象外

- 削除の取り消し（undo）、ゴミ箱・アーカイブ機能。
- Taskの一括削除。
- `depends_on`で参照されている場合に削除自体を禁止すること（警告表示のみとし、既存のガントチャート側の「存在しない先行Task」警告表示の仕組みをそのまま使う）。
- epf-backend/epf-frontendのPoCアプリ側のTask削除（既存実装済み。今回はEPF Managementアプリ自体の話）。

## 参照する正本・前提

- [EPF-20260925-205351-453](../../../tasks/EPF-20260925-205351-453.md)
- 確認済みの現状: `app/lib/markdown.js`、`app/server.js`に削除系の実装は存在しない。`buildGanttData`（`app/lib/markdown.js`）は`depends_on`が存在しないTaskを参照する場合、削除済みTaskとの整合を保ったまま「存在しない先行Task」という警告を出す設計に既になっている（`missingDependencies`）。
- 参考実装: `epf-frontend/src/api.ts`・`epf-frontend/src/App.tsx`に、PoCアプリ自体のTask削除（`window.confirm`→`DELETE`→一覧から除去）が既に実装されている。同じUXパターンを踏襲する。
- [品質ゲート](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-06-品質ゲート.md): Task保存・commit前検査の既存ゲートを維持する。削除は`git commit`で通常のファイル削除として扱われ、履歴に残る。

## 実施手順

1. `app/lib/markdown.js`に`deleteTask`を追加する。`withTaskWriteLock`でロックし、`readTask`相当の再読込でrevisionを照合してから`fs.unlink`する。存在しないTask、revision不一致はエラーにする。
2. `app/server.js`に`DELETE /api/tasks/:id`を追加し、`deleteTask`を呼ぶ。
3. `app/public/index.html`のTask編集ダイアログに削除ボタンを追加する。
4. `app/public/app.js`に削除ボタンのハンドラを追加する。対象Taskを`depends_on`に持つ他Taskがあれば確認メッセージに含める。確認後に`DELETE`を呼び、成功したらダイアログを閉じて一覧を再読込する。
5. `app/test/markdown.test.js`に`deleteTask`の自動テスト（正常系、存在しないTask、revision不一致、`depends_on`で参照されたTaskの削除後にガントチャートが警告を出すこと）を追加する。
6. `npm test`とアプリの主要UI操作（作成・削除・一覧反映）を確認する。

## 検証方法

- `npm test`が全件成功する。
- 画面でTaskを開き、削除ボタンで確認ダイアログが出て、確認後にTaskが削除され一覧から消えることを実機確認する。
- 削除後、`GET /api/tasks/:id`が404相当のエラーを返す。
- 他Taskの`depends_on`が削除したTaskを参照している場合、ガントチャートに「存在しない先行Task」の警告が表示されることを確認する。

## 完了条件

- Task details画面に削除ボタンがあり、確認後に対象Taskを削除できる。
- 削除後、一覧に対象Taskが表示されない。
- 自動テストと実機確認の結果が記録されている。

## 設計書への反映

- 新規作成・既存更新は不要。削除はTask保存操作の一種として、既存の[品質ゲート](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-06-品質ゲート.md)の枠内で扱う。

## リスク・未決事項

- 削除は取り消せない（Gitの履歴からは復元できるが、画面上の操作では戻せない）。誤操作対策は`window.confirm`のみとする。

## 実行前に人間へ確認すること

- なし。

## 判断・実施記録

- 2026-09-26: 作成。計画レビュー待ち。

## 実施結果と検証

- 未実施。
