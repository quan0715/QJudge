#!/bin/sh
# Runs once, when the PostgreSQL data directory is empty. Existing installs
# already have these roles and databases; change passwords with ALTER ROLE.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v web_password="$QJUDGE_DB_PASSWORD" \
  -v ai_password="$QJUDGE_AI_DB_PASSWORD" <<'SQL'
CREATE ROLE qjudge_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'web_password';
CREATE ROLE qjudge_ai LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'ai_password';
CREATE DATABASE online_judge OWNER qjudge_web;
CREATE DATABASE qjudge_ai OWNER qjudge_ai;
REVOKE ALL ON DATABASE online_judge FROM PUBLIC;
REVOKE ALL ON DATABASE qjudge_ai FROM PUBLIC;
SQL
