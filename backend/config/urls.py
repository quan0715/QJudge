"""
URL configuration for OJ Platform backend.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions import IsAdminUser
from apps.users.views import UserAPIKeyView, ValidateAPIKeyView, GetUsageStatsView

schema_view_kwargs = {}
if not settings.DEBUG:
    schema_view_kwargs = {"permission_classes": [IsAdminUser]}

urlpatterns = [
    path('django-admin/', admin.site.urls),  # Django backend admin (use only when frontend cannot handle it)
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/markdown/', include('apps.core.urls')),
    path(
        'api/v1/management/problems/',
        include(('apps.problems.urls', 'problems'), namespace='management-problems'),
    ),
    path('api/v1/problems/', include('apps.problems.urls')),
    path('api/v1/submissions/', include('apps.submissions.urls')),
    path('api/v1/contests/', include('apps.contests.urls')),
    path('api/v1/classrooms/', include('apps.classrooms.urls')),
    path('api/v1/question-banks/', include('apps.question_bank.urls')),
    path('api/v1/question-bank-items/', include('apps.question_bank.item_urls')),
    path('api/v1/management/announcements/', include('apps.announcements.urls')),
    path('api/v1/ai/', include('apps.ai.urls')),
    path('api/v1/subscriptions/', include('apps.subscriptions.urls')),
    # User API Key management
    path('api/v1/users/me/api-key', UserAPIKeyView.as_view(), name='api-key'),
    path('api/v1/users/me/api-key/validate', ValidateAPIKeyView.as_view(), name='validate-api-key'),
    path('api/v1/users/me/api-key/usage', GetUsageStatsView.as_view(), name='api-key-usage'),
    # OpenAPI Schema
    path('api/schema/', SpectacularAPIView.as_view(**schema_view_kwargs), name='schema'),
    # Optional UI:
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema', **schema_view_kwargs), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema', **schema_view_kwargs), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
