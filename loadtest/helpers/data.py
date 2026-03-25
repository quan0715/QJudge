"""Shared constants and payload builders for load-test scenarios."""
import os
import random
import pathlib

# Contest name created by seed_loadtest_data
# - Paper exam default: "Load Test Exam"
# - Coding contest: set LT_CONTEST_NAME="Load Test Coding"
CONTEST_NAME = os.getenv("LT_CONTEST_NAME", "Load Test Exam")

# Populated at runtime by the first user that fetches the contest list
CONTEST_ID: int | None = None

NUM_STUDENTS = 200
STUDENT_PASSWORD = "loadtest123"


def _get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "")
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _get_float_env(name: str, default: float) -> float:
    raw = os.getenv(name, "")
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


# Safety knobs (can be overridden via env when running Locust)
ANTICHEAT_URL_BATCH_SIZE = _get_int_env("LT_ANTICHEAT_URL_BATCH_SIZE", 30)
ANTICHEAT_URL_LOW_WATERMARK = _get_int_env("LT_ANTICHEAT_URL_LOW_WATERMARK", 8)
ANTICHEAT_UPLOAD_INTERVAL_SECONDS = _get_float_env("LT_ANTICHEAT_UPLOAD_INTERVAL_SECONDS", 3.0)
HEARTBEAT_INTERVAL_SECONDS = _get_float_env("LT_HEARTBEAT_INTERVAL_SECONDS", 5.0)

# Path to fake screenshot
FIXTURES_DIR = pathlib.Path(__file__).resolve().parent.parent / "fixtures"
FAKE_FRAME_PATH = FIXTURES_DIR / "fake_frame.webp"

# Pre-load fake frame bytes (lazy)
_fake_frame_bytes: bytes | None = None


def get_fake_frame() -> bytes:
    global _fake_frame_bytes
    if _fake_frame_bytes is None:
        _fake_frame_bytes = FAKE_FRAME_PATH.read_bytes()
    return _fake_frame_bytes


def student_email(index: int) -> str:
    return f"lt_{index:03d}@test.com"


def student_username(index: int) -> str:
    return f"lt_{index:03d}"


# ---- Payload builders ----

CPP_SOLUTIONS = {
    "A+B Problem": '#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}',
    "Hello World": '#include <iostream>\nusing namespace std;\nint main(){cout<<"Hello, World!"<<endl;}',
    "Factorial": '#include <iostream>\nusing namespace std;\nint main(){int n;cin>>n;int r=1;for(int i=2;i<=n;i++)r*=i;cout<<r<<endl;}',
}


def random_submission_payload(contest_problems: list[dict]) -> dict | None:
    """Build a random submission payload from available contest problems."""
    if not contest_problems:
        return None
    prob = random.choice(contest_problems)
    title = prob.get("title", "")
    code = CPP_SOLUTIONS.get(title, CPP_SOLUTIONS["A+B Problem"])
    # Contest detail returns both:
    # - id: contest-problem relation id
    # - problem_id: real problem pk required by /submissions/
    problem_pk = prob.get("problem_id") or prob.get("id")
    if not problem_pk:
        return None
    return {
        "problem": problem_pk,
        "contest": CONTEST_ID,
        "code": code,
        "language": "cpp",
        "source_type": "contest",
    }


def random_exam_answer_payload(exam_questions: list[dict]) -> dict | None:
    """Build a random exam-answer payload."""
    if not exam_questions:
        return None
    q = random.choice(exam_questions)
    qtype = q.get("question_type", "single_choice")
    options = q.get("options", [])

    if qtype in ("single_choice", "true_false"):
        answer = {"selected": random.choice(options) if options else "True"}
    elif qtype == "multiple_choice":
        k = random.randint(1, max(1, len(options)))
        answer = {"selected": random.sample(options, k)}
    else:  # short_answer, essay
        answer = {"text": f"loadtest answer {random.randint(1, 9999)}"}

    return {"question_id": q["id"], "answer": answer}
