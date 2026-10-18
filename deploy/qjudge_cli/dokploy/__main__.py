"""Run with python3 -m qjudge_cli.dokploy --config <private JSON> serve|ssh|deploy [SHA]."""
import argparse
import os
import re
import signal
import subprocess
import threading
import time
from pathlib import Path

from ..agent import state
from ..agent.jobs import TargetNotLatest
from ..agent.server import make_server
from ..release_lock import ReleaseBusy, release_lock
from .config import load_config
from .deployment import Deployment
from .service import DokployAgentService


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('command', choices=('serve', 'ssh', 'deploy'))
    parser.add_argument('sha', nargs='?')
    args = parser.parse_args()
    config = load_config(args.config)
    def restart():
        unit = config.get('systemd_unit', '')
        if unit:
            if not re.fullmatch(r'qjudge-[a-z0-9-]+\.service', unit):
                raise ValueError('Invalid agent systemd unit')
            subprocess.run(['sudo', '-n', 'systemctl', 'restart', '--no-block', unit], check=True)
    service = DokployAgentService(Deployment(config), after_success=restart, restart_agent=bool(config.get('systemd_unit')))
    if args.command == 'serve':
        with release_lock(service.runtime):
            (service.runtime / 'agent-restarting').unlink(missing_ok=True)
        state.mark_interrupted(service.runtime)
        token = Path(config['token_file']).read_text().strip()
        server = make_server(service, token, host=config['listen_host'], port=config.get('port', 8090))
        signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown, daemon=True).start())
        try:
            server.serve_forever()
        finally:
            server.server_close()
        return 0
    target = args.sha
    if args.command == 'ssh':
        match = re.fullmatch(r'deploy-staging ([0-9a-f]{40})', os.environ.get('SSH_ORIGINAL_COMMAND', ''))
        if not match:
            parser.error('Only deploy-staging <40 character SHA> is permitted')
        target = match[1]
    if not target or not re.fullmatch('[0-9a-f]{40}', target):
        parser.error('Expected a commit SHA')
    # CI waits for a web deployment, then rechecks the branch and deployed SHA.
    deadline = time.monotonic() + 3300
    while True:
        try:
            return 0 if service.run_sync(target) else 1
        except ReleaseBusy:
            if time.monotonic() >= deadline:
                raise RuntimeError('Timed out waiting for the shared deployment lock')
            time.sleep(5)
        except TargetNotLatest as error:
            # Superseded CD events are harmless; web requests receive HTTP 400 instead.
            result = subprocess.run(['git', '-C', config['repo'], 'merge-base', '--is-ancestor', target, error.latest])
            if result.returncode == 0:
                print('Skipping superseded commit', target)
                return 0
            raise


if __name__ == '__main__':
    raise SystemExit(main())
