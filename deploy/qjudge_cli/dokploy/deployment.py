"""The one build/backup/Dokploy/readiness pipeline used by web and SSH CD."""
import json
import os
import re
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from ..agent.jobs import git
from ..envfile import write_private
from ..release import MIGRATIONS, MODEL_CONFIG_CHECK

IMAGES = [('backend', 'backend', 'Dockerfile'), ('ai-service', 'ai-service', 'Dockerfile'),
          ('frontend', 'frontend', 'Dockerfile'), ('integrity-resident', 'integrity-service', 'Dockerfile.resident'),
          ('mcp', '.', 'mcp-server/Dockerfile'), ('judge', 'backend/judge', 'Dockerfile.judge')]


class Deployment:
    def __init__(self, config):
        self.config = config
        self.repo = Path(config['repo'])
        self.runtime = Path(config['runtime'])
        self.branch = config['branch']

    def latest(self):
        result = git(subprocess.run, str(self.repo), 'fetch', 'origin', self.branch)
        if result.returncode:
            raise RuntimeError('Cannot fetch tracked branch')
        result = git(subprocess.run, str(self.repo), 'rev-parse', f'origin/{self.branch}')
        sha = result.stdout.strip()
        if result.returncode or not re.fullmatch('[0-9a-f]{40}', sha):
            raise RuntimeError('Cannot resolve tracked branch')
        return sha

    def current(self):
        try:
            return json.loads((self.runtime / 'deployed.json').read_text())
        except FileNotFoundError:
            return {}

    def api(self, route, body=None, query=None):
        url = self.config.get('api_url', 'http://127.0.0.1:3000/api') + '/' + route
        if query:
            url += '?' + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
            headers={'x-api-key': Path(self.config['api_key_file']).read_text().strip(),
                     'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)

    def docker(self, *args):
        return ['sudo', '-n', 'docker', *args]

    def output(self, args):
        return subprocess.check_output(args, text=True, timeout=30).strip()

    def healthy(self):
        ids = self.output(self.docker('ps', '-aq', '--filter',
            'label=com.docker.compose.project=' + self.config['project'])).split()
        if not ids:
            return False
        # inspect preserves digest-pinned image references; docker ps drops the digest.
        rows = self.output(self.docker('inspect', '--format',
            '{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{if .State.Health}}({{.State.Health.Status}}){{end}}|{{.Config.Image}}',
            *ids)).splitlines()
        app = self.api('compose.one', query={'composeId': self.config['compose_id']})
        services = self.parse_app(app['composeFile'])['services']
        for name, service in services.items():
            instances = [row.split('|') for row in rows if row.split('|')[0] == name]
            replicas = service.get('deploy', {}).get('replicas', 1)
            if len(instances) < replicas or any(len(row) != 4 or row[1] != 'running'
                or '(unhealthy)' in row[2] or '(starting)' in row[2]
                or row[3] != service['image'] for row in instances):
                return False
        return True

    def public_healthy(self):
        try:
            with urllib.request.urlopen(self.config['public_origin'] + '/api/health/', timeout=5) as response:
                return response.status == 200
        except (OSError, ValueError):
            return False

    def reconcile_pending(self):
        """Called under the release lock; an uncertain asynchronous switch blocks admission."""
        path = self.runtime / 'deployment-pending.json'
        if not path.exists():
            return False
        title = json.loads(path.read_text())['title']
        try:
            rows = self.api('deployment.allByCompose', query={'composeId': self.config['compose_id']})
        except (OSError, ValueError):
            return True
        matches = [row for row in rows if row.get('title') == title]
        if matches and matches[0]['status'] in ('done', 'error', 'cancelled'):
            path.unlink()
            return False
        # A missing result is also uncertain: the deploy request may still be queued.
        return True

    def execute(self, sha, step, log):
        if not re.fullmatch('[0-9a-f]{40}', sha):
            raise ValueError('Expected a commit SHA')
        # Admission and execution run under the same lock, for both callers.
        step('prepare')
        release = self.runtime / 'releases' / sha
        release.mkdir(parents=True, exist_ok=True)
        archive = subprocess.Popen(['git', '-C', str(self.repo), 'archive', sha], stdout=subprocess.PIPE)
        try:
            subprocess.run(['tar', '-xp', '-C', str(release)], stdin=archive.stdout, check=True)
        finally:
            archive.stdout.close()
        if archive.wait():
            raise RuntimeError('git archive failed')
        version = 'sha-' + sha[:12]
        step('build')
        for name, context, filename in IMAGES:
            ctx = release / context
            dockerfile = release / filename if context == '.' else ctx / filename
            log(f'Building {name} {version}\n')
            self._stream(self.docker('build', '--label', 'org.opencontainers.image.revision=' + sha,
                '-t', f'qjudge/{name}:{version}', '-f', str(dockerfile), str(ctx)), log)
        current = self.api('compose.one', query={'composeId': self.config['compose_id']})
        if current['appName'] != self.config['project'] or current['sourceType'] != 'raw':
            raise RuntimeError('Dokploy app does not match the configured project')
        app = self.parse_app(current['composeFile'])
        if app['networks']['default']['name'] != self.config['network']:
            raise RuntimeError('Dokploy network does not match')
        step('backup')
        backup = self.runtime / 'backups' / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + sha[:12])
        backup.mkdir(parents=True)
        write_private(backup / 'compose.json', current['composeFile'])
        container = self.output(self.docker('ps', '-q', '--filter',
            'label=com.docker.compose.project=' + self.config['project'],
            '--filter', 'label=com.docker.compose.service=postgres'))
        if not container or '\n' in container:
            raise RuntimeError('Expected exactly one PostgreSQL container')
        for db in ('online_judge', 'qjudge_ai'):
            with (backup / (db + '.dump')).open('wb') as target:
                subprocess.run(self.docker('exec', container, 'sh', '-c',
                    'exec pg_dump -U "$POSTGRES_USER" -Fc --no-owner --no-acl ' + db), stdout=target, check=True)
        rendered = self.render_app(app, version)
        write_private(backup / 'next-compose.json', rendered)
        # Keep this host's existing ARM seccomp adjustments.
        profile = json.loads((release / 'backend/judge/seccomp_profiles/cpp.json').read_text())
        for arch in ('SCMP_ARCH_AARCH64', 'SCMP_ARCH_ARM'):
            if arch not in profile['architectures']:
                profile['architectures'].append(arch)
        if not any('statx' in rule['names'] for rule in profile['syscalls']):
            profile['syscalls'].append({'names': ['statx'], 'action': 'SCMP_ACT_ALLOW'})
        profile_path = self.runtime / 'backend/judge/seccomp_profiles/cpp.json'
        profile_path.parent.mkdir(parents=True, exist_ok=True)
        profile_path.write_text(json.dumps(profile))
        step('migrate')
        self.migrate(backup / 'next-compose.json', log)
        step('switch')
        self.api('compose.update', {'composeId': self.config['compose_id'], 'composeFile': rendered})
        title = f"{self.config['project']}-{sha}-{uuid.uuid4().hex[:8]}"
        write_private(self.runtime / 'deployment-pending.json', json.dumps({'title': title, 'sha': sha}))
        self.api('compose.deploy', {'composeId': self.config['compose_id'], 'title': title,
                                  'description': f'Pinned {self.branch} {sha}', 'freshVolumes': False})
        deployment = self.wait_deployment(title)
        step('verify')
        for _ in range(60):
            if self.healthy():
                break
            time.sleep(5)
        else:
            raise RuntimeError('Containers failed readiness checks')
        if not self.public_healthy():
            raise RuntimeError('Public health check failed')
        previous = self.current().get('sha')
        write_private(self.runtime / 'deployed.json', json.dumps({
            'sha': sha, 'previous': previous, 'version': version, 'deploymentId': deployment['deploymentId'],
            'title': title, 'finishedAt': deployment.get('finishedAt')}, indent=2) + '\n')
        link = self.runtime / 'agent-next'
        link.unlink(missing_ok=True)
        link.symlink_to(release / 'deploy')
        os.replace(link, self.runtime / 'agent-current')
        backups = sorted(p for p in (self.runtime / 'backups').iterdir()
            if p.is_dir() and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}', p.name))
        for old in backups[:-5]:
            shutil.rmtree(old)
        log(f'Staging deployed: {sha}\n')

    def parse_app(self, source):
        try:
            return json.loads(source)
        except json.JSONDecodeError:
            # Let the installed Compose parser handle YAML without resolving host paths,
            # env files or interpolation that belongs to Dokploy's configuration.
            result = subprocess.run(self.docker('compose', '-f', '-', 'config',
                '--format', 'json', '--no-interpolate', '--no-normalize',
                '--no-path-resolution', '--no-env-resolution'), input=source,
                capture_output=True, text=True, timeout=30)
            if result.returncode:
                raise RuntimeError('Cannot parse Dokploy Compose configuration')
            return json.loads(result.stdout)

    def migrate(self, compose_file, log):
        # One-off new-image commands use the existing network and databases. They do
        # not replace running services, and failure prevents the Dokploy switch.
        for service, command in (MODEL_CONFIG_CHECK, *MIGRATIONS):
            self._stream(self.docker('compose', '-p', self.config['project'],
                '-f', str(compose_file), 'run', '--rm', '--no-deps', '--pull', 'never',
                service, *command), log)

    def render_app(self, app, version):
        for service in app['services'].values():
            image = service.get('image', '')
            if image.startswith('qjudge/'):
                service['image'] = image.split(':')[0] + ':' + version
                service['pull_policy'] = 'never'
            env = service.get('environment', {})
            if 'DOCKER_IMAGE_JUDGE' in env:
                env['DOCKER_IMAGE_JUDGE'] = 'qjudge/judge:' + version
        backend = app['services']['backend']
        backend.setdefault('environment', {}).update({
            'QJUDGE_AGENT_URL': self.config['agent_url'],
            'QJUDGE_AGENT_TOKEN_FILE': '/run/secrets/qjudge-agent-token',
        })
        mount = self.config['token_file'] + ':/run/secrets/qjudge-agent-token:ro'
        volumes = backend.setdefault('volumes', [])
        if mount not in volumes:
            volumes.append(mount)
        return json.dumps(app, indent=2) + '\n'

    def wait_deployment(self, title):
        for _ in range(240):
            rows = self.api('deployment.allByCompose', query={'composeId': self.config['compose_id']})
            matches = [row for row in rows if row.get('title') == title]
            if matches:
                if matches[0]['status'] in ('done', 'error', 'cancelled'):
                    (self.runtime / 'deployment-pending.json').unlink(missing_ok=True)
                if matches[0]['status'] == 'done':
                    return matches[0]
                if matches[0]['status'] in ('error', 'cancelled'):
                    raise RuntimeError('Dokploy deployment failed: ' + matches[0]['deploymentId'])
            time.sleep(5)
        raise RuntimeError('Timed out waiting for Dokploy deployment')

    def _stream(self, command, log):
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
        for line in process.stdout:
            log(line)
        if process.wait():
            raise RuntimeError('Command failed: ' + command[3])
