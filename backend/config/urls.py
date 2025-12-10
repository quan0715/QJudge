"""
URL configuration for OJ Platform backend.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from apps.core.db_views import DatabaseStatusView, DatabaseSyncView

urlpatterns = [
    path('django-admin/', admin.site.urls),  # Django backend admin (use only when frontend cannot handle it)
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/problems/', include('apps.problems.urls')),
    path('api/v1/submissions/', include('apps.submissions.urls')),
    path('api/v1/contests/', include('apps.contests.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/management/announcements/', include('apps.announcements.urls')),
    # Database Admin (development only)
    path('api/admin/database/', DatabaseStatusView.as_view(), name='database-status'),
    path('api/admin/database/sync/', DatabaseSyncView.as_view(), name='database-sync'),
    # OpenAPI Schema
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # Optional UI:
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

