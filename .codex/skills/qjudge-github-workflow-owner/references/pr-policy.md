# PR Policy (QJudge)

## Branch policy
- Feature work: `codex/<topic>` -> `dev`
- Release: `dev` -> `main`
- Reject: any PR from `main`

## Labels
- Domain label: `frontend`, `backend`, `infra`, `docs`
- Risk label: `risk-low`, `risk-medium`, `risk-high`

## PR description checklist
- 問題與變更後行為
- 實際驗證結果
- 有實質風險時說明影響與復原方式；簡單修改不必填寫制式章節

## Merge gate
- 必須通過 required CI jobs。
- 必須附上本地或容器內驗證結果。
- Architecture/UI/Env 規範由對應 owner skill 定義，不在本檔重複。
