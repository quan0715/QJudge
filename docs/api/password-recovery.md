# Password recovery and email deployment

This feature depends on the users API contract in #204. It is disabled by default. The login page shows “Forgot password” only when `/api/v1/auth/providers` advertises `password_reset_enabled: true`.

## API

- `POST /api/v1/auth/password/reset-requests` accepts `{"identifier":"email or username"}`. Every valid identifier receives HTTP 202, `{"data":null,"meta":{}}`, including unknown, inactive, and SSO-only accounts. Each enabled request enqueues the same worker job before any account lookup. Broker failures return a generic 503. Mail-provider failures are audited without leaking message contents.
- `POST /api/v1/auth/password/resets/{token}` accepts `{"password":"...","password_confirm":"..."}`. A successful reset returns HTTP 200 with `data:null`, clears auth cookies, and blacklists all outstanding refresh tokens. Existing access tokens expire at their configured short lifetime; password recovery does not mutate active exams or external OAuth grants. Django sessions are invalidated by the changed password hash.
- Unknown, expired, consumed, superseded, and malformed secrets return `invalid_reset_token`. Password confirmation/policy failures are structured field errors and do not consume a valid token.

Tokens contain 256 bits of randomness, last 15 minutes, and are stored only as SHA-256 digests. Issuance and redemption lock the same user row, so concurrent requests cannot redeem twice. A newer request invalidates older links. Request limits are 10 per client IP per 15-minute window and 3 per normalized identifier per hour; redemption is limited to 10 per IP per 15 minutes. Counters use atomic cache add/increment. Identifier keys are HMAC digests. Keep the backend behind the shipped ingress, which replaces untrusted forwarded IP headers.

Links use `/reset-password#token=...` so the secret is absent from the initial page request and referrer. The shipped nginx reset API location suppresses raw token URI logs; Django request logs redact it. If adding another reverse proxy or request tracing service, redact `/api/v1/auth/password/resets/*` there too. Never log request bodies for these endpoints.

## Production configuration

Use a dedicated sender on a verified QJudge domain. For this installation the intended sender is **QJudge <noreply@q-judge.com>**. A sender address does not itself provide a mail service: first register and verify the domain with the chosen transactional email provider, add its DNS verification/DKIM/SPF records, and provision SMTP credentials. Keep existing domain mail records intact.

Set these keys in the deployment secret/environment file (never commit credentials):

```dotenv
PASSWORD_RESET_ENABLED=true
EMAIL_HOST=<provider SMTP hostname>
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=10
EMAIL_HOST_USER=<provider SMTP username>
EMAIL_HOST_PASSWORD=<provider SMTP credential>
DEFAULT_FROM_EMAIL=QJudge <noreply@q-judge.com>
```

For providers requiring port 465, set `EMAIL_USE_TLS=false` and `EMAIL_USE_SSL=true`. Never enable both modes. The deployment CLI requires a host and explicit sender when recovery is enabled, validates port/timeout/TLS values, and treats the SMTP password as a secret. `QJUDGE_PUBLIC_ORIGIN` determines the frontend link origin.

Run `deploy/qjudge check`, then follow the ordinary reviewed release/deployment process. Apply migration `users.0003_password_reset_token` and restart both backend and the existing Django Celery worker (the `default` queue). The worker and backend receive the same mail settings. Validate delivery using an explicitly approved test recipient before enabling the production UI. Creating a PR does not configure DNS, create a provider account, or authorize a deployment.

Development uses Django's console email backend; tests use the in-memory backend. Enable `PASSWORD_RESET_ENABLED=true` in the development environment and run the normal Celery worker. No provider credentials or real emails are needed for tests.

To disable recovery, set `PASSWORD_RESET_ENABLED=false` and restart backend/worker. The additive token table can remain during an application rollback. Password changes already completed by users must not be reversed.


### Example: Resend SMTP

Resend is one compatible provider; selecting it does not change the application code. Its [official SMTP settings](https://resend.com/docs/send-with-smtp) are `EMAIL_HOST=smtp.resend.com`, `EMAIL_PORT=587`, `EMAIL_USE_TLS=true`, `EMAIL_USE_SSL=false`, `EMAIL_HOST_USER=resend`, and an API key as `EMAIL_HOST_PASSWORD`. Set the API key through the deployment secret file, not a chat message or committed example.

Verify the sending domain first using the provider's [domain setup](https://resend.com/docs/dashboard/domains/introduction). Configure the actual records provided by its dashboard rather than copying example DNS values. Keep click tracking disabled for password-reset mail. These instructions do not imply a provider account or DNS records have been created.
