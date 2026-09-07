# Resident Integrity in local dev

This is the bounded dev readiness slice. It does not complete Task 9 teacher
presentation or the full Task 10 browser/fault/load suite. Main settings still
default to `legacy`; only dev backend and reconciler default to `resident`.
Existing legacy Runs retain their owner. The reconciler also enforces expired
exam deadlines, so back up the dev DB before activation. It may submit historical
in-progress test participants immediately.

## Credentials and storage

Canonical host files are under `secrets/integrity`. Backend and reconciler read
them at `/run-secrets/integrity/`. The controller keeps its existing individual
`controller-token` mount at `/run-secrets/controller-token`.

`bootstrap_integrity_secrets.py` preserves the bytes, owner and permissions of
the existing Ed25519 PEM private key (`integrity-worker-signing-key`) and
`controller-token`. It rejects nonregular/symlink files, invalid keys/tokens and
any other-user permission bits on private/token files, without repairing them.
Tokens must be at least 32 bytes, ASCII, with no whitespace. Resolve bad existing
material deliberately; do not delete or regenerate the legacy signing key.

The bootstrap derives `backend-public-key` as base64 of the raw 32-byte Ed25519
public key, matching the reviewed loader. Existing base64 raw/DER public keys
must decode to the same key. Plain PEM public files are not accepted. The
separate `resident-service-token` must differ from the controller token.
`--resident-gid 10001` grants just these two resident files mode `0640` and group
10001, preserving their owners. Resident UID/GID 10001 mounts only these files,
never the private key or the whole secrets directory. No values are printed.

The named `integrity_resident_data` volume is retained across container
recreation. Its init service changes only `/run-data` itself to owner 10001:10001
and mode 0700; it never recursively changes host files or existing run contents.
An existing volume with incorrectly owned child files needs explicit diagnosis.
The runtime has one Uvicorn worker, read-only root filesystem, writable `/tmp`,
no published port and no Docker socket. Pool/budget defaults come from the
resident settings implementation; no unused environment tuning knobs are set.

## Activation from the original checkout

The controller performs source integration, DB backup and migrations first.
Run these only from `/Users/quan/online_judge`, with its existing dev environment
and correct Compose project identity. `dc` below denotes
`.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev`.

1. Integrate reviewed core plus this slice, preserving unrelated source changes.
   Before starting the continuous reconciler, apply migrations 0097 and 0098
   through the dev backend with `DB_HOST=postgres`. Verify migration state.
2. Select the verified image with
   `export INTEGRITY_RESIDENT_IMAGE=oj-integrity-resident:dev-ready-124814b1`.
   Alternatively build `integrity-resident` through the wrapper using a new tag.
   Keep the variable in every subsequent Compose operation. Set
   `INTEGRITY_EXECUTION_BACKEND=resident` explicitly if an older environment has
   a legacy override.
3. Run `dc run --rm --no-deps integrity-bootstrap` before creating resident
   containers. This explicit first step prevents missing individual bind sources
   from becoming Docker-created directories. Then run
   `dc run --rm --no-deps integrity-resident-data-init`.
4. Recreate the backend from the integrated source with
   `dc up -d --no-deps --no-build backend`, then start
   `dc up -d --no-deps --no-build integrity-resident`. Inspect its logs and
   `/ready` before `dc up -d --no-deps --no-build integrity-reconciler`.
   This sequence uses existing dev DB/Redis/AI services and does not restart them.
5. `dc ps` and `dc logs --tail 80 integrity-resident integrity-reconciler` show
   runtime state. Reconciler uses direct `DB_HOST=postgres` because session
   advisory ownership is incompatible with transaction-pooled PgBouncer.

Readiness is `/ready`; `/live` is liveness only. Both are internal on port 8011:

```sh
dc exec -T integrity-resident python -c "from urllib.request import urlopen; print(urlopen('http://localhost:8011/ready').read().decode()); print(urlopen('http://localhost:8011/live').read().decode())"
```

A ready response alone does not prove signed Run synchronization or callback
access. Inspect `recovery_error` too, then verify the resident-to-backend token
and signed descriptor response without exposing any credentials:

```sh
dc exec -T integrity-resident python -c "from uuid import UUID; from integrity_service.resident.settings import ResidentSettings; from integrity_service.worker.backend_client import BackendClient; s=ResidentSettings.from_environment(); c=BackendClient(base_url=s.backend_url, run_id=UUID(int=0), token=s.read_credential(), resident_mode=True, retry_attempts=1); print({'verified_descriptors': len(c.fetch_resident_descriptors(s.read_public_key()))}); c.close()"
```

For manual smoke, use dedicated dev teacher/student accounts and a newly named
`Resident dev smoke YYYYMMDD-HHMM` published exam with monitoring enabled,
starting now and ending in at least 30 minutes. Add the test student and a
question through normal administration. Do not reuse a legacy-owned exam.
Within a reconciler interval, verify its new Run has `execution_backend=resident`,
an active/prepared session, healthy state and a recent heartbeat. This proves
the backend signing path and resident Run synchronization. Have the student
enter, answer, and submit normally; verify accepted submission independently of
monitoring state. Task 9 UI and comprehensive fault cases remain pending.

To stop the new scheduler/runtime, `dc stop integrity-reconciler integrity-resident`.
Do not use `down -v`, delete the volume, reverse migrations, or change existing
Run owners. A legacy environment override affects new admission only; resident
sessions still need their resident service to finish correctly.

## Reproducible contract checks

Render with dummy values only; do not save or print a resolved real environment:

```sh
env -i PATH="$PATH" HOME="$HOME" DOCKER_SOCKET_UID=501 \
  OBJECT_STORAGE_ENDPOINT_URL=http://dummy.invalid \
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://dummy.invalid \
  OBJECT_STORAGE_ACCESS_KEY=dummy OBJECT_STORAGE_SECRET_KEY=dummy \
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev \
  --env-file /dev/null config --format json > /tmp/qjudge-resident-dev-dummy.json
COMPOSE_PROJECT_NAME=qjudge-resident-test \
  .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test run --rm --no-deps \
  -v "$PWD:/workspace:ro" -v /tmp/qjudge-resident-dev-dummy.json:/dev-compose.json:ro \
  -e INTEGRITY_DEV_COMPOSE_JSON=/dev-compose.json -w /workspace/integrity-service \
  integrity-unit-test python -m pytest -o addopts='' -q -p no:cacheprovider \
  tests/test_dev_secret_bootstrap.py tests/test_dev_resident_compose.py
```

The test image has no Docker socket. The credential tests execute the real
bootstrap and a UID/GID 10001 child reading real files and writing its data
directory. Actual Docker Desktop bind permissions and live signed callbacks
must still be checked after activation.
