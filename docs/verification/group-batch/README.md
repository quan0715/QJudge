# Group-aware batch grading

Batch grading uses one unit per question group and keeps each child's score. A unit carries the complete grading prompts, all sibling question definitions, and each target student's original sibling answers. Already graded siblings are read-only context; other students' answers cannot be substituted.

One versioned rubric covers the unit. The version derives from question definitions and teacher instructions, not students or existing scores. The finalizer validates the complete unit's rubric and per-criterion results before writing any child scores. Missing or invalid results remain pending. Accepted rubrics are worker-owned and immutable; resuming uses the accepted version. Regrading a child includes its group while preserving manually changed scores.

The baseline SOP uses question and teacher requirements as the authority. It cannot establish the semantic correctness of an AI rubric or guarantee a particular score. Individual scoring disagreements belong to teacher review unless caused by the baseline instructions or a software/context defect.

## Validation

- Frontend behavior covers complete groups across batch boundaries, same-student sibling context, child-only retries, stable rubric versions, manual-score protection, and shared-rubric file viewing.
- AI tests cover complete-unit validation, missing child results, score arithmetic, source provenance, stale context/version, read-only answer IDs, and worker-owned rubric immutability.
- Private dev/staging fixtures use formal source questions and eight simulated students: correct, incorrect, partial, missing shared requirement, prohibited operation, and equivalent solution cases. They are not teacher-approved answer keys or point allocations.
- Formal exam text, student answer fixtures, and detailed screenshots remain outside this public repository. Public screenshots show the grading matrix only.

Live verification status and limitations are recorded in the PR and the existing Notion task. The worker renews its short-lived delegated lease through the existing token exchange while a run is active, so artifact-only work can outlast one token. Revoked credentials still pause writeback; token lifetimes and authorization checks are unchanged. A completed AI run alone is not proof of saved grades.
