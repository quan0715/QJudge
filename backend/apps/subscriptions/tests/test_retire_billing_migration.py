import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_retire_billing_removes_subscription_data_and_tables():
    executor = MigrationExecutor(connection)
    migrate_from = [
        (app_label, "0001_initial")
        if app_label == "subscriptions"
        else (app_label, migration_name)
        for app_label, migration_name in executor.loader.graph.leaf_nodes()
    ]
    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps

    User = old_apps.get_model("users", "User")
    Subscription = old_apps.get_model("subscriptions", "Subscription")
    WebhookEvent = old_apps.get_model("subscriptions", "WebhookEvent")

    teacher = User.objects.create(
        username="former-subscriber",
        email="former-subscriber@example.com",
        role="teacher",
    )
    Subscription.objects.create(user=teacher, tier="pro", status="active")
    WebhookEvent.objects.create(
        event_id="retired-event",
        event_type="subscription.active",
        payload={},
    )

    executor = MigrationExecutor(connection)
    migrate_to = [
        (app_label, "0002_retire_billing")
        if app_label == "subscriptions"
        else (app_label, migration_name)
        for app_label, migration_name in executor.loader.graph.leaf_nodes()
    ]
    executor.migrate(migrate_to)
    new_apps = executor.loader.project_state(migrate_to).apps

    with pytest.raises(LookupError):
        new_apps.get_model("subscriptions", "Subscription")
    with pytest.raises(LookupError):
        new_apps.get_model("subscriptions", "WebhookEvent")

    table_names = connection.introspection.table_names()
    assert "subscriptions" not in table_names
    assert "subscription_webhook_events" not in table_names
