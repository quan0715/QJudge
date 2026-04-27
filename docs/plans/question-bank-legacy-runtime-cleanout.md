# Question Bank Legacy Runtime Cleanout

## Goal

Remove the active `Question` / `QuestionCodingExt` adapter path from question-bank runtime code, then drop the legacy schema only after production data is clear.

## Current Blockers

- `QuestionBankMembership.legacy_question` is still read by list/detail serializers.
- `QuestionCodingExt` still supplies coding test-case and language payloads.
- `ContestQuestionBinding.legacy_exam_question` still links exam imports back to legacy exam rows.
- Some memberships can exist without a canonical `QuestionAsset.latest_version`.

## Phase 1: Audit Gate

Add and run the read-only audit command:

```bash
python manage.py audit_question_bank_legacy --json
```

The command fails if any blocker rows remain:

- `legacy_questions`
- `legacy_coding_ext`
- `memberships_with_legacy_question`
- `contest_bindings_with_legacy_exam_question`
- `memberships_without_asset`
- `memberships_without_latest_version`

Production cleanup should start with this command. Dev data does not need preservation; it can be reset or migrated opportunistically.

## Phase 2: Canonical Read Path

Move question-bank list/detail projection to `QuestionBankMembership` + `QuestionAsset` + `QuestionVersion`.

- Stop selecting `legacy_question` and `legacy_question__coding_ext` in runtime read models.
- Rebuild `BankQuestionReadRow` fields from `question_asset.latest_version` and `QuestionAsset.payload`.
- Keep API response shape stable while changing the source model.
- Add regression coverage for coding, exam, duplicated/imported, and membership-detail responses.

Exit condition: API tests pass without any runtime read dependency on `legacy_question`.

## Phase 3: Canonical Write Path

Stop creating or mutating `Question` and `QuestionCodingExt` during question-bank writes.

- Update create/update/import workflows to write `QuestionAsset`, `QuestionVersion`, and `QuestionBankMembership` only.
- Store coding-specific payload in canonical asset/version payloads.
- Remove backfill-on-read behavior after write paths are canonical.

Exit condition: new question-bank operations produce no `Question` or `QuestionCodingExt` rows.

## Phase 4: Bridge Removal

Once production audit returns `PASS`, remove bridge fields and models.

- Remove `QuestionBankMembership.legacy_question`.
- Remove `ContestQuestionBinding.legacy_exam_question` after exam binding reads are canonical.
- Remove `QuestionCodingExt`.
- Remove `Question`.
- Delete legacy-only helper functions and tests.

Exit condition: migrations apply cleanly and the audit command is no longer needed in normal operation.

## Verification

- Run focused question-bank API tests.
- Run the audit command against production before schema-drop migration.
- Regenerate OpenAPI schema if response serializers or routes change.
- Confirm frontend question-bank flows still receive the same response contract.
