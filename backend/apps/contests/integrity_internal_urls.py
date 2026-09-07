from django.urls import path

from apps.contests.views.integrity_internal import (
    IntegrityCommandsView,
    IntegrityResidentDescriptorsView,
    IntegrityResidentFinalizeView,
)


urlpatterns = [
    path("runs/<uuid:run_id>/finalize/", IntegrityResidentFinalizeView.as_view(), name="integrity-resident-finalize"),
    path("resident/descriptors/", IntegrityResidentDescriptorsView.as_view(), name="integrity-resident-descriptors"),
    path(
        "runs/<uuid:run_id>/commands/",
        IntegrityCommandsView.as_view(),
        name="integrity-commands",
    ),
]
