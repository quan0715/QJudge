# Layer Boundaries (QJudge current state)

## Canonical directories (frontend/src)
- `features/`: feature domain presentation + flow assembly
- `shared/`: cross-feature UI/utilities (no direct API repository calls)
- `core/`: entities, ports, types, usecases (business rules)
- `infrastructure/`: http client, repositories, mappers
- `styles/`: global styles
- `assets/`, `i18n/`, `test/`: support layers

## Import direction
- `features -> shared/core/infrastructure`
- `shared -> core` (and style/assets as needed)
- `infrastructure -> core`
- `core -> core`

## Boundary exceptions
- Exception must include: reason, scope, rollback plan.
- Keep exception local and temporary; avoid making it a new default.

## Naming baseline
- `.tsx` components: PascalCase
- hooks: `use*.ts`
- entities/ports/usecases/mappers/repositories: dot-notation suffix
