# QJudge Paper CLI OAuth-First Design

Date: 2026-05-20
Status: Draft for implementation planning

## Purpose

QJudge Paper CLI is a lightweight command-line frontend for teacher-facing paper exam workflows. Its first production-like feature is AI grading for subjective exam questions.

The CLI exists to reduce frontend implementation cost while preserving the real QJudge product flow:

```text
login -> select classroom -> select exam -> select feature -> select question -> run AI grading -> collect artifacts
```

The CLI is not an experiment-only runner. Experiment commands will be added after the product-like grading path is stable.

## Decision

V1 is OAuth-first.

The CLI will reuse the existing QJudge OAuth authorization server that was introduced for MCP. It will not reuse the MCP server itself. The CLI talks directly to Django backend REST APIs with an OAuth bearer token.

The existing MCP OAuth system already provides the important pieces:

- OAuth authorization server metadata
- dynamic client registration
- public clients
- PKCE
- loopback HTTP redirect URIs
- browser-based login and consent through the existing QJudge frontend
- bearer token authentication through backend `OAuth2Authentication`

Therefore, the CLI should not implement email/password login as its primary path.

## Goals

- Provide a formal, product-like CLI entry point for paper exam workflows.
- Reuse existing backend APIs and durable AI run infrastructure.
- Make OAuth login the default and recommended authentication path.
- Run one-question AI grading from the CLI without modifying official grades.
- Download `rubric.md`, `grade.csv`, run metadata, and a local `manifest.json`.
- Keep the implementation small enough to build before the broader AI grading experiment pipeline.

## Non-Goals

- Do not route CLI actions through the MCP server.
- Do not write AI grades back to official exam scores in V1.
- Do not implement the three-model experiment pipeline in V1.
- Do not replace the current frontend grading UI.
- Do not implement a custom password login flow as the main CLI authentication path.

## OAuth Scope

The existing OAuth scope is currently named `mcp`. That works technically, but it is not a formal product scope for a CLI.

Add a new scope:

```text
qjudge.paper
```

Meaning:

```text
Access QJudge paper exam workflows from QJudge Paper CLI.
```

Keep `mcp` for backward compatibility. The authorization approve endpoint should accept both scopes:

```text
mcp
qjudge.paper
```

The CLI should request only:

```text
scope=qjudge.paper
```

## OAuth Flow

The CLI login flow is standard authorization code + PKCE:

```text
qjudge-paper auth login
  -> start a local callback server on 127.0.0.1:<random_port>
  -> register public OAuth client through /o/register/
  -> generate code_verifier and code_challenge
  -> open browser to /o/authorize/
  -> user logs in through QJudge frontend if needed
  -> user approves QJudge Paper CLI consent page
  -> frontend calls /api/oauth/approve/
  -> backend redirects to local callback with ?code=...&state=...
  -> CLI exchanges code at /o/token/
  -> CLI stores access token, refresh token, issuer, client id, and expiry
```

Token refresh:

```text
qjudge-paper auth refresh
  -> POST /o/token/ with grant_type=refresh_token
```

Logout:

```text
qjudge-paper auth logout
  -> delete local token cache
```

V1 may skip remote token revocation if it increases scope. Local logout is enough for the first implementation.

## Required Backend Changes

Minimal backend changes:

1. Add `qjudge.paper` to `OAUTH2_PROVIDER["SCOPES"]`.
2. Add `qjudge.paper` to OAuth authorization server metadata `scopes_supported`.
3. Update `/api/oauth/approve/` to allow `mcp` and `qjudge.paper`.
4. Update frontend OAuth authorize copy to display a non-MCP client name cleanly.
5. Add tests for the new scope and approval behavior.

No new auth model is required.

No MCP server change is required.

## CLI Commands

V1 commands:

```bash
qjudge-paper auth login
qjudge-paper auth status
qjudge-paper auth logout
qjudge-paper grade
```

`qjudge-paper grade` is interactive:

```text
1. select classroom
2. select exam
3. select feature: AI grading
4. select subjective question
5. select model
6. confirm read-only run
7. create AI session
8. upload seed grade.csv
9. start durable AI run
10. stream progress
11. download artifacts
```

Later commands:

```bash
qjudge-paper experiment pilot
qjudge-paper experiment full-exam
```

## API Usage

The CLI should use the same product APIs as the frontend:

| Step | API |
| --- | --- |
| Current user | `GET /api/v1/auth/me` |
| Classrooms | `GET /api/v1/classrooms/?scope=teaching` |
| Classroom exams | `GET /api/v1/classrooms/{classroom_id}/contests/` |
| Subjective questions | `GET /api/v1/contests/{contest_id}/exam-questions/?kind=subjective` |
| Grading answers | `GET /api/v1/contests/{contest_id}/exam-answers/all-answers/?projection=grading&question_id={question_id}` |
| Create AI session | `POST /api/v1/ai/sessions/new_session/` |
| Save task manifest | `PATCH /api/v1/ai/sessions/{session_id}/` |
| Upload seed artifact | `POST /api/v1/ai/artifacts/upload/` |
| Start AI run | `POST /api/v1/ai/sessions/{session_id}/runs/` |
| Stream run events | `GET /api/v1/ai/runs/{run_id}/events/?after=0` |
| List artifacts | `GET /api/v1/ai/artifacts/?session_id={session_id}` |
| Read artifact content | `GET /api/v1/ai/artifacts/{artifact_id}/content/` |

All calls use:

```http
Authorization: Bearer <access_token>
```

## AI Grading Contract

V1 reuses the current frontend grading contract:

Seed artifact:

```text
step=grade
filename=grade.csv
```

Columns:

```csv
index,exam_answer_id,username,answer_text,score,reason,synced
```

The CLI also writes a local-only `human_baseline.csv` with
`original_score` and `original_feedback`. That file is never uploaded to
the AI session during blind grading.

Blind grading sessions also attach a tool policy to the AI session task
manifest. The policy blocks `qjudge_grading` actions that can expose existing
grades, including `list_answers`, `question_detail`, and `dashboard`; it also
blocks grading write actions for experiment runs.

Prompt behavior:

- create `rubric.md`
- read `question_context.json`
- read `grade.csv`
- treat the run as blind grading: do not look up or use existing human scores
  or feedback
- fill `score` and `reason`
- do not call `qjudge_grading grade`
- do not call `qjudge_grading batch_grade`
- do not publish scores

Official grade mutation remains out of scope.

## Local Output

Output directory:

```text
reports/qjudge-paper/<contest_id>/<question_id>/<timestamp>/
```

Files:

```text
manifest.json
input_snapshot.json
question_context.json
rubric.md
grade.csv
human_baseline.csv
run_events.jsonl
report.md
```

`manifest.json` must record:

- CLI version
- backend base URL
- authenticated user id
- classroom id
- contest id
- question id
- model id
- AI session id
- AI run id
- artifact ids
- local artifact paths
- start/end time
- official grades modified: always `false` in V1

## Package Layout

Recommended location:

```text
tools/qjudge-paper-cli/
```

Recommended Python modules:

```text
tools/qjudge-paper-cli/pyproject.toml
tools/qjudge-paper-cli/qjudge_paper_cli/__main__.py
tools/qjudge-paper-cli/qjudge_paper_cli/app.py
tools/qjudge-paper-cli/qjudge_paper_cli/auth.py
tools/qjudge-paper-cli/qjudge_paper_cli/api.py
tools/qjudge-paper-cli/qjudge_paper_cli/grading.py
tools/qjudge-paper-cli/qjudge_paper_cli/artifacts.py
tools/qjudge-paper-cli/qjudge_paper_cli/manifest.py
tools/qjudge-paper-cli/qjudge_paper_cli/prompts.py
tools/qjudge-paper-cli/tests/
```

Recommended dependencies:

```text
httpx
pydantic
typer
rich
questionary
platformdirs
```

Token cache path:

```text
~/.config/qjudge-paper-cli/auth.json
```

The token file should be written with user-only permissions.

## Codex Operation Model

The CLI must be usable by a local coding agent without asking the user to paste passwords or raw access tokens.

Expected flow:

1. The user or agent runs `qjudge-paper auth login`.
2. The CLI opens a browser authorization URL and waits on a loopback callback.
3. The user approves the OAuth consent page in the browser.
4. The CLI stores refreshable credentials in the local token cache.
5. Later agent-driven commands reuse the token cache and refresh the access token automatically.

This means future Codex operation should not require reauthentication unless:

- the refresh token expires
- the user logs out
- the backend revokes the token
- the token cache is deleted
- the CLI is run on a different machine or Unix user account

The token cache is a local secret. It must stay outside the repository and must never be written to reports, logs, `manifest.json`, or git-tracked files.

Avoid OS keychain integration in V1 because it can introduce desktop permission prompts that make agent-driven CLI operation less reliable. A `0600` JSON token cache is acceptable for the first implementation.

## Implementation Phases

### Phase 1: OAuth-First Auth

- add `qjudge.paper` backend scope
- implement CLI OAuth login with PKCE and loopback callback
- implement token refresh
- implement `auth status`

### Phase 2: Product Wizard

- list classrooms
- list classroom exams
- list subjective questions
- list available AI models
- confirm read-only grading run

### Phase 3: One-Question AI Grading

- fetch grading answers
- create seed `grade.csv`
- create AI session
- save task manifest in session context
- upload seed `grade.csv`
- start durable AI run
- stream run events until terminal state
- download `rubric.md` and `grade.csv`
- write `manifest.json`

### Phase 4: Experiment Extensions

- add model set configuration
- add independent multi-model blind grading
- add Human H0 export
- add deterministic three-model voting
- add AI-vs-Human H0 aggregation reports

## Reduced-Workload Rationale

OAuth-first reduces work because it avoids:

- building a separate CLI password login UX
- storing teacher passwords locally
- implementing a new token issuer
- bypassing existing frontend SSO and consent behavior
- integrating the CLI directly with `ai-service`

The CLI only needs a standard OAuth desktop-client implementation plus existing REST API calls.

## Open Decisions

1. Should the CLI package be installed with `pipx`, or run from the repo through a wrapper script first?
2. Should token storage use plain `0600` JSON in V1, or add OS keychain integration immediately?
3. Should `qjudge.paper` allow all teacher REST APIs currently needed by the CLI, or should stricter scoped permissions be introduced later?
4. Which model should be the default for V1 AI grading?

Recommended defaults:

- run from repo first
- use `0600` JSON token cache in V1
- use `qjudge.paper` as a coarse CLI scope first
- default model: `deepseek-v4-flash`, matching current AI grading frontend default
