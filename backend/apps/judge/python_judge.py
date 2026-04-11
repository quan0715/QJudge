"""Backward-compatibility shim: PythonJudge → IOJudge('python')."""
from .io_judge import IOJudge


class PythonJudge(IOJudge):
    def __init__(self) -> None:
        super().__init__("python")
