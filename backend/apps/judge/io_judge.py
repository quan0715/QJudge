"""
Unified IO-comparison judge for all supported languages.

Each language uses the same Docker image (DOCKER_IMAGE_JUDGE) which must have
g++, gcc, python3, and java installed.  Verdict is determined by comparing
stdout against expected_output after stripping trailing whitespace.

A submission or test run gets one container and one ``docker exec`` of
runner.py, which compiles once and then runs every case in turn.

To add a new language with IO-comparison semantics, register a LangSpec here.
For non-IO judging (special judge, checker, etc.) create a separate judge class.
"""
from __future__ import annotations

import json
import logging
import socket
from contextlib import closing, suppress
from dataclasses import dataclass
from pathlib import Path
from threading import Thread, Timer
from typing import Any, Dict, Iterator, Optional, Sequence, Tuple

import docker
from django.conf import settings
from docker.utils.socket import STDERR, frames_iter

_RUNNER = Path(__file__).with_name("runner.py").read_text(encoding="utf-8")
_PUBLIC_SYSTEM_ERROR = "Judge system error"
_COMPILE_TIMEOUT_SECONDS = 30
_SESSION_SECONDS = 3600
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LangSpec:
    filename: str
    compile_cmd: Optional[Tuple[str, ...]]
    run_cmd: Tuple[str, ...]


_LANG_SPECS: dict[str, LangSpec] = {
    "cpp": LangSpec(
        filename="main.cpp",
        # The judge image precompiles bits/stdc++.h with exactly these flags.
        compile_cmd=("g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"),
        run_cmd=("/tmp/build/main",),
    ),
    "c": LangSpec(
        filename="main.c",
        compile_cmd=("gcc", "-O2", "-std=c11", "-lm", "-o", "main", "main.c"),
        run_cmd=("/tmp/build/main",),
    ),
    "python": LangSpec(
        filename="main.py",
        compile_cmd=None,
        run_cmd=("python3", "/tmp/build/main.py"),
    ),
    "java": LangSpec(
        filename="Main.java",
        compile_cmd=("javac", "Main.java"),
        run_cmd=("java", "-Xmx{mem}m", "-Xms32m", "-cp", "/tmp/build", "Main"),
    ),
}

_ALIASES: dict[str, str] = {
    "c++":     "cpp",
    "py":      "python",
    "python3": "python",
}


def resolve_language(language: str) -> str:
    """Normalise a raw language string to a canonical key in _LANG_SPECS."""
    key = language.lower().strip()
    return _ALIASES.get(key, key)


class IOJudge:
    """
    Docker-based judge for languages with standard IO comparison.
    All languages run inside the same image (DOCKER_IMAGE_JUDGE).

    One instance judges one submission or test run: ``run`` starts a container
    that compiles once and runs every case.  Use it as a context manager (or
    call ``close``) so the container is removed.
    """

    def __init__(self, language: str) -> None:
        canon = resolve_language(language)
        if canon not in _LANG_SPECS:
            supported = ", ".join(sorted(_LANG_SPECS))
            raise ValueError(
                f"Unsupported language: '{language}'. Supported: {supported}"
            )
        self._language = canon
        self._spec = _LANG_SPECS[canon]
        self.image = settings.DOCKER_IMAGE_JUDGE
        self.platform = settings.DOCKER_JUDGE_PLATFORM
        self.pids_limit = settings.DOCKER_JUDGE_PIDS_LIMIT
        self.tmpfs_size = settings.DOCKER_JUDGE_TMPFS_SIZE
        self.docker_timeout = settings.DOCKER_JUDGE_TIMEOUT
        self._client: Optional[docker.DockerClient] = None
        self._container = None

    def __enter__(self) -> "IOJudge":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def close(self) -> None:
        container, self._container = self._container, None
        if container is not None:
            with suppress(Exception):
                container.remove(force=True)

    def run(
        self,
        code: str,
        cases: Sequence[Tuple[str, str]],
        time_limit: int,
        memory_limit: int,
    ) -> Iterator[Dict[str, Any]]:
        """
        Yield the verdict of each ``(input, expected output)`` case, in order,
        as soon as it is judged.  The sequence stops after a CE or SE verdict.

        time_limit bounds each case's CPU time.  Its wall-clock time may reach
        twice that plus a second, so CPU contention between concurrent judges
        does not turn a solution near the limit into TLE.
        """
        if not cases:
            return
        judged = 0
        try:
            self._ensure_docker_client()
            self.close()
            self._container = self._start_container(memory_limit)
            with closing(self._records(code, cases, time_limit, memory_limit)) as records:
                build = next(records, None)
                if build is not None and (build["exit"] or build["timeout"]):
                    yield self._compile_error(build)
                    return
                if build is not None:
                    for (_, expected_output), record in zip(cases, records):
                        yield self._interpret(record, expected_output, time_limit)
                        judged += 1
            if judged == len(cases):
                return
            logger.error("Judge runner stopped after %s of %s cases", judged, len(cases))
        except Exception:
            logger.exception("Judge infrastructure failure")
        yield {"status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _records(
        self,
        code: str,
        cases: Sequence[Tuple[str, str]],
        time_limit: int,
        memory_limit: int,
    ) -> Iterator[Dict[str, Any]]:
        """Run runner.py once; yield its build record, then one per case."""
        wall_limit = 2 * time_limit + 1000
        config = {
            "source": self._spec.filename,
            "compile": self._spec.compile_cmd,
            "run": [part.format(mem=memory_limit) for part in self._spec.run_cmd],
            "compile_seconds": _COMPILE_TIMEOUT_SECONDS,
            "time_limit": time_limit,
            "wall_limit": wall_limit,
            "cases": len(cases),
        }
        api = self._client.api
        container = self._container
        exec_id = api.exec_create(
            container.id, ["python3", "-I", "-S", "-c", _RUNNER, json.dumps(config)],
            stdin=True, user="0", workdir="/tmp",
        )["Id"]
        stream = api.exec_start(exec_id, socket=True)
        sock = getattr(stream, "_sock", stream)
        sock.settimeout(None)

        def expire():
            with suppress(docker.errors.APIError):
                container.kill()

        # The runner enforces every limit itself; this only stops a stuck one.
        deadline = Timer(
            _COMPILE_TIMEOUT_SECONDS + len(cases) * (wall_limit / 1000 + 1) + 10, expire,
        )
        deadline.daemon = True
        deadline.start()
        Thread(target=self._send, args=(sock, code, cases), daemon=True).start()
        try:
            yield from self._parse(frames_iter(stream, tty=False))
        finally:
            deadline.cancel()
            with suppress(OSError):
                sock.shutdown(socket.SHUT_RDWR)
            stream.close()
            sock.close()

    @staticmethod
    def _send(sock, code: str, cases: Sequence[Tuple[str, str]]) -> None:
        """Stream the source and every input; the runner reads them as it goes."""
        with suppress(OSError):
            for text in [code, *(case_input for case_input, _ in cases)]:
                data = text.encode()
                sock.sendall(b"%d\n" % len(data))
                sock.sendall(data)

    @staticmethod
    def _parse(frames) -> Iterator[Dict[str, Any]]:
        """Split the runner's stdout into records and log its stderr."""
        pending, errors = bytearray(), bytearray()
        for stream, data in frames:
            if stream == STDERR:
                errors += data
                continue
            pending += data
            while (newline := pending.find(b"\n")) >= 0:
                record = json.loads(pending[:newline])
                end = newline + 1 + record["size"]
                if len(pending) < end:
                    break
                record["output"] = pending[newline + 1:end].decode("utf-8", errors="ignore")
                del pending[:end]
                yield record
        if errors:
            logger.error("Judge runner failed: %s", errors.decode("utf-8", errors="replace")[-4000:])

    def _ensure_docker_client(self) -> None:
        if self._client is not None:
            return
        try:
            client = docker.DockerClient(timeout=self.docker_timeout)
            client.ping()
            client.images.get(self.image)
            self._client = client
        except docker.errors.ImageNotFound:
            raise RuntimeError(
                f"Judge image '{self.image}' not found. "
                f"Build it with: docker build -t {self.image} "
                f"-f backend/judge/Dockerfile.judge backend/judge"
            )
        except docker.errors.DockerException as exc:
            raise RuntimeError(f"Cannot connect to Docker: {exc}") from exc

    def _start_container(self, memory_limit: int):
        security_opts = ["no-new-privileges"]
        if settings.DOCKER_SECCOMP_PROFILE:
            import os
            profile = settings.DOCKER_SECCOMP_PROFILE
            if not os.path.isabs(profile):
                profile = os.path.join(settings.BASE_DIR, profile)
            if os.path.exists(profile):
                with open(profile, encoding="utf-8") as profile_file:
                    security_opts.append(f"seccomp={profile_file.read()}")

        run_kwargs = {
            "image": self.image,
            # PID 1 only keeps the container up; the runner reaps the cases'
            # processes. It exits on its own (and auto_remove deletes the
            # container) if the worker dies before close().
            "command": ["sleep", str(_SESSION_SECONDS)],
            "working_dir": "/tmp",
            "network_disabled": True,
            "read_only": True,
            "auto_remove": True,
            "mem_limit": f"{memory_limit}m",
            "memswap_limit": f"{memory_limit}m",
            "cpu_period": 100_000,
            "cpu_quota": 100_000,
            "pids_limit": self.pids_limit,
            "cap_drop": [
                "NET_ADMIN", "SYS_ADMIN", "SYS_BOOT", "SYS_MODULE",
                "SYS_RAWIO", "SYS_PTRACE", "SYS_TIME", "MAC_ADMIN",
                "MAC_OVERRIDE", "NET_RAW", "AUDIT_WRITE", "AUDIT_CONTROL",
            ],
            "security_opt": security_opts,
            "tmpfs": {"/tmp": f"size={self.tmpfs_size},mode=1777,exec"},
            "log_config": docker.types.LogConfig(type="none"),
        }
        if self.platform:
            run_kwargs["platform"] = self.platform

        container = self._client.containers.create(**run_kwargs)
        try:
            container.start()
        except Exception:
            with suppress(Exception):
                container.remove(force=True)
            raise
        return container

    @staticmethod
    def _compile_error(build: Dict[str, Any]) -> Dict[str, Any]:
        if build["timeout"]:
            error = "Compilation time limit exceeded"
        elif build["ole"]:
            error = "Compiler output limit exceeded (1 MiB)"
        else:
            error = build["output"].strip()[:2000]
        return {"status": "CE", "output": "", "error": error, "time": 0, "memory": 0}

    @staticmethod
    def _interpret(
        record: Dict[str, Any],
        expected_output: str,
        time_limit: int,
    ) -> Dict[str, Any]:
        exit_code = record["exit"]
        output = record["output"]
        elapsed = record["time"]
        memory = record["memory"]

        if record["ole"]:
            return {"status": "RE", "output": output[:1000], "error": "Output limit exceeded (1 MiB)", "time": elapsed, "memory": memory}

        if record["tle"]:
            return {"status": "TLE", "output": output[:1000], "error": f"Time Limit Exceeded (>{time_limit}ms)", "time": elapsed, "memory": memory}

        if exit_code != 0:
            return {"status": "RE", "output": output[:1000], "error": f"Runtime Error (exit code: {exit_code})", "time": elapsed, "memory": memory}

        actual = output.strip()
        expected = expected_output.strip()
        if actual == expected:
            return {"status": "AC", "output": actual[:1000], "error": "", "time": elapsed, "memory": memory}
        return {"status": "WA", "output": actual[:1000], "error": "Wrong Answer", "time": elapsed, "memory": memory}
