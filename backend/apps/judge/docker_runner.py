"""Backward-compatibility shim: CppJudge → IOJudge('cpp')."""
from .io_judge import IOJudge


class CppJudge(IOJudge):
    def __init__(self) -> None:
        super().__init__("cpp")
