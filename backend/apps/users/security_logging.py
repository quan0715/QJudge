"""Keep reset secrets out of application request logs."""
import logging
import re

RESET_PATH = re.compile(r'(/api/v1/auth/password/resets/)[^\s?"\']+')


class ResetTokenRedactionFilter(logging.Filter):
    def filter(self, record):
        if record.name == 'uvicorn.access' and isinstance(record.args, tuple):
            # Uvicorn's AccessFormatter unpacks its native five arguments.
            record.args = tuple(RESET_PATH.sub(r'\1[redacted]', value) if isinstance(value, str) else value
                                for value in record.args)
            return True
        record.msg = RESET_PATH.sub(r'\1[redacted]', record.getMessage())
        record.args = ()
        return True


def install_reset_log_redaction():
    for name in ('qjudge.requests', 'django.request', 'django.server', 'uvicorn.access'):
        logger = logging.getLogger(name)
        if not any(isinstance(item, ResetTokenRedactionFilter) for item in logger.filters):
            logger.addFilter(ResetTokenRedactionFilter())
