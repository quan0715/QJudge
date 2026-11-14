"""Exercise both fresh installs and the completed pre-baseline migration ledger."""
import pytest
from django.apps import apps
from django.utils.translation import override
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder
from django.db.migrations.state import ProjectState
from django.db.migrations.autodetector import MigrationAutodetector


def test_baseline_matches_current_models():
    loader = MigrationLoader(None)
    with override("en-us"):
        assert MigrationAutodetector(
            loader.project_state(), ProjectState.from_apps(apps)
        ).changes(graph=loader.graph) == {}


@pytest.mark.django_db
def test_completed_old_history_is_adopted_without_schema_operations():
    loader = MigrationLoader(connection)
    recorder = MigrationRecorder(connection)
    replacements = loader.replacements
    for key, migration in replacements.items():
        recorder.record_unapplied(*key)
        for old_key in migration.replaces:
            recorder.record_applied(*old_key)

    executor = MigrationExecutor(connection)
    executor.loader.check_consistent_history(connection)
    assert executor.migration_plan(executor.loader.graph.leaf_nodes()) == []
    executor.migrate(executor.loader.graph.leaf_nodes())
    applied = recorder.applied_migrations()
    assert all(key in applied for key in replacements)
    assert MigrationExecutor(connection).migration_plan(loader.graph.leaf_nodes()) == []

