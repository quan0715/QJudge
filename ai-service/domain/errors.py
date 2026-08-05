"""Domain errors that do not depend on a delivery mechanism."""

from __future__ import annotations

from .models import RunStatus


class InvalidRunTransition(ValueError):
    """Raised when a run is asked to move outside its state machine."""

    def __init__(self, source: RunStatus, target: RunStatus) -> None:
        self.source = source
        self.target = target
        super().__init__(f"Cannot transition run from {source} to {target}")
