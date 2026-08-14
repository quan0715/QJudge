import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_private_question_asset_migration_preserves_version_snapshots() -> None:
    executor = MigrationExecutor(connection)
    migrate_from = [
        (app_label, "0018_retire_marketplace")
        if app_label == "question_bank"
        else (app_label, migration_name)
        for app_label, migration_name in executor.loader.graph.leaf_nodes()
    ]
    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps

    User = old_apps.get_model("users", "User")
    Contest = old_apps.get_model("contests", "Contest")
    QuestionBank = old_apps.get_model("question_bank", "QuestionBank")
    QuestionAsset = old_apps.get_model("question_bank", "QuestionAsset")
    QuestionVersion = old_apps.get_model("question_bank", "QuestionVersion")
    QuestionBankMembership = old_apps.get_model(
        "question_bank", "QuestionBankMembership"
    )
    ContestQuestionBinding = old_apps.get_model(
        "question_bank", "ContestQuestionBinding"
    )

    teacher = User.objects.create(
        username="private-bank-teacher",
        email="private-bank-teacher@example.com",
        role="teacher",
    )
    owned_bank = QuestionBank.objects.create(
        owner=teacher,
        name="Owned bank",
        category="coding",
    )
    ownerless_bank = QuestionBank.objects.create(
        owner=None,
        name="Old platform bank",
        category="coding",
    )
    asset = QuestionAsset.objects.create(
        owner=teacher,
        asset_type="coding",
        title="Current title",
        prompt="Current prompt",
        payload={"revision": 2},
        status="draft",
        visibility="public",
        version_state="draft",
    )
    version_1 = QuestionVersion.objects.create(
        question_asset=asset,
        version_number=1,
        title="Original title",
        prompt="Original prompt",
        payload={"revision": 1},
        created_by=teacher,
    )
    version_2 = QuestionVersion.objects.create(
        question_asset=asset,
        version_number=2,
        title="Current title",
        prompt="Current prompt",
        payload={"revision": 2},
        created_by=teacher,
    )
    asset.latest_version_id = version_2.pk
    asset.save(update_fields=["latest_version"])
    QuestionBankMembership.objects.create(
        bank=owned_bank,
        question_asset=asset,
        order=0,
        added_by=teacher,
    )
    QuestionBankMembership.objects.create(
        bank=ownerless_bank,
        question_asset=asset,
        order=0,
        added_by=teacher,
    )
    contest = Contest.objects.create(owner=teacher, name="Versioned exam")
    binding = ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        question_version=version_1,
        binding_type="coding",
        order=0,
        score=100,
        created_by=teacher,
    )

    executor = MigrationExecutor(connection)
    migrate_to = [
        (app_label, "0019_private_question_assets")
        if app_label == "question_bank"
        else (app_label, migration_name)
        for app_label, migration_name in executor.loader.graph.leaf_nodes()
    ]
    executor.migrate(migrate_to)
    new_apps = executor.loader.project_state(migrate_to).apps

    PrivateQuestionBank = new_apps.get_model("question_bank", "QuestionBank")
    PrivateQuestionAsset = new_apps.get_model("question_bank", "QuestionAsset")
    PrivateQuestionVersion = new_apps.get_model("question_bank", "QuestionVersion")
    PrivateContestQuestionBinding = new_apps.get_model(
        "question_bank", "ContestQuestionBinding"
    )

    assert not PrivateQuestionBank.objects.filter(pk=ownerless_bank.pk).exists()
    assert PrivateQuestionBank.objects.get(pk=owned_bank.pk).owner_id == teacher.pk
    preserved_asset = PrivateQuestionAsset.objects.get(pk=asset.pk)
    assert preserved_asset.latest_version_id == version_2.pk
    assert (
        PrivateQuestionVersion.objects.filter(question_asset_id=asset.pk).count()
        == 2
    )
    assert (
        PrivateContestQuestionBinding.objects.get(pk=binding.pk).question_version_id
        == version_1.pk
    )

    bank_owner = PrivateQuestionBank._meta.get_field("owner")
    assert bank_owner.null is False
    asset_fields = {field.name for field in PrivateQuestionAsset._meta.get_fields()}
    assert {"status", "visibility", "version_state"}.isdisjoint(asset_fields)
