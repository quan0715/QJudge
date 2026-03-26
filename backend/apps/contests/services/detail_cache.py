from django.core.cache import cache


def _contest_detail_version_key(contest_id: int) -> str:
    return f"contest_detail_version:{contest_id}"


def get_contest_detail_cache_key(contest_id: int, user_cache_key: str) -> str:
    version = cache.get(_contest_detail_version_key(contest_id), 1)
    return f"contest_detail:{contest_id}:v:{version}:u:{user_cache_key}"


def bump_contest_detail_cache_version(contest_id: int) -> None:
    version_key = _contest_detail_version_key(contest_id)
    if cache.add(version_key, 2):
        return
    try:
        cache.incr(version_key)
    except ValueError:
        cache.set(version_key, 2)
