import copy
import json
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from qjudge_cli.agent import state
from qjudge_cli.agent.jobs import TargetNotLatest
from qjudge_cli.dokploy.deployment import Deployment
from qjudge_cli.dokploy.service import DokployAgentService
from qjudge_cli.release_lock import ReleaseBusy, release_lock

SHA = 'a' * 40
OLD = 'b' * 40


class FakeDeployment:
    def __init__(self, root):
        self.runtime = root
        self.repo = root
        self.branch = 'dev'
        self.executions = []
        self.fail = False
        self.config = {'ingress': []}
        self.record = {'sha': OLD}
    def latest(self):
        return SHA
    def current(self):
        return self.record
    def healthy(self):
        return True
    def public_healthy(self):
        return True
    def reconcile_pending(self):
        return (self.runtime / 'deployment-pending.json').exists()
    def execute(self, sha, step, log):
        self.executions.append(sha)
        step('build')
        log('building\n')
        if self.fail:
            raise RuntimeError('build failed')
        self.record = {'sha': sha}
        step('verify')


class DokployAgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.deployment = FakeDeployment(self.root)
        self.work = []
        self.agent = DokployAgentService(self.deployment, spawn=self.work.append)

    def test_web_holds_same_lock_as_cd_until_completion(self):
        job = self.agent.start_upgrade(SHA, 'admin')
        self.assertEqual(job['status'], 'running')
        with self.assertRaises(ReleaseBusy):
            self.agent.run_sync(SHA)
        with self.assertRaises(ReleaseBusy):
            self.agent.start_upgrade(SHA, 'another-admin')
        self.work.pop()()
        self.assertEqual(state.read_job(self.root)['status'], 'succeeded')
        self.assertTrue(self.agent.run_sync(SHA))
        self.assertEqual(self.deployment.executions, [SHA])

    def test_web_is_rejected_while_cd_holds_lock(self):
        with release_lock(self.root):
            with self.assertRaises(ReleaseBusy):
                self.agent.start_upgrade(SHA, 'admin')
        self.assertIsNone(state.read_job(self.root))

    def test_stale_target_cannot_start_and_releases_lock(self):
        with self.assertRaises(TargetNotLatest):
            self.agent.start_upgrade(OLD, 'admin')
        with release_lock(self.root):
            pass
        self.assertFalse(self.work)

    def test_failed_job_keeps_previous_deployment_and_unlocks(self):
        self.deployment.fail = True
        self.agent.start_upgrade(SHA, 'admin')
        self.work.pop()()
        self.assertEqual(state.read_job(self.root)['status'], 'failed')
        self.assertEqual(self.agent.status()['version']['current'], OLD)
        with release_lock(self.root):
            pass

    def test_status_reports_dev_and_survives_process_restart(self):
        self.agent.start_upgrade(SHA, 'admin')
        self.work.pop()()
        other = DokployAgentService(self.deployment)
        self.assertEqual(other.status()['tracked_branch'], 'dev')
        self.assertEqual(other.status()['job']['status'], 'succeeded')
        self.assertIn('building', other.status()['log'])

    def test_failed_spawn_does_not_leave_running_job(self):
        self.agent.spawn = lambda work: (_ for _ in ()).throw(RuntimeError('no thread'))
        with self.assertRaises(RuntimeError):
            self.agent.start_upgrade(SHA, 'admin')
        self.assertEqual(state.read_job(self.root)['status'], 'failed')
        with release_lock(self.root):
            pass

    def test_ingress_probes_configured_dokploy_routes(self):
        self.deployment.config['ingress'] = [{'id': 'site', 'public': 'https://staging.test',
            'target': 'Traefik → frontend:80', 'probe': 'https://staging.test/api/health/', 'expect': '200'}]
        self.agent.http_get = lambda url: 200
        row = self.agent.ingress()['entries'][0]
        self.assertTrue(row['ok'])
        self.assertEqual(row['target'], 'Traefik → frontend:80')

    def test_latest_fetches_only_the_configured_branch(self):
        deployment = Deployment({'repo': str(self.root), 'runtime': str(self.root), 'branch': 'dev'})
        responses = [subprocess.CompletedProcess([], 0, '', ''), subprocess.CompletedProcess([], 0, SHA, '')]
        with patch('qjudge_cli.dokploy.deployment.git', side_effect=responses) as run:
            self.assertEqual(deployment.latest(), SHA)
        self.assertEqual(run.call_args_list[0].args[2:], ('fetch', 'origin', 'dev'))
        self.assertEqual(run.call_args_list[1].args[2:], ('rev-parse', 'origin/dev'))

    def test_backup_failure_never_updates_dokploy(self):
        config = {'repo': str(self.root), 'runtime': str(self.root), 'branch': 'dev',
                  'compose_id': 'app', 'project': 'staging', 'network': 'isolated'}
        deployment = Deployment(config)
        app = {'services': {'backend': {'image': 'qjudge/backend:old'}},
               'networks': {'default': {'name': 'isolated'}}}
        process = type('Process', (), {'stdout': io.BytesIO(), 'wait': lambda self: 0})()
        def command(args, **kwargs):
            if 'pg_dump' in args[-1]:
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, 0)
        with patch.object(deployment, '_stream'), patch.object(deployment, 'output', return_value='postgres'), \
             patch.object(deployment, 'api', return_value={'appName': 'staging', 'sourceType': 'raw',
                 'composeFile': json.dumps(app)}) as api, \
             patch('qjudge_cli.dokploy.deployment.subprocess.Popen', return_value=process), \
             patch('qjudge_cli.dokploy.deployment.subprocess.run', side_effect=command):
            with self.assertRaises(subprocess.CalledProcessError):
                deployment.execute(SHA, lambda name: None, lambda line: None)
        self.assertEqual([call.args[0] for call in api.call_args_list], ['compose.one'])
        self.assertFalse((self.root / 'deployed.json').exists())

    def test_yaml_uses_compose_parser_without_resolving_private_values(self):
        deployment = Deployment({'repo': str(self.root), 'runtime': str(self.root), 'branch': 'dev'})
        source = 'services:\n  backend:\n    image: qjudge/backend:old\n'
        app = {'services': {'backend': {'image': 'qjudge/backend:old'}}}
        with patch('qjudge_cli.dokploy.deployment.subprocess.run',
                   return_value=subprocess.CompletedProcess([], 0, json.dumps(app), '')) as run:
            self.assertEqual(deployment.parse_app(source), app)
        self.assertEqual(run.call_args.kwargs['input'], source)
        for flag in ('--no-interpolate', '--no-path-resolution', '--no-env-resolution'):
            self.assertIn(flag, run.call_args.args[0])

    def test_migrations_use_new_compose_without_replacing_services(self):
        deployment = Deployment({'repo': str(self.root), 'runtime': str(self.root),
                                 'branch': 'dev', 'project': 'staging'})
        with patch.object(deployment, '_stream') as stream:
            deployment.migrate(self.root / 'next-compose.json', lambda line: None)
        commands = [call.args[0] for call in stream.call_args_list]
        self.assertEqual(len(commands), 3)
        self.assertIn('infrastructure.agent.model_config', commands[0])
        self.assertEqual(commands[1][-4:], ['python', 'manage.py', 'migrate', '--noinput'])
        self.assertIn('alembic upgrade head', commands[2][-1])
        for command in commands:
            self.assertIn('--no-deps', command)
            self.assertIn(str(self.root / 'next-compose.json'), command)
            self.assertNotIn('up', command)

    def test_first_runtime_creates_profile_and_migration_failure_prevents_switch(self):
        config = {'repo': str(self.root), 'runtime': str(self.root), 'branch': 'dev',
                  'compose_id': 'app', 'project': 'staging', 'network': 'isolated',
                  'agent_url': 'http://172.19.0.1:8090', 'token_file': '/private/token'}
        deployment = Deployment(config)
        app = {'services': {'backend': {'image': 'qjudge/backend:old'}},
               'networks': {'default': {'name': 'isolated'}}}
        source = self.root / 'releases' / SHA / 'backend/judge/seccomp_profiles/cpp.json'
        source.parent.mkdir(parents=True)
        source.write_text(json.dumps({'architectures': [], 'syscalls': []}))
        process = type('Process', (), {'stdout': io.BytesIO(), 'wait': lambda self: 0})()
        steps = []
        with patch.object(deployment, '_stream'), patch.object(deployment, 'output', return_value='postgres'), \
             patch.object(deployment, 'api', return_value={'appName': 'staging', 'sourceType': 'raw',
                 'composeFile': json.dumps(app)}) as api, \
             patch.object(deployment, 'migrate', side_effect=RuntimeError('migration failed')), \
             patch('qjudge_cli.dokploy.deployment.subprocess.Popen', return_value=process), \
             patch('qjudge_cli.dokploy.deployment.subprocess.run', return_value=subprocess.CompletedProcess([], 0)):
            with self.assertRaisesRegex(RuntimeError, 'migration failed'):
                deployment.execute(SHA, steps.append, lambda line: None)
        self.assertEqual(steps, ['prepare', 'build', 'backup', 'migrate'])
        profile = json.loads((self.root / 'backend/judge/seccomp_profiles/cpp.json').read_text())
        self.assertIn('SCMP_ARCH_AARCH64', profile['architectures'])
        self.assertEqual([call.args[0] for call in api.call_args_list], ['compose.one'])
        self.assertFalse((self.root / 'deployed.json').exists())

    def test_restart_marker_blocks_admission_until_new_server_starts(self):
        agent = DokployAgentService(self.deployment, spawn=self.work.append, restart_agent=True)
        agent.start_upgrade(SHA, 'admin')
        self.work.pop()()
        self.assertTrue((self.root / 'agent-restarting').exists())
        with self.assertRaises(ReleaseBusy):
            agent.start_upgrade(SHA, 'other')
        (self.root / 'agent-restarting').unlink()
        self.assertTrue(agent.run_sync(SHA))

    def test_orphaned_cd_job_is_settled_without_clearing_pending_switch(self):
        state.write_job(self.root, {'status': 'running', 'id': 'dead-cd'})
        (self.root / 'deployment-pending.json').write_text('{}')
        status = self.agent.status()
        self.assertEqual(status['job']['status'], 'interrupted')
        self.assertTrue(status['external_busy'])
        with self.assertRaises(ReleaseBusy):
            self.agent.start_upgrade(SHA, 'admin')

    def test_status_does_not_interrupt_a_live_worker(self):
        self.agent.start_upgrade(SHA, 'admin')
        self.assertEqual(self.agent.status()['job']['status'], 'running')
        self.work.pop()()

    def test_failure_reports_independent_public_health(self):
        self.deployment.fail = True
        self.agent.start_upgrade(SHA, 'admin')
        self.work.pop()()
        self.assertTrue(state.read_job(self.root)['site_healthy'])

    def test_uncertain_dokploy_switch_blocks_until_terminal_status(self):
        deployment = Deployment({'repo': str(self.root), 'runtime': str(self.root),
                                 'branch': 'dev', 'compose_id': 'staging'})
        pending = self.root / 'deployment-pending.json'
        pending.write_text(json.dumps({'title': 'release'}))
        for rows in ([], [{'title': 'release', 'status': 'running'}]):
            with patch.object(deployment, 'api', return_value=rows):
                self.assertTrue(deployment.reconcile_pending())
                self.assertTrue(pending.exists())
        with patch.object(deployment, 'api', side_effect=OSError('connection lost')):
            self.assertTrue(deployment.reconcile_pending())
        with patch.object(deployment, 'api', return_value=[{'title': 'release', 'status': 'done'}]):
            self.assertFalse(deployment.reconcile_pending())
            self.assertFalse(pending.exists())

    def test_health_checks_each_service_image_and_missing_services(self):
        deployment = Deployment({'repo': str(self.root), 'runtime': str(self.root),
                                 'branch': 'dev', 'project': 'staging', 'compose_id': 'staging'})
        app = {'services': {'backend': {'image': 'qjudge/backend:new'},
                            'celery': {'image': 'qjudge/backend:new'}}}
        cases = [
            ('backend|running|Up (healthy)|qjudge/backend:new\ncelery|running|Up|qjudge/backend:old', False),
            ('backend|running|Up|qjudge/backend:new\nbackend|running|Up|qjudge/backend:new', False),
            ('backend|running|Up (unhealthy)|qjudge/backend:new\ncelery|running|Up|qjudge/backend:new', False),
            ('backend|running|Up (healthy)|qjudge/backend:new\ncelery|running|Up|qjudge/backend:new', True),
        ]
        for rows, expected in cases:
            with self.subTest(rows=rows), patch.object(deployment, 'output', return_value=rows), \
                 patch.object(deployment, 'api', return_value={'composeFile': json.dumps(app)}):
                self.assertEqual(deployment.healthy(), expected)

    def test_dokploy_render_preserves_routes_data_and_other_images(self):
        config = {'repo': str(self.root), 'runtime': str(self.root), 'branch': 'dev',
                  'agent_url': 'http://172.19.0.1:8090', 'token_file': '/private/token'}
        app = {'services': {'backend': {'image': 'qjudge/backend:old',
            'volumes': ['/data:/data'], 'labels': {'traefik.http.routers.app.rule': 'Host(`staging.test`)'},
            'environment': {'EMAIL_MODE': 'disabled', 'DOCKER_IMAGE_JUDGE': 'qjudge/judge:old'}},
            'postgres': {'image': 'postgres:15', 'volumes': ['db:/var/lib/postgresql/data']}},
            'volumes': {'db': {}}, 'networks': {'default': {'name': 'isolated'}}}
        before = copy.deepcopy(app)
        result = json.loads(Deployment(config).render_app(app, 'sha-' + SHA[:12]))
        self.assertEqual(result['services']['postgres'], before['services']['postgres'])
        self.assertEqual(result['networks'], before['networks'])
        self.assertEqual(result['services']['backend']['labels'], before['services']['backend']['labels'])
        self.assertEqual(result['services']['backend']['environment']['EMAIL_MODE'], 'disabled')
        self.assertIn('/data:/data', result['services']['backend']['volumes'])
        again = json.loads(Deployment(config).render_app(result, 'sha-' + SHA[:12]))
        self.assertEqual(again, result)


if __name__ == '__main__':
    unittest.main()
