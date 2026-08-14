"""ASGI config for the QJudge backend."""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# AI chat uses persisted SSE through the compatibility BFF.  There are no
# active Django-owned WebSocket routes.
application = get_asgi_application()
