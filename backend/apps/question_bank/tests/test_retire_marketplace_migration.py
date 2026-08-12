import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_retire_marketplace_preserves_owned_banks_and_removes_marketplace_state():
    executor = MigrationExecutor(connection)
    leaf_nodes = executor.loader.graph.leaf_nodes()
    migrate_from = [
        (app_label, "0017_eliminate_question_bank_legacy_adapters")
        if app_label == "question_bank"
        else (app_label, migration_name)
        for app_label, migration_name in leaf_nodes
    ]
    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps

    User = old_apps.get_model("users", "User")
    QuestionBank = old_apps.get_model("question_bank", "QuestionBank")
    QuestionBankSubscription = old_apps.get_model(
        "question_bank", "QuestionBankSubscription"
    )

    teacher = User.objects.create(
        username="retirement-teacher",
        email="retirement-teacher@example.com",
        role="teacher",
    )
    owned_bank = QuestionBank.objects.create(
        owner=teacher,
        name="Owned public bank",
        category="coding",
        visibility="public",
        verified=True,
        review_status="approved",
    )
    platform_bank = QuestionBank.objects.create(
        owner=None,
        name="Platform public bank",
        category="coding",
        visibility="public",
        verified=True,
        review_status="approved",
    )
    QuestionBankSubscription.objects.create(user=teacher, bank=platform_bank)

    executor = MigrationExecutor(connection)
    migrate_to = [
        (app_label, "0018_retire_marketplace")
        if app_label == "question_bank"
        else (app_label, migration_name)
        for app_label, migration_name in executor.loader.graph.leaf_nodes()
    ]
    executor.migrate(migrate_to)
    new_apps = executor.loader.project_state(migrate_to).apps
    PrivateQuestionBank = new_apps.get_model("question_bank", "QuestionBank")

    preserved = PrivateQuestionBank.objects.get(pk=owned_bank.pk)
    archived = PrivateQuestionBank.objects.get(pk=platform_bank.pk)
    assert preserved.owner_id == teacher.pk
    assert preserved.is_archived is False
    assert archived.is_archived is True

    field_names = {field.name for field in PrivateQuestionBank._meta.get_fields()}
    assert {
        "visibility",
        "verified",
        "review_status",
        "review_note",
        "submitted_at",
        "reviewed_at",
        "reviewed_by",
        "subscriptions",
    }.isdisjoint(field_names)
    assert "question_bank_subscriptions" not in connection.introspection.table_names()
