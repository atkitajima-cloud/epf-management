# Taskの対象リポジトリを識別できるようにする

## 目的

EPF ManagementのTaskについて、担当するリポジトリ、または複数repoにまたがる共通作業であることを、Markdown正本と画面で一貫して扱えるようにする。

## 背景と判断

現行のFront Matterには `frontend_repo` と `backend_repo` があるが、`epf-project`、`epf-management`、共通作業を表せない。また、作成・編集画面にこれらを入力するUIもない。

`target_repo` を単一の正本フィールドとして導入する。値は `epf-project`、`epf-management`、`epf-backend`、`epf-frontend`、`common` のいずれかとする。複数repoにまたがる作業、または特定repoに限定しない作業は `common` とする。複数の任意文字列を保存する方式は、PoCの用途に対して入力・絞り込み・移行を複雑にするため採用しない。画面上の表示名は、それぞれ `project`、`management`、`backend`、`frontend`、`common` とする。表示は優先度と同じバッジ形式とし、`project` は紫、`management` は緑、`backend` は青、`frontend` は橙、`common` は灰で固定する。

旧 `frontend_repo` / `backend_repo` はTaskの正本フィールドから廃止する。既存Taskは、frontendのみなら `epf-frontend`、backendのみなら `epf-backend`、両方またはいずれもない場合は `common` へ移行する。

## 対象範囲

- `app/lib/markdown.js` のFront Matter直列化、更新、Task作成、検証を `target_repo` に対応させる。
- 作成・編集ダイアログに対象リポジトリの選択欄を追加する。
- Kanbanとガントに対象リポジトリを表示し、対象リポジトリで絞り込めるようにする。Kanbanカードでは、優先度と同じバッジ形式で、repoごとに固定色を使った `backend` のような短縮名を常時表示する。
- `tasks/*.md` の既存データを移行する。
- Markdown I/O、Task作成・更新、Kanban・ガント表示の自動テストを追加・更新する。

## 対象外

- repoごとの権限管理
- 複数の個別repoを同時に選ぶ機能（その場合は `common`）
- `epf-project`、`epf-backend`、`epf-frontend` の実装変更

## 実装ステップ

1. 対象リポジトリの定数・検証・Front Matterの優先順を追加し、作成・更新APIで受け渡す。
2. 作成・編集ダイアログへ選択欄を追加し、Kanbanのカードへ表示する。
3. ガントの対象リポジトリ表示と絞り込みを追加する。
4. 既存Taskを定義済みの移行規則で `target_repo` へ更新し、旧フィールドを除去する。
5. 自動テスト、WBS生成、ブラウザでの操作確認を実施する。

## 検証

- 不正な `target_repo` を保存できないこと。
- 各repoと `common` を作成・編集・再読込できること。
- Kanbanとガントで表示・絞り込みの対象が正しいこと。
- 既存Taskが移行後も読み込め、WBS生成が成功すること。
- `npm test` が成功すること。

## リスクと復旧

既存TaskのFront Matterを一括移行するため、移行差分を先に確認する。問題があれば当該コミットをrevertして、移行前の2フィールド形式へ戻せる。

## 完了条件

- EPF-0021の完了条件をすべて満たす。
- 検証結果をEPF-0021と本Planへ記録する。
