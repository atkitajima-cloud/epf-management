# PLAN-0018: Taskの同時作業を安全にする

## 状態

- 状態: レビュー待ち
- 作成日: 2026-09-25
- 計画承認状態: approved
- 人間承認: 2026-09-25、kitajimaが実装を依頼。
- 関連Task: [EPF-0041](../tasks/EPF-0041.md)
- 上位計画: [PLAN-0002](PLAN-0002-team-collaboration.md)
- 関連資料: [IMP-04](../../epf-project/docs/references/poc-retrospective-and-team-readiness.md#imp-04)

## 目的

Task IDの重複、他の人の更新による上書き、確認していない変更のcommitを防ぐ。

## 方針

- 新しいTask IDは、日本時間の年月日時分秒とミリ秒3桁を使う。形式は `EPF-YYYYMMDDHHMMSSmmm`。既存の4桁IDは変えない。同じミリ秒の衝突対応は追加しない。
- 同じアプリを使う人の保存は、Taskを開いた時のrevisionと照合する。古いrevisionなら保存せず、最新を読み直すか確認する。
- 別々のcloneでは、Taskを保存した時点で相手の変更は分からない。Commit & Pushの直前に共有側を取得し、同じTaskが先に更新されていたらcommitを止める。確認後に最新版へ更新すると、この作業ツリーの該当Taskの変更を破棄する。利用者は最新版を編集し直す。自動マージはしない。
- Commit & Pushは、確認したファイルと内容だけをcommitする。確認後に内容が変わったら中止する。

## 対象外

- WBSの競合解消（IMP-08で扱う）。
- 既存Task IDの変更、共有Webサーバーの導入。
- 同じミリ秒に作成されたIDの衝突処理。

## 実施と検証

1. 既存IDを保ったまま、Task ID検証・リンク・履歴を4桁と17桁に対応させる。
2. 1ミリ秒違う時刻から、別々のTask管理ルートで異なるIDが作られることをtestする。
3. 同じTaskを古いrevisionで同時保存し、先の保存だけが残ることをtestする。
4. 別cloneで同じTaskが先に共有された場合、後からのCommit & Pushを止める。確認後に最新版へ更新し、再編集・共有できることをtestする。
5. 確認後に変わった内容や未確認のstage変更がcommitされないことをtestする。
6. `npm test`と記録検査を実行し、結果をTaskと本Planに記録する。

## 記録

- 2026-09-25: TaskとIMP-04を確認して作成。採番形式と既存IDを変えない方針を利用者が指定。
- 2026-09-25: 利用者の依頼により実装を開始。別cloneでは保存時に更新を検出できないため、Commit & Push前に確認し、最新版へ更新してやり直す流れを実装する。
- 2026-09-25: 実装完了。Task作成・詳細編集・状態変更・受入記録、Commit & Pushを更新し、READMEへ操作を記載。最新版へ更新した場合は同じTaskだけを差し替え、別ファイルの変更を残す。
- 2026-09-25: `npm test` 43件成功。`node scripts/check-records.mjs` はエラー0件（既存切れリンク12件）。人間の受入確認待ち。
