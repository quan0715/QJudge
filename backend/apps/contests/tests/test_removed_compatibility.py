from importlib.util import find_spec


def test_score_recalculation_compatibility_module_is_removed():
    assert find_spec("apps.contests.services.score_recalculation") is None
