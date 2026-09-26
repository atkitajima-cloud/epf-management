# ExecPlan

新しいepf-management固有のExecPlanは、このディレクトリの [`TEMPLATE.md`](TEMPLATE.md) から作る。4repoで同じ書式を使う。

- 実行中は `active/`、完了後は結果と検証を記録して `completed/` に置く。
- 複数repoにまたがる作業のExecPlanは `epf-project/docs/exec-plans/` に置く。
- 対応するTask本文の「関連」とExecPlanの関連Task欄を相互にリンクする。
- 既存の `plans/PLAN-*.md` は移動・改名しない。Taskの旧`plan`欄は既存Plan用として維持し、新しいExecPlanはTask本文からリンクする。Front Matterの変更はEPF-0048で扱う。
- ファイル名の命名・採番ルールは[TaskとExecPlanの同期ルール](../../../epf-project/docs/design-docs/01-開発の進め方/DD-01-01-TaskとExecPlanの同期ルール.md#ExecPlanの命名・採番新規作成分から適用)を参照する。
