# Database migration baseline

The current baseline replaces the project's completed migration history through
`a7847bda3616` (including contests `0016_correct_clipboard_violation_counts`).
Old migration files and the legacy schema alignment helper have been removed.
Third-party migrations are unchanged.

- New installations create the current schema directly.
- Existing installations must first complete all migrations from `a7847bda3616`
  or a later release containing that history. The baseline's `replaces` metadata
  lets Django recognize that completed history without recreating tables or
  repeating data corrections. No `--fake` or manual ledger reset is required.
- Installations with partially applied older history must finish that upgrade
  before adopting this baseline. Direct upgrades from those older states are
  not supported.
- Keep the existing `django_migrations` rows. Historical rows for retired apps
  are harmless and are not application code; deleting them is unnecessary.
- The database default `submission_results.is_hidden = TRUE` is preserved for
  schema equivalence and safe inserts that omit visibility.

Backend CI migrates the previous release into a disposable database, verifies
that adopting the baseline performs no schema or application-data writes, and
compares its columns, defaults, constraints and indexes with a fresh installation.
The normal backend and integration suites also run against the new baseline.
