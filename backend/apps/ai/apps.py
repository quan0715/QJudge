from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai"
    verbose_name = "AI Chat"

    def ready(self) -> None:
        # Import side-effect: registers pre_delete handler for AIArtifact.
        from . import signals  # noqa: F401
