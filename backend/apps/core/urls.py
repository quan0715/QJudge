"""URL configuration for core shared endpoints."""
from django.urls import path

from .views import MarkdownImageReadView, MarkdownImageUploadView

urlpatterns = [
    path("images/", MarkdownImageUploadView.as_view(), name="markdown-image-upload"),
    path("images/<path:object_key>", MarkdownImageReadView.as_view(), name="markdown-image-read"),
]
