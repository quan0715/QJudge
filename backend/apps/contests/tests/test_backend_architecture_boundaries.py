from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _read(path: str) -> str:
    return (BACKEND_ROOT / path).read_text(encoding="utf-8")


def test_exam_domain_services_do_not_construct_drf_responses():
    service_sources = [
        "apps/contests/services/exam_validation.py",
        "apps/contests/services/anti_cheat_session.py",
    ]

    for path in service_sources:
        source = _read(path)
        assert "rest_framework.response" not in source
        assert "Response(" not in source


def test_question_bank_import_resolver_is_shared_by_contest_imports():
    assert (BACKEND_ROOT / "apps/question_bank/import_resolver.py").exists()

    exam_question_source = _read("apps/contests/views/exam_question.py")
    contest_problem_source = _read("apps/contests/services/contest_problem_service.py")

    assert "def _resolve_bank_question_for_import" not in exam_question_source
    assert "apps.question_bank.import_resolver" in exam_question_source
    assert "apps.question_bank.import_resolver" in contest_problem_source


def test_device_conflict_response_adapter_is_shared_by_exam_views():
    adapter_source = _read("apps/contests/views/exam_validation_response.py")
    assert "def build_device_conflict_response_for_view" in adapter_source
    assert "build_device_conflict_payload" in adapter_source

    for path in [
        "apps/contests/views/exam_answer.py",
        "apps/contests/views/exam_anticheat.py",
        "apps/contests/views/exam_question.py",
    ]:
        source = _read(path)
        assert "build_device_conflict_response_for_view" in source
        assert "Response(conflict_payload" not in source


def test_contest_detail_cache_helper_has_been_removed():
    assert not (BACKEND_ROOT / "apps/contests/services/detail_cache.py").exists()

    for path in (BACKEND_ROOT / "apps").rglob("*.py"):
        if "migrations" in path.parts or path == Path(__file__).resolve():
            continue
        source = path.read_text(encoding="utf-8")
        assert "services.detail_cache" not in source
        assert "bump_contest_detail_cache_version" not in source


def test_contest_activity_writes_go_through_activity_log_service():
    allowed = {
        BACKEND_ROOT / "apps/contests/services/activity_log.py",
    }

    offenders = []
    for path in (BACKEND_ROOT / "apps").rglob("*.py"):
        if (
            "migrations" in path.parts
            or "tests" in path.parts
            or path in allowed
            or path == Path(__file__).resolve()
        ):
            continue
        source = path.read_text(encoding="utf-8")
        if "ContestActivity.objects.create" in source:
            offenders.append(path.relative_to(BACKEND_ROOT).as_posix())

    assert offenders == []
