"""Fresh-install browser tests: real Celery delivery to the CI-only SMTP inbox."""
from .test import *

PASSWORD_RESET_ENABLED = True
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'mailpit'
EMAIL_PORT = 1025
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False
EMAIL_HOST_USER = ''
EMAIL_HOST_PASSWORD = ''
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = 'QJudge <noreply@qjudge.test>'
