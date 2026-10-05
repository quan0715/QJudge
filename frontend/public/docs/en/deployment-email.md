# Configure email delivery

`EMAIL_MODE` controls the platform's application mail capability. An unset value or `disabled` keeps it off; `external` uses an SMTP service you provide. Password recovery also requires `AUTH_EMAIL_PASSWORD_ENABLED` before the login page offers “Forgot password”. Publishing an exam or its results currently sends no email notification.

This version supports `disabled` and `external`. It does not yet provide `bundled` or `deploy/qjudge addon postal`. An independently deployed Postal server can provide external SMTP after its service, sender domain and SMTP credentials are configured.

## 1. Prepare SMTP and a sender

Obtain the SMTP hostname reachable from backend and celery, port, TLS mode, and credentials. Container `localhost` refers to that container itself. A restricted internal relay that needs no authentication can leave both credential fields empty.

Use a sender authorized by the SMTP service. Follow that service's domain verification, DKIM and SPF instructions; operating a server that delivers directly also requires checking its outbound IP and PTR. Preserve existing domain mail records.

The deployment operator enters credentials into `deploy/.env` on the host. Do not place real credentials in chat, command-line `--set` arguments, Git or documentation.

## 2. Apply SMTP settings while mail stays disabled

Edit `deploy/.env` from the repository root. Replace these example values:

```dotenv
EMAIL_MODE=disabled
EMAIL_HOST=smtp.example.edu
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=10
EMAIL_HOST_USER=your-smtp-user
EMAIL_HOST_PASSWORD=replace-with-your-smtp-credential
DEFAULT_FROM_EMAIL=QJudge <noreply@mail.example.edu>
```

| Transport | Settings |
| --- | --- |
| STARTTLS (usually 587) | `EMAIL_USE_TLS=true`, `EMAIL_USE_SSL=false` |
| Implicit TLS (usually 465) | `EMAIL_USE_TLS=false`, `EMAIL_USE_SSL=true` |
| Restricted internal relay without TLS | Both `false`, only when its network isolation and service requirements have been confirmed |

Never enable both TLS modes. Provide both credential fields or leave both empty. `EMAIL_TIMEOUT` accepts 1–120 seconds. `QJUDGE_PUBLIC_ORIGIN` determines the password-reset link origin.

`deploy/qjudge check` validates configuration; `external` additionally requires explicit `EMAIL_HOST` and `DEFAULT_FROM_EMAIL`. Passing validation does not prove SMTP delivery.

After the [initial deployment](deployment.md), apply settings using the currently deployed version. These commands assume that version supports `EMAIL_MODE`; when upgrading an older installation, use the new version ref containing this feature instead:

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

For the first installation, when `deploy/.version` does not exist yet, follow the deployment guide using the intended version, for example `deploy/qjudge upgrade origin/main`. Editing `.env` or running `restart` alone does not change an existing container's environment. `upgrade` recreates affected services; schedule this work outside active exams.

## 3. Send one test message from celery

From the same repository root, define a Compose command using the deployed version and project:

```bash
qjudge_project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' deploy/.env)"
qjudge_image_version="sha-$(sed -n 's/^current=//p' deploy/.version | cut -c1-12)"
qjudge_dc() {
  QJUDGE_VERSION="$qjudge_image_version" docker compose \
    --project-name "${qjudge_project:-qjudge}" \
    --project-directory deploy --env-file deploy/.env \
    -f deploy/compose.yml -f deploy/compose.build.yml "$@"
}
```

Replace the recipient below with an inbox whose operator has agreed to receive the test, then run it once:

```bash
qjudge_dc exec -T celery python manage.py sendtestemail your-test-inbox@example.edu
```

`sendtestemail` uses SMTP settings directly and remains available with `EMAIL_MODE=disabled`. It sends real mail; the recipient need not have a platform account. Success means SMTP accepted the message. Confirm the inbox, spam folder and service delivery records. If the outcome is unknown, inspect those records before retrying.

## 4. Enable application mail

After confirming receipt, change `deploy/.env` to:

```dotenv
EMAIL_MODE=external
```

Validate and apply the current version again:

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

Backend and celery receive the same mail settings. Use a dedicated test account to verify password recovery, worker delivery and redemption. Accounts using only third-party login cannot reset a local password. A successful SMTP probe alone does not verify the worker flow.

`EMAIL_MODE` is shared by application mail features. Future notifications will use this capability check and document their individual notification rules separately.

## Disable mail and troubleshoot

Set `EMAIL_MODE=disabled`, then run the same `check` and `upgrade` commands to update backend and celery. Mail already handed to SMTP cannot be recalled; an executing job may already have passed the capability check. Keeping SMTP settings does not itself send mail. Manual `sendtestemail` remains available.

- Missing “Forgot password”: check mail mode, `AUTH_EMAIL_PASSWORD_ENABLED`, and whether containers were recreated. `/api/v1/auth/providers` exposes their combined result as `password_reset_enabled`.
- SMTP probe failure: check the reported error against hostname, container connectivity, port, TLS, credentials and sender authorization.
- Probe succeeded but recovery mail is absent: confirm celery consumes the `default` queue, inspect `qjudge_dc logs --tail 100 celery` and SMTP delivery records. Worker failures appear as `password_reset_delivery_failed` or `password_reset_job_failed`; user acknowledgements stay generic.

### Migrate the old setting

`PASSWORD_RESET_ENABLED` has been removed. `deploy/qjudge check` reports how to replace it. Delete the old line and start with `EMAIL_MODE=disabled`; switch to `external` after SMTP verification. The old value `true` does not automatically enable mail. Rolling back to a version using the old switch requires restoring its configuration and redeploying.
