"""Keep reset secrets out of application request logs."""
import logging
import re

RESET_PATH = re.compile(r'(/api/v1/auth/password/resets/)[^\s?"\']+')


class ResetTokenRedactionFilter(logging.Filter):
    def filter(self, record):
        record.msg = RESET_PATH.sub(r'\1[redacted]', record.getMessage())
        record.args = ()
        return True


def install_reset_log_redaction():
    for name in ('qjudge.requests', 'django.request', 'django.server'):
        logger = logging.getLogger(name)
        if not any(isinstance(item, ResetTokenRedactionFilter) for item in logger.filters):
            logger.addFilter(ResetTokenRedactionFilter())
