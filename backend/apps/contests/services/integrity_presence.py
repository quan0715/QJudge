"""Short-lived participant presence projected from accepted checkpoints."""

from django.core.cache import cache
from django.utils import timezone


CHECKPOINT_RECEIPT_TTL_SECONDS = 120
_KEY_PREFIX = "integrity:checkpoint"


def _key(contest_id, user_id: int) -> str:
    return f"{_KEY_PREFIX}:{contest_id}:{user_id}"


def record_checkpoint(contest_id, user_id: int) -> str:
    received_at = timezone.now().isoformat()
    cache.set(
        _key(contest_id, user_id),
        received_at,
        timeout=CHECKPOINT_RECEIPT_TTL_SECONDS,
    )
    return received_at


def get_last_checkpoint(contest_id, user_id: int) -> str | None:
    value = cache.get(_key(contest_id, user_id))
    return value if isinstance(value, str) else None


def get_last_checkpoints(contest_id, user_ids: list[int]) -> dict[int, str | None]:
    key_by_user_id = {user_id: _key(contest_id, user_id) for user_id in user_ids}
    values = cache.get_many(key_by_user_id.values())
    return {
        user_id: values.get(key) if isinstance(values.get(key), str) else None
        for user_id, key in key_by_user_id.items()
    }


def clear_checkpoint(contest_id, user_id: int) -> None:
    cache.delete(_key(contest_id, user_id))
