"""Trusted, host-owned configuration; never supplied by an HTTP caller."""
import json
import re
from pathlib import Path


def load_config(path: Path) -> dict:
    config = json.loads(path.read_text())
    for key in ('repo', 'runtime', 'token_file', 'api_key_file'):
        if not Path(config[key]).is_absolute():
            raise ValueError(f'{key} must be absolute')
    if config['branch'] not in ('dev', 'main'):
        raise ValueError('branch must be dev or main')
    for key in ('project', 'network', 'compose_id'):
        if not re.fullmatch(r'[A-Za-z0-9_-]+', config[key]):
            raise ValueError(f'invalid {key}')
    if not config['public_origin'].startswith('https://'):
        raise ValueError('public_origin must use HTTPS')
    return config
