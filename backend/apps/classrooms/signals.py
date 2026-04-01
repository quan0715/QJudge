from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.contests.services.detail_cache import bump_contest_detail_cache_version

from .models import ClassroomContest


@receiver(post_save, sender=ClassroomContest)
def invalidate_contest_detail_cache_on_bind(
    sender, instance: ClassroomContest, **kwargs
) -> None:
    bump_contest_detail_cache_version(instance.contest_id)


@receiver(post_delete, sender=ClassroomContest)
def invalidate_contest_detail_cache_on_unbind(
    sender, instance: ClassroomContest, **kwargs
) -> None:
    bump_contest_detail_cache_version(instance.contest_id)
