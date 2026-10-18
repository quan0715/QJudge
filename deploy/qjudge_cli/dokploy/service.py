"""Dokploy-specific operations behind the existing authenticated agent HTTP API."""
import json
import threading
import time
import uuid

from ..agent import state
from ..agent.jobs import TargetNotLatest, git
from ..agent.service import AgentService, _spawn_thread
from ..ingress import IngressEntry
from ..release_lock import release_lock, release_locked
from .deployment import Deployment


class DokployAgentService(AgentService):
    def __init__(self, deployment: Deployment, *, spawn=_spawn_thread, after_success=lambda: None):
        # Reuse commit descriptions and network probes; do not run standard CLI upgrades.
        super().__init__(deployment.repo / 'deploy', deployment.runtime / 'agent.env',
                         spawn=spawn, after_success=after_success)
        self.deployment = deployment
        self.runtime = deployment.runtime

    def status(self):
        record = self.deployment.current()
        job = state.read_job(self.runtime)
        return {'tracked_branch': self.deployment.branch, 'deployment_mode': 'dokploy',
                'version': {'current': record.get('sha'), 'previous': record.get('previous'),
                            'deployed_at': record.get('finishedAt')},
                'job': job, 'log': state.log_tail(self.runtime),
                'external_busy': release_locked(self.runtime) and (job or {}).get('status') != 'running'}

    def check(self):
        sha = self.deployment.latest()
        current = self.deployment.current().get('sha')
        result = git(self.run, str(self.deployment.repo), 'log', '--first-parent',
                     '--format=%H%x1f%s', f'{current}..{sha}') if current else None
        releases = []
        if result and result.returncode == 0:
            for line in result.stdout.splitlines():
                commit, _, subject = line.partition('\x1f')
                releases.append({'sha': commit, 'subject': subject})
        return {'tracked_branch': self.deployment.branch,
                'latest': {'sha': sha, **self._commit(str(self.deployment.repo), sha)},
                'releases': releases, 'update_available': self._newer(str(self.deployment.repo), sha, current)}

    def _admit(self, target, actor, *, skip_current=False):
        lock = release_lock(self.runtime)
        lock.__enter__()
        try:
            latest = self.deployment.latest()
            if target != latest:
                raise TargetNotLatest(latest)
            if skip_current and self.deployment.current().get('sha') == target and self.deployment.healthy():
                lock.__exit__(None, None, None)
                return None, None
            job = {'id': uuid.uuid4().hex, 'target': target, 'triggered_by': actor,
                   'started_at': state.now(), 'finished_at': None, 'status': 'running',
                   'step': 'prepare', 'site_healthy': None}
            state.reset_log(self.runtime)
            state.write_job(self.runtime, job)
            return job, lock
        except BaseException:
            lock.__exit__(None, None, None)
            raise

    def start_upgrade(self, target, triggered_by):
        job, lock = self._admit(target, triggered_by)
        try:
            self.spawn(lambda: self._work(job, lock))
        except BaseException:
            state.write_job(self.runtime, {**job, 'status': 'failed', 'finished_at': state.now()})
            lock.__exit__(None, None, None)
            raise
        return dict(job)

    def run_sync(self, target, actor='github-actions'):
        job, lock = self._admit(target, actor, skip_current=True)
        return self._work(job, lock, console=True) if job else True

    def _work(self, job, lock, console=False):
        job = dict(job)
        def log(line):
            state.append_log(self.runtime, line)
            if console:
                print(line, end='', flush=True)
        def step(name):
            job['step'] = name
            state.write_job(self.runtime, job)
            log(f'::qjudge-step {name}\n')
        try:
            self.deployment.execute(job['target'], step, log)
            job.update(status='succeeded', site_healthy=True)
        except Exception as error:
            log(f'Deployment failed: {type(error).__name__}: {error}\n')
            job.update(status='failed', site_healthy=False)
        finally:
            try:
                job['finished_at'] = state.now()
                state.write_job(self.runtime, job)
            finally:
                lock.__exit__(None, None, None)
        if job['status'] == 'succeeded':
            try:
                self.after_success()
            except Exception as error:
                log(f'Agent restart failed: {error}\n')
        return job['status'] == 'succeeded'

    def containers(self):
        ids = self.deployment.output(self.deployment.docker('ps', '-aq', '--filter',
            'label=com.docker.compose.project=' + self.deployment.config['project'])).split()
        rows = json.loads(self.deployment.output(self.deployment.docker('inspect', *ids))) if ids else []
        return {'containers': [{'project': r['Config']['Labels']['com.docker.compose.project'],
            'service': r['Config']['Labels'].get('com.docker.compose.service', ''),
            'state': r['State']['Status'], 'health': r['State'].get('Health', {}).get('Status', '')} for r in rows]}

    def ingress(self):
        # These entries describe the actual Dokploy/Traefik routes, not CLI host ports.
        entries = [IngressEntry(**row) for row in self.deployment.config['ingress']]
        results = [None] * len(entries)
        def probe(i, entry):
            results[i] = self._probe(entry)
        threads = [threading.Thread(target=probe, args=(i, entry), daemon=True) for i, entry in enumerate(entries)]
        for thread in threads:
            thread.start()
        deadline = time.monotonic() + 6
        for thread in threads:
            thread.join(max(0, deadline - time.monotonic()))
        return {'entries': [row or self._row(entry, False, 'timed out') for row, entry in zip(results, entries)]}
