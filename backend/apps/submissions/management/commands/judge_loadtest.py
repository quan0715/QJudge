"""
Judge throughput load test.

Submits in bulk straight to the judge queue (no HTTP, no exam flow), waits for
every verdict and reports latency, throughput and host load. Everything it
creates belongs to the user `lt_judge` and a problem no student can see, so
`cleanup` removes it. Run it in the celery service: it needs the Docker socket
to count judge containers, and /proc there shows the host's load and memory.

    python manage.py judge_loadtest seed [--cases 100]
    python manage.py judge_loadtest seed --source-problem <uuid> --ac-code solution.cpp
    python manage.py judge_loadtest run --count 60 [--per-minute 30 | --sequential] [--out result.json]
    python manage.py judge_loadtest cleanup

`seed --source-problem` copies the test cases and limits of a real problem; the
AC code must solve it. WA submissions run that same solution
and print an extra line, CE submissions do not compile.
"""
import json
import random
import threading
import time
from datetime import timedelta

import docker
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.problems.models import CodingProblem, LanguageConfig, TestCase
from apps.submissions.models import Submission
from apps.submissions.tasks import judge_submission

USERNAME = "lt_judge"
SLUG = "lt-judge-loadtest"
DONE = {"AC", "WA", "TLE", "MLE", "RE", "CE", "KR", "SE"}
SUM_SOLUTION = (
    "#include <cstdio>\n"
    "int main(){int n;long long s=0,x;scanf(\"%d\",&n);"
    "while(n--){scanf(\"%lld\",&x);s+=x;}printf(\"%lld\\n\",s);}\n"
)


def wrong_answer(ac_code):
    # Runs the whole solution, then a static destructor adds a line at exit.
    return ac_code + (
        "\n#include <cstdio>\n"
        "static struct QjudgeLtWrongAnswer { ~QjudgeLtWrongAnswer() { std::puts(\"qjudge-lt-wa\"); } }"
        " qjudge_lt_wrong_answer;\n"
    )


def percentile(values, q):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


class HostSampler(threading.Thread):
    """Every 5 seconds: host load, available memory and running judge containers."""

    def __init__(self):
        super().__init__(daemon=True)
        self.samples = []
        self.halt = threading.Event()
        try:
            self.client = docker.DockerClient(timeout=10)
        except docker.errors.DockerException:
            self.client = None

    def run(self):
        while True:
            self.sample()
            if self.halt.wait(5):
                return

    def stop(self):
        self.halt.set()
        self.join()
        self.sample()
        return self.samples

    def sample(self):
        try:
            with open("/proc/loadavg") as handle:
                load1 = float(handle.read().split()[0])
            with open("/proc/meminfo") as handle:
                meminfo = dict(line.split(":", 1) for line in handle)
            available = int(meminfo["MemAvailable"].split()[0]) // 1024
        except OSError:
            return
        containers = None
        if self.client is not None:
            try:
                containers = len(self.client.containers.list(
                    filters={"ancestor": settings.DOCKER_IMAGE_JUDGE}))
            except docker.errors.DockerException:
                pass
        self.samples.append({
            "time": timezone.now().isoformat(timespec="seconds"), "load1": load1,
            "mem_available_mb": available, "judge_containers": containers,
        })


class Command(BaseCommand):
    help = "Seed, run or clean up the judge throughput load test."

    def add_arguments(self, parser):
        actions = parser.add_subparsers(dest="action", required=True)
        seed = actions.add_parser("seed")
        seed.add_argument("--cases", type=int, default=100, help="synthetic test cases")
        seed.add_argument("--source-problem", help="copy test cases and limits from this problem id")
        seed.add_argument("--ac-code", help="C++ file that solves --source-problem")
        run = actions.add_parser("run")
        run.add_argument("--count", type=int, required=True)
        pace = run.add_mutually_exclusive_group()
        pace.add_argument("--per-minute", type=float, default=0, help="0 submits everything at once")
        pace.add_argument("--sequential", action="store_true", help="wait for each verdict before the next")
        run.add_argument("--mix", default="16,49,35", help="AC,WA,CE weights (2026-10-13 Lab2 by default)")
        run.add_argument("--timeout", type=int, default=1800, help="seconds to wait for verdicts")
        run.add_argument("--out", help="write the report as JSON")
        actions.add_parser("cleanup")

    def handle(self, *args, action, **options):
        getattr(self, action)(**options)

    # ------------------------------------------------------------------
    def seed(self, cases, source_problem, ac_code, **_):
        if CodingProblem.objects.filter(slug=SLUG).exists():
            raise CommandError("Already seeded; run cleanup first.")
        if bool(source_problem) != bool(ac_code):
            raise CommandError("--source-problem and --ac-code go together.")
        user = get_user_model().objects.create_user(
            username=USERNAME, email=f"{USERNAME}@loadtest.invalid", role="student",
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        if source_problem:
            source = CodingProblem.objects.get(pk=source_problem)
            with open(ac_code) as handle:
                solution = handle.read()
            rows = [
                (tc.input_data, tc.output_data, tc.weight_percent)
                for tc in source.test_cases.order_by("order", "id")
            ]
            limits = dict(time_limit=source.time_limit, memory_limit=source.memory_limit)
        else:
            rng = random.Random(0)
            base, remainder = divmod(100, cases)
            rows = []
            for order in range(cases):
                numbers = [rng.randint(-10**6, 10**6) for _ in range(rng.randint(1, 1000))]
                weight = base + (1 if order < remainder else 0)
                rows.append((f"{len(numbers)}\n{' '.join(map(str, numbers))}\n", str(sum(numbers)), weight))
            solution, limits = SUM_SOLUTION, dict(time_limit=1000, memory_limit=256)
        problem = CodingProblem.objects.create(slug=SLUG, created_by=user, **limits)
        LanguageConfig.objects.create(problem=problem, language="cpp", template_code=solution)
        TestCase.objects.bulk_create(
            TestCase(problem=problem, input_data=inp, output_data=out, score=weight,
                     weight_percent=weight, order=order, is_hidden=True)
            for order, (inp, out, weight) in enumerate(rows)
        )
        self.stdout.write(f"Seeded {problem.id} with {len(rows)} test cases.")

    # ------------------------------------------------------------------
    def run(self, count, per_minute, sequential, mix, timeout, out, **_):
        problem = CodingProblem.objects.filter(slug=SLUG).first()
        if problem is None:
            raise CommandError("Run seed first.")
        user = get_user_model().objects.get(username=USERNAME)
        solution = problem.language_configs.get(language="cpp").template_code
        codes = {"AC": solution, "WA": wrong_answer(solution), "CE": "int main( {\n"}
        weights = [float(w) for w in mix.split(",")]
        kinds = random.Random(count).choices(list(codes), weights=weights, k=count)
        concurrency = self.worker_concurrency()
        self.stdout.write(f"Submitting {count} ({mix} AC,WA,CE); worker concurrency {concurrency}.")

        sampler = HostSampler()
        sampler.start()
        expected = {}
        for kind in kinds:
            if self.real_backlog():
                self.stdout.write(self.style.WARNING(
                    "A real submission has waited over 60s; stopped submitting."))
                break
            submission = Submission.objects.create(
                user=user, problem=problem, language="cpp", code=codes[kind],
            )
            judge_submission.apply_async(args=[submission.id], queue="high_priority")
            expected[submission.id] = kind
            if sequential:
                self.wait([submission.id], timeout)
            elif per_minute:
                time.sleep(60 / per_minute)
        if not expected:
            sampler.stop()
            raise CommandError("Nothing was submitted.")
        finished = self.wait(list(expected), timeout)
        time.sleep(5)  # containers are removed just after the verdict is saved
        samples = sampler.stop()

        rows =list(Submission.objects.filter(id__in=expected).values("id", "status", "created_at", "updated_at"))
        latencies = [(r["updated_at"] - r["created_at"]).total_seconds() for r in rows if r["status"] in DONE]
        statuses = {}
        for r in rows:
            statuses[r["status"]] = statuses.get(r["status"], 0) + 1
        span = (max(r["updated_at"] for r in rows) - min(r["created_at"] for r in rows)).total_seconds()
        report = {
            "count": len(rows), "finished": finished, "concurrency": concurrency, "mix": mix,
            "per_minute": per_minute, "sequential": sequential, "statuses": statuses,
            "unexpected": sum(r["status"] != expected[r["id"]] for r in rows),
            "latency_s": latencies and {
                "p50": round(percentile(latencies, .5), 1), "p95": round(percentile(latencies, .95), 1),
                "max": round(max(latencies), 1), "mean": round(sum(latencies) / len(latencies), 1),
            },
            "span_s": round(span, 1),
            "per_minute_done": round(len(latencies) / span * 60, 1) if span else None,
            "host": samples and {
                "load1_max": max(x["load1"] for x in samples),
                "mem_available_min_mb": min(x["mem_available_mb"] for x in samples),
                "judge_containers_max": max(x["judge_containers"] or 0 for x in samples),
                "judge_containers_after": samples[-1]["judge_containers"],
            },
            "submission_ids": sorted(expected),
            "samples": samples,
        }
        hidden = {"submission_ids", "samples"}
        self.stdout.write(json.dumps({k: v for k, v in report.items() if k not in hidden}, indent=2))
        if out:
            with open(out, "w") as handle:
                json.dump(report, handle, indent=2)
        if report["unexpected"] or not finished:
            raise CommandError("Some submissions did not finish with the expected verdict.")
        if samples and samples[-1]["judge_containers"]:
            raise CommandError("Judge containers are still running after every verdict.")

    def wait(self, ids, timeout):
        deadline = time.monotonic() + timeout
        while Submission.objects.filter(id__in=ids).exclude(status__in=DONE).exists():
            if time.monotonic() > deadline:
                return False
            time.sleep(1)
        return True

    @staticmethod
    def real_backlog():
        # Recent only: stale rows that never got a verdict must not stop the run.
        now = timezone.now()
        return Submission.objects.filter(
            status__in=["pending", "judging"],
            created_at__range=(now - timedelta(minutes=30), now - timedelta(seconds=60)),
        ).exclude(user__username=USERNAME).exists()

    @staticmethod
    def worker_concurrency():
        try:
            stats = judge_submission.app.control.inspect(timeout=2).stats() or {}
            return sum(s["pool"]["max-concurrency"] for s in stats.values())
        except Exception:
            return None

    # ------------------------------------------------------------------
    def cleanup(self, **_):
        problem = CodingProblem.objects.filter(slug=SLUG).first()
        if problem is not None:
            Submission.objects.filter(problem=problem).delete()
            problem.delete()
        deleted, _ = get_user_model().objects.filter(username=USERNAME).delete()
        self.stdout.write(f"Removed load-test problem and user ({deleted} rows for the user).")
