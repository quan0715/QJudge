"""Guard the installed broker dependencies against worker startup failures."""

import pytest
from kombu.transport.redis import Channel
from redis import Redis


@pytest.mark.parametrize("keyprefix", ["", "qjudge-ai:"])
def test_installed_dependencies_can_create_redis_transport_client(keyprefix):
    # Exercise the same client factory used at worker startup without opening
    # a broker connection. Importing Celery alone misses version mismatches.
    channel = Channel.__new__(Channel)
    channel.global_keyprefix = keyprefix
    client = channel._get_client()()
    try:
        assert isinstance(client, Redis)
    finally:
        client.close()
