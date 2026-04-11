# MCP Coding Problem CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `qjudge_coding` tool to the MCP server for full coding problem CRUD + test_run.

**Architecture:** Single `@mcp.tool()` function with `action` parameter routing to Django's `/api/v1/problems/` endpoints via existing `django_api()` helper. All queries use `scope=manage`. No Django-side changes needed.

**Tech Stack:** Python, FastMCP, httpx, pytest

---

## Task 1: Write failing tests for `qjudge_coding` list and get actions

**Files:**
- Modify: `mcp-server/tests/test_server.py`

- [ ] **Step 1: Write test for `list` action with query params**

Add to `mcp-server/tests/test_server.py`:

```python
def test_qjudge_coding_list_builds_query_with_scope_manage(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"results": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding(
            "list",
            DummyContext(),
            search="binary",
            difficulty="easy,medium",
            tags="array,dp",
        )
    )

    assert result == {"results": []}
    assert captured == {
        "method": "GET",
        "path": "/api/v1/problems/?scope=manage&search=binary&difficulty=easy%2Cmedium&tags=array%2Cdp",
        "json_body": None,
    }
```

- [ ] **Step 2: Write test for `list` action with no filters**

```python
def test_qjudge_coding_list_with_no_filters(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["path"] = path
        return {"results": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(server.qjudge_coding("list", DummyContext()))

    assert captured["path"] == "/api/v1/problems/?scope=manage"
```

- [ ] **Step 3: Write test for `get` action**

```python
def test_qjudge_coding_get_calls_detail_endpoint(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return {"id": "p-1", "title": "A+B"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("get", DummyContext(), problem_id="p-1"))

    assert result == {"id": "p-1", "title": "A+B"}
    assert captured == {
        "method": "GET",
        "path": "/api/v1/problems/p-1/",
    }
```

- [ ] **Step 4: Write test for `get` without problem_id**

```python
def test_qjudge_coding_get_requires_problem_id():
    result = run(server.qjudge_coding("get", DummyContext()))
    assert result == {"error": True, "detail": "problem_id is required"}
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd /Users/quan/online_judge/mcp-server && python -m pytest tests/test_server.py -k "qjudge_coding" -v`
Expected: FAIL — `module 'server' has no attribute 'qjudge_coding'`

---

## Task 2: Write failing tests for create, update, delete actions

**Files:**
- Modify: `mcp-server/tests/test_server.py`

- [ ] **Step 1: Write test for `create` with basic + nested fields**

```python
def test_qjudge_coding_create_sends_full_body(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "new-p", "title": "New Problem"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding(
            "create",
            DummyContext(),
            title="New Problem",
            difficulty="easy",
            time_limit=1000,
            memory_limit=256,
            test_cases=[
                {"input_data": "1 2", "output_data": "3", "is_sample": True, "weight_percent": 50},
                {"input_data": "3 4", "output_data": "7", "weight_percent": 50},
            ],
            language_configs=[
                {"language": "python", "template_code": "", "is_enabled": True},
            ],
            existing_tag_ids=["tag-1"],
            new_tag_names=["new-tag"],
        )
    )

    assert result == {"id": "new-p", "title": "New Problem"}
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/problems/"
    body = captured["json_body"]
    assert body["title"] == "New Problem"
    assert body["difficulty"] == "easy"
    assert body["time_limit"] == 1000
    assert body["memory_limit"] == 256
    assert len(body["test_cases"]) == 2
    assert body["language_configs"] == [{"language": "python", "template_code": "", "is_enabled": True}]
    assert body["existing_tag_ids"] == ["tag-1"]
    assert body["new_tag_names"] == ["new-tag"]
```

- [ ] **Step 2: Write test for `create` with minimal fields**

```python
def test_qjudge_coding_create_minimal_only_title(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["json_body"] = json_body
        return {"id": "new-p"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(server.qjudge_coding("create", DummyContext(), title="Minimal"))

    assert captured["json_body"] == {"title": "Minimal"}
```

- [ ] **Step 3: Write test for `create` without title**

```python
def test_qjudge_coding_create_requires_title():
    result = run(server.qjudge_coding("create", DummyContext()))
    assert result == {"error": True, "detail": "title is required"}
```

- [ ] **Step 4: Write test for `update` with partial fields**

```python
def test_qjudge_coding_update_sends_only_provided_fields(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"id": "p-1", "title": "Updated"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding(
            "update",
            DummyContext(),
            problem_id="p-1",
            title="Updated",
            time_limit=2000,
            test_cases=[{"input_data": "1", "output_data": "1", "weight_percent": 100}],
        )
    )

    assert result == {"id": "p-1", "title": "Updated"}
    assert captured["method"] == "PATCH"
    assert captured["path"] == "/api/v1/problems/p-1/"
    assert captured["json_body"] == {
        "title": "Updated",
        "time_limit": 2000,
        "test_cases": [{"input_data": "1", "output_data": "1", "weight_percent": 100}],
    }
```

- [ ] **Step 5: Write test for `update` error cases**

```python
def test_qjudge_coding_update_requires_problem_id():
    result = run(server.qjudge_coding("update", DummyContext(), title="X"))
    assert result == {"error": True, "detail": "problem_id is required"}


def test_qjudge_coding_update_requires_at_least_one_field():
    result = run(server.qjudge_coding("update", DummyContext(), problem_id="p-1"))
    assert result == {"error": True, "detail": "No fields to update"}
```

- [ ] **Step 6: Write test for `delete`**

```python
def test_qjudge_coding_delete_calls_endpoint(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        return {"status": "success"}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(server.qjudge_coding("delete", DummyContext(), problem_id="p-1"))

    assert result == {"status": "deleted", "problem_id": "p-1"}
    assert captured == {"method": "DELETE", "path": "/api/v1/problems/p-1/"}


def test_qjudge_coding_delete_requires_problem_id():
    result = run(server.qjudge_coding("delete", DummyContext()))
    assert result == {"error": True, "detail": "problem_id is required"}
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd /Users/quan/online_judge/mcp-server && python -m pytest tests/test_server.py -k "qjudge_coding" -v`
Expected: FAIL — `module 'server' has no attribute 'qjudge_coding'`

---

## Task 3: Write failing tests for test_run action and unknown action

**Files:**
- Modify: `mcp-server/tests/test_server.py`

- [ ] **Step 1: Write test for `test_run` with samples**

```python
def test_qjudge_coding_test_run_with_samples(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["method"] = method
        captured["path"] = path
        captured["json_body"] = json_body
        return {"results": [{"status": "AC", "time": 10}]}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    result = run(
        server.qjudge_coding(
            "test_run",
            DummyContext(),
            problem_id="p-1",
            language="python",
            code="print(int(input())+int(input()))",
        )
    )

    assert result == {"results": [{"status": "AC", "time": 10}]}
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/problems/p-1/test_run/"
    assert captured["json_body"] == {
        "language": "python",
        "code": "print(int(input())+int(input()))",
        "use_samples": True,
    }
```

- [ ] **Step 2: Write test for `test_run` with custom test cases**

```python
def test_qjudge_coding_test_run_with_custom_cases(monkeypatch):
    captured = {}

    async def fake_django_api(method, path, ctx, *, json_body=None):
        captured["json_body"] = json_body
        return {"results": []}

    monkeypatch.setattr(server, "django_api", fake_django_api)

    run(
        server.qjudge_coding(
            "test_run",
            DummyContext(),
            problem_id="p-1",
            language="cpp",
            code="#include <iostream>",
            use_samples=False,
            custom_test_cases=[{"input": "1 2", "expected_output": "3"}],
        )
    )

    assert captured["json_body"] == {
        "language": "cpp",
        "code": "#include <iostream>",
        "use_samples": False,
        "custom_test_cases": [{"input": "1 2", "expected_output": "3"}],
    }
```

- [ ] **Step 3: Write test for `test_run` error cases**

```python
def test_qjudge_coding_test_run_requires_fields():
    no_problem = run(server.qjudge_coding("test_run", DummyContext(), language="python", code="x"))
    assert no_problem == {"error": True, "detail": "problem_id is required"}

    no_language = run(server.qjudge_coding("test_run", DummyContext(), problem_id="p-1", code="x"))
    assert no_language == {"error": True, "detail": "language is required"}

    no_code = run(server.qjudge_coding("test_run", DummyContext(), problem_id="p-1", language="python"))
    assert no_code == {"error": True, "detail": "code is required"}
```

- [ ] **Step 4: Write test for unknown action**

```python
def test_qjudge_coding_unknown_action():
    result = run(server.qjudge_coding("wat", DummyContext()))
    assert result == {"error": True, "detail": "Unknown action: wat"}
```

- [ ] **Step 5: Run all coding tests to verify they fail**

Run: `cd /Users/quan/online_judge/mcp-server && python -m pytest tests/test_server.py -k "qjudge_coding" -v`
Expected: FAIL — `module 'server' has no attribute 'qjudge_coding'`

- [ ] **Step 6: Commit all tests**

```bash
cd /Users/quan/online_judge
git add mcp-server/tests/test_server.py
git commit -m "test: add failing tests for qjudge_coding MCP tool"
```

---

## Task 4: Implement `qjudge_coding` tool function

**Files:**
- Modify: `mcp-server/server.py`

- [ ] **Step 1: Add the tool function**

Add before `if __name__ == "__main__":` in `mcp-server/server.py`:

```python
# ---------------------------------------------------------------------------
# Tool 4: qjudge_coding — 程式題目 CRUD + test_run
# ---------------------------------------------------------------------------

@mcp.tool()
async def qjudge_coding(
    action: str,
    ctx: Context,
    problem_id: str | None = None,
    search: str | None = None,
    difficulty: str | None = None,
    tags: str | None = None,
    title: str | None = None,
    slug: str | None = None,
    time_limit: int | None = None,
    memory_limit: int | None = None,
    forbidden_keywords: list[str] | None = None,
    required_keywords: list[str] | None = None,
    test_cases: list[dict] | None = None,
    language_configs: list[dict] | None = None,
    translations: list[dict] | None = None,
    existing_tag_ids: list[str] | None = None,
    new_tag_names: list[str] | None = None,
    language: str | None = None,
    code: str | None = None,
    use_samples: bool = True,
    custom_test_cases: list[dict] | None = None,
) -> Any:
    """Manage coding problems: list, view, create, edit, delete, and test-run code.

    Actions:
      list        — Browse problems (optional: search, difficulty, tags)
      get         — Get full problem detail including test cases and language configs
      create      — Create a new problem (required: title)
      update      — Update problem fields (required: problem_id + at least one field)
      delete      — Delete a problem (required: problem_id)
      test_run    — Execute code against test cases (required: problem_id, language, code)
    """
    base = "/api/v1/problems"

    if action == "list":
        query: dict[str, str] = {"scope": "manage"}
        if search:
            query["search"] = search
        if difficulty:
            query["difficulty"] = difficulty
        if tags:
            query["tags"] = tags
        return await django_api("GET", f"{base}/?{urlencode(query)}", ctx)

    if action == "get":
        if not problem_id:
            return _error("problem_id is required")
        return await django_api("GET", f"{base}/{problem_id}/", ctx)

    if action == "create":
        if not title:
            return _error("title is required")
        body: dict[str, Any] = {"title": title}
        for key, val in [
            ("difficulty", difficulty),
            ("slug", slug),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("forbidden_keywords", forbidden_keywords),
            ("required_keywords", required_keywords),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("translations", translations),
            ("existing_tag_ids", existing_tag_ids),
            ("new_tag_names", new_tag_names),
        ]:
            if val is not None:
                body[key] = val
        return await django_api("POST", f"{base}/", ctx, json_body=body)

    if action == "update":
        if not problem_id:
            return _error("problem_id is required")
        body = {}
        for key, val in [
            ("title", title),
            ("difficulty", difficulty),
            ("slug", slug),
            ("time_limit", time_limit),
            ("memory_limit", memory_limit),
            ("forbidden_keywords", forbidden_keywords),
            ("required_keywords", required_keywords),
            ("test_cases", test_cases),
            ("language_configs", language_configs),
            ("translations", translations),
            ("existing_tag_ids", existing_tag_ids),
            ("new_tag_names", new_tag_names),
        ]:
            if val is not None:
                body[key] = val
        if not body:
            return _error("No fields to update")
        return await django_api("PATCH", f"{base}/{problem_id}/", ctx, json_body=body)

    if action == "delete":
        if not problem_id:
            return _error("problem_id is required")
        await django_api("DELETE", f"{base}/{problem_id}/", ctx)
        return {"status": "deleted", "problem_id": problem_id}

    if action == "test_run":
        if not problem_id:
            return _error("problem_id is required")
        if not language:
            return _error("language is required")
        if not code:
            return _error("code is required")
        body = {
            "language": language,
            "code": code,
            "use_samples": use_samples,
        }
        if custom_test_cases is not None:
            body["custom_test_cases"] = custom_test_cases
        return await django_api("POST", f"{base}/{problem_id}/test_run/", ctx, json_body=body)

    return _error(f"Unknown action: {action}")
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/quan/online_judge/mcp-server && python -m pytest tests/test_server.py -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/quan/online_judge
git add mcp-server/server.py
git commit -m "feat: add qjudge_coding MCP tool for coding problem CRUD + test_run"
```

---

## Task 5: Verify Django endpoints are reachable (integration smoke test)

**Files:** None (manual verification)

- [ ] **Step 1: Check dev environment is running**

Run: `bash /Users/quan/online_judge/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps`
Expected: backend, postgres, etc. are running. If not, start with `dev up -d`.

- [ ] **Step 2: Verify problems API responds**

Run: `docker compose -f docker-compose.dev.yml exec backend python -c "from apps.problems.models import CodingProblem; print(f'Problems count: {CodingProblem.objects.count()}')"` 
Expected: prints a count (may be 0 or more)

- [ ] **Step 3: Verify endpoint via curl from backend container**

Run: `docker compose -f docker-compose.dev.yml exec backend python manage.py shell -c "from django.test import RequestFactory; from apps.problems.views import ProblemViewSet; print('ProblemViewSet loaded OK')"`
Expected: "ProblemViewSet loaded OK"

- [ ] **Step 4: Run full test suite one final time**

Run: `cd /Users/quan/online_judge/mcp-server && python -m pytest tests/test_server.py -v`
Expected: ALL PASS (including all existing tests + new coding tests)
