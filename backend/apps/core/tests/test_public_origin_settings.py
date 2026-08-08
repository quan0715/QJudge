from __future__ import annotations

import pytest

from config.deployment import parse_public_origin


def test_parse_public_origin_returns_normalized_origin_and_hostname() -> None:
    parsed = parse_public_origin("https://judge.example.test/")

    assert parsed.url == "https://judge.example.test"
    assert parsed.hostname == "judge.example.test"


@pytest.mark.parametrize(
    "value",
    (
        "judge.example.test",
        "ftp://judge.example.test",
        "https://judge.example.test/path",
        "https://judge.example.test?mode=test",
        "https://user@judge.example.test",
    ),
)
def test_parse_public_origin_rejects_values_that_are_not_origins(value: str) -> None:
    with pytest.raises(ValueError, match="QJUDGE_PUBLIC_ORIGIN"):
        parse_public_origin(value)
