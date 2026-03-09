"""Shared constants and payload builders for load-test scenarios."""
import os
import random
import pathlib

# Contest name created by seed_loadtest_data
CONTEST_NAME = "Load Test Exam"

# Populated at runtime by the first user that fetches the contest list
CONTEST_ID: int | None = None

NUM_STUDENTS = 200
STUDENT_PASSWORD = "loadtest123"

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
    return {
        "problem": prob["id"],
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
