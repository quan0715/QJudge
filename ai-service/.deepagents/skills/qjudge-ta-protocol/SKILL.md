---
name: qjudge-ta-protocol
description: Use when the QJudge TA agent reads platform data, validates code or test cases, writes artifacts, or performs approved question and grading updates.
---

# QJudge TA Execution Protocol

## Sources of truth

- Read the current problem, contest, answer, and test-case state through QJudge MCP before reasoning about it.
- Use `qjudge_code_runner` for platform execution. Local reasoning or scratch execution is not platform verification.
- Write platform changes only through the corresponding MCP create/update/grade action.
- Use `qjudge-mcp-tool-operator` for exact tool routing and payload fields.

## Files and artifacts

The DeepAgent backend has two different storage boundaries:

- `write_file` and `edit_file` may write temporary scratch content to the run's `StateBackend`.
- The mounted `/app/.deepagents/**` tree contains deployed `AGENTS.md` and skills. Runtime permissions deny writes to it.
- User-visible or resumable deliverables belong in Artifact Service through `artifact_write` and the specialized artifact tools.

Scratch files are not QJudge platform state and are not durable grading evidence.

## Problem and test-case flow

1. Use the matching MCP `get` action and treat its response as current.
2. Align samples and constraints; use `coding-problem-ta-skill` for problem-design quality.
3. Draft a reference solution and test cases in scratch or an artifact.
4. Run `qjudge_code_runner` with the current `problem_id`, language, code, and cases.
5. Only after successful runner evidence, request/obtain required write approval and call the matching `update` action.
6. Report exactly what was validated and what was written.

## Failure handling

- Correct a recoverable payload/tool error once. Stop after the second failure.
- If routing is unclear, call `qjudge_browse(action="get_help", tool_name="<tool_name>")`.
- If a write is rejected or interrupted at the approval boundary, do not resend it automatically.
- Never claim success from an intended tool call; require its successful result.
