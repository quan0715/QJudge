# Usage Accounting Boundary

QJudge currently records raw input and output token counts. It has no active model-pricing or credit-conversion registry.

- Do not add pricing fields to `MODEL_INFO`.
- Do not recreate the removed Django pricing or credit tables during a model change.
- Do not treat historical migrations as the current runtime contract.

If pricing is introduced again, define its owner, units, cache-token handling, rounding, and migration policy separately. Provider prices are time-sensitive and must be verified from the provider before use.
