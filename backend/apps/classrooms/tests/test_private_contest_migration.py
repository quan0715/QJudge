from datetime import timedelta

import pytest
from django.db import IntegrityError, connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_private_contest_migration_deletes_orphans_and_deduplicates_bindings(request) -> None:
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    request.addfinalizer(lambda: MigrationExecutor(connection).migrate(latest))
    migrate_from = []
    for app_label, migration_name in executor.loader.graph.leaf_nodes():
        if app_label == "classrooms":
            migrate_from.append(
                (
                    app_label,
                    "0001_initial_squashed_0008_drop_legacy_email_notifications",
                )
            )
        elif app_label == "contests":
            migrate_from.append(
                (app_label, "0095_remove_contest_question_edit_lock_fields")
            )
        else:
            migrate_from.append((app_label, migration_name))
    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps

    User = old_apps.get_model("users", "User")
    Classroom = old_apps.get_model("classrooms", "Classroom")
    ClassroomContest = old_apps.get_model("classrooms", "ClassroomContest")
    Contest = old_apps.get_model("contests", "Contest")
    ContestParticipant = old_apps.get_model("contests", "ContestParticipant")
    ContestAnnouncement = old_apps.get_model("contests", "ContestAnnouncement")
    CodingProblem = old_apps.get_model("problems", "CodingProblem")
    Submission = old_apps.get_model("submissions", "Submission")

    teacher = User.objects.create(
        username="contest-migration-teacher",
        email="contest-migration-teacher@example.com",
        role="teacher",
    )
    student = User.objects.create(
        username="contest-migration-student",
        email="contest-migration-student@example.com",
        role="student",
    )
    room_1 = Classroom.objects.create(
        name="Room 1",
        owner=teacher,
        invite_code="MIGROOM1",
    )
    room_2 = Classroom.objects.create(
        name="Room 2",
        owner=teacher,
        invite_code="MIGROOM2",
    )
    kept = Contest.objects.create(
        name="Kept contest",
        owner=teacher,
        visibility="public",
        status="published",
    )
    orphan = Contest.objects.create(
        name="Orphan contest",
        owner=teacher,
        visibility="public",
        status="published",
    )
    duplicated = Contest.objects.create(
        name="Duplicated contest",
        owner=teacher,
        visibility="public",
        status="published",
    )
    ClassroomContest.objects.create(classroom=room_1, contest=kept)
    first_binding = ClassroomContest.objects.create(
        classroom=room_1,
        contest=duplicated,
    )
    second_binding = ClassroomContest.objects.create(
        classroom=room_2,
        contest=duplicated,
    )
    ClassroomContest.objects.filter(pk=first_binding.pk).update(
        bound_at=timezone.now() - timedelta(days=1)
    )
    ContestParticipant.objects.create(contest=orphan, user=student)
    ContestAnnouncement.objects.create(
        contest=orphan,
        title="Delete me",
        content="Orphan announcement",
        created_by=teacher,
    )
    problem = CodingProblem.objects.create(
        slug="orphan-contest-problem",
        created_by=teacher,
    )
    submission = Submission.objects.create(
        user=student,
        problem=problem,
        contest=orphan,
        source_type="contest",
        language="python",
        code="print(1)",
    )

    executor = MigrationExecutor(connection)
    migrate_to = []
    for app_label, migration_name in executor.loader.graph.leaf_nodes():
        if app_label == "classrooms":
            migrate_to.append(
                (app_label, "0002_enforce_single_contest_binding")
            )
        elif app_label == "contests":
            migrate_to.append((app_label, "0096_remove_contest_visibility"))
        else:
            migrate_to.append((app_label, migration_name))
    executor.migrate(migrate_to)
    new_apps = executor.loader.project_state(migrate_to).apps

    PrivateContest = new_apps.get_model("contests", "Contest")
    PrivateClassroomContest = new_apps.get_model(
        "classrooms", "ClassroomContest"
    )
    PrivateSubmission = new_apps.get_model("submissions", "Submission")
    PrivateCodingProblem = new_apps.get_model("problems", "CodingProblem")

    assert not PrivateContest.objects.filter(pk=orphan.pk).exists()
    assert not PrivateSubmission.objects.filter(pk=submission.pk).exists()
    assert PrivateCodingProblem.objects.filter(pk=problem.pk).exists()
    assert PrivateContest.objects.filter(pk__in=[kept.pk, duplicated.pk]).count() == 2
    retained = PrivateClassroomContest.objects.get(contest_id=duplicated.pk)
    assert retained.pk == first_binding.pk
    assert retained.pk != second_binding.pk
    assert not any(
        field.name == "visibility" for field in PrivateContest._meta.get_fields()
    )

    with pytest.raises(IntegrityError):
        PrivateClassroomContest.objects.create(
            classroom_id=room_2.pk,
            contest_id=kept.pk,
        )
