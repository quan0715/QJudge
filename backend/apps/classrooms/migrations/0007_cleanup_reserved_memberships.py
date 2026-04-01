from django.db import migrations


def cleanup_reserved_memberships(apps, schema_editor):
    Classroom = apps.get_model("classrooms", "Classroom")
    ClassroomMember = apps.get_model("classrooms", "ClassroomMember")

    through_model = Classroom.admins.through

    reserved_user_ids_by_classroom = {}
    for classroom_id, owner_id in Classroom.objects.values_list("id", "owner_id"):
        reserved_user_ids_by_classroom[classroom_id] = {owner_id}

    for classroom_id, user_id in through_model.objects.values_list("classroom_id", "user_id"):
        reserved_user_ids_by_classroom.setdefault(classroom_id, set()).add(user_id)

    for classroom_id, reserved_user_ids in reserved_user_ids_by_classroom.items():
        ClassroomMember.objects.filter(
            classroom_id=classroom_id,
            user_id__in=reserved_user_ids,
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("classrooms", "0006_alter_classroom_icon"),
    ]

    operations = [
        migrations.RunPython(cleanup_reserved_memberships, migrations.RunPython.noop),
    ]
