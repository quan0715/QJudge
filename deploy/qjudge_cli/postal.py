"""Optional Postal lifecycle. Never called by application init/upgrade."""
from __future__ import annotations

import fcntl
from datetime import datetime, timezone
import ipaddress
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .check import unknown_key_errors
from .schema import Env
from .stack import Runner, compose_project, ensure_network

ACTIONS = ('check', 'init', 'up', 'status', 'backup', 'upgrade')
WRITERS = ('web', 'smtp', 'worker')
SERVICES = ('postal-db', *WRITERS)
CONFIG_FILES = ('postal.yml', 'signing.key', 'db-password', 'smtp.cert', 'smtp.key')


def check_settings(env: Env) -> list[str]:
    """Only topology; usable without any QJudge database or SMTP credentials."""
    errors = []
    if env.get('EMAIL_MODE', '').strip() != 'bundled':
        return errors
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', compose_project(env)):
        errors.append('COMPOSE_PROJECT_NAME: use lowercase letters, digits, underscores and hyphens')
    host = env.get('POSTAL_HOSTNAME', '')
    if not re.fullmatch(r'(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}', host):
        errors.append('POSTAL_HOSTNAME: a fully qualified DNS hostname is required')
    config = env.get('POSTAL_CONFIG_DIR', '')
    if not config or not Path(config).is_absolute() or any(c in config for c in '\n\r$'):
        errors.append('POSTAL_CONFIG_DIR: an absolute host path without interpolation is required')
    if env.get('POSTAL_NETWORK_MODE', '').strip() not in ('', 'standalone', 'qjudge'):
        errors.append('POSTAL_NETWORK_MODE: must be standalone or qjudge')
    for key in ('POSTAL_SMTP_PORT', 'POSTAL_WEB_PORT'):
        value = env.get(key, '').strip()
        if value and (not value.isascii() or not value.isdigit() or not 1 <= int(value) <= 65535):
            errors.append(f'{key}: must be a port between 1 and 65535')
    for key in ('POSTAL_SMTP_BIND_ADDRESS', 'POSTAL_WEB_BIND_ADDRESS'):
        value = env.get(key, '').strip()
        if value:
            try:
                # IPv4 avoids ambiguous host:port interpolation. IPv6 can be a reviewed override.
                ipaddress.IPv4Address(value)
            except ValueError:
                errors.append(f'{key}: must be an IPv4 bind address')
    return errors


def _check_files(config: Path) -> list[str]:
    errors = []
    if config.is_symlink() or not config.is_dir() or config.stat().st_mode & 0o027:
        return ['POSTAL_CONFIG_DIR: must be a real directory without group write or world access (0750 or 0700)']
    for name in CONFIG_FILES:
        path = config / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size == 0 or path.stat().st_mode & 0o137:
            errors.append(f'Postal {name}: requires a nonempty regular file, no symlink, permissions 0640 or 0600')
    return errors


def _compose(deploy: Path, env_file: Path, env: Env, *, isolated=False) -> list[str]:
    result = ['docker', 'compose', '--project-name', f'{compose_project(env)}-postal',
              '--project-directory', str(deploy), '--env-file', str(env_file),
              '-f', str(deploy / 'addons/postal/compose.yml')]
    if not isolated and env.get('POSTAL_NETWORK_MODE', '').strip() == 'qjudge':
        result += ['-f', str(deploy / 'addons/postal/compose.qjudge.yml')]
    return result


def _call(run: Runner, command: list[str], operation: str, **kwargs):
    # Postal exceptions can contain configuration. Never echo subprocess stderr.
    result = run(command, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError(f'Postal {operation} failed (exit {result.returncode}); inspect locally with secrets redacted')
    return result


def _backup(deploy: Path, env: Env, command: list[str], destination: Path, run: Runner) -> tuple[Path, list[str]]:
    """Quiesce writers and keep ALL databases (Postal creates one per mail server)."""
    config = Path(env['POSTAL_CONFIG_DIR']).resolve()
    destination = destination.resolve()
    if destination == config or config in destination.parents:
        raise RuntimeError('Postal backup directory must be outside POSTAL_CONFIG_DIR')
    addon = (deploy / 'addons/postal').resolve()
    if destination == addon or addon in destination.parents:
        # The addon definitions are copied into the backup; a nested target would copy itself.
        raise RuntimeError('Postal backup directory must be outside deploy/addons/postal')
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = Path(tempfile.mkdtemp(prefix='postal-', dir=destination))
    print(f'Postal backup: {backup}')
    running = _call(run, [*command, 'ps', '--status', 'running', '--services'], 'status', stdout=subprocess.PIPE, text=True).stdout.splitlines()
    active = [s for s in WRITERS if s in running]
    # Include restarting/starting writers: restart policy must not revive one during the dump.
    _call(run, [*command, 'stop', *WRITERS], 'stop writers', stdout=subprocess.PIPE)
    # MYSQL_PWD exists only in the exec process inside MariaDB, never in host argv.
    dump_script = 'export MYSQL_PWD="$(cat /run/secrets/db-password)"; exec mariadb-dump --user=root --all-databases --single-transaction --routines --events --hex-blob'
    with (backup / 'databases.sql.partial').open('xb') as output:
        os.chmod(output.name, 0o600)
        _call(run, [*command, 'exec', '-T', 'postal-db', 'sh', '-ec', dump_script], 'database backup', stdout=output)
        output.flush()
        os.fsync(output.fileno())
    if not (backup / 'databases.sql.partial').stat().st_size:
        raise RuntimeError('Postal database backup was empty; writers remain stopped')
    shutil.copytree(config, backup / 'config', symlinks=True)
    # Extra symlinks could point to certificates outside the backup; reject rather than claim portability.
    if any(p.is_symlink() for p in (backup / 'config').rglob('*')):
        raise RuntimeError('Postal config backup contains symlinks; writers remain stopped')
    for path in (backup / 'config').rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)
    (backup / 'config').chmod(0o700)
    images = _call(run, [*command, 'images', '--format', 'json'], 'record image versions', stdout=subprocess.PIPE, text=True).stdout
    manifest = {'created_at': datetime.now(timezone.utc).isoformat(), 'project': f'{compose_project(env)}-postal', 'images': json.loads(images or '[]'),
                'settings': {k: v for k, v in env.items() if k.startswith('POSTAL_') or k in ('EMAIL_MODE', 'COMPOSE_PROJECT_NAME')},
                'previously_running': active}
    with (backup / 'manifest.json').open('x') as output:
        os.chmod(output.name, 0o600)
        json.dump(manifest, output, indent=2)
    shutil.copytree(deploy / 'addons/postal', backup / 'addon', dirs_exist_ok=False)
    (backup / 'databases.sql.partial').rename(backup / 'databases.sql')
    print('Postal backup complete; contains private keys and message data. Protect it off-host.')
    return backup, active


def _run_postal(deploy: Path, env_file: Path, env: Env, action: str, run: Runner,
               backup_dir: Path | None = None) -> int:
    if env.get('EMAIL_MODE', '').strip() != 'bundled':
        print('EMAIL_MODE is not bundled; the Postal addon is disabled')
        return 1
    if action not in ACTIONS:
        print('Unsupported Postal action')
        return 1
    # A separate Postal host skips the application's required keys, not typo detection.
    problems = unknown_key_errors(env) + check_settings(env)
    if not problems:
        problems = _check_files(Path(env['POSTAL_CONFIG_DIR']))
    for problem in problems:
        print(problem)
    if problems:
        return 1
    command = _compose(deploy, env_file, env)
    try:
        if action == 'status':
            result = _call(run, [*command, 'ps', '--all', '--format', 'json'], 'status', stdout=subprocess.PIPE, text=True)
            raw = result.stdout.strip()
            rows = json.loads(raw) if raw.startswith('[') else [json.loads(line) for line in raw.splitlines()]
            states = {row['Service']: row for row in rows}
            healthy = True
            for service in SERVICES:
                state = states.get(service, {})
                ok = state.get('State') == 'running' and state.get('Health') == 'healthy'
                print(f'{service}: {"healthy" if ok else "missing or unhealthy"}')
                healthy &= ok
            print('Container health does not prove mail delivery, DNS, PTR or outbound port 25.')
            return 0 if healthy else 1
        # This service has network_mode:none and cannot access any database or SMTP endpoint.
        if action != 'backup':
            _call(run, [*_compose(deploy, env_file, env, isolated=True), 'run', '--rm', '--no-deps', '-T',
                        'config-check', 'ruby', '/checks/check-config.rb'], 'configuration check', stdout=subprocess.PIPE)
        if action == 'check':
            print('Postal config: OK. DNS, PTR, network reachability and mail delivery remain unverified.')
            return 0
        if action in ('backup', 'upgrade'):
            backup, active = _backup(deploy, env, command, backup_dir or deploy / 'backups/postal', run)
            if action == 'backup':
                if active:
                    _call(run, [*command, 'start', *active], 'resume writers', stdout=subprocess.PIPE)
                return 0
            _call(run, [*command, 'pull', 'web', 'smtp', 'worker', 'runner'], 'pull Postal image', stdout=subprocess.PIPE)
            _call(run, [*command, 'run', '--rm', '--no-deps', '-T', 'runner', 'postal', 'upgrade'], 'schema upgrade', stdout=subprocess.PIPE)
            print(f'Postal recovery backup: {backup}; schema rollback is manual')
        if action in ('init', 'up') and env.get('POSTAL_NETWORK_MODE', '').strip() == 'qjudge':
            ensure_network(run)
        if action in ('init', 'up'):
            _call(run, [*command, 'up', '-d', '--no-recreate', '--wait', '--wait-timeout', '120', 'postal-db'], 'database startup', stdout=subprocess.PIPE)
        if action == 'init':
            _call(run, [*command, 'run', '--rm', '--no-deps', '-T', 'runner', 'postal', 'initialize'], 'initialization', stdout=subprocess.PIPE)
            print('Postal initialized. Create the admin account and SMTP credentials manually; no email sent.')
            return 0
        # Do not implicitly replace MariaDB during a Postal-only upgrade.
        _call(run, [*command, 'up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120', *WRITERS], 'startup', stdout=subprocess.PIPE)
        print('Postal containers healthy; actual mail delivery still requires operator verification.')
        return 0
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        print(f'Postal {action} failed; no further steps were run. Preserve partial backups; writers may remain stopped. See the Postal recovery runbook.')
        return 1


def lock_path(deploy: Path, env: Env) -> Path:
    return deploy / f'.postal-{compose_project(env)}.lock'


def run_postal(deploy: Path, env_file: Path, env: Env, action: str, run: Runner,
               backup_dir: Path | None = None) -> int:
    # Reject before creating even a lock file for disabled/malformed settings.
    if env.get('EMAIL_MODE', '').strip() != 'bundled' or action not in ACTIONS or check_settings(env):
        return _run_postal(deploy, env_file, env, action, run, backup_dir)
    child_env = {k: v for k, v in os.environ.items() if not k.startswith(('POSTAL_', 'COMPOSE_'))}
    child_env.update({k: v for k, v in env.items() if k.startswith('POSTAL_') or k == 'COMPOSE_PROJECT_NAME'})

    def controlled_run(args, **kwargs):
        return run(args, env=child_env, **kwargs)

    try:
        descriptor = os.open(lock_path(deploy, env), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return _run_postal(deploy, env_file.resolve(), env, action, controlled_run, backup_dir)
    except BlockingIOError:
        print('Another Postal operation is running; retry after it completes')
    except OSError:
        print('Postal files or operation lock are inaccessible; check local ownership and permissions')
    return 1
