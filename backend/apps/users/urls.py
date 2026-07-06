"""Users resource URL configuration."""

from django.urls import path

from .views import (
    CurrentUserView,
    UserSearchView,
    UserRoleUpdateView,
    UserPreferencesView,
    UserAvatarUploadView,
)

app_name = 'users'

urlpatterns = [
    path('', UserSearchView.as_view(), name='user-search'),
    path('me', CurrentUserView.as_view(), name='current-user'),
    path('me/preferences', UserPreferencesView.as_view(), name='user-preferences'),
    path('me/avatar', UserAvatarUploadView.as_view(), name='user-avatar-upload'),
    path('<int:pk>/role', UserRoleUpdateView.as_view(), name='user-role-update'),
]
