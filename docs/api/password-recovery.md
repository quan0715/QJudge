# Password recovery and email deployment

This feature depends on the users API contract in #204. It is disabled by default. The login page shows “Forgot password” only when `/api/v1/auth/providers` advertises `password_reset_enabled: true`.

## API

- `POST /api/v1/auth/password/reset-requests` accepts `{"identifier":"email or username"}`. Every valid identifier receives HTTP 202, `{"data":null,"meta":{}}`, including unknown, inactive, and SSO-only accounts. Each enabled request enqueues the same worker job before any account lookup. Broker failures return a generic 503. Mail-provider failures are audited without leaking message contents.
- `POST /api/v1/auth/password/resets` accepts `{"uid":"...","token":"...","password":"...","password_confirm":"..."}`. A successful reset returns HTTP 200 with `data:null`, clears auth cookies, and blacklists all outstanding refresh tokens. Existing access tokens expire at their configured lifetime; password recovery does not mutate active exams or external OAuth grants. Django sessions are invalidated by the changed password hash.
- Unknown, expired, used, and malformed links return `invalid_reset_token`. Password confirmation/policy failures are structured field errors and do not consume a valid token.

Recovery resolves email and username with the same exact comparisons as password login. An identifier matching multiple accounts is acknowledged without choosing a recipient. Eligibility requires an active account with an existing, usable, supported local password hash; linking OAuth does not remove that capability. Recovery cannot create a local credential for a pure OAuth account with an empty, unusable or unsupported hash.

Links use Django's `default_token_generator`: an HMAC over the user id, current password hash, last login and issue time, signed with `SECRET_KEY`. Nothing is stored. A link expires after `PASSWORD_RESET_TIMEOUT` (15 minutes); changing the password invalidates it and every other outstanding link. Requesting a new link does not invalidate an older one before it expires. Redemption and password login use the same user row lock, and the token is checked against the locked row. Password login reads and checks the password under that lock and commits token issuance and its login record before releasing it; reset therefore revokes a concurrent old-password login's refresh token, or the waiting login checks the new hash and fails. Concurrent resets cannot redeem twice. Request limits are 10 per client IP per 15-minute window and 3 per normalized identifier per hour; redemption independently allows 10 per IP per 15 minutes. Counters use atomic cache add/increment. Identifier keys are HMAC digests. Keep the backend behind the shipped ingress, which replaces untrusted forwarded IP headers.

Links use `/reset-password#uid=...&token=...` so the secret is absent from the initial page request and referrer, and the frontend sends both values in the request body, so URL access logs never contain them. Never log request bodies for these endpoints.

## Platform mail capability and deployment

`EMAIL_MODE` is the shared platform mail switch: unset or `disabled` keeps
application mail off; `external` enables configured SMTP. Invalid modes fail
settings startup and deployment validation. `apps.core.services.mail.mail_enabled()`
uses the supported mode explicitly. Password recovery additionally requires
`AUTH_EMAIL_PASSWORD_ENABLED`; `/api/v1/auth/providers.password_reset_enabled`
is derived from both capabilities, preserving the frontend API contract.

`PASSWORD_RESET_ENABLED` has been removed. Delete it from the deployment env
and choose `EMAIL_MODE=disabled` or `external`; the CLI returns an actionable
migration error rather than silently mapping the old setting.

The public operator guides are [Traditional Chinese](../../frontend/public/docs/zh-TW/deployment-email.md)
and [English](../../frontend/public/docs/en/deployment-email.md), served at
`/docs/deployment-email`. They cover SMTP and sender preparation, operator-only
credential entry, configuration with mail disabled, a manual celery
`sendtestemail` probe, enablement, disabling and troubleshooting. The probe
bypasses the application mail gate deliberately. Both backend and celery receive
`EMAIL_MODE` and the same SMTP settings. Environment changes require container
recreation, not a simple restart.

Development uses Django's console email backend; unit tests use the in-memory
backend. Set `EMAIL_MODE=external` to exercise recovery in development without
provider credentials. CI E2E selects external mode and uses Mailpit rather than
an outbound provider. No mail is sent automatically by setting SMTP values while
mode is disabled.

Delivery failures are audited as `password_reset_job_failed`; throttling
appears as `password_reset_throttled`. Completed password changes must not be
reversed.

Exam publication and results notifications require a separate specification.
Postal addon integration and its `bundled` mode are outside this change. An
independently hosted Postal server can be configured as external SMTP; direct
Postal delivery does not verify QJudge SMTP authentication or celery delivery.

## Browser verification in CI

Run the **E2E** workflow on the recovery branch with `group=auth`. It runs
`frontend/tests/e2e/password-recovery.e2e.spec.ts` alongside the existing auth
and pending-action checks. The fresh-install overlay uses `config.settings.e2e`
and a pinned Mailpit SMTP inbox. The real backend enqueues the real Celery job;
Playwright retrieves the delivered message from the loopback-only inbox API and
follows its link. No production SMTP credentials or external recipients are used.

The test verifies generic request acknowledgements, mismatched and weak password
rejection, successful reset, cleared browser cookies, old-password rejection,
new-password login and refusal to reuse a used link while signed in. Unit
tests additionally cover expiry, links from other accounts, concurrent redemption,
refresh token revocation and limits. Unit tests retain Django's in-memory mail backend.

The CI inbox API defaults to `http://127.0.0.1:8025`; an independently prepared
test stack may set `E2E_MAILPIT_URL`. Never expose this inbox or use the E2E
settings/Compose overlay for a production installation.
