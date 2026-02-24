# Architecture Boundaries (QJudge)

## Directory map

- src/app: composition root (providers, app bootstrapping, global contexts)
- src/core:
  - entities: domain entities and value objects
  - ports: repository interfaces (contracts only, no implementation)
  - types: shared types, enums, and constants
  - usecases: business logic orchestration; depends on ports only
  - config: domain-specific configuration (status mappings, difficulty levels, etc.)
- src/infrastructure:
  - api/http.client: HTTP client and error handling
  - api/repositories: concrete repository implementations
  - mappers: DTO-to-Entity transformations
- src/services: legacy compatibility/testing area; avoid adding new runtime app logic here
- src/shared: cross-feature UI and utilities; depends on core only; no infrastructure calls
- src/features/<feature>: feature-specific presentation, workflows, state, and hooks; may depend on shared/core/infrastructure
- src/styles: global styles only

## Import direction

```
app -> features/shared/core
features -> shared/core/infrastructure
features -> core/usecases (for complex business logic)
shared -> core (entities, types only)
services (legacy) -> core/infrastructure
usecases -> ports (interfaces only)
infrastructure/repositories -> core/ports (implements interfaces)
infrastructure/repositories -> infrastructure/mappers
infrastructure/mappers -> core/entities
core -> nothing (pure, no external dependencies)
```

Visual representation:

```
┌─────────────────────────────────────────────────────────┐
│                      Presentation                        │
│  ┌─────────┐  ┌──────────┐  ┌────────┐                  │
│  │   app   │→ │ features │→ │ shared │                  │
│  └─────────┘  └──────────┘  └────────┘                  │
│                     │              │                     │
└─────────────────────│──────────────│─────────────────────┘
                      │              │
                      ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                         Core                             │
│  ┌──────────┐  ┌───────┐  ┌───────┐  ┌────────┐        │
│  │ usecases │→ │ ports │  │ types │  │entities│        │
│  └──────────┘  └───────┘  └───────┘  └────────┘        │
│                     ▲                      ▲            │
└─────────────────────│──────────────────────│────────────┘
                      │ implements           │
┌─────────────────────│──────────────────────│────────────┐
│                Infrastructure              │            │
│  ┌──────────────┐  ┌─────────┐  ┌─────────┴──┐         │
│  │ repositories │→ │ mappers │→ │ httpClient │         │
│  └──────────────┘  └─────────┘  └────────────┘         │
└─────────────────────────────────────────────────────────┘
```

## Code examples

Note: UI samples use React syntax; adapt to your UI framework if different.

### Core: entities

```ts
// src/core/entities/problem.entity.ts
export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}
```

### Core: ports (interfaces only)

```ts
// src/core/ports/problem.repository.ts
import type { Problem } from "@/core/entities/problem.entity";

export interface IProblemRepository {
  getProblem(id: string): Promise<Problem>;
  getProblems(params?: { tags?: string[] }): Promise<Problem[]>;
}
```

### Core: usecases (business logic orchestration)

```ts
// src/core/usecases/solver/submitSolution.usecase.ts
import type { ISubmissionRepository } from "@/core/ports/submission.repository";
import type { Submission } from "@/core/entities/submission.entity";

export interface SubmitSolutionParams {
  problemId: string;
  code: string;
  language: string;
}

export async function submitSolutionUseCase(
  params: SubmitSolutionParams,
  deps: { submissionRepository: ISubmissionRepository }
): Promise<Submission> {
  // Business logic: validate, submit, poll for result
  const submission = await deps.submissionRepository.submit(params);
  return submission;
}
```

### Infrastructure: mappers

```ts
// src/infrastructure/mappers/problem.mapper.ts
import type { Problem } from "@/core/entities/problem.entity";

interface ProblemDto {
  id: number;
  title: string;
  difficulty_level: string;
  tag_list: string[];
}

export function mapProblemDto(dto: ProblemDto): Problem {
  return {
    id: String(dto.id),
    title: dto.title,
    difficulty: dto.difficulty_level as Problem["difficulty"],
    tags: dto.tag_list,
  };
}
```

### Infrastructure: repositories

```ts
// src/infrastructure/api/repositories/problem.repository.ts
import type { IProblemRepository } from "@/core/ports/problem.repository";
import type { Problem } from "@/core/entities/problem.entity";
import { httpClient } from "@/infrastructure/api/http.client";
import { mapProblemDto } from "@/infrastructure/mappers/problem.mapper";

export const problemRepository: IProblemRepository = {
  async getProblem(id: string): Promise<Problem> {
    const { data } = await httpClient.get(`/problems/${id}/`);
    return mapProblemDto(data);
  },

  async getProblems(params): Promise<Problem[]> {
    const { data } = await httpClient.get("/problems/", { params });
    return data.results.map(mapProblemDto);
  },
};
```

### Shared: reusable UI (no infrastructure calls)

```tsx
// src/shared/ui/problem/ProblemCard.tsx
import type { Problem } from "@/core/entities/problem.entity";

type Props = { problem: Problem; onSelect?: (id: string) => void };

export const ProblemCard = ({ problem, onSelect }: Props) => (
  <button onClick={() => onSelect?.(problem.id)}>{problem.title}</button>
);
```

### Features: hooks (simple queries)

```ts
// src/features/Problems/hooks/useProblemList.ts
import { useQuery } from "@tanstack/react-query";
import { problemRepository } from "@/infrastructure/api/repositories";
import type { Problem } from "@/core/entities/problem.entity";

export function useProblemList(tags?: string[]) {
  return useQuery<Problem[]>({
    queryKey: ["problems", tags],
    queryFn: () => problemRepository.getProblems({ tags }),
  });
}
```

### Features: hooks (complex logic via usecases)

```ts
// src/features/Problems/hooks/useSubmitSolution.ts
import { useMutation } from "@tanstack/react-query";
import { submitSolutionUseCase } from "@/core/usecases/solver";
import { submissionRepository } from "@/infrastructure/api/repositories";

export function useSubmitSolution() {
  return useMutation({
    mutationFn: (params) =>
      submitSolutionUseCase(params, { submissionRepository }),
  });
}
```

### App: composition root

```tsx
// src/App.tsx
import { ToastProvider } from "@/app/contexts/ToastContext";
import { ApiErrorProvider } from "@/app/contexts/ApiErrorContext";
import { problemRoutes } from "@/features/Problems";

export default function App() {
  return (
    <ApiErrorProvider>
      <ToastProvider>
        {problemRoutes}
      </ToastProvider>
    </ApiErrorProvider>
  );
}
```

## When to use Use Cases vs Direct Repository Calls

| Scenario | Approach | Example |
|----------|----------|---------|
| Simple CRUD query | Hook → Repository | `useProblemList` |
| Simple mutation | Hook → Repository | `useDeleteProblem` |
| Complex business logic | Hook → Use Case → Repository | `useSubmitSolution` |
| Cross-repository orchestration | Hook → Use Case → Repositories | `enterExamUseCase` |
| Transaction-like operations | Hook → Use Case → Repositories | `joinContestUseCase` |

## Ownership checks

- If code is used by 2+ features and has no business rules, move to shared.
- If code is domain-specific, keep inside the feature even if shared by screens.
- If code talks to external systems, move to infrastructure.
- If code orchestrates multiple repositories or contains complex validation, extract to usecases.

## Naming and duplication

- Pick a single canonical feature directory name; avoid duplicates that differ only by case.
- Use feature index.ts as the public entrypoint; avoid deep imports from other features.

## File naming conventions

### Naming Strategy: React vs Non-React

| 檔案類型 | 副檔名 | 命名規則 | 說明 |
|----------|--------|----------|------|
| React Components | `.tsx` | PascalCase | 符合 JSX 慣例 |
| React Hooks | `.ts` | camelCase + `use` | 符合 React Rules of Hooks |
| Non-React | `.ts` | dot.notation | 清晰標示檔案用途 |

### React files (.tsx) - PascalCase

| Type | Pattern | Example |
|------|---------|---------|
| Components | `<Name>.tsx` | `ProblemCard.tsx` |
| Screens | `<Name>Screen.tsx` | `ProblemListScreen.tsx` |
| Contexts | `<Name>Context.tsx` | `ToastContext.tsx` |
| Section components | `<Name>Section.tsx` | `ProblemFilterSection.tsx` |
| Layouts | `<Name>.tsx` | `HeroBase.tsx` |
| Stories | `<Name>.stories.tsx` | `ProblemCard.stories.tsx` |

### React hooks (.ts) - camelCase with `use` prefix

| Type | Pattern | Example |
|------|---------|---------|
| Hooks | `use<Name>.ts` | `useProblemList.ts` |
| Hook tests | `use<Name>.test.ts` | `useProblemList.test.ts` |

### Non-React files (.ts) - dot.notation

| Type | Pattern | Example |
|------|---------|---------|
| Entities | `<domain>.entity.ts` | `problem.entity.ts` |
| Ports (interfaces) | `<domain>.repository.ts` | `problem.repository.ts` |
| Repository impl | `<domain>.repository.ts` | `problem.repository.ts` |
| Mappers | `<domain>.mapper.ts` | `problem.mapper.ts` |
| Use Cases | `<actionTarget>.usecase.ts` | `submitSolution.usecase.ts` |
| Config | `<name>.config.ts` | `status.config.ts` |
| Types | `<domain>.types.ts` | `solver.types.ts` |
| HTTP Client | `http.client.ts` | `http.client.ts` |

### Exceptions (保留原樣)

| File | Reason |
|------|--------|
| `index.ts` | Barrel exports |
| `routes.tsx` | Route definitions |
| `App.tsx` | Application root |
| Pure utilities | 簡單工具可用 camelCase: `format.ts`, `debounce.ts` |

### By layer reference

| Layer | Folder | Pattern | Example |
|-------|--------|---------|---------|
| app | src/app/contexts | `<Name>Context.tsx` | `ToastContext.tsx` |
| app | src/app | `App.tsx` | - |
| core | src/core/entities | `<domain>.entity.ts` | `problem.entity.ts` |
| core | src/core/ports | `<domain>.repository.ts` | `problem.repository.ts` |
| core | src/core/usecases | `<actionTarget>.usecase.ts` | `submitSolution.usecase.ts` |
| core | src/core/types | `<domain>.types.ts` | `solver.types.ts` |
| core | src/core/config | `<name>.config.ts` | `status.config.ts` |
| infrastructure | src/infrastructure/api | `http.client.ts` | - |
| infrastructure | src/infrastructure/api/repositories | `<domain>.repository.ts` | `problem.repository.ts` |
| infrastructure | src/infrastructure/mappers | `<domain>.mapper.ts` | `problem.mapper.ts` |
| shared | src/shared/ui | `<Name>.tsx` | `ProblemCard.tsx` |
| shared | src/shared/utils | `<name>.ts` | `format.ts` |
| shared | src/shared/hooks | `use<Name>.ts` | `useCopyText.ts` |
| shared | src/shared/layout | `<Name>.tsx` | `HeroBase.tsx` |
| features | src/features/<Feature>/screens | `<Name>Screen.tsx` | `ProblemListScreen.tsx` |
| features | src/features/<Feature>/components | `<Name>.tsx` | `ProblemForm.tsx` |
| features | src/features/<Feature>/hooks | `use<Name>.ts` | `useProblemDetail.ts` |
| features | src/features/<Feature>/contexts | `<Name>Context.tsx` | `ProblemEditContext.tsx` |
| features | src/features/<Feature> | `routes.tsx`, `index.ts` | - |

## Test file conventions

| Type | Pattern | Example |
|------|---------|---------|
| Unit tests (React) | `<Name>.test.tsx` | `ProblemCard.test.tsx` |
| Unit tests (Non-React) | `<name>.test.ts` | `problem.mapper.test.ts` |
| Stories | `<Name>.stories.tsx` | `ProblemCard.stories.tsx` |
| Test location | Alongside source or `__tests__/` | - |


## Naming lint script

- Run: `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-naming.js --root frontend/src`
- Optional ignore file: `.naminglintignore` with repo-relative paths (one per line)

## Architecture lint script

- Run: `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src`
- Optional ignore file: `.architecturelintignore` with repo-relative paths (one per line)
