"""
Unified IO-comparison judge for all supported languages.

Each language uses the same Docker image (DOCKER_IMAGE_JUDGE) which must have
g++, gcc, python3, and java installed.  Verdict is determined by comparing
stdout against expected_output after stripping trailing whitespace.

To add a new language with IO-comparison semantics, register a LangSpec here.
For non-IO judging (special judge, checker, etc.) create a separate judge class.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass
from threading import Event, Timer
from typing import Any, Dict, Optional

import docker
from django.conf import settings

_CE_SENTINEL = "QJUDGE_CE_7f3a"
_SETUP_ERROR_SENTINEL = "QJUDGE_SETUP_ERROR_7f3a"
_RESOURCE_SENTINEL = "\nQJUDGE_RESOURCES_7f3a "
_PUBLIC_SYSTEM_ERROR = "Judge system error"
_OUTPUT_LIMIT_BYTES = 1024 * 1024
_COMPILE_TIMEOUT_SECONDS = 30
_SESSION_SECONDS = 3600
_BUILD_DIR = "/tmp/build"
_RUN_DIR = "/tmp/run"
# Not the image's judge user (1001), which owns the build.
_SANDBOX_UID = 1002
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LangSpec:
    filename: str
    compile_cmd: Optional[str]
    run_cmd: str


_LANG_SPECS: dict[str, LangSpec] = {
    "cpp": LangSpec(
        filename="main.cpp",
        compile_cmd="g++ -O2 -std=c++20 -o main main.cpp",
        run_cmd="/tmp/build/main",
    ),
    "c": LangSpec(
        filename="main.c",
        compile_cmd="gcc -O2 -std=c11 -lm -o main main.c",
        run_cmd="/tmp/build/main",
    ),
    "python": LangSpec(
        filename="main.py",
        compile_cmd=None,
        run_cmd="python3 /tmp/build/main.py",
    ),
    "java": LangSpec(
        filename="Main.java",
        compile_cmd="javac Main.java",
        run_cmd="java -Xmx{mem}m -Xms32m -cp /tmp/build Main",
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

    One instance judges one submission or test run: the first ``execute`` starts
    a container and compiles once, and every case runs in that container.  Use
    it as a context manager (or call ``close``) so the container is removed.
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
        self._session_key = None
        self._compile_error: Optional[Dict[str, Any]] = None

    def __enter__(self) -> "IOJudge":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def close(self) -> None:
        container, self._container = self._container, None
        self._session_key = None
        self._compile_error = None
        if container is not None:
            with suppress(Exception):
                container.remove(force=True)

    def execute(
        self,
        code: str,
        input_data: str,
        expected_output: str,
        time_limit: int,
        memory_limit: int,
    ) -> Dict[str, Any]:
        try:
            self._ensure_docker_client()
            error = self._prepare(code, memory_limit)
            if error:
                return dict(error)
            result = self._exec(
                self._build_run_cmd(input_data, time_limit, memory_limit),
                timeout=time_limit / 1000.0 + 2.0,
                user="0",
            )
            return self._interpret(result, expected_output, time_limit)
        except Exception:
            logger.exception("Judge infrastructure failure")
            return {"status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _heredoc(target_file: str, content: str, prefix: str) -> str:
        delimiter = f"{prefix}_{uuid.uuid4().hex}"
        while delimiter in content:
            delimiter = f"{prefix}_{uuid.uuid4().hex}"
        return f"cat > {target_file} <<'{delimiter}'\n{content}\n{delimiter}"

    def _prepare(self, code: str, memory_limit: int) -> Optional[Dict[str, Any]]:
        key = (code, memory_limit)
        if key == self._session_key:
            return self._compile_error
        self.close()
        self._container = self._start_container(memory_limit)
        # The build belongs to the image's judge user; cases run as another uid,
        # so a student program cannot alter what later cases execute.
        parts = [
            f"mkdir {_BUILD_DIR} && cd {_BUILD_DIR} || exit 125",
            self._heredoc(self._spec.filename, code, "CODE"),
        ]
        if self._spec.compile_cmd:
            parts += [
                f"{self._spec.compile_cmd} > /tmp/compile_out.txt 2>&1",
                "COMPILE_EXIT=$?",
                "if [ $COMPILE_EXIT -ne 0 ]; then",
                f"  echo '{_CE_SENTINEL}'",
                "  cat /tmp/compile_out.txt",
                "  exit $COMPILE_EXIT",
                "fi",
            ]
        result = self._exec("\n".join(parts), timeout=_COMPILE_TIMEOUT_SECONDS)
        error = None
        if result["exit_code"] == 124 or result.get("output_limit_exceeded"):
            error = {
                "status": "CE", "output": "", "time": 0, "memory": 0,
                "error": "Compilation time limit exceeded" if result["exit_code"] == 124
                else "Compiler output limit exceeded (1 MiB)",
            }
        elif result["exit_code"] != 0:
            verdict = self._interpret(result, "", 0)
            # Anything but a compiler diagnostic is an infrastructure failure,
            # not the student's runtime error.
            error = verdict if verdict["status"] == "CE" else {
                "status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR,
                "time": 0, "memory": 0,
            }
        if error:
            self.close()
        self._session_key = key
        self._compile_error = error
        return error

    def _build_run_cmd(self, input_data: str, time_limit: int, memory_limit: int) -> str:
        timeout_s = time_limit / 1000.0 + 0.5
        run_cmd = self._spec.run_cmd.format(mem=memory_limit)
        uid = _SANDBOX_UID
        return "\n".join([
            # Reset what the previous case left behind: System V IPC (only its
            # owner may remove it) and every writable path except the build.
            f"setpriv --reuid={uid} --regid={uid} --clear-groups ipcrm -a >/dev/null 2>&1",
            f"find /tmp /dev/shm -mindepth 1 ! -path {_BUILD_DIR} ! -path '{_BUILD_DIR}/*' -delete >/dev/null 2>&1",
            f"install -d -o {uid} -g {uid} {_RUN_DIR} && cd {_RUN_DIR} || "
            f"{{ echo '{_SETUP_ERROR_SENTINEL}'; exit 125; }}",
            self._heredoc("input.txt", input_data, "INPUT"),
            f"LC_ALL=C HOME={_RUN_DIR} /usr/bin/time -q -f '{_RESOURCE_SENTINEL}%e %M' "
            f"timeout {timeout_s:.3f}s setpriv --reuid={uid} --regid={uid} --clear-groups "
            f"{run_cmd} < input.txt 2>&1",
            # Leftover background processes would hold the output stream open
            # and carry into the next case.
            "STATUS=$?",
            "kill -9 -1 >/dev/null 2>&1",
            "exit $STATUS",
        ])

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
            # PID 1 reaps orphaned student processes. It exits on its own (and
            # auto_remove deletes the container) if the worker dies before close().
            "command": [
                "/bin/bash", "-c",
                f"end=$((SECONDS+{_SESSION_SECONDS})); "
                "while [ $SECONDS -lt $end ]; do sleep 5 & wait $!; done",
            ],
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

    def _exec(self, command: str, timeout: float, *, user: str = "") -> Dict[str, Any]:
        api = self._client.api
        container = self._container
        stream = None
        deadline = None
        timed_out = Event()
        try:
            exec_id = api.exec_create(
                container.id, ["/bin/bash", "-c", command], user=user, workdir="/tmp",
            )["Id"]
            stream = api.exec_start(exec_id, stream=True)

            def expire():
                timed_out.set()
                with suppress(docker.errors.APIError):
                    container.kill()

            deadline = Timer(timeout + 5, expire)
            deadline.daemon = True
            deadline.start()
            output = bytearray()
            output_limit_exceeded = False
            for chunk in stream:
                # Reserve space for GNU time's trailer before checking program output.
                remaining = _OUTPUT_LIMIT_BYTES + 256 - len(output)
                output.extend(chunk[:remaining])
                if len(chunk) > remaining:
                    output_limit_exceeded = True
                    break
            deadline.cancel()
            if timed_out.is_set() or output_limit_exceeded:
                # The process may still be running; drop the whole container and
                # let the next case start (and compile) a fresh one.
                self.close()
                exit_code = 124 if timed_out.is_set() else 137
            else:
                exit_code = self._exit_code(api, exec_id)
            decoded = output.decode("utf-8", errors="ignore")
            elapsed_ms, memory_kb = 0, 0
            if _RESOURCE_SENTINEL in decoded and not output_limit_exceeded:
                decoded, _, resources = decoded.rpartition(_RESOURCE_SENTINEL)
                seconds, memory = resources.split()
                elapsed_ms, memory_kb = round(float(seconds) * 1000), int(memory)
            output_limit_exceeded |= len(decoded.encode("utf-8")) > _OUTPUT_LIMIT_BYTES
            return {
                "exit_code": exit_code,
                "output": decoded,
                "output_limit_exceeded": output_limit_exceeded,
                "time": elapsed_ms,
                "memory": memory_kb,
            }
        except Exception:
            logger.exception("Judge container failure")
            self.close()
            return {"exit_code": -1, "output": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}
        finally:
            if deadline:
                deadline.cancel()
            if stream:
                with suppress(Exception):
                    stream.close()

    @staticmethod
    def _exit_code(api, exec_id) -> int:
        # The output stream can end a moment before Docker records the exit.
        for _ in range(100):
            info = api.exec_inspect(exec_id)
            if not info["Running"]:
                return info["ExitCode"]
            time.sleep(0.01)
        raise RuntimeError("Judge exec did not finish")

    def _interpret(
        self,
        result: Dict[str, Any],
        expected_output: str,
        time_limit: int,
    ) -> Dict[str, Any]:
        exit_code = result["exit_code"]
        output = result["output"]
        elapsed = result["time"]
        memory = result["memory"]

        if exit_code == -1 or (exit_code == 125 and output.startswith(_SETUP_ERROR_SENTINEL)):
            return {"status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}

        if result.get("output_limit_exceeded"):
            return {"status": "RE", "output": output[:1000], "error": "Output limit exceeded (1 MiB)", "time": elapsed, "memory": memory}

        if output.startswith(_CE_SENTINEL):
            error_detail = output[len(_CE_SENTINEL):].strip()
            return {"status": "CE", "output": "", "error": error_detail[:2000], "time": 0, "memory": 0}

        if exit_code == 124:
            return {"status": "TLE", "output": output[:1000], "error": f"Time Limit Exceeded (>{time_limit}ms)", "time": elapsed, "memory": memory}

        if exit_code != 0:
            return {"status": "RE", "output": output[:1000], "error": f"Runtime Error (exit code: {exit_code})", "time": elapsed, "memory": memory}

        actual = output.strip()
        expected = expected_output.strip()
        if actual == expected:
            return {"status": "AC", "output": actual[:1000], "error": "", "time": elapsed, "memory": memory}
        return {"status": "WA", "output": actual[:1000], "error": "Wrong Answer", "time": elapsed, "memory": memory}
