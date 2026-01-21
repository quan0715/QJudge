---
name: qjudge-clean-arch-workflow
description: Project architecture skill for QJudge that defines Clean Architecture responsibility boundaries, import directions, and a framework-agnostic new-feature workflow. Use when evaluating or refactoring project structure, splitting responsibilities, moving code across layers, or planning/implementing a new feature flow.
---

# QJudge Clean Architecture Workflow (Framework-Agnostic)

## Quick start
- Read references/architecture-boundaries.md before moving code across layers or adjusting folders.
- Read references/feature-workflow.md when creating a new feature or refactoring an existing one.
- Keep app-level providers and contexts under src/app.
- Prevent duplicate feature folders that differ only by case.

## Working rules
- Keep core pure: no UI, no framework imports, no direct I/O.
- Keep infrastructure as the only gateway to external I/O (HTTP, storage, etc.).
- Keep shared as cross-feature utilities/components with no feature or infrastructure dependency.
- Keep features as the only place where app-specific behavior is composed.
- Keep app as the composition root (providers, routing assembly, bootstrapping).
- Keep usecases for complex business logic that orchestrates multiple repositories.

## Architecture check gate
When the user asks to "check architecture" or requests an architecture review:
- Run naming lint first: `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-naming.js --root frontend/src`.
- Run import/architecture lint next: `node .codex/skills/qjudge-clean-arch-workflow/scripts/lint-architecture.js --root frontend/src`.
- Treat this as a gate: if any lint fails, the task is not complete. Report failures and stop at fixes.
- Even if scripts pass, scan for obvious boundary leaks or naming exceptions the scripts may miss and provide an improvement report.

## If blocked
- Stop and ask for a decision when a dependency direction is unclear or a boundary needs an exception.
