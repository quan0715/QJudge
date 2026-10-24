import pytest

from application.batch_grading import parse_batch_units


def test_units_come_from_the_batch_units_line():
    message = 'batch_units: [{"id": "group_g", "label": "第7題", "question_ids": ["a", "b"]}]\n批改第7題'
    assert parse_batch_units(message) == [{"id": "group_g", "label": "第7題", "question_ids": ["a", "b"]}]


def test_a_request_without_units_is_not_batch_grading():
    assert parse_batch_units("hello") is None


@pytest.mark.parametrize("line", ["batch_units: []", 'batch_units: [{"id": "x"}]', "batch_units: {}"])
def test_malformed_units_are_rejected(line):
    with pytest.raises(ValueError):
        parse_batch_units(line)
