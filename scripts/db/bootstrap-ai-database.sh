#!/usr/bin/env sh
set -eu

# Idempotently split the Django and AI application credentials.  This script is
# deliberately run by a one-shot Compose service after PostgreSQL is healthy so
# it also upgrades volumes created before the service boundary existed.

required_variables="
POSTGRES_ADMIN_USER
POSTGRES_ADMIN_PASSWORD
DB_NAME
DB_USER
DB_PASSWORD
AI_DB_NAME
AI_DB_USER
AI_DB_PASSWORD
GLITCHTIP_DB_NAME
GLITCHTIP_DB_USER
GLITCHTIP_DB_PASSWORD
"

for variable in $required_variables; do
    value="$(printenv "$variable" 2>/dev/null || true)"
    if [ -z "$value" ]; then
        echo "missing required database bootstrap variable: $variable" >&2
        exit 1
    fi
done

if [ "$POSTGRES_ADMIN_USER" = "$DB_USER" ] || \
   [ "$POSTGRES_ADMIN_USER" = "$AI_DB_USER" ] || \
   [ "$POSTGRES_ADMIN_USER" = "$GLITCHTIP_DB_USER" ] || \
   [ "$DB_USER" = "$AI_DB_USER" ] || \
   [ "$DB_USER" = "$GLITCHTIP_DB_USER" ] || \
   [ "$AI_DB_USER" = "$GLITCHTIP_DB_USER" ]; then
    echo "POSTGRES_ADMIN_USER, Django, AI, and GlitchTip role names must be distinct" >&2
    exit 1
fi
if [ "$DB_NAME" = "$AI_DB_NAME" ] || \
   [ "$DB_NAME" = "$GLITCHTIP_DB_NAME" ] || \
   [ "$AI_DB_NAME" = "$GLITCHTIP_DB_NAME" ]; then
    echo "Django, AI, and GlitchTip database names must be distinct" >&2
    exit 1
fi

# Names are interpolated only through PostgreSQL format(%I), but validating the
# public configuration surface also keeps \connect and operational tooling sane.
for variable in POSTGRES_ADMIN_USER DB_USER AI_DB_USER GLITCHTIP_DB_USER DB_NAME AI_DB_NAME GLITCHTIP_DB_NAME; do
    value="$(printenv "$variable")"
    case "$value" in
        ''|*[!A-Za-z0-9_]*|[0-9]*)
            echo "$variable must be a simple PostgreSQL identifier" >&2
            exit 1
            ;;
    esac
done

export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"
PGHOST="${POSTGRES_HOST:-postgres}"
PGPORT="${POSTGRES_PORT:-5432}"

# psql reads all secrets directly from environment variables with \getenv.  No
# password is placed in argv, interpolated by the shell, or echoed by this script.
psql \
    --host "$PGHOST" \
    --port "$PGPORT" \
    --username "$POSTGRES_ADMIN_USER" \
    --dbname postgres \
    --no-psqlrc \
    --quiet \
    --set ON_ERROR_STOP=1 <<'SQL'
\getenv admin_user POSTGRES_ADMIN_USER
\getenv db_name DB_NAME
\getenv db_user DB_USER
\getenv db_password DB_PASSWORD
\getenv ai_db_name AI_DB_NAME
\getenv ai_db_user AI_DB_USER
\getenv ai_db_password AI_DB_PASSWORD
\getenv glitchtip_db_name GLITCHTIP_DB_NAME
\getenv glitchtip_db_user GLITCHTIP_DB_USER
\getenv glitchtip_db_password GLITCHTIP_DB_PASSWORD

SELECT rolsuper AS bootstrap_is_superuser
FROM pg_roles
WHERE rolname = :'admin_user'
\gset
\if :bootstrap_is_superuser
\else
    \echo 'POSTGRES_ADMIN_USER must be an existing PostgreSQL superuser' >&2
    \quit 1
\endif

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'db_user', :'db_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')
\gexec
SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'db_user', :'db_password'
)
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'ai_db_user', :'ai_db_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'ai_db_user')
\gexec
SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'ai_db_user', :'ai_db_password'
)
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'glitchtip_db_user', :'glitchtip_db_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'glitchtip_db_user')
\gexec
SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD %L',
    :'glitchtip_db_user', :'glitchtip_db_password'
)
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'ai_db_name', :'ai_db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'ai_db_name')
\gexec
SELECT format(
    'CREATE DATABASE %I OWNER %I', :'glitchtip_db_name', :'glitchtip_db_user'
)
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'glitchtip_db_name')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'db_name', :'ai_db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'db_name', :'glitchtip_db_user')
\gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'db_name', :'db_user')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'ai_db_name', :'ai_db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'ai_db_name')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'ai_db_name', :'db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'ai_db_name', :'glitchtip_db_user')
\gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'ai_db_name', :'ai_db_user')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'glitchtip_db_name', :'glitchtip_db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'glitchtip_db_name')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'glitchtip_db_name', :'db_user')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM %I', :'glitchtip_db_name', :'ai_db_user')
\gexec
SELECT format(
    'GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I',
    :'glitchtip_db_name', :'glitchtip_db_user'
)
\gexec

\connect :db_name
SELECT format('ALTER SCHEMA %I OWNER TO %I', nspname, :'db_user')
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
\gexec
SELECT format(
    'ALTER %s %I.%I OWNER TO %I',
    CASE relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
    END,
    nspname,
    relname,
    :'db_user'
)
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  AND nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
  AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = pg_class.oid
        AND dependency.deptype IN ('a', 'i')
  )
\gexec

\connect :ai_db_name
SELECT format('ALTER SCHEMA %I OWNER TO %I', nspname, :'ai_db_user')
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
\gexec
SELECT format(
    'ALTER %s %I.%I OWNER TO %I',
    CASE relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
    END,
    nspname,
    relname,
    :'ai_db_user'
)
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  AND nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
  AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = pg_class.oid
        AND dependency.deptype IN ('a', 'i')
  )
\gexec

\connect :glitchtip_db_name
SELECT format('ALTER SCHEMA %I OWNER TO %I', nspname, :'glitchtip_db_user')
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
\gexec
SELECT format(
    'ALTER %s %I.%I OWNER TO %I',
    CASE relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
    END,
    nspname,
    relname,
    :'glitchtip_db_user'
)
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  AND nspname NOT IN ('pg_catalog', 'information_schema')
  AND nspname NOT LIKE 'pg_toast%'
  AND nspname NOT LIKE 'pg_temp_%'
  AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = pg_class.oid
        AND dependency.deptype IN ('a', 'i')
  )
\gexec

\connect postgres
SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AS django_role_is_safe
FROM pg_roles WHERE rolname = :'db_user'
\gset
SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AS ai_role_is_safe
FROM pg_roles WHERE rolname = :'ai_db_user'
\gset
SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AS glitchtip_role_is_safe
FROM pg_roles WHERE rolname = :'glitchtip_db_user'
\gset
\if :django_role_is_safe
\else
    \echo 'Django application role has elevated PostgreSQL privileges' >&2
    \quit 1
\endif
\if :ai_role_is_safe
\else
    \echo 'AI application role has elevated PostgreSQL privileges' >&2
    \quit 1
\endif
\if :glitchtip_role_is_safe
\else
    \echo 'GlitchTip application role has elevated PostgreSQL privileges' >&2
    \quit 1
\endif
SQL

unset PGPASSWORD
echo "PostgreSQL application database boundary is ready"
