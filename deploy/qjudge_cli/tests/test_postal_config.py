"""Real YAML and Compose parsers, temporary non-secret fixtures, no containers."""
import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

DEPLOY = Path(__file__).resolve().parents[2]
VALIDATOR = DEPLOY / 'addons/postal/check-config.rb'


def fixture():
    return {'version': 2, 'postal': {'web_hostname': 'postal.example.test', 'smtp_hostname': 'postal.example.test', 'web_protocol': 'https'},
            'main_db': {'host': 'postal-db', 'username': 'root', 'password': 'fixture-password-only', 'database': 'postal'},
            'message_db': {'host': 'postal-db', 'username': 'root', 'password': 'fixture-password-only', 'database_name_prefix': 'postal'},
            'smtp_server': {'tls_enabled': True, 'max_message_size': 14}, 'rails': {'secret_key': 'fixture-' * 10}}


@unittest.skipUnless(shutil.which('ruby'), 'Ruby required for isolated Postal config parser tests')
class PostalConfigTests(unittest.TestCase):
    def validate(self, config):
        # Require the production validator; exercise its settings function before cryptographic checks.
        program = "require 'json'; require ARGV[0]; PostalAddonConfig.validate_settings(JSON.parse(STDIN.read), 'fixture-password-only', 'postal.example.test')"
        return subprocess.run(['ruby', '--disable-gems', '-e', program, str(VALIDATOR)], input=json.dumps(config), text=True, capture_output=True)

    def test_database_password_reader_rejects_whitespace_instead_of_changing_it(self):
        program = "require ARGV[0]; PostalAddonConfig.read_password(ARGV[1])"
        for text, valid in [('fixture-password-only', True), ('fixture-password-only\n', True),
                            (' fixture-password-only ', False), ('fixture-password-only\r\n', False),
                            ('fixture-password-only\nextra', False)]:
            with TemporaryDirectory() as directory:
                path = Path(directory) / 'db-password'
                path.write_text(text)
                result = subprocess.run(['ruby', '--disable-gems', '-e', program, str(VALIDATOR), str(path)], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, valid, result.stderr)
                self.assertNotIn('fixture-password-only', result.stdout + result.stderr)

    def test_valid_standard_postal_settings(self):
        result = self.validate(fixture())
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_bad_settings_fail_without_exposing_values(self):
        changes = [('version', None, 1), ('main_db', 'host', 'unrelated-database'), ('message_db', 'password', 'fixture-sensitive-value'),
                   ('rails', 'secret_key', 'REPLACE' * 20), ('smtp_server', 'tls_enabled', False),
                   ('smtp_server', 'max_message_size', 26), ('smtp_server', 'max_message_size', True),
                   ('postal', 'smtp_hostname', 'wrong.example.test')]
        for group, key, value in changes:
            data = fixture()
            if key is None:
                data[group] = value
            else:
                data[group][key] = value
            result = self.validate(data)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('fixture-sensitive-value', result.stdout + result.stderr)

    def test_yaml_syntax_and_unsafe_tags_do_not_echo_content(self):
        for text in ('secret: [fixture-sensitive-value', '--- !ruby/object:Object {}', '[]'):
            with TemporaryDirectory() as directory:
                (Path(directory) / 'postal.yml').write_text(text)
                result = subprocess.run(['ruby', '--disable-gems', str(VALIDATOR), directory], env={**os.environ, 'POSTAL_HOSTNAME': 'postal.example.test'}, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('fixture-sensitive-value', result.stderr + result.stdout)
                self.assertIn('configuration invalid', result.stderr)

    def test_invalid_key_material_is_rejected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'postal.yml').write_text(json.dumps(fixture()))
            (root / 'db-password').write_text('fixture-password-only')
            for name in ('signing.key', 'smtp.key', 'smtp.cert'):
                (root / name).write_text('fixture-sensitive-value')
            result = subprocess.run(['ruby', '--disable-gems', str(VALIDATOR), directory], env={**os.environ, 'POSTAL_HOSTNAME': 'postal.example.test'}, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('fixture-sensitive-value', result.stdout + result.stderr)


@unittest.skipUnless(shutil.which('docker'), 'Docker Compose CLI required for static topology tests')
class PostalComposeTests(unittest.TestCase):
    def config(self, overlay=False):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / 'fixture.env'
            env_file.write_text('POSTAL_CONFIG_DIR=/tmp/postal-fixture\nPOSTAL_HOSTNAME=postal.example.test\n')
            args = ['docker', 'compose', '--project-name', 'qjudge-postal-fixture', '--project-directory', str(DEPLOY), '--env-file', str(env_file), '-f', str(DEPLOY / 'addons/postal/compose.yml')]
            if overlay:
                args += ['-f', str(DEPLOY / 'addons/postal/compose.qjudge.yml')]
            result = subprocess.run([*args, '--profile', 'tools', 'config', '--format', 'json'], capture_output=True, text=True,
                                    env={k: v for k, v in os.environ.items() if not k.startswith(('POSTAL_', 'COMPOSE_'))})
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(result.stdout)

    def test_worker_gets_time_to_finish_an_in_flight_delivery(self):
        # Postal drops a message whose worker is killed mid-delivery; stop must not SIGKILL after 10s.
        import re
        value = str(self.config()['services']['worker'].get('stop_grace_period') or '0s')
        seconds = sum(int(n) * {'h': 3600, 'm': 60, 's': 1}[unit] for n, unit in re.findall(r'(\d+)([hms])', value))
        self.assertGreaterEqual(seconds, 60, value)

    def test_standalone_private_database_pinned_images_and_healthchecks(self):
        config = self.config()
        self.assertFalse(any(n.get('external') for n in config['networks'].values()))
        for name in ('postal-db', 'web', 'smtp', 'worker'):
            service = config['services'][name]
            self.assertIn('@sha256:', service['image'])
            self.assertIn('healthcheck', service)
        self.assertNotIn('ports', config['services']['postal-db'])
        self.assertEqual(config['services']['config-check']['network_mode'], 'none')
        self.assertNotIn('depends_on', config['services']['config-check'])
        for name in ('web', 'smtp'):
            self.assertEqual(config['services'][name]['ports'][0]['host_ip'], '127.0.0.1')
        self.assertTrue(config['services']['runner']['volumes'][0]['read_only'])
        # Compose omits false booleans in some versions; the long-syntax default is false.
        self.assertFalse(config['services']['runner']['volumes'][0].get('bind', {}).get('create_host_path', False))
        self.assertIn('tools', config['services']['runner']['profiles'])

    def test_web_health_probe_supplies_the_configured_virtual_host(self):
        config = self.config()
        probe = config['services']['web']['healthcheck']['test']
        self.assertIn('Host: postal.example.test', probe)
        self.assertIn('--header', probe)
        self.assertIn('http://127.0.0.1:5000/', probe)

    def test_same_host_only_attaches_smtp_to_qjudge(self):
        config = self.config(True)
        self.assertEqual(config['services']['smtp']['networks']['qjudge']['aliases'], ['postal.example.test'])
        for name in ('postal-db', 'web', 'worker', 'runner'):
            self.assertNotIn('qjudge', config['services'][name]['networks'])

    def test_application_stack_does_not_depend_on_postal(self):
        for name in ('compose.yml', 'compose.build.yml'):
            self.assertNotIn('postal', (DEPLOY / name).read_text().lower())
