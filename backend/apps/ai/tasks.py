"""Celery tasks for durable AI chat runs."""

from celery import shared_task

from .services.run_runtime import execute_run


@shared_task(bind=True, ignore_result=True)
def execute_ai_chat_run(self, run_id: str) -> None:
    """Execute a durable AI chat run independently of frontend connections."""
    execute_run(run_id)
