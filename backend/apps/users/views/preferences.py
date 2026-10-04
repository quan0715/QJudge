"""Current-user preferences views."""

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.core.api.envelope import contract_validation_error_response

from ..serializers import UserPreferencesUpdateSerializer, UserSettingsSerializer
from .common import SchemaAPIView


class UserPreferencesView(SchemaAPIView):
    """
    Get and update current user preferences.

    GET /api/v1/users/me/preferences - Get current preferences
    PATCH /api/v1/users/me/preferences - Update preferences
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserPreferencesUpdateSerializer

    def get(self, request):
        """Get current user preferences."""
        user = request.user
        cache_key = f"user_preferences:v2:{user.id}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        # Ensure user has a profile
        from ..models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)

        serializer = UserSettingsSerializer(profile)
        cache.set(cache_key, serializer.data, timeout=30)
        return Response(serializer.data)

    def patch(self, request):
        """Update user preferences."""
        user = request.user

        # Ensure user has a profile
        from ..models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)

        serializer = UserPreferencesUpdateSerializer(data=request.data)

        if not serializer.is_valid():
            return contract_validation_error_response(request, '偏好設定驗證失敗', serializer.errors)

        # Update profile fields
        validated = serializer.validated_data
        validated_data = {**validated.get("profile", {}), **validated.get("preferences", {})}
        if "onboarding_completed_at" in validated:
            validated_data["onboarding_completed_at"] = validated["onboarding_completed_at"]

        if 'display_name' in validated_data:
            profile.display_name = validated_data['display_name']
        if 'avatar_url' in validated_data:
            profile.avatar_url = validated_data['avatar_url']
            profile.avatar_source = 'manual'
        if 'preferred_language' in validated_data:
            profile.preferred_language = validated_data['preferred_language']
        if 'preferred_theme' in validated_data:
            profile.preferred_theme = validated_data['preferred_theme']
        if 'editor_font_size' in validated_data:
            profile.editor_font_size = validated_data['editor_font_size']
        if 'editor_tab_size' in validated_data:
            profile.editor_tab_size = validated_data['editor_tab_size']
        if 'onboarding_completed_at' in validated_data:
            val = validated_data['onboarding_completed_at']
            profile.onboarding_completed_at = timezone.now() if val else None

        profile.save()
        cache.delete(f"user_preferences:v2:{user.id}")

        # Return updated profile
        profile_serializer = UserSettingsSerializer(profile)

        return Response(profile_serializer.data)


__all__ = ["UserPreferencesView"]
