"""Locust entrypoint for paper-exam scenario (no coding submissions)."""
from users.paper_exam import PaperExamUser  # noqa: F401
from safety import enforce_safety_limits  # noqa: F401
