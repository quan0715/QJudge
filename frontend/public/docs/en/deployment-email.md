# Configure email delivery

`EMAIL_MODE` is the platform's application mail switch. QJudge always sends through the standard `EMAIL_*` SMTP settings; the mode only decides where that SMTP service comes from:

| Mode | SMTP service | Responsibility |
| --- | --- | --- |
| `disabled` (default when unset) | None; application mail is off | — |
| `external` | An SMTP service you already have | The provider handles queues, delivery and reputation |
| `bundled` | A self-hosted Postal server managed with `deploy/qjudge addon postal` | The operator maintains delivery, data, DNS and IP reputation |

Password recovery also requires `AUTH_EMAIL_PASSWORD_ENABLED` before the login page offers “Forgot password”. Publishing an exam or its results currently sends no email notification. All settings live in `deploy/.env`.

Steps 1–4 apply to both `external` and `bundled`. For `bundled`, first set up Postal as described in the self-hosted Postal section below, then use it as the SMTP service in these steps.

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

`deploy/qjudge check` validates configuration; `external` and `bundled` additionally require explicit `EMAIL_HOST` and `DEFAULT_FROM_EMAIL`. Passing validation does not prove SMTP delivery.

After the [initial deployment](deployment.md), apply settings using the currently deployed version. These commands assume that version supports `EMAIL_MODE`; when upgrading an older installation, use the new version ref containing this feature instead:

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

For the first installation, when `deploy/.version` does not exist yet, follow the deployment guide using the intended version, for example `deploy/qjudge upgrade origin/main`. Editing `.env` or running `restart` alone does not change an existing container's environment. `upgrade` recreates affected services; schedule this work outside active exams.

## 3. Send one test message from celery

From the same repository root, define a Compose command using the deployed version and project:

```bash
qjudge_image_version="sha-$(sed -n 's/^current=//p' deploy/.version | cut -c1-12)"
qjudge_dc() {
  QJUDGE_VERSION="$qjudge_image_version" docker compose \
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

After confirming receipt, change `deploy/.env` to `external`, or `bundled` when the SMTP service is the Postal addon:

```dotenv
EMAIL_MODE=external
```

Validate and apply the current version again:

```bash
deploy/qjudge check
deploy/qjudge upgrade "$(sed -n 's/^current=//p' deploy/.version)"
```

Backend and celery receive the same mail settings. Use a dedicated test account to verify password recovery, worker delivery and redemption. Accounts using only third-party login without a usable local password cannot recover one; accounts with an existing local password remain eligible after linking OAuth. Match the identifier's case as you would for password login. A successful SMTP probe alone does not verify the worker flow.

A password reset signs the browser that completed it out, and other devices can no longer renew their sessions. Sessions already open on other devices stay valid until their current access expires (up to 8 hours), so a user who suspects a stolen session should also expect up to 8 hours before it ends.

`EMAIL_MODE` is shared by application mail features. Future notifications will use this capability check and document their individual notification rules separately.

## Disable mail and troubleshoot

Set `EMAIL_MODE=disabled`, then run the same `check` and `upgrade` commands to update backend and celery. Mail already handed to SMTP cannot be recalled; an executing job may already have passed the capability check. Keeping SMTP settings does not itself send mail. Manual `sendtestemail` remains available.

- Missing “Forgot password”: check mail mode, `AUTH_EMAIL_PASSWORD_ENABLED`, and whether containers were recreated. `/api/v1/auth/providers` exposes their combined result as `password_reset_enabled`.
- SMTP probe failure: check the reported error against hostname, container connectivity, port, TLS, credentials and sender authorization.
- Probe succeeded but recovery mail is absent: confirm celery consumes the `default` queue, inspect `qjudge_dc logs --tail 100 celery` and SMTP delivery records. Worker failures appear as `password_reset_job_failed`; user acknowledgements stay generic.

### Migrate the old setting

`PASSWORD_RESET_ENABLED` has been removed. `deploy/qjudge check` reports how to replace it. Delete the old line and start with `EMAIL_MODE=disabled`; switch to `external` or `bundled` after SMTP verification. The old value `true` does not automatically enable mail. Rolling back to a version using the old switch requires restoring its configuration and redeploying.

## Self-hosted Postal (`EMAIL_MODE=bundled`)

The Postal addon runs as its own Compose project next to QJudge. Ordinary QJudge `init`/`upgrade` never starts Postal or changes SMTP settings; only the explicit `deploy/qjudge addon postal check|init|up|status|backup|upgrade` commands act on it, and only when `EMAIL_MODE=bundled`.

### Prerequisites

The [official requirements](https://docs.postalserver.io/getting-started/prerequisites/) recommend a dedicated host with at least 2 CPUs, 4GB RAM and 25GB disk. This addon pins Postal 3.3.7 (linux/amd64) and MariaDB 10.11.16 by digest. Use an amd64 production host. It does not upgrade MariaDB automatically during Postal upgrades.

Before enabling delivery, the operator must arrange:

- A stable public IP and **outbound TCP 25** permitted by the hosting provider. Submitting to Postal on port 587 does not replace outbound port 25 delivery to recipient servers.
- Matching forward DNS, SMTP hostname and PTR. PTR is normally controlled by the IP/VPS provider, not the registrar of your Cloudflare domain.
- DNS-only SMTP A/AAAA records; ordinary Cloudflare proxy/HTTP Tunnel does not carry SMTP. Do not publish AAAA until IPv6 is configured end to end.
- SPF, DKIM, return-path MX and DMARC based on Postal's actual records. Prefer a dedicated sending subdomain and preserve existing inbound-mail MX records.
- Inbound TCP 25 for public bounce handling. Default bindings are loopback only; exposing ports and managing firewalls are explicit operator actions.
- HTTPS for the admin interface and a separately supplied, trusted STARTTLS certificate/key matching the SMTP hostname.

See [DNS configuration](https://docs.postalserver.io/getting-started/dns-configuration/) and [SMTP TLS](https://docs.postalserver.io/features/smtp-tls/). The tooling does not create DNS, firewall rules, certificates, accounts or SMTP credentials, and sends no test mail.

### Prepare the addon

Add the Postal settings to `deploy/.env` on the host that runs Postal. On the same host as QJudge this is QJudge's own `deploy/.env`:

```dotenv
EMAIL_MODE=bundled
POSTAL_CONFIG_DIR=/srv/postal/config
POSTAL_HOSTNAME=postal.your-domain.example
POSTAL_NETWORK_MODE=standalone
POSTAL_WEB_BIND_ADDRESS=127.0.0.1
POSTAL_WEB_PORT=5000
POSTAL_SMTP_BIND_ADDRESS=127.0.0.1
POSTAL_SMTP_PORT=25
```

On a separate Postal host, that host's `deploy/.env` needs only these keys (plus `COMPOSE_PROJECT_NAME` if you changed it); no QJudge PostgreSQL, AI, MinIO or SMTP credentials are required there. The project is `<COMPOSE_PROJECT_NAME>-postal`, by default `qjudge-postal`; changing the project name selects a different database volume, not a migration. A separate host needs the checkout's deployment tools but no running QJudge services.

The operator supplies the following files in `POSTAL_CONFIG_DIR`:

| File | Purpose |
| --- | --- |
| `postal.yml` | Copy `deploy/addons/postal/postal.yml.example`; replace hostnames, database passwords, Rails secret and DNS settings |
| `db-password` | Single-line MariaDB root password, at least 16 characters; must match both YAML database passwords, without leading/trailing whitespace |
| `signing.key` | Operator-created Postal RSA private key, at least 2048 bits, following the [official installation](https://docs.postalserver.io/getting-started/installation/) |
| `smtp.cert`, `smtp.key` | Certificate chain and private key matching `POSTAL_HOSTNAME` |

Keep the directory 0750 and files 0640 or stricter; symlinks are rejected. Postal's image runs as UID 999: both that user and the operator invoking the CLI must have read access. Use sudo where needed. A UID/GID 999 owner is suitable after verifying the image's group configuration. Never commit these files or publish their contents. Renewed certificates must be copied safely into the directory, then run addon `up` to recreate services.

Both database groups point to the private `postal-db:3306`, with a dedicated root account because Postal creates additional databases per mail server. MariaDB publishes no host port and never joins the QJudge network. The SMTP message limit must be 1–25MB to fit the configured 256MB redo log.

```bash
deploy/qjudge addon postal check
deploy/qjudge addon postal init
```

`check` runs a temporary network-disabled container to validate YAML, matching passwords, private keys and certificate identity/expiry. It may download the pinned image; it never accesses a database or sends mail. Certificate trust-chain verification remains an operator check. `init` starts only Postal MariaDB and initializes **Postal's own schema**. It neither runs QJudge migrations nor creates/replaces secrets.

The operator can then create the first admin interactively:

```bash
docker compose --project-name qjudge-postal --project-directory deploy \
  -f deploy/addons/postal/compose.yml \
  run --rm --no-deps runner postal make-user

deploy/qjudge addon postal up
deploy/qjudge addon postal status
```

Configure the admin HTTPS proxy to `127.0.0.1:5000`. In Postal, create the organization, mail server, sender domain and SMTP credential. Postal's own admin notifications use its YAML `smtp` group; configure those separately following the official documentation.

### Same host or separate host

On the same host, set `POSTAL_NETWORK_MODE=qjudge` and run addon `up`. Only SMTP joins the existing `qjudge` network, with `POSTAL_HOSTNAME` as its alias. In the same `deploy/.env`, set `EMAIL_HOST` to that name, port 25, keep STARTTLS enabled, and add the Postal SMTP credential and sender. Never use `127.0.0.1` inside QJudge's backend container to refer to Postal. Backend and celery pick up `EMAIL_MODE=bundled` only when `deploy/qjudge upgrade` recreates them, so finish Postal setup and the step 3 test message before that upgrade.

On a separate host, that host uses `EMAIL_MODE=bundled` while QJudge's host uses `EMAIL_MODE=external` pointing at Postal. Keep `standalone` and explicitly bind SMTP to the appropriate host IPv4 (for example, `0.0.0.0` when accepting public bounces), then configure firewall/DNS. QJudge uses the reachable SMTP hostname, port, TLS settings, credentials and sender address; no Postal API key is needed.

To move later, restore Postal's complete database/configuration onto the new host and validate delivery/bounces before changing QJudge's standard SMTP settings or DNS. Remove the old same-host SMTP network alias/container before switching, otherwise Docker DNS may keep routing to the old instance. Setting QJudge to `EMAIL_MODE=external` does not stop an old Postal installation.

### Health is not delivery

`up` waits for MariaDB, web, SMTP and worker health. `status` fails if any of these are absent or unhealthy. This proves process readiness only, not TLS trust, DNS, PTR, outbound port 25, recipient acceptance or inbox placement.

Before production, separately authorize and verify connectivity from QJudge, TLS chain, queue/delivery logs, a designated test recipient, SPF/DKIM/DMARC results and bounce handling. These external acceptance tests are not run automatically.

### Backup and upgrade

```bash
deploy/qjudge addon postal backup
# Optional backup root; a fresh private subdirectory is always created:
# deploy/qjudge addon postal backup --backup-dir /srv/backups/postal

deploy/qjudge addon postal upgrade
```

Backup explicitly stops all web/SMTP/worker containers, including containers in a restart loop, then resumes only the previously running processes on success. Clients may need to retry; schedule a maintenance window. Concurrent addon operations in the same checkout/project are rejected. Use one checkout/env for all maintenance.

Each backup contains all MariaDB databases (including per-server message databases), complete config, image records, non-secret topology settings and addon definitions. Directories are 0700, SQL/config files 0600. Backups contain message data and private keys: encrypt them, retain copies off-host and establish retention. A `.partial` file is not a completed backup. No previous backups or volumes are deleted.

An expired SMTP certificate does not prevent `backup`: it requires safely handled files, not operational SMTP. Normal `up`/certificate refresh recreates Postal writers while preserving the existing MariaDB container.

`upgrade` backs up first, pulls the Postal images pinned in Compose, migrates Postal, recreates writers and waits for health. It does not replace the running MariaDB image. Review release notes/tag/digest changes before upgrading; never follow `latest`. Plan database upgrades separately with MariaDB's compatibility guidance.

Stop, dump, copy or migration failures stop the workflow; writers may remain stopped. Preserve backups and current state and investigate locally without sharing secrets. Do not repeatedly rerun failed migrations blindly. Rolling an image back does not roll a database schema back; there is no automatic schema downgrade.

### Restore / host migration rehearsal

1. Preserve the source host/volume and isolate SMTP traffic. Confirm the backup contains `databases.sql`, `config/`, `manifest.json`, `addon/`, and no `.partial`; inspect recorded images and backup time.
2. Use a separate project/clean volume and compatible recorded MariaDB/Postal versions on an isolated host. Restore config, reset its ownership/read permissions for UID 999, and update `POSTAL_CONFIG_DIR`. Hostname and TLS must match the new topology.
3. Start only MariaDB; do not run Postal init, writers or migrations. Import with `docker compose ... exec -T postal-db sh -ec 'export MYSQL_PWD="$(cat /run/secrets/db-password)"; exec mariadb --user=root' < /private/backup/databases.sql`, replacing `...` with the restore project's env and saved Compose definitions. Keep passwords out of host command arguments.
4. Verify databases and mail-server/message data, ensure no old writer is delivering simultaneously, then start compatible Postal services. Check status, DNS, queue and separately authorized mail tests. Switch traffic only after the rehearsal succeeds; retain the old host/volume until recovery is confirmed.

Local tests verify orchestration, failure handling and configuration parsing. They do not certify live Postal startup, restoration or external delivery.
