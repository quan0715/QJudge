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
