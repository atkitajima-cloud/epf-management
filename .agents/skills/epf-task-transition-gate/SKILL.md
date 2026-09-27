---
name: epf-task-transition-gate
description: "EPF ManagementのTaskを着手、review、完了、または差し戻す前に使う。ExecPlanの有無にかかわらず遷移条件と人間確認を確認し、Task・ExecPlan・実装記録を同期して証跡を保存する。EPF-XXXXの着手、レビュー依頼、クローズ、差し戻し、TaskとExecPlanの同期で使用する。"
---

# Task状態遷移ゲート

Taskを`doing`、`review`、`done`へ進める、または状態を差し戻す前に、必要な判断と記録をそろえて同期証跡を保存する。機械検査を文章で繰り返さず、未達があれば遷移せずに報告する。

## 開始時

最初のcommentaryで、次を利用者へ伝える。

- 使用Skill: `epf-task-transition-gate`
- 対象Taskと遷移先
- 今回確認・更新する目的

## 読むもの

常時読むもの:

- 対象Task
- Taskの`exec_plan`が指す主ExecPlan。空なら読まない
- [TaskとExecPlanの同期ルール](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-01-TaskとExecPlanの同期ルール.md)の「状態遷移契約」と「証跡を保存する順序」

条件付きで読むもの:

| 条件 | 参照先 |
| --- | --- |
| backend／frontend実装の`review`または`done` | [開発フローとブランチ運用](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-02-開発フローとブランチ運用.md#状態遷移の完了条件) |
| 人間からAI不備を指摘された、想定外を検出した、またはTask・PlanがAI-DEFを参照する | [AI作業不備の記録と改善ループ](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-04-AI作業不備の記録と改善ループ.md)と対象の台帳行 |
| 設計・判断Taskを`done`へ進める | 同期ルールの「設計・判断Taskの実装への引き渡し」 |

通常の遷移で、上記の条件に該当しない文書やAI作業不備台帳全体を読まない。

## 実施手順

1. Task ID、現在状態、遷移先、利用者の承認範囲を確認する。
2. Task本文、Front Matter、ExecPlan、実装記録を先に最終化する。証跡保存後にTask内容を変更しない。
3. 遷移先に応じて、人間判断が必要な項目を確認する。
   - `doing`: 必要な計画と相互リンク、着手時刻、阻害要因。計画承認前は実装しない。
   - `review`: 成果物がレビュー可能で、完了条件、検証、自己レビュー、push済み実装commitまたは実装不要理由が記録済みであること。
   - `done`: 人間の明示的な最終受入、`review`後の変更有無、必要な外部ゲート、設計Taskの引き渡し。Taskが`review`の間にExecPlanを最終化・移動し、Taskリンクを更新する。
   - 差し戻し: 人間の依頼と理由を記録する。再実施の詳細確認は次に`review`へ進める際に行う。
4. 不備確認の発火条件がある場合だけ、対象のAI-DEFを記録または更新する。
5. 利用可能なtestと対象差分を確認する。commit時の全体記録検査は既存hookへ任せる。
6. Task保存APIで`sync_status: passed`と遷移先を保存し、Task状態を変更する。AIは`human_checked`を設定しない。
7. repoの規則に従ってcommitする。`review`へ進める明示依頼では対象commitをpushし、TaskとExecPlanへpush済みcommitを記録してから`review`へ進める。

実装commitをExecPlanへ記録するcommit自身は、再帰的な記録対象にしない。`review`後に実装commitが変わっていなければ、`done`で同じtestを再実行しない。

## 停止条件

- 計画承認、最終受入、PR承認・mergeなど、人間だけが行う判断が未完了。
- 完了条件、検証、push済みcommit、Pipeline成功など、対象遷移に必要な記録が未達。
- TaskとExecPlanを同期できない、または証跡保存後にTask内容が変わった。
- 利用者の承認範囲を超える仕様変更、Requirement変更、設計判断が必要。

## 完了報告

Task IDと状態、ExecPlan状態、検証結果、commit・push、残る人間確認を簡潔に報告する。AI作業不備を更新した場合だけ、記録ID、事実、対策、検証、残る対応を追加する。
