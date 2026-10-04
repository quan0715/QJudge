from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'
    verbose_name = '使用者管理'

    def ready(self):
        import apps.users.signals  # noqa: F401
        from .security_logging import install_reset_log_redaction
        install_reset_log_redaction()
