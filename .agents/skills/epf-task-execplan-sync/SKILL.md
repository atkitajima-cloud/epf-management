---
name: epf-task-execplan-sync
description: "EPF ManagementのTaskを着手、review、完了へ進める際に、Task Markdownと関連ExecPlanの同期を確認・記録する。EPF-XXXXの状態変更、クローズ、またはTaskとExecPlanの同期が必要なときに使う。"
---

# TaskとExecPlanの同期

EPF ManagementのTask Markdownを正本として、関連するExecPlanとの状態・記録・リンクを整合させる。設計・判断Taskを完了する場合は、後続実装Taskまたは実装不要理由も確認する。

## 参照する正本

- このrepoの`AGENTS.md`
- `../epf-project/docs/design-docs/01-開発の進め方/DD-01-01-TaskとExecPlanの同期ルール.md`
- `../epf-project/docs/design-docs/01-開発の進め方/DD-01-02-開発フローとブランチ運用.md`（実装Taskのbranch・Pull Request・AWS principalの運用）
- `../epf-project/docs/design-docs/01-開発の進め方/DD-01-03-AI駆動開発の共通Skill運用方針.md`
- `../epf-project/docs/design-docs/01-開発の進め方/DD-01-04-AI作業不備の記録と改善ループ.md`（AI作業不備の記録対象と改善ループ）
- 対象の`tasks/EPF-XXXX.md`と、そこからリンクされるExecPlan

Skill内へTaskの状態、設計判断、完了日、後続Taskを複製して保持しない。常に対象Markdownを読んで判断する。

## 利用者への通知

Task・ExecPlanの状態または記録を実際に確認・更新する作業を始めるときは、最初のcommentaryで次を利用者へ明示する。

- 使用Skill: `epf-task-execplan-sync`
- 対象Task
- 今回確認または更新する目的

単なる内部参照だけで通知を増やす必要はない。完了時は通常の完了報告に、Skillで確認した整合内容を含める。

## 実施手順

1. 利用者が指定したTask ID、要求する状態遷移、変更範囲を確認する。不明な状態・影響の大きい判断は推測で変更しない。
2. Task、関連ExecPlan、先行・後続Task、未完了の完了条件を読む。
3. 変更内容に応じて、TaskとExecPlanを同じ作業ターンで更新する。
4. 更新対象、差分、検証結果を確認し、repoの作業規則に従って記録する。

### AI作業不備の確認

人間から不備・漏れ・再発防止を指摘されたとき、またはtest・review・受入・deploy後確認で想定外を検出したときは、即時対応の後に[AI作業不備の記録と改善ループ](../../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-04-AI作業不備の記録と改善ループ.md)の記録対象を照合する。該当する場合は、[AI作業不備台帳](../../../../epf-project/docs/references/ai-work-defect-log.md)へ事実、検出経路、影響、即時対応、再発防止の対応Taskを記録または更新する。

Taskを`review`または`done`へ進める前にも、未記録の人間指摘・検証不備がないか、台帳の`対応中`または`改善待ち`の記録に必要な対応Taskがあるかを確認する。緊急修正を台帳記録待ちにしない。対象外の仕様変更・人間判断や、AIの関与を確認できない外部障害は台帳へ記録しない。

### 着手

- ExecPlanを作成した場合、Taskを`doing`にし、「ExecPlanを作成する」を完了にする。
- ExecPlanまたはPlanの作成が必要なのに、Taskの完了条件に計画作成を表す項目がない場合は、「ExecPlan（またはPlan）を作成し、人間レビューで実装範囲と検証方法を確認できる状態にする」を追加して完了にする。実装・検証の完了条件は未完了のまま残す。
- Task本文とExecPlanの双方から相対リンクでたどれることを確認する。
- 着手を阻害する未決事項や依存関係があれば、ExecPlanへ事実として記録する。

### review

- Task本文に未チェックの完了条件がないことを確認する。未チェックがある場合はTaskを`review`へ進めず、実施・検証を継続する。
- 実施内容、検証方法、確認待ちの事項をExecPlanに記録する。
- 実装または設計の完了条件を推測で完了にしない。人間レビュー待ちの内容を明示する。
- AI作業不備の確認を行い、該当する場合は台帳と対応Taskのリンクを記録する。

### 完了

- Taskを`done`にする場合、`completed_at`へ日本時間の当日を記録する。
- ExecPlanへ実施結果、検証結果、関連commitまたはPull Requestを記録する。
- `epf-backend`／`epf-frontend`の実装では、Task本文の`## 実装記録`にrepoごとのbranch、Pull Request、merge commit、Pipeline結果、検証結果が記録されていることを確認する。Task:branchが1:Nの場合も、すべてのrepoを確認する。
- `epf-backend`／`epf-frontend`では、作業ツリーがcleanであること、local `main`がmerge commitを含むこと、local／CodeCommitのsource branchが削除済みであることを確認し、結果をTask本文とExecPlanへ記録する。AIのCodeCommit Git操作では`atkit_ai`とAWS CLI credential helperを明示する。
- `epf-backend`／`epf-frontend`でPipeline失敗、未完了の人間受入、または未commit変更がある場合はcleanupを実行しない。残すbranchと阻害要因を記録し、Taskを`done`にしない。
- `epf-backend`／`epf-frontend`で`main`へ直接pushした例外では、branch・Pull Requestの代わりに、人間の明示承認、理由、影響、追補レビュー結果を確認する。
- `epf-project`／`epf-management`の変更では、commitと検証結果を記録する。Pull Request、merge commit、Pipeline、source branch cleanupは必須条件にしない。Pull Requestを使った場合だけ、その結果を記録する。計画の人間承認とTaskの最終受入は確認する。
- 設計・判断Taskでは、`## 実装への引き渡し`が次のいずれかを満たすことを確認する。
  - 実装が必要: 後続Task、実装repo、引き渡す決定、後続Taskの完了条件がある。
  - 実装不要: 判定と理由がある。
- ExecPlanを`completed/`へ移す場合は、関連Taskがすべて`done`であること、または未達理由と後続Taskが記録されていることを確認する。
- AI作業不備の確認を行い、該当する台帳記録の即時対応、再発防止Task、未達事項が実態と一致することを確認する。

## 制約

- 既存Requirementを変更しない。
- Taskデータ変更だけを理由に新しいPlanを作成しない。
- 利用者が依頼していないTask、Requirement、設計判断を変更しない。
- 実際の書き込み、Git commit、外部操作については、repoの`AGENTS.md`と利用者の承認範囲を守る。

## 完了報告

Task ID、状態、更新したTask・ExecPlan・後続Task、検証結果、残る人間確認事項を簡潔に報告する。
