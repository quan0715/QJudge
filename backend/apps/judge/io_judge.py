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
import uuid
from contextlib import suppress
from dataclasses import dataclass
from threading import Event, Timer
from typing import Any, Dict, Optional

import docker
from django.conf import settings

_CE_SENTINEL = "QJUDGE_CE_7f3a"
_RESOURCE_SENTINEL = "\nQJUDGE_RESOURCES_7f3a "
_PUBLIC_SYSTEM_ERROR = "Judge system error"
_OUTPUT_LIMIT_BYTES = 1024 * 1024
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LangSpec:
    name: str
    version: str
    filename: str
    compile_cmd: Optional[str]
    run_cmd: str


_LANG_SPECS: dict[str, LangSpec] = {
    "cpp": LangSpec(
        name="C++",
        version="C++20",
        filename="main.cpp",
        compile_cmd="g++ -O2 -std=c++20 -o main main.cpp",
        run_cmd="./main",
    ),
    "c": LangSpec(
        name="C",
        version="C11",
        filename="main.c",
        compile_cmd="gcc -O2 -std=c11 -lm -o main main.c",
        run_cmd="./main",
    ),
    "python": LangSpec(
        name="Python",
        version="Python 3.11",
        filename="main.py",
        compile_cmd=None,
        run_cmd="python3 main.py",
    ),
    "java": LangSpec(
        name="Java",
        version="Java 17",
        filename="Main.java",
        compile_cmd="javac Main.java",
        run_cmd="java -Xmx{mem}m -Xms32m Main",
    ),
}

SUPPORTED_LANGUAGES = [
    {"id": "cpp",    "name": "C++",    "display_name": "C++ (C++20)",      "aliases": ["cpp", "c++"]},
    {"id": "c",      "name": "C",      "display_name": "C (C11)",           "aliases": ["c"]},
    {"id": "python", "name": "Python", "display_name": "Python 3.11",       "aliases": ["python", "py", "python3"]},
    {"id": "java",   "name": "Java",   "display_name": "Java 17",           "aliases": ["java"]},
]

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

    def get_language_name(self) -> str:
        return self._spec.name

    def get_language_version(self) -> str:
        return self._spec.version

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
            cmd = self._build_full_cmd(code, input_data, time_limit, memory_limit)
            result = self._run_in_container(
                cmd,
                timeout=time_limit / 1000.0 + 2.0,
                mem_limit=memory_limit,
            )
            return self._interpret(result, expected_output, time_limit)
        except RuntimeError:
            logger.exception("Judge runtime infrastructure failure")
            return {"status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}
        except docker.errors.DockerException:
            logger.exception("Judge Docker infrastructure failure")
            return {"status": "SE", "output": "", "error": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}
        except Exception:
            logger.exception("Unexpected judge infrastructure failure")
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

    def _build_full_cmd(
        self,
        code: str,
        input_data: str,
        time_limit: int,
        memory_limit: int,
    ) -> str:
        spec = self._spec
        parts: list[str] = []

        parts.append(self._heredoc(spec.filename, code, "CODE"))

        if spec.compile_cmd:
            compile_cmd = spec.compile_cmd
            parts.append(
                f"{compile_cmd} > /tmp/compile_out.txt 2>&1\n"
                f"COMPILE_EXIT=$?\n"
                f"if [ $COMPILE_EXIT -ne 0 ]; then\n"
                f"    echo '{_CE_SENTINEL}'\n"
                f"    cat /tmp/compile_out.txt\n"
                f"    exit $COMPILE_EXIT\n"
                f"fi"
            )

        parts.append(self._heredoc("input.txt", input_data, "INPUT"))

        timeout_s = time_limit / 1000.0 + 0.5
        run_cmd = spec.run_cmd.format(mem=memory_limit)
        parts.append(
            f"LC_ALL=C /usr/bin/time -q -f '{_RESOURCE_SENTINEL}%e %M' "
            f"timeout {timeout_s:.3f}s {run_cmd} < input.txt 2>&1"
        )

        return "\n\n".join(parts)

    def _ensure_docker_client(self) -> None:
        if self._client is not None:
            return
        kwargs: dict[str, Any] = {"timeout": self.docker_timeout}
        try:
            client = docker.DockerClient(**kwargs)
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

    def _run_in_container(
        self, command: str, timeout: float, mem_limit: int
    ) -> Dict[str, Any]:
        container = None
        stream = None
        deadline = None
        try:
            security_opts = ["no-new-privileges"]
            if settings.DOCKER_SECCOMP_PROFILE:
                import os
                profile = settings.DOCKER_SECCOMP_PROFILE
                if not os.path.isabs(profile):
                    profile = os.path.join(settings.BASE_DIR, profile)
                if os.path.exists(profile):
                    security_opts.append(f"seccomp={profile}")

            run_kwargs = {
                "image": self.image,
                "command": ["/bin/bash", "-c", command],
                "working_dir": "/tmp",
                "network_disabled": True,
                "mem_limit": f"{mem_limit}m",
                "memswap_limit": f"{mem_limit}m",
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
            # Attach before starting so even fast writers cannot lose the prefix.
            stream = container.attach(stdout=True, stderr=True, stream=True)
            timed_out = Event()

            def expire():
                timed_out.set()
                with suppress(docker.errors.APIError):
                    container.kill()

            container.start()
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
                    with suppress(docker.errors.APIError):
                        container.kill()
                    break
            result = container.wait(timeout=5)
            deadline.cancel()
            decoded = output.decode("utf-8", errors="ignore")
            elapsed_ms, memory_kb = 0, 0
            if _RESOURCE_SENTINEL in decoded and not output_limit_exceeded:
                decoded, _, resources = decoded.rpartition(_RESOURCE_SENTINEL)
                seconds, memory = resources.split()
                elapsed_ms, memory_kb = round(float(seconds) * 1000), int(memory)
            output_limit_exceeded |= len(decoded.encode("utf-8")) > _OUTPUT_LIMIT_BYTES
            return {
                "exit_code": 124 if timed_out.is_set() else result["StatusCode"],
                "output": decoded,
                "output_limit_exceeded": output_limit_exceeded,
                "time": elapsed_ms,
                "memory": memory_kb,
            }
        except docker.errors.APIError:
            logger.exception("Judge container API failure")
            return {"exit_code": -1, "output": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}
        except Exception:
            logger.exception("Unexpected judge container failure")
            return {"exit_code": -1, "output": _PUBLIC_SYSTEM_ERROR, "time": 0, "memory": 0}
        finally:
            if deadline:
                deadline.cancel()
            if stream:
                with suppress(Exception):
                    stream.close()
            if container:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

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

        if exit_code == -1:
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
