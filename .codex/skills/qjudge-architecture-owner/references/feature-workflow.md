# Feature Workflow (Architecture View)

## Phase 0 - Spec
- Define states: loading/empty/error/permission/normal
- Define field keys and API contract draft

## Phase 1 - Shared building blocks
- Reusable components/utilities in `shared`
- No external I/O here

## Phase 2 - Feature assembly with mocks
- Build screens/hooks in `features/<domain>` with fixtures/mocks

## Phase 3 - Infrastructure wiring
- Implement repositories/mappers in `infrastructure`
- Wire data through feature hooks
- Extract usecases for multi-repo or complex business rules

## Phase 4 - Hardening
- Run naming + architecture lints
- Remove temporary boundary exceptions
