import pytest
from apps.judge.docker_runner import CppJudge


@pytest.mark.parametrize(
    "exit_code,output,expected_status",
    [
        (124, "", "TLE"),
        (1, "error: compile failed", "CE"),
        (137, "Segmentation fault", "RE"),
    ],
)
def test_cpp_judge_error_status_mapping(monkeypatch, exit_code, output, expected_status):
    judge = CppJudge()
    monkeypatch.setattr(judge, "_ensure_docker_client", lambda: None)

    def fake_run(_command, _timeout, _mem_limit):
        return {"exit_code": exit_code, "output": output, "time": 10, "memory": 5}

    monkeypatch.setattr(judge, "_run_in_container", fake_run)

    result = judge.execute("int main(){}", "", "", 1000, 128)
    assert result["status"] == expected_status


def test_cpp_judge_success_and_wrong_answer(monkeypatch):
    judge = CppJudge()
    monkeypatch.setattr(judge, "_ensure_docker_client", lambda: None)
    responses = [
        {"exit_code": 0, "output": "42\n", "time": 8, "memory": 4},
        {"exit_code": 0, "output": "41\n", "time": 8, "memory": 4},
    ]

    def fake_run(_command, _timeout, _mem_limit):
        return responses.pop(0)

    monkeypatch.setattr(judge, "_run_in_container", fake_run)

    ac_result = judge.execute("int main(){return 0;}", "", "42", 1000, 128)
    assert ac_result["status"] == "AC"
    assert ac_result["error"] == ""

    wa_result = judge.execute("int main(){return 0;}", "", "42", 1000, 128)
    assert wa_result["status"] == "WA"
    assert wa_result["error"] == "Wrong Answer"
