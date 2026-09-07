from django.urls import path

from apps.contests.views.integrity_internal import (
    IntegrityBootstrapView,
    IntegrityCommandsView,
    IntegrityResidentDescriptorsView,
)


urlpatterns = [
    path("resident/descriptors/", IntegrityResidentDescriptorsView.as_view(), name="integrity-resident-descriptors"),
    path(
        "runs/<uuid:run_id>/bootstrap/",
        IntegrityBootstrapView.as_view(),
        name="integrity-bootstrap",
    ),
    path(
        "runs/<uuid:run_id>/commands/",
        IntegrityCommandsView.as_view(),
        name="integrity-commands",
    ),
]
