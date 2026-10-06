"""Postal orchestration tests: no Docker services or real credentials."""
import io
import json
import subprocess
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from qjudge_cli.addon import ADDONS, run_addon
from qjudge_cli.check import check_env
from qjudge_cli.tests.test_check import VALID


class RecordingRunner:
    def __init__(self, fail=None, healthy=True):
        self.calls = []
        self.fail = fail
        self.healthy = healthy

    def __call__(self, args, **kwargs):
        self.calls.append((args, kwargs))
        failed = self.fail and self.fail(args)
        output = ''
        if '--services' in args:
            output = 'web\nsmtp\nworker\n'
        elif '--format' in args:
            output = json.dumps([{'Service': s, 'State': 'running', 'Health': 'healthy' if self.healthy else 'unhealthy'} for s in ('postal-db', 'web', 'smtp', 'worker')])
        stream = kwargs.get('stdout')
        if hasattr(stream, 'write'):
            stream.write(b'-- fixture SQL dump\n')
        return subprocess.CompletedProcess(args, 9 if failed else 0, stdout=output, stderr='fixture-sensitive-error' if failed else '')


class PostalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.deploy = Path(self.tmp.name)
        self.config = self.deploy / 'secrets' / 'postal'
        self.config.mkdir(parents=True, mode=0o750)
        for name in ('postal.yml', 'signing.key', 'db-password', 'smtp.cert', 'smtp.key'):
            target = self.config / name
            target.write_text('fixture-only-not-a-real-secret\n')
            target.chmod(0o640)
        self.env = {'EMAIL_MODE': 'bundled', 'POSTAL_CONFIG_DIR': str(self.config), 'POSTAL_HOSTNAME': 'postal.example.test', 'COMPOSE_PROJECT_NAME': 'test-mail'}
        self.env_file = self.deploy / '.env'
        self.env_file.write_text('EMAIL_MODE=bundled\n')
        addon = self.deploy / 'addons' / 'postal'
        addon.mkdir(parents=True)
        (addon / 'compose.yml').write_text('services: {}\n')
        self.output = io.StringIO()

    def invoke(self, action='up', env=None, run=None, **kwargs):
        with redirect_stdout(self.output):
            return run_addon(self.deploy, self.env_file, self.env if env is None else env, 'postal', action, run=run or RecordingRunner(), **kwargs)

    def test_addon_is_registered(self):
        self.assertIn('postal', ADDONS)

    def test_default_disabled_and_external_never_run_or_change_files(self):
        for mode in ('', 'disabled', 'external'):
            run = RecordingRunner()
            self.assertEqual(self.invoke(env={**self.env, 'EMAIL_MODE': mode}, run=run), 1)
            self.assertEqual(run.calls, [])
        self.assertEqual(self.env_file.read_text(), 'EMAIL_MODE=bundled\n')

    def test_existing_smtp_configuration_needs_no_postal_settings(self):
        self.assertEqual(check_env({**VALID, 'EMAIL_MODE': 'external', 'EMAIL_HOST': 'smtp.example.test',
                                    'DEFAULT_FROM_EMAIL': 'QJudge <noreply@mail.example.edu>'}), [])
        self.assertEqual(check_env(VALID), [])
        self.assertTrue(any('EMAIL_MODE' in e for e in check_env({**VALID, 'EMAIL_MODE': 'typo'})))

    def test_standalone_up_needs_no_app_secrets_or_shared_network(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke(run=run), 0)
        args = [args for args, _ in run.calls]
        self.assertTrue(all(a[:2] == ['docker', 'compose'] for a in args))
        self.assertTrue(all(a[a.index('--project-name') + 1] == 'test-mail-postal' for a in args))
        self.assertIn('--wait', args[-1])
        self.assertNotIn('compose.qjudge.yml', ' '.join(args[-1]))
        self.assertNotIn('backend', ' '.join(args[-1]))

    def test_same_host_opt_in_adds_overlay_and_shared_network(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke(env={**self.env, 'POSTAL_NETWORK_MODE': 'qjudge'}, run=run), 0)
        self.assertTrue(any(a[:3] == ['docker', 'network', 'inspect'] for a, _ in run.calls))
        self.assertTrue(any('compose.qjudge.yml' in ' '.join(a) for a, _ in run.calls))

    def test_invalid_topology_fails_without_subprocess(self):
        for key, value in [('POSTAL_HOSTNAME', 'https://bad/path'), ('POSTAL_CONFIG_DIR', 'relative'), ('POSTAL_SMTP_PORT', '65536'), ('POSTAL_SMTP_PORT', '0'), ('POSTAL_WEB_BIND_ADDRESS', 'bad'), ('POSTAL_NETWORK_MODE', 'typo'), ('COMPOSE_PROJECT_NAME', '../wrong')]:
            with self.subTest(key=key):
                run = RecordingRunner()
                self.assertEqual(self.invoke(env={**self.env, key: value}, run=run), 1)
                self.assertEqual(run.calls, [])

    def test_missing_world_readable_symlink_or_empty_file_fails_closed(self):
        target = self.config / 'signing.key'
        for problem in ('missing', 'public', 'symlink', 'empty'):
            with self.subTest(problem=problem):
                if target.exists() or target.is_symlink():
                    target.unlink()
                if problem == 'symlink':
                    target.symlink_to(self.config / 'db-password')
                elif problem != 'missing':
                    target.write_text('fixture' if problem == 'public' else '')
                    target.chmod(0o644 if problem == 'public' else 0o640)
                run = RecordingRunner()
                self.assertEqual(self.invoke(run=run), 1)
                self.assertEqual(run.calls, [])

    def test_config_check_failure_never_starts_database_or_prints_stderr(self):
        run = RecordingRunner(fail=lambda a: 'check-config.rb' in ' '.join(a))
        self.assertEqual(self.invoke('init', run=run), 1)
        self.assertEqual(len(run.calls), 1)
        self.assertNotIn('fixture-sensitive-error', self.output.getvalue())

    def test_init_only_initializes_postal_database_and_preserves_config(self):
        before = {p.name: p.read_bytes() for p in self.config.iterdir()}
        run = RecordingRunner()
        self.assertEqual(self.invoke('init', run=run), 0)
        args = [a for a, _ in run.calls]
        self.assertIn('postal-db', args[1])
        self.assertEqual(args[-1][-2:], ['postal', 'initialize'])
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.config.iterdir()})

    def test_status_requires_all_services_healthy(self):
        self.assertEqual(self.invoke('status', run=RecordingRunner()), 0)
        self.assertEqual(self.invoke('status', run=RecordingRunner(healthy=False)), 1)
        self.assertIn('delivery', self.output.getvalue())

    def test_backup_uses_private_new_directory_and_resumes_previous_writers(self):
        run = RecordingRunner()
        backups = self.deploy / 'backups'
        self.assertEqual(self.invoke('backup', run=run, backup_dir=backups), 0)
        dirs = list(backups.iterdir())
        self.assertEqual(len(dirs), 1)
        self.assertEqual(dirs[0].stat().st_mode & 0o777, 0o700)
        dump = dirs[0] / 'databases.sql'
        self.assertEqual(dump.stat().st_mode & 0o777, 0o600)
        self.assertIn(b'fixture SQL', dump.read_bytes())
        self.assertTrue((dirs[0] / 'config' / 'signing.key').exists())
        self.assertTrue((dirs[0] / 'manifest.json').exists())
        args = [a for a, _ in run.calls]
        self.assertIn('stop', args[1])
        self.assertTrue(any('--all-databases' in ' '.join(a) for a in args))
        self.assertEqual(args[-1][-3:], ['web', 'smtp', 'worker'])
        self.assertFalse(any('down' in a for a in args))

    def test_upgrade_backup_precedes_migrate_and_never_automatically_pulls_database(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke('upgrade', run=run), 0)
        args = [a for a, _ in run.calls]
        dump = next(i for i, a in enumerate(args) if '--all-databases' in ' '.join(a))
        migrate = next(i for i, a in enumerate(args) if a[-2:] == ['postal', 'upgrade'])
        self.assertLess(dump, migrate)
        self.assertTrue(all('postal-db' not in a[a.index('pull'):] for a in args if 'pull' in a))
        self.assertIn('--wait', args[-1])

    def test_stop_dump_and_migration_failure_leave_writers_stopped_and_report_failure(self):
        for marker in ('stop', '--all-databases', 'upgrade'):
            with self.subTest(marker=marker):
                run = RecordingRunner(fail=lambda a: marker in ' '.join(a))
                self.assertEqual(self.invoke('upgrade', run=run), 1)
                args = [a for a, _ in run.calls]
                self.assertFalse(any('up' in a for a in args))
                if marker != 'upgrade':
                    self.assertFalse(any(a[-2:] == ['postal', 'upgrade'] for a in args))
                self.assertNotIn('fixture-sensitive-error', self.output.getvalue())

    def test_unsupported_action_does_not_launch_anything(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke('delete', run=run), 1)
        self.assertEqual(run.calls, [])

    def test_empty_dump_is_not_a_successful_backup(self):
        class EmptyDump(RecordingRunner):
            def __call__(self, args, **kwargs):
                if '--all-databases' in ' '.join(args):
                    self.calls.append((args, kwargs))
                    return subprocess.CompletedProcess(args, 0, stdout='', stderr='')
                return super().__call__(args, **kwargs)
        run = EmptyDump()
        self.assertEqual(self.invoke('upgrade', run=run), 1)
        self.assertFalse(any(a[-2:] == ['postal', 'upgrade'] for a, _ in run.calls))
        self.assertEqual(len(list((self.deploy / 'backups/postal').glob('*/databases.sql'))), 0)

    def test_backup_copy_failure_cannot_migrate_or_restart(self):
        run = RecordingRunner()
        with patch('qjudge_cli.postal.shutil.copytree', side_effect=OSError('fixture-sensitive-error')):
            self.assertEqual(self.invoke('upgrade', run=run), 1)
        self.assertFalse(any('up' in a or a[-2:] == ['postal', 'upgrade'] for a, _ in run.calls))
        self.assertNotIn('fixture-sensitive-error', self.output.getvalue())

    def test_backup_twice_never_overwrites_previous_data(self):
        for _ in range(2):
            self.assertEqual(self.invoke('backup'), 0)
        self.assertEqual(len(list((self.deploy / 'backups/postal').glob('*/databases.sql'))), 2)

    def test_backup_inside_config_is_rejected_without_stopping_writers(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke('backup', run=run, backup_dir=self.config / 'backups'), 1)
        self.assertFalse(any('stop' in a for a, _ in run.calls))

    def test_missing_services_are_unhealthy(self):
        class Missing(RecordingRunner):
            def __call__(self, args, **kwargs):
                result = super().__call__(args, **kwargs)
                result.stdout = '[]'
                return result
        self.assertEqual(self.invoke('status', run=Missing()), 1)

    def test_pinned_env_overrides_unvalidated_shell_settings(self):
        run = RecordingRunner()
        with patch.dict('os.environ', {'POSTAL_CONFIG_DIR': '/unvalidated', 'POSTAL_SMTP_PORT': '1234'}):
            self.assertEqual(self.invoke(run=run), 0)
        for args, kwargs in run.calls:
            if args[:2] == ['docker', 'compose']:
                self.assertEqual(kwargs['env']['POSTAL_CONFIG_DIR'], str(self.config))
                self.assertNotIn('POSTAL_SMTP_PORT', kwargs['env'])

    def test_operation_lock_prevents_concurrent_writers(self):
        import fcntl
        from qjudge_cli.postal import lock_path
        lock = lock_path(self.deploy, self.env)
        lock.parent.mkdir(parents=True, exist_ok=True)
        with lock.open('w') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            run = RecordingRunner()
            self.assertEqual(self.invoke('upgrade', run=run), 1)
            self.assertEqual(run.calls, [])

    def test_backup_inside_addon_directory_is_rejected_without_stopping_writers(self):
        run = RecordingRunner()
        backups = self.deploy / 'addons' / 'postal' / 'backups'
        self.assertEqual(self.invoke('backup', run=run, backup_dir=backups), 1)
        self.assertFalse(any('stop' in a for a, _ in run.calls))
        self.assertFalse(backups.exists())

    def test_unknown_keys_are_rejected_before_any_postal_command(self):
        run = RecordingRunner()
        env = {**self.env, 'POSTAL_NETWORK_MOD': 'qjudge'}
        self.assertEqual(self.invoke('up', env=env, run=run), 1)
        self.assertEqual(run.calls, [])

    def test_backup_stops_restarting_writers_as_well_as_running_writers(self):
        class Restarting(RecordingRunner):
            def __call__(self, args, **kwargs):
                result = super().__call__(args, **kwargs)
                if '--services' in args:
                    result.stdout = 'web\n'  # SMTP/worker are restarting, not running.
                return result
        run = Restarting()
        self.assertEqual(self.invoke('backup', run=run), 0)
        stop = next(a for a, _ in run.calls if 'stop' in a)
        self.assertEqual(stop[stop.index('stop') + 1:], ['web', 'smtp', 'worker'])
        self.assertEqual(run.calls[-1][0][-2:], ['start', 'web'])

    def test_backup_does_not_require_working_smtp_certificates(self):
        run = RecordingRunner(fail=lambda a: 'check-config.rb' in ' '.join(a))
        self.assertEqual(self.invoke('backup', run=run), 0)
        self.assertFalse(any('check-config.rb' in ' '.join(a) for a, _ in run.calls))

    def test_up_preserves_database_container_during_certificate_refresh(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke('up', run=run), 0)
        database_up = next(a for a, _ in run.calls if 'up' in a and 'postal-db' in a)
        self.assertIn('--no-recreate', database_up)
        self.assertNotIn('--force-recreate', database_up)
        self.assertNotIn('postal-db', run.calls[-1][0])

    def test_quoted_network_mode_spaces_cannot_silently_select_standalone(self):
        run = RecordingRunner()
        self.assertEqual(self.invoke(env={**self.env, 'POSTAL_NETWORK_MODE': ' qjudge '}, run=run), 0)
        self.assertTrue(any('compose.qjudge.yml' in ' '.join(a) for a, _ in run.calls))
