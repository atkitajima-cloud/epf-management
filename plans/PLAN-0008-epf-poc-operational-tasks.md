# EPF PoCの実運用Taskへの移行

## 目的

`epf-management` をEPF PoCの実運用に使用する。

既存のダミーTaskをすべて完了済みにし、`epf-project` の目的、アーキテクチャ、実行計画に対応する実Taskを作成する。新規Taskは2026-09-21から2026-09-23までの3日間でPoCの成功条件を検証する最小規模とする。

## 対象範囲

- 既存の `EPF-0001` から `EPF-0013` まで、13件のTaskの `status` をすべて `done` に更新する。
- `REQ-0003` として「EPF PoCをEPF Managementで実運用する」要求を追加する。
- `EPF-0014` から `EPF-0020` まで、実PoC用の7件のTaskを追加する。
- 各Taskへ日付、依存関係、Requirement、関連repo、Planを記録する。
- `epf-project` の `docs/exec-plans/active/0001-api-contract-and-architecture-decisions.md` を、API契約とアーキテクチャ判断の正本としてリンクする。

## 対象外

- `epf-management` のアプリケーションコード、API、UI、テンプレートの変更。
- 既存の `REQ-0001`、`REQ-0002` および既存Planの内容変更。
- frontend、backend、AWS、CI/CDの実装・deploy。
- 3日間のPoC完了後に必要となる本番レベルの設計・運用Taskの作成。

## 設計判断

- 目的、横断仕様、設計判断、ExecPlanの正本は `epf-project` に置く。`epf-management` には実行Taskと進捗だけを置き、内容を複製しない。
- 既存13件はダミーであるという利用者の明示指示に基づき、本文・日付・関連情報を変更せず、状態だけを `done` にする。
- 実PoC用Taskは、担当者を推測しないため初期値を `unassigned` とする。担当決定後はEPF Managementの画面またはMarkdownで更新する。
- 最初のTaskを `doing`、後続Taskを `ready` とし、実際の進捗に合わせて状態を更新する。
- 期限は2026-09-21、2026-09-22、2026-09-23の3日間に限定する。範囲を超える作業は、PoC完了後に別Taskとして扱う。

## 作成する要求

| ID | タイトル | 状態 | 優先度 |
| --- | --- | --- | --- |
| REQ-0003 | EPF PoCをEPF Managementで実運用する | accepted | high |

要求の受入条件は、実PoC用TaskがEPF Management上で追跡でき、Taskの変更履歴をGitで確認でき、PoC完了時に実績を `epf-project` の実行計画へ反映できることとする。

## 作成するTask

| ID | 日付 | 状態 | タイトル | 依存先 | 関連repo |
| --- | --- | --- | --- | --- | --- |
| EPF-0014 | 2026-09-21 | doing | PoC開始条件とAPI契約管理方式を決定する | なし | epf-project |
| EPF-0015 | 2026-09-21 | ready | 最小Task API仕様とデータアクセス方針を確定する | EPF-0014 | epf-project |
| EPF-0016 | 2026-09-22 | ready | BackendのTask CRUD APIと自動テストを実装する | EPF-0015 | epf-backend |
| EPF-0017 | 2026-09-22 | ready | FrontendのTask画面とAPI連携を実装する | EPF-0015 | epf-frontend |
| EPF-0018 | 2026-09-22 | ready | Backend基盤をCDKで構築しAWSへdeployする | EPF-0016 | epf-backend |
| EPF-0019 | 2026-09-23 | ready | Pull RequestからPipeline、test、deployまでを検証する | EPF-0017、EPF-0018 | epf-frontend、epf-backend |
| EPF-0020 | 2026-09-23 | ready | PoC結果を検証し設計と実行計画を更新する | EPF-0019 | epf-project |

全Taskの `requirement` は `REQ-0003`、`plan` は `PLAN-0008-epf-poc-operational-tasks.md` とする。EPF-0014とEPF-0015は、`epf-project` のactive ExecPlanへリンクする。

## 実施手順

1. 既存13件のTaskを確認し、対象IDと更新前の状態を記録する。
2. `EPF-0001` から `EPF-0013` の `status` を `done` に更新する。
3. `REQ-0003` を追加する。
4. `EPF-0014` から `EPF-0020` をテンプレートに従って作成する。
5. Front MatterのID、status、owner、priority、start、due、depends_on、requirement、plan、関連repoを検証する。
6. Markdown I/Oと既存テストを実行し、Task一覧、WBS、ガントで13件の完了と7件の実Taskを確認する。
7. 変更対象だけをGitコミットし、結果を記録する。

## 検証

- `EPF-0001` から `EPF-0013` の13件すべてが `done` である。
- `REQ-0003` が存在し、7件の新規Taskがすべて参照している。
- `EPF-0014` から `EPF-0020` のID重複がなく、日付が2026-09-21から2026-09-23に収まる。
- 依存関係が存在するTask IDだけを指し、循環していない。
- `npm test` が成功する。
- Task一覧、WBS、ガントがTask Markdownから正しく生成される。

## リスク

- 3日間でCI/CDとAWS deployまでを完了するには、作業範囲を最小Task管理機能に限定し続ける必要がある。
- AWSアカウント、CodeCommit、CodePipeline、CodeBuildの利用可能状態は未確認である。利用不能な場合は、理由を記録し、検証範囲を勝手に縮小しない。
- frontendホスティング、認証・認可、運用設計は未決事項である。EPF-0014とEPF-0015で必要最小限を判断し、決定できない内容は後続Taskとして分離する。

## 未決事項

- 新規Taskの担当者は未割当で開始してよいか。
- 3日間でAWSの実環境へdeployするために必要なアカウント・権限・CodeCommit利用可否。

このPlanのレビューと利用者の明示承認後に、TaskおよびRequirementのデータ変更を開始する。
