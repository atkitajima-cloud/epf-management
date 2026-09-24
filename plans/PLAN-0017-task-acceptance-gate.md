# EPF-0038のTask受入ゲート

## 状態

- 状態: 実装済み・人間レビュー待ち
- 関連Task: [EPF-0038](../tasks/EPF-0038.md)
- 上位計画: [規約検査と人間承認ゲート](../../epf-project/docs/exec-plans/active/0014-rule-and-human-approval-gates.md)
- 人間承認: 2026-09-24、上位計画への「承認します。実装をお願い」に基づく。

## 目的

人間の最終受入が記録される前に、EPF ManagementのTaskを誤って`done`へ保存する事故を防ぐ。

## 対象範囲

- Taskの実日時をタイムゾーン付きISO 8601で検証する。
- 新規実Taskの`done`には`accepted_by`と`actual_completed_at`を要求する。
- 受入を記録するAPIと画面操作を追加する。時刻はサーバーが記録し、`accepted_by`には既存の`owner`を使う。
- `done`への遷移では、受入記録が変更前のTaskにあることを要求する。受入と`done`の同時送信は拒否する。
- 導入前に完了したTaskのIDを検査設定へ固定し、新しい欄だけの経過措置とする。サンプルTaskとEPF-0016の未チェック条件は既存設計書の例外に合わせる。
- Task保存経路とMarkdown直接編集の読取経路に同じ検証規則を適用する。
- 4repo共通の記録検査プログラムと既存切れリンクのbaselineをこのrepoに置き、各repoのcommit前hookから呼び出す。

## 対象外

- 利用者認証と、AIによる受入欄の意図的な偽造の防止。EPF-0039へ引き渡す。
- 過去Taskの受入欄を推測して補完すること。
- Task APIのbackend/frontend PoCアプリへの変更。

## 設計判断

- 受入操作は既存Taskに対する独立したAPIとし、Task更新APIの入力欄から`accepted_by`と実完了時刻を受け取らない。
- `completed_at`は受入時刻を日本時間へ換算した日付を使う。状態を戻した場合、受入欄も消し、再受入を要する。
- 既存の完了TaskはIDで限定し、今後のTaskには経過措置を広げない。
- 受入APIの呼出主体をサーバーだけでは証明できない。ここで防ぐのは操作順の取り違えである。
- 横断検査はTaskを主対象とし、アプリ実装と検査設定を同じrepoで管理する。ExecPlanなどの記録正本は`epf-project`に残す。

## 実装手順

1. 導入前の完了Task IDを記録する。
2. `markdown.js`に実日時と受入欄の検証、受入操作、`done`遷移検証を加える。
3. APIと画面に受入操作を加え、既存の保存・状態変更経路を統一する。
4. 正常・異常・過去Taskの例で自動testし、APIと画面の主要操作を確認する。

## 検証

- 受入前または同一リクエストの`done`は拒否され、Taskは`review`に残る。
- 受入を別操作で記録した後だけ`done`へ進み、日付は実完了時刻と一致する。
- 不正な実日時と、導入後の直接編集による受入欄欠落は無効Taskとなる。
- 導入前の完了Taskは無効にならず、過去の正本は変更されない。
- `npm test`と主要UI確認が成功する。

## リスクと未決事項

- 認証のない現行アプリでは`accepted_by`が実際の操作主体を証明しない。権限分離はEPF-0039で扱う。
- 受入後に日付を越えて`done`へ変更した場合も、完了日は受入日とする。

## 実施記録

- 2026-09-24: 承認済みExecPlanを受け、アプリ変更分のPlanを作成した。
- 2026-09-24: `accepted_by`とサーバー時刻の記録、既存受入を要求する`done`遷移、実日時検証、無効Task表示を実装した。`npm test`は38件成功。実Task 52件の読込で無効0件。アプリHTMLとTask一覧APIはHTTP 200。local commitは`fa6f654`。PRと人間受入は未実施。
- 2026-09-24: 人間のレビュー指摘を受け、横断検査プログラムと切れリンクbaselineの配置先を`epf-project`からこのrepoへ変更する。4repoのhook参照、手順、検証記録を同時に更新する。
- 2026-09-24: [EPF-0038のGitHub PR #1](https://github.com/atkitajima-cloud/epf-management/pull/1)を`master`宛てに作成した。人間レビュー、merge、Pipeline、最終受入は未実施。
