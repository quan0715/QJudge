# Resident Integrity operations

Resident is the only monitoring runtime in dev, test and production. The
controller, per-exam worker containers, execution-backend switch and their
management endpoints are retired. No legacy service or migration backup is
required.

## What teachers and students do

Teachers enable monitoring in exam settings and set the start/end times.
The always-on reconciler prepares the session and keeps the resident service
in sync, including exams created shortly before starting. Extending an exam
updates its revision and deadline; already submitted attempts do not reopen.

Teachers review events and evidence. There are no Worker start/restart controls.
A service interruption may delay or lose monitoring records but must not block
answering, saving or submission. An archived run does not imply complete media:
inspect each event's evidence state and recorded gaps.

The browser sends scoped event batches to the checkpoint API and uploads
independent WebM evidence segments to object storage. Durable receipt, processed
decision and evidence completion are separate states. After submission, capture
stops and previously collected data may drain until the upload deadline.
Rejoining an explicitly reopened attempt uses a new attempt identity.

## Local dev update

Use the existing dev database. In the commands below, `dc` means
`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev`.

1. Apply current migrations with
   `dc exec -T -e DB_HOST=postgres backend python manage.py migrate`.
   Migration 0099 removes the retired worker fields.
2. Build the runtime: `dc build integrity-resident`.
3. For first setup, run `dc run --rm --no-deps integrity-bootstrap`, then
   `dc run --rm --no-deps integrity-resident-data-init`.
4. Recreate the runtime and reconciler:
   `dc up -d --no-deps --no-build integrity-resident integrity-reconciler`.
   Backend source reloads in dev; restart the backend if its environment changed.
5. Check `dc logs --tail 80 integrity-resident integrity-reconciler` and the
   internal readiness endpoint:

```sh
dc exec -T integrity-resident python -c "from urllib.request import urlopen; print(urlopen('http://localhost:8011/ready').read().decode())"
```

Expect `ready: true`, `protocol: resident-v1` and `recovery_error: null`.
Readiness alone is not proof that browser events reach the management page.

## Credentials, storage and lifecycle

The bootstrap uses `secrets/integrity`: the backend signing private key,
derived public key and resident service token. It creates missing credentials
and validates existing ones without printing them. Resident UID/GID 10001
receives only the public key and service token, individually mounted read-only.
The runtime has no Docker socket, no published port and one Uvicorn process.

The named `integrity_resident_data` volume contains durable receipts, journals
and decision state. Container recreation preserves it. The init service sets
ownership on the volume root, not recursively on its contents.

Finalization uses revision-checked control phases and immutable object-storage
uploads. Purge succeeds only when both object-storage data and the retired
resident run directory have been removed. Purge refuses a still-loaded run.
Do not use `down -v` as a routine service update.

The reconciler uses direct PostgreSQL rather than transaction-pooled PgBouncer
because scheduler ownership uses a session advisory lock.

## Acceptance

Use dedicated local test accounts and clearly named exams. Verify:

- Start within five minutes, enter normally, and see real browser events.
- Extend while answering: preserve the answer and update the countdown.
- Reopen explicitly: new events belong to the new attempt.
- Submit during monitoring outage: answer submission succeeds independently.
- Restore monitoring: retained events drain without duplicate penalties.
- Review media: duplicate chunks are not repeated; short-only evidence remains
  accessible rather than being silently discarded.
- Verify finalization and two concurrent exams independently.

Automated backend, browser-unit and resident-engine tests use the test Compose
environment. See the release completion plan for the current acceptance record;
do not infer end-to-end completion from a unit-suite count.
