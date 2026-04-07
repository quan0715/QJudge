from django.db import connection
from django.http import JsonResponse


def health_check(request):
    """Lightweight liveness + readiness probe for Docker / load balancer."""
    try:
        connection.ensure_connection()
    except Exception:
        return JsonResponse({"status": "unhealthy", "db": False}, status=503)
    return JsonResponse({"status": "ok", "db": True})
