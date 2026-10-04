"""Atomic fixed-window limits for anonymous password recovery."""
import logging
import time
from django.core.cache import cache
from django.utils.crypto import salted_hmac
from rest_framework.throttling import BaseThrottle

logger = logging.getLogger('qjudge.auth')


class PasswordRecoveryThrottle(BaseThrottle):
    request_limit = 10
    window = 15 * 60

    def allow_request(self, request, view):
        # The shipped nginx configuration replaces X-Forwarded-For with the
        # trusted client address. Never expose the backend directly to clients.
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', 'unknown')).split(',')[-1].strip()
        checks = [('ip', ip, self.request_limit, self.window)]
        if getattr(view, 'limit_identifier', False):
            identifier = request.data.get('identifier', '') if isinstance(request.data, dict) else ''
            checks.append(('identifier', str(identifier).strip().casefold(), 3, 3600))
        self.retry_after = 0
        for kind, identity, limit, seconds in checks:
            fingerprint = salted_hmac('password-reset-throttle', identity).hexdigest()
            bucket = int(time.time()) // seconds
            key = f'password-reset:{kind}:{fingerprint}:{bucket}'
            if cache.add(key, 1, timeout=seconds + 1):
                count = 1
            else:
                try:
                    count = cache.incr(key)
                except ValueError:
                    # An expiring counter must not fail open.
                    count = limit + 1
            if count > limit:
                self.retry_after = max(self.retry_after, seconds - int(time.time()) % seconds)
                logger.warning('password_reset_throttled scope=%s fingerprint=%s', kind, fingerprint)
        return self.retry_after == 0

    def wait(self):
        return self.retry_after
