# WBS

> このファイルは `tasks/*.md` から生成される派生Viewです。直接編集しないでください。

| ID | Task | Status | Completed at | Owner | Priority | Target repo | Start | Due | Progress | Schedule | Dependencies | Requirement |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EPF-0050 | 要求仕様の取り込みと参照方式を確定する | backlog | - | kitajima | high | common | 2026-10-05 | 2026-10-05 | 0% | on_track | - | REQ-0004 |
| EPF-0053 | Task受入の独立操作を廃止する | backlog | - | kitajima | high | epf-management | - | - | 0% | unscheduled | - | REQ-0004 |
| EPF-20260926-153522-400 | Task削除を論理削除へ変更し削除済み表示を追加する | doing | - | kitajima | high | epf-management | - | - | 25% | unscheduled | - | - |
| EPF-0001 | Markdown Task Readerを実装する | done | 2026-09-21 | sato | high | common | 2026-09-15 | 2026-09-20 | 100% | done | - | REQ-0001 |
| EPF-0002 | Planner風Kanbanを構築する | done | 2026-09-21 | suzuki | high | common | 2026-09-18 | 2026-09-22 | 100% | done | EPF-0001 | REQ-0001 |
| EPF-0003 | Drag & Dropで状態を更新する | done | 2026-09-21 | yamada | high | common | 2026-09-19 | 2026-09-23 | 100% | done | EPF-0002 | REQ-0001 |
| EPF-0004 | Task詳細編集を実装する | done | 2026-09-21 | tanaka | medium | common | 2026-09-20 | 2026-09-25 | 100% | done | EPF-0003 | REQ-0001 |
| EPF-0005 | Codex Adapterを実装する | done | 2026-09-21 | ai-team | high | common | 2026-09-12 | 2026-09-18 | 100% | done | - | REQ-0002 |
| EPF-0006 | AI ChatからTaskを追加する | done | 2026-09-21 | kobayashi | high | common | 2026-09-22 | 2026-09-26 | 100% | done | EPF-0005 | REQ-0002 |
| EPF-0007 | Requirement抜け漏れ分析を試行する | done | 2026-09-21 | unassigned | medium | common | 2026-09-24 | 2026-09-29 | 100% | done | EPF-0006 | REQ-0002 |
| EPF-0008 | 利用フィードバックを整理する | done | 2026-09-21 | product-owner | low | common | 2026-09-26 | 2026-10-02 | 100% | done | - | REQ-0001 |
| EPF-0009 | PoCの操作確認を記録する | done | 2026-09-21 | product-owner | medium | common | - | - | 100% | done | - | REQ-0001 |
| EPF-0010 | 要求仕様書を作成する | done | 2026-09-21 | unassigned | medium | common | - | - | 100% | done | - | REQ-0001 |
| EPF-0011 | 詳細仕様書を作成する | done | 2026-09-21 | sakai | medium | common | - | - | 100% | done | - | REQ-0001 |
| EPF-0012 | テスト | done | 2026-09-21 | unassigned | medium | common | 2026-09-24 | 2026-09-30 | 100% | done | - | - |
| EPF-0013 | 北島テスト | done | 2026-09-21 | kitajima | medium | common | 2026-09-26 | 2026-10-30 | 100% | done | - | - |
| EPF-0014 | PoC開始条件とAPI契約管理方式を決定する | done | 2026-09-21 | kitajima | high | epf-project | 2026-09-21 | 2026-09-21 | 100% | done | - | REQ-0003 |
| EPF-0015 | 最小Task API仕様とデータアクセス方針を確定する | done | 2026-09-21 | kitajima | high | epf-project | 2026-09-21 | 2026-09-21 | 100% | done | EPF-0014 | REQ-0003 |
| EPF-0016 | BackendのTask CRUD APIと自動テストを実装する | done | 2026-09-21 | kitajima | high | epf-backend | 2026-09-22 | 2026-09-22 | 100% | done | EPF-0015, EPF-0025 | REQ-0003 |
| EPF-0017 | FrontendのTask画面とAPI連携を実装する | done | 2026-09-21 | kitajima | high | epf-frontend | 2026-09-22 | 2026-09-22 | 100% | done | EPF-0015, EPF-0024, EPF-0025 | REQ-0003 |
| EPF-0018 | Backend基盤をCDKで構築しAWSへdeployする | done | 2026-09-22 | kitajima | high | epf-backend | 2026-09-22 | 2026-09-22 | 100% | done | EPF-0016, EPF-0026 | REQ-0003 |
| EPF-0019 | Pull RequestからPipeline、test、deployまでを検証する | done | 2026-09-23 | kitajima | high | common | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0017, EPF-0018, EPF-0027, EPF-0028, EPF-0030, EPF-0031, EPF-0033 | REQ-0003 |
| EPF-0020 | PoC結果を検証し設計と実行計画を更新する | done | 2026-09-23 | kitajima | high | epf-project | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0019 | REQ-0003 |
| EPF-0021 | Taskの対象リポジトリを識別できるようにする | done | 2026-09-21 | kitajima | high | epf-management | 2026-09-21 | 2026-09-22 | 100% | done | - | REQ-0003 |
| EPF-0022 | 完了済みTaskを完了日の新しい順に並べる | done | 2026-09-21 | kitajima | medium | epf-management | 2026-09-21 | 2026-09-22 | 100% | done | - | REQ-0003 |
| EPF-0023 | ガントでTaskの依存関係を分かるようにする | done | 2026-09-21 | kitajima | medium | epf-management | 2026-09-22 | 2026-09-22 | 100% | done | - | REQ-0003 |
| EPF-0024 | Frontendの技術選定とホスティング方式を決定する | done | 2026-09-21 | kitajima | high | epf-frontend | 2026-09-22 | 2026-09-22 | 100% | done | EPF-0015 | REQ-0003 |
| EPF-0025 | PoCの認証・認可方針を決定する | done | 2026-09-21 | kitajima | high | epf-project | 2026-09-22 | 2026-09-22 | 100% | done | EPF-0015 | REQ-0003 |
| EPF-0026 | Backend CDKのスタック構成と環境名を決定する | done | 2026-09-21 | kitajima | high | epf-backend | 2026-09-22 | 2026-09-22 | 100% | done | - | REQ-0003 |
| EPF-0027 | repo別Pipeline構成とトリガーを決定する | done | 2026-09-22 | kitajima | high | common | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0017, EPF-0018 | REQ-0003 |
| EPF-0028 | PoC最小運用範囲を決定する | done | 2026-09-22 | kitajima | medium | epf-project | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0017, EPF-0018 | REQ-0003 |
| EPF-0029 | ガントを依存順に並べ矢印を下向きにする | done | 2026-09-21 | kitajima | high | epf-management | 2026-09-22 | 2026-09-22 | 100% | done | - | REQ-0003 |
| EPF-0030 | AI駆動開発の共通Skill運用を設計する | done | 2026-09-22 | kitajima | high | common | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0027, EPF-0028 | REQ-0003 |
| EPF-0031 | TaskとExecPlanの同期Skillを実装・検証する | done | 2026-09-22 | kitajima | high | epf-management | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0030 | REQ-0003 |
| EPF-0032 | BackendのAIコードレビューSkillを実装・試行する | done | 2026-09-23 | kitajima | medium | epf-backend | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0031 | REQ-0003 |
| EPF-0033 | Task削除機能を追加する | done | 2026-09-23 | kitajima | high | common | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0016, EPF-0017, EPF-0034 | REQ-0003 |
| EPF-0034 | Task起点のブランチ・Pull Request運用を設計する | done | 2026-09-23 | kitajima | medium | common | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0031, EPF-0032 | - |
| EPF-0035 | AIコードレビューにHTTPメソッドとCORS検証を追加する | done | 2026-09-23 | kitajima | medium | epf-backend | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0037 | REQ-0003 |
| EPF-0036 | 無効な対象リポジトリを検証しTask表示漏れを防ぐ | done | 2026-09-23 | kitajima | medium | epf-management | 2026-09-23 | 2026-09-23 | 100% | done | EPF-0037 | REQ-0003 |
| EPF-0037 | AI作業上の不備を記録し改善へ還流する仕組みを整備する | done | 2026-09-23 | kitajima | medium | common | 2026-09-23 | 2026-09-23 | 100% | done | - | REQ-0003 |
| EPF-0038 | 規約違反を機械で検出する検査を整備する | done | 2026-09-24 | kitajima | high | common | 2026-09-26 | 2026-09-26 | 100% | done | EPF-0043 | REQ-0004 |
| EPF-0039 | Pull Requestの検証・承認を強制する | done | 2026-09-26 | kitajima | high | common | 2026-10-02 | 2026-10-02 | 100% | done | EPF-0038, EPF-0044 | REQ-0004 |
| EPF-0040 | 検証済み成果物をそのまま配布する | done | 2026-09-26 | kitajima | high | common | 2026-10-03 | 2026-10-03 | 100% | done | EPF-0039, EPF-0042 | REQ-0004 |
| EPF-0041 | Task管理の同時作業を安全にする | done | 2026-09-25 | kitajima | high | epf-management | 2026-09-28 | 2026-09-28 | 100% | done | - | REQ-0004 |
| EPF-0042 | API契約と実装の適合を機械検証する | done | 2026-09-26 | kitajima | high | common | 2026-10-01 | 2026-10-01 | 100% | done | EPF-0044 | REQ-0004 |
| EPF-0043 | 完了の定義を確定し未達を是正する | done | 2026-09-24 | kitajima | high | common | 2026-09-25 | 2026-09-25 | 100% | done | - | REQ-0004 |
| EPF-0044 | epf-projectのGit remoteをCodeCommitに設定する | done | 2026-09-24 | kitajima | high | epf-project | 2026-09-24 | 2026-09-24 | 100% | done | - | REQ-0004 |
| EPF-0045 | 記録の正確性と参加の入口を整備する | done | 2026-09-25 | kitajima | high | common | 2026-09-30 | 2026-09-30 | 100% | done | - | REQ-0004 |
| EPF-0046 | 開発指標を自動集計する | done | 2026-09-26 | kitajima | low | epf-management | 2026-10-03 | 2026-10-03 | 100% | done | EPF-0043, EPF-0045 | REQ-0004 |
| EPF-0047 | 設計書の分類・採番・共通ヘッダを再編する | done | 2026-09-26 | kitajima | medium | common | 2026-10-04 | 2026-10-04 | 100% | done | EPF-0038, EPF-0044 | REQ-0004 |
| EPF-0048 | Task Front Matterをexec_planへ統一し検証を追加する | done | 2026-09-26 | kitajima | medium | common | 2026-10-06 | 2026-10-06 | 100% | done | EPF-0045 | REQ-0004 |
| EPF-0049 | AIツール別のSkill参照経路を用意する | done | 2026-09-23 | kitajima | high | common | 2026-09-23 | 2026-09-23 | 100% | done | - | REQ-0004 |
| EPF-0051 | AIの外部操作前に計画承認を確認する | done | 2026-09-24 | kitajima | high | common | 2026-09-26 | 2026-09-26 | 100% | done | - | REQ-0004 |
| EPF-0052 | AIのTask完了前に人間受入を確認する | done | 2026-09-24 | kitajima | high | common | 2026-09-27 | 2026-09-27 | 100% | done | - | REQ-0004 |
| EPF-20260925-205351-453 | Task details画面からタスクを削除できるようにする | done | 2026-09-26 | kitajima | medium | epf-management | - | - | 100% | done | - | - |
