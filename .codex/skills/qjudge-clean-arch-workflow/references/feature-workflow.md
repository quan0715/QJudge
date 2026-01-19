# New Feature Workflow (Framework-Agnostic)

## Phase 0: Spec and boundaries

- Define states (loading, empty, error, permission), data fields, and repository contracts.
- Decide which layer owns each piece.
- Identify if use cases are needed (complex logic, multiple repositories).

**DoD:**
- Spec doc with states and field keys
- Draft repository interface in `core/ports/`
- Decision on use cases needed

## Phase 1: Shared building blocks

- If needed, add reusable UI components or utilities in `src/shared`.
- Do not connect to infrastructure or app-specific state here.
- Components receive data via props only.

**DoD:**
- Components/utilities with basic usage examples or stories
- No infrastructure imports in shared code

## Phase 2: Layout skeleton (optional)

- Create layout or skeleton structures (shared or feature-level) with slots for states.
- Keep it free of business logic.

**DoD:**
- Skeleton supports empty/loading/error states
- No data fetching in layout components

## Phase 3: Feature assembly with mocks

- Assemble screens/workflows in `src/features/<feature>` using mock data.
- Keep imports inside allowed boundaries; no real I/O.
- Create hooks that will later connect to repositories.

**DoD:**
- Screens cover states defined in Phase 0
- No direct infrastructure calls (use mock data)

## Phase 4: Integrate infrastructure

- Implement repository in `src/infrastructure/api/repositories/`.
- Create mapper in `src/infrastructure/mappers/` if DTO transformation needed.
- Wire repositories through feature hooks.
- Extract use cases to `src/core/usecases/` if complex logic identified.

**DoD:**
- Repositories implement port interfaces
- Mappers handle DTO-to-Entity transformation
- Error/loading states match the spec

## Phase 5: Testing and refinement

- Add unit tests for use cases and mappers.
- Add integration tests for hooks if needed.
- Verify all states work correctly.

**DoD:**
- Critical paths have test coverage
- All defined states are handled

---

## Layer Responsibility Checklist

| Task | Layer | Files |
|------|-------|-------|
| Define domain entity | core | `entities/<domain>.entity.ts` |
| Define repository interface | core | `ports/<domain>.repository.ts` |
| Implement HTTP calls | infrastructure | `api/repositories/<domain>.repository.ts` |
| Transform DTO to Entity | infrastructure | `mappers/<domain>.mapper.ts` |
| Orchestrate complex logic | core | `usecases/<domain>/<actionTarget>.usecase.ts` |
| Create reusable UI | shared | `ui/<domain>/<Name>.tsx` |
| Create feature screen | features | `<Feature>/screens/<Name>Screen.tsx` |
| Create feature hook | features | `<Feature>/hooks/use<Name>.ts` |

## Decision Tree: Use Case vs Direct Repository

```
Is the operation a simple CRUD?
├── Yes → Hook calls Repository directly
└── No → Continue...

Does it involve multiple repositories?
├── Yes → Extract to Use Case
└── No → Continue...

Does it have complex validation or business rules?
├── Yes → Extract to Use Case
└── No → Continue...

Does it need to be reused across multiple features?
├── Yes → Extract to Use Case
└── No → Hook calls Repository directly
```

## Example: Adding a "Problem Solver" Feature

```
Phase 0:
- States: loading, solving, submitting, result, error
- Entities: Problem, Submission, TestResult
- Ports: IProblemRepository, ISubmissionRepository
- Use Cases: testRunUseCase, submitSolutionUseCase

Phase 1:
- shared/ui/editor/CodeEditor.tsx
- shared/ui/solver/TestResultList.tsx

Phase 2:
- shared/layout/SolverLayout.tsx

Phase 3:
- features/Problems/screens/ProblemSolverScreen.tsx
- features/Problems/hooks/useProblemSolver.ts (with mocks)

Phase 4:
- infrastructure/api/repositories/submission.repository.ts
- infrastructure/mappers/submission.mapper.ts
- core/usecases/solver/submitSolution.usecase.ts
- Connect hooks to real repositories

Phase 5:
- Test submitSolution.usecase.ts
- Test submission.mapper.ts
- Integration test for submission flow
```
