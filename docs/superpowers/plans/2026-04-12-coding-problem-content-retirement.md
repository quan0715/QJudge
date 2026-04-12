# CodingProblem Content Field Retirement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove content fields (title, difficulty) and ProblemTranslation model from CodingProblem, making QuestionAsset the single source of truth for content.

**Architecture:** Three phases — (1) update all readers to use QuestionAsset, (2) update writers to stop writing content to CodingProblem, (3) delete fields/models/sync functions + migration. Each phase leaves the system in a working state.

**Tech Stack:** Django REST Framework, PostgreSQL

---

## File Structure

### Files modified:
- `backend/apps/problems/models.py` — remove title, difficulty, ProblemTranslation, effective_* properties
- `backend/apps/problems/serializers.py` — read content from QuestionAsset instead of CodingProblem
- `backend/apps/problems/services.py` — stop writing content to CodingProblem, remove ProblemTranslation writes
- `backend/apps/problems/managers.py` — update search/prefetch
- `backend/apps/problems/views.py` — update search_fields
- `backend/apps/problems/admin.py` — remove ProblemTranslationInline
- `backend/apps/contests/serializers.py` — update ContestProblemSerializer to read from QuestionAsset
- `backend/apps/question_bank/question_assets.py` — remove sync_asset_to_problem, sync_problem_question_asset

### Test files modified:
- `backend/apps/problems/tests/` — update fixtures
- `backend/apps/contests/tests/` — update fixtures
- `backend/apps/question_bank/tests/` — update fixtures

---

## Phase 1: Update Readers

### Task 1: Update ProblemListSerializer to read from QuestionAsset

**Files:**
- Modify: `backend/apps/problems/serializers.py`

- [ ] **Step 1: Update get_title to only read from QuestionAsset**

Replace the `get_title` method in `ProblemListSerializer`. Remove the ProblemTranslation fallback:

```python
def get_title(self, obj):
    """Get title from QuestionAsset (source of truth)."""
    if obj.question_asset_id:
        try:
            return obj.question_asset.title or f"Problem {obj.id}"
        except Exception:
            pass
    # Legacy fallback for problems without asset (should not happen after backfill)
    return getattr(obj, 'title', None) or f"Problem {obj.id}"
```

- [ ] **Step 2: Remove `difficulty` from Meta.fields, add as SerializerMethodField**

In `ProblemListSerializer`, change `difficulty` from a model field to a method field that reads from QuestionAsset:

Add field declaration:
```python
difficulty = serializers.SerializerMethodField()
```

Add method:
```python
def get_difficulty(self, obj):
    if obj.question_asset_id:
        try:
            return (obj.question_asset.payload or {}).get("difficulty", "medium")
        except Exception:
            pass
    return getattr(obj, 'difficulty', 'medium')
```

- [ ] **Step 3: Run tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 4: Commit**

```bash
git add backend/apps/problems/serializers.py
git commit -m "refactor: ProblemListSerializer reads title/difficulty from QuestionAsset"
```

### Task 2: Update ProblemDetailSerializer to read from QuestionAsset

**Files:**
- Modify: `backend/apps/problems/serializers.py`

- [ ] **Step 1: Replace `translations` field and `get_translation` method**

Remove `translations = ProblemTranslationSerializer(many=True, read_only=True)` field.

Replace with a SerializerMethodField that reads from QuestionAsset.payload:

```python
translation = serializers.SerializerMethodField()
translations = serializers.SerializerMethodField()
```

Update `get_translation`:
```python
def get_translation(self, obj):
    """Get translation from QuestionAsset payload."""
    if not obj.question_asset_id:
        return None
    try:
        translations = (obj.question_asset.payload or {}).get("translations", [])
    except Exception:
        return None
    if not translations:
        return None
    lang = self.context.get('language', 'zh-TW')
    match_langs = ['zh-TW', 'zh-hant'] if lang == 'zh-TW' else [lang]
    for t in translations:
        if t.get("language") in match_langs:
            return t
    return translations[0]
```

Add `get_translations`:
```python
def get_translations(self, obj):
    """Get all translations from QuestionAsset payload."""
    if not obj.question_asset_id:
        return []
    try:
        return (obj.question_asset.payload or {}).get("translations", [])
    except Exception:
        return []
```

- [ ] **Step 2: Replace `title` and `difficulty` in fields**

Remove `'title'` and `'difficulty'` from Meta.fields (they're model fields that read from CodingProblem). Add them as SerializerMethodFields:

```python
title = serializers.SerializerMethodField()
difficulty = serializers.SerializerMethodField()

def get_title(self, obj):
    if obj.question_asset_id:
        try:
            return obj.question_asset.title or f"Problem {obj.id}"
        except Exception:
            pass
    return getattr(obj, 'title', None) or f"Problem {obj.id}"

def get_difficulty(self, obj):
    if obj.question_asset_id:
        try:
            return (obj.question_asset.payload or {}).get("difficulty", "medium")
        except Exception:
            pass
    return getattr(obj, 'difficulty', 'medium')
```

- [ ] **Step 3: Run tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ apps/contests/tests/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 4: Commit**

```bash
git add backend/apps/problems/serializers.py
git commit -m "refactor: ProblemDetailSerializer reads content from QuestionAsset"
```

### Task 3: Update ProblemAdminSerializer read path

**Files:**
- Modify: `backend/apps/problems/serializers.py`

- [ ] **Step 1: Replace translations read in ProblemAdminSerializer**

Change the `translations` field from `ProblemTranslationSerializer(many=True)` to `SerializerMethodField` for the read path. For write, translations_data is still extracted in create/update and passed to ProblemService:

```python
translations = serializers.SerializerMethodField()

# Write-only field for incoming translations
translations_input = ProblemTranslationSerializer(many=True, required=False, write_only=True, source='translations')
```

Wait — this gets complex because DRF uses same field for read and write. Better approach: keep `translations` as a writable field but override `to_representation` to read from QuestionAsset:

```python
def to_representation(self, instance):
    data = super().to_representation(instance)
    # Override translations from QuestionAsset payload
    if instance.question_asset_id:
        try:
            data['translations'] = (instance.question_asset.payload or {}).get("translations", [])
        except Exception:
            pass
    # Override title/difficulty from QuestionAsset
    if instance.question_asset_id:
        try:
            data['title'] = instance.question_asset.title or data.get('title', '')
            data['difficulty'] = (instance.question_asset.payload or {}).get("difficulty", data.get('difficulty', 'medium'))
        except Exception:
            pass
    return data
```

- [ ] **Step 2: Run tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ apps/contests/tests/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 3: Commit**

```bash
git add backend/apps/problems/serializers.py
git commit -m "refactor: ProblemAdminSerializer reads content from QuestionAsset"
```

### Task 4: Update ContestProblemSerializer

**Files:**
- Modify: `backend/apps/contests/serializers.py`

- [ ] **Step 1: Update get_title and get_difficulty**

These already read from `coding_problem.effective_title` and `coding_problem.effective_difficulty`. After we delete those properties, they need to read from QuestionAsset directly.

Update now to read from QuestionAsset to prepare for property removal:

```python
def get_title(self, obj):
    if obj.question_asset_id:
        try:
            return obj.question_asset.title
        except Exception:
            pass
    if obj.coding_problem_id:
        try:
            return obj.coding_problem.title
        except Exception:
            pass
    return None

def get_difficulty(self, obj):
    if obj.question_asset_id:
        try:
            return (obj.question_asset.payload or {}).get("difficulty", "medium")
        except Exception:
            pass
    if obj.coding_problem_id:
        try:
            return obj.coding_problem.difficulty
        except Exception:
            pass
    return "medium"
```

- [ ] **Step 2: Run tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/contests/tests/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 3: Commit**

```bash
git add backend/apps/contests/serializers.py
git commit -m "refactor: ContestProblemSerializer reads content from QuestionAsset directly"
```

### Task 5: Update OrphanProblemSerializer and managers

**Files:**
- Modify: `backend/apps/problems/serializers.py`
- Modify: `backend/apps/problems/managers.py`
- Modify: `backend/apps/problems/views.py`

- [ ] **Step 1: Update OrphanProblemSerializer**

Override title and difficulty to read from QuestionAsset:

```python
title = serializers.SerializerMethodField()
difficulty = serializers.SerializerMethodField()

def get_title(self, obj):
    if obj.question_asset_id:
        try:
            return obj.question_asset.title or f"Problem {obj.id}"
        except Exception:
            pass
    return getattr(obj, 'title', None) or f"Problem {obj.id}"

def get_difficulty(self, obj):
    if obj.question_asset_id:
        try:
            return (obj.question_asset.payload or {}).get("difficulty", "medium")
        except Exception:
            pass
    return getattr(obj, 'difficulty', 'medium')
```

- [ ] **Step 2: Update managers.py — remove translations prefetch**

In `ProblemQuerySet.visible_to`, change:
```python
return queryset.prefetch_related("translations", "test_cases", "tags").distinct()
```
To:
```python
return queryset.select_related("question_asset").prefetch_related("test_cases", "tags").distinct()
```

- [ ] **Step 3: Update views.py — remove translations from search_fields**

Change `search_fields = ['title', 'translations__title']` to:
```python
search_fields = ['title', 'question_asset__title']
```

- [ ] **Step 4: Run all tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ apps/contests/tests/ -v --no-cov --ds=config.settings.test --reuse-db`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/problems/serializers.py backend/apps/problems/managers.py backend/apps/problems/views.py
git commit -m "refactor: update OrphanProblemSerializer, managers, and search to use QuestionAsset"
```

---

## Phase 2: Update Writers

### Task 6: Update ProblemService to stop writing content to CodingProblem

**Files:**
- Modify: `backend/apps/problems/services.py`

- [ ] **Step 1: Update create_problem_adapter**

Remove `sync_asset_to_problem` call. Remove translations from `replace_related`. Content is already written to QuestionAsset via `write_coding_content_to_asset`. CodingProblem.objects.create should NOT include title/difficulty (but we keep them for now since the fields still exist — we'll remove in Phase 3):

In `create_problem_adapter`, remove line:
```python
sync_asset_to_problem(question_asset=question_asset, problem=problem)
```

In `replace_related` call, remove translations_data:
```python
ProblemService.replace_related(
    problem,
    test_cases_data=test_cases_data,
    language_configs_data=language_configs_data,
)
```

- [ ] **Step 2: Update update_problem_adapter**

Remove `sync_asset_to_problem` call. Remove translations from `replace_related`:

```python
ProblemService.replace_related(
    instance,
    test_cases_data=test_cases_data if test_cases_data else None,
    language_configs_data=language_configs_data if language_configs_data else None,
)
```

Remove the `effective_translations` variable and the `instance.translations.values(...)` fallback. Instead, for the `write_coding_content_to_asset` call, read existing translations from QuestionAsset payload:

```python
effective_translations = translations_data if translations_data else (
    (instance.question_asset.payload or {}).get("translations", []) if instance.question_asset_id else []
)
```

Remove `sync_asset_to_problem` import and call.

- [ ] **Step 3: Update clone_problem**

Currently clones ProblemTranslation via `_clone_related`. Remove translations from clone:

In `_clone_related`, remove the translations loop:
```python
# Remove this block:
translations = source_problem.translations.all()
for trans in translations:
    ProblemTranslation.objects.create(...)
```

In `clone_problem`, remove `title=f"{source_problem.title} (Copy)"` and `difficulty=source_problem.difficulty` from CodingProblem.objects.create. But we still need title for slug generation — read from QuestionAsset:

```python
source_title = source_problem.question_asset.title if source_problem.question_asset_id else "Problem"
new_problem = CodingProblem.objects.create(
    title=f"{source_title} (Copy)",  # Still needed until field is removed
    slug=f"{source_problem.slug}-{contest.id}-copy",
    difficulty=source_problem.difficulty,  # Still needed until field is removed
    time_limit=source_problem.time_limit,
    memory_limit=source_problem.memory_limit,
    created_by=created_by,
    question_asset=source_problem.question_asset,
    question_version=source_problem.question_version,
)
```

- [ ] **Step 4: Update create_contest_problem**

Remove `sync_asset_to_problem` call. Still create CodingProblem with title/difficulty for now (field removal is Phase 3):

```python
@staticmethod
@transaction.atomic
def create_contest_problem(contest, created_by, title="New Problem") -> CodingProblem:
    from apps.question_bank.question_assets import write_coding_content_to_asset
    slug = f"contest-{contest.id}-problem-{uuid.uuid4().hex[:8]}"

    question_asset, question_version = write_coding_content_to_asset(
        owner=created_by,
        title=title,
        prompt="",
        difficulty="medium",
        translations=[],
        actor=created_by,
    )

    problem = CodingProblem.objects.create(
        title=title,
        slug=slug,
        difficulty='medium',
        created_by=created_by,
        question_asset=question_asset,
        question_version=question_version,
    )
    return problem
```

- [ ] **Step 5: Update replace_related — remove translations handling**

```python
@staticmethod
def replace_related(
    problem: CodingProblem,
    *,
    test_cases_data=None,
    language_configs_data=None,
) -> None:
    if test_cases_data is not None:
        problem.test_cases.all().delete()
        for tc_data in test_cases_data:
            TestCase.objects.create(problem=problem, **tc_data)

    if language_configs_data is not None:
        problem.language_configs.all().delete()
        for lc_data in language_configs_data:
            LanguageConfig.objects.create(problem=problem, **lc_data)
```

Remove `ProblemTranslation` from imports.

- [ ] **Step 6: Clean up _split_content_execution and imports**

The `_split_content_execution` function and `CONTENT_FIELDS`/`EXECUTION_FIELDS` at the top can be simplified — title/difficulty are still passed in validated_data but we keep writing them to CodingProblem for now. No change needed yet.

Remove unused import `ProblemTranslation` from the top.

- [ ] **Step 7: Run all tests**

Run: `docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/problems/ apps/contests/tests/ apps/question_bank/tests/ -v --no-cov --ds=config.settings.test --reuse-db`

Fix any test failures (tests may create ProblemTranslation in fixtures — those tests need to verify content via QuestionAsset instead).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/problems/services.py
git commit -m "refactor: ProblemService stops writing content to CodingProblem, removes sync calls"
```

---

## Phase 3: Delete Fields and Models

### Task 7: Remove sync functions from question_assets.py

**Files:**
- Modify: `backend/apps/question_bank/question_assets.py`

- [ ] **Step 1: Delete `sync_asset_to_problem` function**

Delete the entire function (lines ~465-509).

- [ ] **Step 2: Delete `sync_problem_question_asset` function**

Delete the entire function (lines ~515-558). Also delete the DEPRECATED comment above it.

- [ ] **Step 3: Delete helper functions only used by sync**

Delete `_build_problem_asset_payload`, `_pick_problem_translation`, `_asset_visibility_for_problem`, `resolve_problem_asset_owner` — but ONLY if they have no other callers. Search each one first.

- [ ] **Step 4: Update all callers of deleted functions**

Search for `sync_problem_question_asset` and `sync_asset_to_problem` across the codebase. Remove all calls. Known callers:
- `services.py` (already removed in Task 6)
- `seed_e2e_data.py` — remove the sync call
- `seed_loadtest_data.py` — remove the sync call
- `backfill_question_assets.py` — update or remove
- `bank_workflows.py` — update
- Test files — update

- [ ] **Step 5: Run all tests**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cleanup: remove sync_problem_question_asset and sync_asset_to_problem"
```

### Task 8: Delete ProblemTranslation model and CodingProblem content fields

**Files:**
- Modify: `backend/apps/problems/models.py`
- Modify: `backend/apps/problems/admin.py`
- Modify: `backend/apps/problems/serializers.py` — remove ProblemTranslationSerializer
- Create migration

- [ ] **Step 1: Delete ProblemTranslation model from models.py**

Remove the entire `ProblemTranslation` class.

- [ ] **Step 2: Remove title and difficulty from CodingProblem**

Delete these fields from the model:
```python
title = models.CharField(max_length=255, verbose_name='標題')
difficulty = models.CharField(...)
```

Also delete `DIFFICULTY_CHOICES`, `effective_title`, `effective_difficulty`, `effective_owner` properties.

Update `__str__` to read from question_asset:
```python
def __str__(self):
    title = self.question_asset.title if self.question_asset_id else str(self.id)
    return f"{self.id}. {title}"
```

- [ ] **Step 3: Remove ProblemTranslationInline from admin.py**

Delete the inline and remove from ContestAdmin.inlines.

- [ ] **Step 4: Remove ProblemTranslationSerializer from serializers.py**

Delete the class. Remove from imports.

- [ ] **Step 5: Update all remaining references**

Search for `problem.title` and `problem.difficulty` across backend — these may still be used in:
- `LanguageConfig.__str__` — reads `self.problem.title`
- `TestCase.__str__` — reads `self.problem.title`
- `contest_problem_service.py` — may read title for logging
- Exporter DTOs — may read title
- Test fixtures — may set title/difficulty

Update all to read from `question_asset.title` or remove.

- [ ] **Step 6: Update ProblemService — remove title/difficulty from CodingProblem.objects.create**

In `create_problem_adapter`, `clone_problem`, `create_contest_problem`: remove `title=...` and `difficulty=...` from `CodingProblem.objects.create(...)`.

Update `_split_content_execution` — remove CONTENT_FIELDS since they no longer go to CodingProblem.

- [ ] **Step 7: Update ProblemViewSet search_fields**

Remove `'title'` from `search_fields` (field no longer exists). Keep `'question_asset__title'`.

- [ ] **Step 8: Create migration**

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py makemigrations problems --name remove_content_fields_and_translations
```

- [ ] **Step 9: Run ALL tests**

```bash
docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/ -v --no-cov --ds=config.settings.test --reuse-db
```

Also run MCP tests:
```bash
docker compose -f docker-compose.dev.yml exec qjudge-mcp pip install pytest -q && docker compose -f docker-compose.dev.yml exec qjudge-mcp python -m pytest tests/ -v
```

Fix all failures.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "cleanup: remove title, difficulty, ProblemTranslation from CodingProblem"
```

### Task 9: Final cleanup and verification

**Files:** Various

- [ ] **Step 1: Search for any remaining ProblemTranslation references**

```bash
grep -r "ProblemTranslation" backend/ --include="*.py" | grep -v migrations | grep -v __pycache__
```

Remove any found.

- [ ] **Step 2: Search for remaining `problem.title` or `problem.difficulty` patterns**

```bash
grep -rn "\.title" backend/apps/problems/ --include="*.py" | grep -v migrations | grep -v __pycache__
```

Verify none read from CodingProblem directly (only QuestionAsset).

- [ ] **Step 3: Regenerate OpenAPI schema**

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py spectacular --file schema.yml
```

- [ ] **Step 4: Run full test suite one final time**

```bash
docker compose -f docker-compose.dev.yml exec -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/online_judge backend python -m pytest apps/ -v --no-cov --ds=config.settings.test --reuse-db
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final cleanup and schema regeneration after content field retirement"
```
