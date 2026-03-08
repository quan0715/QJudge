# PR Policy (QJudge)

## Branch policy
- Feature work: `codex/<topic>` -> `dev`
- Release: `dev` -> `main`
- Reject: any PR from `main`

## Labels
- Domain label: `frontend`, `backend`, `infra`, `docs`
- Risk label: `risk-low`, `risk-medium`, `risk-high`
- Optional phase label: `gate-0` ~ `gate-4` (僅在採 Gate 工作流時使用)

## PR description checklist
- 變更目標與非目標
- 影響範圍（路徑/功能）
- 驗證步驟（含命令）
- 風險與回滾方式

## Merge gate
- 必須通過 required CI jobs。
- 必須附上本地或容器內驗證結果。
- Architecture/UI/Env 規範由對應 owner skill 定義，不在本檔重複。
