import pytest
from django.conf import settings
from django.db import connection
from django.db.migrations.loader import MigrationLoader


@pytest.mark.django_db
def test_labs_app_and_migration_nodes_are_removed():
    loader = MigrationLoader(connection, ignore_no_migrations=True)

    assert "apps.labs" not in settings.INSTALLED_APPS
    assert not any(app_label == "labs" for app_label, _ in loader.graph.nodes)
    assert not any(
        dependency[0] == "labs"
        for migration in loader.disk_migrations.values()
        for dependency in migration.dependencies
    )
