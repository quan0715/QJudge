import pytest
from apps.judge.io_judge import IOJudge


def record(**fields):
    return {"exit": 0, "time": 10, "memory": 5, "tle": False, "ole": False, "output": "", **fields}


@pytest.mark.parametrize(
    "fields,expected_status",
    [
        ({"exit": 137, "tle": True}, "TLE"),
        ({"exit": 0, "tle": True, "output": "42"}, "TLE"),
        ({"exit": 137, "output": "Segmentation fault"}, "RE"),
        ({"exit": 153, "ole": True, "tle": True}, "RE"),
        ({"output": "42\n"}, "AC"),
        ({"output": "41\n"}, "WA"),
    ],
)
def test_judge_status_mapping(fields, expected_status):
    assert IOJudge._interpret(record(**fields), "42", 1000)["status"] == expected_status


def test_judge_success_and_wrong_answer_errors():
    assert IOJudge._interpret(record(output="42\n"), "42", 1000)["error"] == ""
    assert IOJudge._interpret(record(output="41\n"), "42", 1000)["error"] == "Wrong Answer"


def test_compile_error_status():
    build = {"exit": 1, "timeout": False, "ole": False, "output": "error: 'x' was not declared"}
    assert IOJudge._compile_error(build) == {
        "status": "CE", "output": "", "error": "error: 'x' was not declared", "time": 0, "memory": 0,
    }


@pytest.mark.parametrize("language", ["cpp", "c", "python", "java"])
def test_io_judge_all_languages_instantiate(language):
    judge = IOJudge(language)
    assert isinstance(judge, IOJudge)


def test_io_judge_unsupported_language():
    with pytest.raises(ValueError, match="Unsupported language"):
        IOJudge("brainfuck")
