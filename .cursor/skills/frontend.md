# QJudge frontend guidance

Use the maintained project guidance in `CLAUDE.md` and the relevant `.codex/skills/` owner:

- `qjudge-ui-carbon-owner`: components, styling, accessibility, Storybook.
- `qjudge-architecture-owner`: layer boundaries and state ownership.
- `qjudge-env-compose-owner`: service-dependent checks.

Follow the state management already used by the affected feature. Do not introduce Redux, Zustand, Jotai, or another state library solely because of a generic example.
