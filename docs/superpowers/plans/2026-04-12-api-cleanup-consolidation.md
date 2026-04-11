# Contest Problem API Cleanup & Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all contest problem operations into ContestProblemViewSet, remove unused endpoints, and eliminate ContestProblem dual-write.

**Architecture:** Three phases — (1) remove dead code, (2) move actions from ContestViewSet to ContestProblemViewSet + update frontend/MCP, (3) remove legacy ContestProblem dual-write. Each phase produces a working, testable state.

**Tech Stack:** Django REST Framework, React (TypeScript), FastMCP (Python)

---

## File Structure

### Backend files modified:
- `backend/apps/contests/views/problem.py` — add `duplicate`, `reorder`, extract helpers
- `backend/apps/contests/views/contest.py` — remove `add_problem`, `reorder_problems`, helper methods
- `backend/apps/contests/services/contest_problem_service.py` — **CREATE**: shared service for bank import + materialization
- `backend/apps/problems/views.py` — remove `orphan_queue`, `resolve_orphan`
- `backend/apps/problems/urls.py` — remove discussion URL patterns
- `backend/apps/problems/discussion_views.py` — **DELETE** entire file
- `backend/apps/problems/models.py` — remove Discussion/Comment/Like models
- `backend/apps/contests/views/problem.py` — remove dual-write to ContestProblem

### Frontend files modified:
- `frontend/src/infrastructure/api/repositories/contestProblems.repository.ts` — update endpoints, remove unused functions
- `frontend/src/features/contest/components/admin/examEditor/CodingTestEditorLayout.tsx` — use new endpoints

### MCP files modified:
- `mcp-server/server.py` — update `create` and `duplicate` endpoints

### Test files modified:
- `backend/apps/contests/tests/management/test_contest_viewset_actions.py` — update/move tests
- `mcp-server/tests/test_server.py` — update endpoint paths

---

## Phase 1: Remove Unused Endpoints & Dead Code

### Task 1: Remove orphan-queue and resolve-orphan endpoints

These admin-only endpoints have no frontend or MCP callers. Orphan cleanup is now automatic via `cleanup_orphan_asset_if_needed`.

**Files:**
- Modify: `backend/apps/problems/views.py`
- Modify: `backend/apps/problems/serializers.py`

- [ ] **Step 1: Remove orphan_queue and resolve_orphan actions from ProblemViewSet**

In `backend/apps/problems/views.py`, delete the `orphan_queue` action (lines 214-220) and `resolve_orphan` action (lines 257-339). Also remove `OrphanProblemSerializer` and `ResolveOrphanProblemSerializer` from `serializers.py`.

- [ ] **Step 2: Run existing problem tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ -v --no-cov --ds=config.settings.test --reuse-db`
Expected: PASS (no test references these endpoints)

- [ ] **Step 3: Commit**

```bash
git add backend/apps/problems/views.py backend/apps/problems/serializers.py
git commit -m "cleanup: remove unused orphan-queue and resolve-orphan endpoints"
```

### Task 2: Remove problem discussion endpoints

Frontend discussions use `/api/v1/discussions/` (separate app), not `/api/v1/problems/{id}/discussions/`. The problem discussion views, models, and URLs are unused.

**Files:**
- Delete: `backend/apps/problems/discussion_views.py`
- Modify: `backend/apps/problems/urls.py` — remove discussion URL patterns (lines 22-61)
- Modify: `backend/apps/problems/models.py` — remove ProblemDiscussion, ProblemDiscussionComment, DiscussionLike, CommentLike models

- [ ] **Step 1: Remove discussion URL patterns from urls.py**

In `backend/apps/problems/urls.py`, delete all 6 discussion path() entries (discussions, problem-discussions, comments, likes).

- [ ] **Step 2: Delete discussion_views.py**

```bash
git rm backend/apps/problems/discussion_views.py
```

- [ ] **Step 3: Remove discussion models from models.py**

In `backend/apps/problems/models.py`, delete `ProblemDiscussion`, `ProblemDiscussionComment`, `DiscussionLike`, `CommentLike` classes (lines 279-424).

- [ ] **Step 4: Create migration for model removal**

Run: `docker compose -f docker-compose.dev.yml exec backend python manage.py makemigrations problems --name remove_discussion_models`

- [ ] **Step 5: Run tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 6: Commit**

```bash
git add -A backend/apps/problems/
git commit -m "cleanup: remove unused problem discussion endpoints and models"
```

### Task 3: Remove unused frontend repository functions

`createContestProblem`, `updateContestProblemScore`, and `publishContestProblemsToPractice` have zero callers.

**Files:**
- Modify: `frontend/src/infrastructure/api/repositories/contestProblems.repository.ts`

- [ ] **Step 1: Remove unused functions**

Delete `createContestProblem` (lines 42-51), `updateContestProblemScore` (lines 77-88), and `publishContestProblemsToPractice` (lines 90-105).

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/infrastructure/api/repositories/contestProblems.repository.ts
git commit -m "cleanup: remove unused frontend contest problem repository functions"
```

---

## Phase 2: Consolidate into ContestProblemViewSet

### Task 4: Extract shared service for bank import + materialization

The `_resolve_bank_question_for_import` and `_materialize_problem_from_bank_question` methods live on ContestViewSet but are called by both ContestViewSet and ContestProblemViewSet. Extract them to a shared service.

**Files:**
- Create: `backend/apps/contests/services/contest_problem_service.py`
- Modify: `backend/apps/contests/views/contest.py` — delegate to service
- Modify: `backend/apps/contests/views/problem.py` — use service directly instead of ContestViewSet instance hack

- [ ] **Step 1: Create contest_problem_service.py**

Create `backend/apps/contests/services/contest_problem_service.py` with:
- `resolve_bank_question_for_import(user, question_bank_id, question_id)` → returns `(bank, question)` or raises
- `materialize_problem_from_bank_question(contest, question, user)` → returns `CodingProblem`

Extract the logic directly from `ContestViewSet._resolve_bank_question_for_import` (contest.py:846-898) and `ContestViewSet._materialize_problem_from_bank_question` (contest.py:900-1018). Change `_resolve_bank_question_for_import` to raise `DRFValidationError` / `NotFound` instead of returning error responses.

- [ ] **Step 2: Update ContestViewSet.add_problem to use service**

In `contest.py`, replace `self._resolve_bank_question_for_import(...)` and `self._materialize_problem_from_bank_question(...)` calls with imports from the new service.

- [ ] **Step 3: Update ContestProblemViewSet.import_from_bank to use service directly**

In `problem.py`, replace the hacky `ContestViewSet()` instance creation with direct imports from service.

- [ ] **Step 4: Run all contest tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/contests/tests/ -v --no-cov --ds=config.settings.test --reuse-db`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/contests/services/contest_problem_service.py backend/apps/contests/views/contest.py backend/apps/contests/views/problem.py
git commit -m "refactor: extract contest problem service from ContestViewSet helpers"
```

### Task 5: Add `duplicate` and `reorder` actions to ContestProblemViewSet

**Files:**
- Modify: `backend/apps/contests/views/problem.py`
- Modify: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`

- [ ] **Step 1: Write failing test for `duplicate`**

```python
@pytest.mark.django_db
def test_contest_problem_duplicate_creates_clone(api_client, owner, contest):
    from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
    problem = _create_problem("Original", owner)
    asset = QuestionAsset.objects.create(owner=owner, asset_type=QuestionAsset.AssetType.CODING, title="Original")
    problem.question_asset = asset
    problem.save(update_fields=["question_asset"])
    ContestQuestionBinding.objects.create(
        contest=contest, question_asset=asset, coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING, order=0, score=100,
    )

    api_client.force_authenticate(user=owner)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/problems/duplicate/",
        {"problem_id": str(problem.id)},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    bindings = ContestQuestionBinding.objects.filter(contest=contest, binding_type=QuestionAsset.AssetType.CODING)
    assert bindings.count() == 2
```

- [ ] **Step 2: Write failing test for `reorder`**

```python
@pytest.mark.django_db
def test_contest_problem_reorder_via_viewset(api_client, owner, contest):
    from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
    bindings = []
    for i, title in enumerate(["A", "B", "C"]):
        p = _create_problem(title, owner)
        asset = QuestionAsset.objects.create(owner=owner, asset_type=QuestionAsset.AssetType.CODING, title=title)
        p.question_asset = asset
        p.save(update_fields=["question_asset"])
        b = ContestQuestionBinding.objects.create(
            contest=contest, question_asset=asset, coding_problem=p,
            binding_type=QuestionAsset.AssetType.CODING, order=i, score=100,
        )
        bindings.append(b)

    api_client.force_authenticate(user=owner)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/problems/reorder/",
        {"orders": [
            {"id": str(bindings[2].id), "order": 0},
            {"id": str(bindings[0].id), "order": 1},
            {"id": str(bindings[1].id), "order": 2},
        ]},
        format="json",
    )

    assert response.status_code == 200
    bindings[2].refresh_from_db()
    assert bindings[2].order == 0
```

- [ ] **Step 3: Run tests to verify they fail**

Expected: 404 because actions don't exist yet.

- [ ] **Step 4: Implement `duplicate` action**

Add to `ContestProblemViewSet` in `problem.py`:

```python
@action(detail=False, methods=["post"], url_path="duplicate")
def duplicate(self, request, *args, **kwargs):
    """Clone an existing coding problem within the contest."""
    contest_id = self.kwargs.get("contest_pk")
    contest = get_object_or_404(Contest, pk=contest_id)
    user = request.user

    if not can_manage_contest(user, contest):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
    ensure_contest_question_editable(
        contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.duplicate",
    )

    problem_id = request.data.get("problem_id")
    if not problem_id:
        raise DRFValidationError("problem_id is required")

    from apps.problems.models import CodingProblem
    source = CodingProblem.objects.filter(id=problem_id).first()
    if not source:
        return Response({"detail": "Problem not found"}, status=status.HTTP_404_NOT_FOUND)

    from apps.problems.services import ProblemService
    problem = ProblemService.clone_problem(source, contest, user)

    if not problem.question_asset_id:
        from apps.question_bank.question_assets import sync_problem_question_asset
        sync_problem_question_asset(problem=problem, actor=user)
        problem.refresh_from_db(fields=["question_asset", "question_version"])

    last_order = ContestQuestionBinding.objects.filter(
        contest=contest, binding_type=QuestionAsset.AssetType.CODING,
    ).aggregate(max_order=Max("order"))["max_order"]
    next_order = (last_order if last_order is not None else -1) + 1

    default_max_score = max(1, int(problem.test_cases.aggregate(total=Sum("score"))["total"] or 100))
    requested = request.data.get("max_score")
    max_score = max(1, int(requested)) if requested is not None else default_max_score

    binding = ContestQuestionBinding.objects.create(
        contest=contest, question_asset=problem.question_asset,
        question_version=problem.question_version, coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        order=next_order, score=max_score, source_mode="copy", created_by=user,
    )

    cp = ContestProblem(
        contest=contest, problem=problem, order=next_order, max_score=max_score,
        question_asset=problem.question_asset, question_version=problem.question_version,
    )
    cp._skip_binding_sync = True
    cp.save()
    binding.legacy_contest_problem = cp
    binding.save(update_fields=["legacy_contest_problem", "updated_at"])

    ContestActivityViewSet.log_activity(
        contest, user, "update_problem", f"Duplicated problem {source.title or source.id}",
    )

    from apps.problems.serializers import ProblemListSerializer
    data = ProblemListSerializer(problem, context={"request": request}).data
    data["binding_id"] = str(binding.id)
    return Response(data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 5: Implement `reorder` action**

Add to `ContestProblemViewSet`:

```python
@action(detail=False, methods=["post"], url_path="reorder")
def reorder(self, request, *args, **kwargs):
    """Reorder coding problems. Payload: {"orders": [{"id": "...", "order": N}, ...]}"""
    contest_id = self.kwargs.get("contest_pk")
    contest = get_object_or_404(Contest, pk=contest_id)
    user = request.user

    if not can_manage_contest(user, contest):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
    ensure_contest_question_editable(
        contest=contest, actor_id=getattr(user, "id", None), action="contest_problem.reorder",
    )

    orders = request.data.get("orders", [])
    if not orders:
        raise DRFValidationError("No orders provided")

    import uuid as _uuid
    for item in orders:
        item_id = item.get("id")
        new_order = item.get("order")
        if item_id is None or new_order is None:
            continue
        item_str = str(item_id)
        try:
            _uuid.UUID(item_str)
            is_uuid = True
        except (ValueError, AttributeError):
            is_uuid = False

        if is_uuid:
            updated = ContestQuestionBinding.objects.filter(
                contest=contest, id=item_str,
            ).update(order=new_order)
            if not updated:
                ContestQuestionBinding.objects.filter(
                    contest=contest, coding_problem_id=item_str,
                ).update(order=new_order)
        elif item_str.isdigit():
            ContestQuestionBinding.objects.filter(
                contest=contest, legacy_contest_problem_id=int(item_str),
            ).update(order=new_order)

    # Normalize to sequential 0, 1, 2...
    bindings = ContestQuestionBinding.objects.filter(
        contest=contest, binding_type=QuestionAsset.AssetType.CODING,
    ).order_by("order", "created_at")
    for i, b in enumerate(bindings):
        if b.order != i:
            b.order = i
            b.save(update_fields=["order", "updated_at"])
        if b.legacy_contest_problem_id:
            ContestProblem.objects.filter(pk=b.legacy_contest_problem_id).update(order=i)

    ContestActivityViewSet.log_activity(contest, user, "update_problem", "Reordered coding problems")
    return Response({"status": "reordered"})
```

- [ ] **Step 6: Run tests**

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/contests/views/problem.py backend/apps/contests/tests/management/test_contest_viewset_actions.py
git commit -m "feat: add duplicate and reorder actions to ContestProblemViewSet"
```

### Task 6: Update frontend to use ContestProblemViewSet endpoints

**Files:**
- Modify: `frontend/src/infrastructure/api/repositories/contestProblems.repository.ts`
- Modify: `frontend/src/features/contest/components/admin/examEditor/CodingTestEditorLayout.tsx`

- [ ] **Step 1: Update repository functions**

In `contestProblems.repository.ts`:

Replace `addContestProblem` (POST to `/add_problem/`) with two functions:
```typescript
export const createContestProblem = async (
  contestId: string,
  data: { title: string; max_score?: number }
): Promise<Problem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/`, data),
    "Failed to create problem"
  );
  return mapProblemDto(responseData);
};

export const duplicateContestProblem = async (
  contestId: string,
  data: { problem_id: string; max_score?: number }
): Promise<Problem> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/problems/duplicate/`, data),
    "Failed to duplicate problem"
  );
  return mapProblemDto(responseData);
};

export const importContestProblemsFromBank = async (
  contestId: string,
  items: { question_bank_id: string; question_id: string }[]
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/problems/import-from-bank/`, { items }),
    "Failed to import problems from bank"
  );
};
```

Replace `reorderContestProblems` endpoint:
```typescript
export const reorderContestProblems = async (
  contestId: string,
  orders: { id: string | number; order: number }[]
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/problems/reorder/`, { orders }),
    "Failed to reorder problems"
  );
};
```

- [ ] **Step 2: Update CodingTestEditorLayout.tsx**

Replace the three `addContestProblem` call sites:

Line ~289 (bank import):
```typescript
// Before: addContestProblem(contestId, { question_bank_id: ..., question_id: ... })
// After:
importContestProblemsFromBank(contestId, [{ question_bank_id: sourceItem.questionBankId, question_id: sourceItem.questionId }])
```

Line ~298 (template creation):
```typescript
// Before: addContestProblem(contestId, { title: sourceItem.title })
// After:
createContestProblem(contestId, { title: sourceItem.title })
```

Line ~322 (duplicate):
```typescript
// Before: addContestProblem(contestId, { problem_id: problemId })
// After:
duplicateContestProblem(contestId, { problem_id: problemId })
```

Update imports accordingly.

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/infrastructure/api/repositories/contestProblems.repository.ts frontend/src/features/contest/components/admin/examEditor/CodingTestEditorLayout.tsx
git commit -m "refactor: frontend uses ContestProblemViewSet endpoints for all problem operations"
```

### Task 7: Update MCP to use ContestProblemViewSet endpoints

**Files:**
- Modify: `mcp-server/server.py`
- Modify: `mcp-server/tests/test_server.py`

- [ ] **Step 1: Update `create` action endpoint**

In `server.py`, change the `create` action from:
```python
return await django_api("POST", f"/api/v1/contests/{contest_id}/add_problem/", ctx, json_body=body)
```
To:
```python
return await django_api("POST", f"/api/v1/contests/{contest_id}/problems/", ctx, json_body=body)
```

- [ ] **Step 2: Update `duplicate` action endpoint**

Change from:
```python
return await django_api("POST", f"/api/v1/contests/{contest_id}/add_problem/", ctx, json_body=body)
```
To:
```python
return await django_api("POST", f"/api/v1/contests/{contest_id}/problems/duplicate/", ctx, json_body=body)
```

- [ ] **Step 3: Update tests**

In `test_server.py`, update expected paths:
- `test_qjudge_coding_create`: path → `/api/v1/contests/c-1/problems/`
- `test_qjudge_coding_duplicate`: path → `/api/v1/contests/c-1/problems/duplicate/`

- [ ] **Step 4: Rebuild and run MCP tests**

Run: rebuild MCP container, install pytest, run all tests.
Expected: 44 passed

- [ ] **Step 5: Commit**

```bash
git add mcp-server/server.py mcp-server/tests/test_server.py
git commit -m "refactor: MCP uses ContestProblemViewSet endpoints for create and duplicate"
```

### Task 8: Remove `add_problem` and `reorder_problems` from ContestViewSet

Now that all callers use ContestProblemViewSet, remove the old actions.

**Files:**
- Modify: `backend/apps/contests/views/contest.py`
- Modify: `backend/apps/contests/tests/management/test_contest_viewset_actions.py`

- [ ] **Step 1: Remove `add_problem` action and its helpers**

In `contest.py`, delete:
- `_resolve_bank_question_for_import` method (now in service)
- `_materialize_problem_from_bank_question` method (now in service)
- `add_problem` action
- Related helper methods only used by add_problem

- [ ] **Step 2: Remove `reorder_problems` action**

Delete the `reorder_problems` method from ContestViewSet.

- [ ] **Step 3: Update tests**

In `test_contest_viewset_actions.py`:
- Update tests that use `/api/v1/contests/{id}/add_problem/` to use new endpoints
- Update tests that use `/api/v1/contests/{id}/reorder_problems/` to use new endpoint
- Specifically: `test_add_problem_supports_existing_problem_and_title_mode`, `test_add_problem_supports_question_bank_copy`, `test_add_problem_materializes_coding_ext_when_bank_question_has_no_source_problem`, `test_reorder_problems_updates_and_normalizes_order`, `test_contest_question_mutations_blocked_when_question_edit_locked` (references add_problem)

- [ ] **Step 4: Run all contest tests**

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/contests/views/contest.py backend/apps/contests/tests/
git commit -m "cleanup: remove add_problem and reorder_problems from ContestViewSet"
```

---

## Phase 3: Remove ContestProblem Dual-Write

### Task 9: Audit ContestProblem readers

Before removing dual-write, verify nothing reads ContestProblem directly.

**Files:** Read-only audit, no changes.

- [ ] **Step 1: Search for all ContestProblem model usage**

Search backend for:
- `ContestProblem.objects` queries (not in dual-write code)
- `contest.contest_problems` related manager usage
- `contest_problem` foreign key references
- Serializers that read ContestProblem

Document each reference and whether it can be replaced with ContestQuestionBinding.

- [ ] **Step 2: Search frontend for ContestProblem ID patterns**

Check if any frontend code uses integer ContestProblem IDs vs UUID binding IDs. The `_resolve_binding` method in ContestProblemViewSet already handles both — confirm this is the only entry point.

- [ ] **Step 3: Document findings**

Create a list of all ContestProblem references that need migration before dual-write removal. This becomes the work list for the next tasks.

- [ ] **Step 4: Commit audit notes**

```bash
git commit --allow-empty -m "audit: document ContestProblem references for dual-write removal"
```

### Task 10: Remove dual-write from ContestProblemViewSet

**Files:**
- Modify: `backend/apps/contests/views/problem.py`

- [ ] **Step 1: Remove ContestProblem creation from `create` action**

Delete lines that create `ContestProblem` instance and link it to binding via `legacy_contest_problem`.

- [ ] **Step 2: Remove ContestProblem creation from `import_from_bank` action**

Same deletion.

- [ ] **Step 3: Remove ContestProblem creation from `duplicate` action**

Same deletion.

- [ ] **Step 4: Remove ContestProblem deletion from `destroy` action**

Delete: `if binding.legacy_contest_problem_id: ContestProblem.objects.filter(...).delete()`

- [ ] **Step 5: Remove ContestProblem sync from `update_score` action**

Delete: `if binding.legacy_contest_problem_id: ContestProblem.objects.filter(...).update(max_score=...)`

- [ ] **Step 6: Remove ContestProblem sync from `reorder` action**

Delete: `if b.legacy_contest_problem_id: ContestProblem.objects.filter(...).update(order=i)`

- [ ] **Step 7: Remove ContestProblem import**

Remove `ContestProblem` from imports at top of file.

- [ ] **Step 8: Run all tests**

Expected: Some tests may fail if they assert on ContestProblem existence. Update those tests.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/contests/views/problem.py backend/apps/contests/tests/
git commit -m "cleanup: remove ContestProblem dual-write from ContestProblemViewSet"
```

### Task 11: Remove ContestProblem model (final cleanup)

**Files:**
- Modify: `backend/apps/contests/models.py`
- Modify: `backend/apps/question_bank/models.py` — remove `legacy_contest_problem` FK from ContestQuestionBinding
- Create migration

- [ ] **Step 1: Remove ContestProblem model**

Delete the ContestProblem class from `backend/apps/contests/models.py`.

- [ ] **Step 2: Remove `legacy_contest_problem` FK from ContestQuestionBinding**

In `backend/apps/question_bank/models.py`, remove the `legacy_contest_problem` OneToOneField.

- [ ] **Step 3: Remove `_resolve_binding` legacy integer fallback**

In `backend/apps/contests/views/problem.py`, remove the `lookup_str.isdigit()` branch since no more integer IDs.

- [ ] **Step 4: Clean up all remaining ContestProblem references**

Search and remove any remaining imports, serializer fields, test fixtures, etc.

- [ ] **Step 5: Create migration**

Run: `docker compose -f docker-compose.dev.yml exec backend python manage.py makemigrations contests question_bank --name remove_contest_problem_model`

- [ ] **Step 6: Run full test suite**

Expected: ALL PASS after fixing any remaining references.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "cleanup: remove ContestProblem model and legacy dual-write infrastructure"
```
