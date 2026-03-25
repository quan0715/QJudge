"""
Signals for user model.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import User, UserProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """
    Automatically create user profile when a new user is created.
    """
    if created:
        UserProfile.objects.create(user=instance)


# NOTE:
# Do not auto-save profile on every user save.
# It can overwrite freshly-synced profile fields (e.g. OAuth avatar) with a stale
# in-memory related object during login/token issuance flow.
