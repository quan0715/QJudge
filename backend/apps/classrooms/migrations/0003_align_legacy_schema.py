from django.db import migrations

from apps.core.legacy_schema_alignment import build_alignment

# Catalog produced by the baseline migrations on an empty PostgreSQL database.
EXPECTED_CONSTRAINTS = (
    ("classrooms_classroom", "classrooms_classroom_invite_code_key", "u", "UNIQUE (invite_code)"),
    ("classrooms_classroom", "classrooms_classroom_owner_id_53ddbf2f_fk_users_id", "f", "FOREIGN KEY (owner_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroom", "classrooms_classroom_pkey", "p", "PRIMARY KEY (id)"),
    ("classrooms_classroom", "classrooms_classroom_uuid_key", "u", "UNIQUE (uuid)"),
    ("classrooms_classroom_admins", "classrooms_classroom_admins_classroom_id_user_id_ba34410e_uniq", "u", "UNIQUE (classroom_id, user_id)"),
    ("classrooms_classroom_admins", "classrooms_classroom_admins_pkey", "p", "PRIMARY KEY (id)"),
    ("classrooms_classroom_admins", "classrooms_classroom_admins_user_id_e455c1c1_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroom_admins", "classrooms_classroom_classroom_id_50aec4e1_fk_classroom", "f", "FOREIGN KEY (classroom_id) REFERENCES classrooms_classroom(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroomannouncement", "classrooms_classroom_classroom_id_fc777d4f_fk_classroom", "f", "FOREIGN KEY (classroom_id) REFERENCES classrooms_classroom(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroomannouncement", "classrooms_classroom_created_by_id_66842a4e_fk_users_id", "f", "FOREIGN KEY (created_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroomannouncement", "classrooms_classroomannouncement_pkey", "p", "PRIMARY KEY (id)"),
    ("classrooms_classroomcontest", "classrooms_classroom_classroom_id_8b23cf1b_fk_classroom", "f", "FOREIGN KEY (classroom_id) REFERENCES classrooms_classroom(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroomcontest", "classrooms_classroomcont_classroom_id_contest_id_ccb2bf03_uniq", "u", "UNIQUE (classroom_id, contest_id)"),
    ("classrooms_classroomcontest", "classrooms_classroomcontest_contest_id_9c6bb247_fk_contests_id", "f", "FOREIGN KEY (contest_id) REFERENCES contests(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroomcontest", "classrooms_classroomcontest_pkey", "p", "PRIMARY KEY (id)"),
    ("classrooms_classroomcontest", "unique_classroom_binding_per_contest", "u", "UNIQUE (contest_id)"),
    ("classrooms_classroommember", "classrooms_classroom_classroom_id_b40bc929_fk_classroom", "f", "FOREIGN KEY (classroom_id) REFERENCES classrooms_classroom(id) DEFERRABLE INITIALLY DEFERRED"),
    ("classrooms_classroommember", "classrooms_classroommember_classroom_id_user_id_f19c0914_uniq", "u", "UNIQUE (classroom_id, user_id)"),
    ("classrooms_classroommember", "classrooms_classroommember_pkey", "p", "PRIMARY KEY (id)"),
    ("classrooms_classroommember", "classrooms_classroommember_user_id_2471d723_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
)

EXPECTED_INDEXES = (
    ("classrooms_classroom", "classrooms_classroom_invite_code_a99e22b5_like", "CREATE INDEX classrooms_classroom_invite_code_a99e22b5_like ON classrooms_classroom USING btree (invite_code varchar_pattern_ops)"),
    ("classrooms_classroom", "classrooms_classroom_is_archived_68dd154b", "CREATE INDEX classrooms_classroom_is_archived_68dd154b ON classrooms_classroom USING btree (is_archived)"),
    ("classrooms_classroom", "classrooms_classroom_owner_id_53ddbf2f", "CREATE INDEX classrooms_classroom_owner_id_53ddbf2f ON classrooms_classroom USING btree (owner_id)"),
    ("classrooms_classroom_admins", "classrooms_classroom_admins_classroom_id_50aec4e1", "CREATE INDEX classrooms_classroom_admins_classroom_id_50aec4e1 ON classrooms_classroom_admins USING btree (classroom_id)"),
    ("classrooms_classroom_admins", "classrooms_classroom_admins_user_id_e455c1c1", "CREATE INDEX classrooms_classroom_admins_user_id_e455c1c1 ON classrooms_classroom_admins USING btree (user_id)"),
    ("classrooms_classroomannouncement", "classrooms_classroomannouncement_classroom_id_fc777d4f", "CREATE INDEX classrooms_classroomannouncement_classroom_id_fc777d4f ON classrooms_classroomannouncement USING btree (classroom_id)"),
    ("classrooms_classroomannouncement", "classrooms_classroomannouncement_created_by_id_66842a4e", "CREATE INDEX classrooms_classroomannouncement_created_by_id_66842a4e ON classrooms_classroomannouncement USING btree (created_by_id)"),
    ("classrooms_classroomcontest", "classrooms_classroomcontest_classroom_id_8b23cf1b", "CREATE INDEX classrooms_classroomcontest_classroom_id_8b23cf1b ON classrooms_classroomcontest USING btree (classroom_id)"),
    ("classrooms_classroomcontest", "classrooms_classroomcontest_contest_id_9c6bb247", "CREATE INDEX classrooms_classroomcontest_contest_id_9c6bb247 ON classrooms_classroomcontest USING btree (contest_id)"),
    ("classrooms_classroommember", "classrooms_classroommember_classroom_id_b40bc929", "CREATE INDEX classrooms_classroommember_classroom_id_b40bc929 ON classrooms_classroommember USING btree (classroom_id)"),
    ("classrooms_classroommember", "classrooms_classroommember_user_id_2471d723", "CREATE INDEX classrooms_classroommember_user_id_2471d723 ON classrooms_classroommember USING btree (user_id)"),
)


class Migration(migrations.Migration):
    dependencies = [
        ("classrooms", "0002_baseline"),
    ]

    operations = [
        migrations.RunPython(
            build_alignment(EXPECTED_CONSTRAINTS, EXPECTED_INDEXES),
            migrations.RunPython.noop,
        ),
    ]
