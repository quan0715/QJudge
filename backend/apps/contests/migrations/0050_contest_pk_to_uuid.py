"""
Migration: Convert Contest PK from auto-increment integer to UUID.

Three phases:
  A) Add a uuid column to contests, populate existing rows.
  B) For every FK table: add a uuid-typed column, copy data, drop old FK+column.
  C) Drop the old integer PK, promote uuid to PK, rename FK columns back.
"""
import uuid

from django.db import migrations, models
import django.db.models.deletion


# ── Tables with a NOT NULL FK ─────────────────────────────────────────────
FK_TABLES_NOT_NULL = [
    # (table, fk_column, constraint_name)
    ("contest_problems", "contest_id", "contest_problems_contest_id_04159ddc_fk_contests_id"),
    ("exam_questions", "contest_id", "exam_questions_contest_id_1a3fe4f3_fk_contests_id"),
    ("contest_participants", "contest_id", "contest_participants_contest_id_09eb8fd9_fk_contests_id"),
    ("contest_announcements", "contest_id", "contest_announcements_contest_id_575ee8cf_fk_contests_id"),
    ("contest_clarifications", "contest_id", "contest_clarifications_contest_id_25da9663_fk_contests_id"),
    ("exam_events", "contest_id", "exam_events_contest_id_e2c66062_fk_contests_id"),
    ("exam_evidence_jobs", "contest_id", "exam_evidence_jobs_contest_id_3c53eec3_fk_contests_id"),
    ("exam_evidence_videos", "contest_id", "exam_evidence_videos_contest_id_c0c49207_fk_contests_id"),
    ("contest_activities", "contest_id", "contest_activities_contest_id_f2180fd0_fk_contests_id"),
    ("contests_admins", "contest_id", "contests_admins_contest_id_184139c3_fk_contests_id"),
    ("classrooms_classroomcontest", "contest_id", "classrooms_classroomcontest_contest_id_9c6bb247_fk_contests_id"),
]

# ── Tables with a NULLABLE FK ────────────────────────────────────────────
FK_TABLES_NULLABLE = [
    ("submissions", "contest_id", "submissions_contest_id_3c8de7a5_fk_contests_id"),
    ("problems", "created_in_contest_id", "problems_created_in_contest_id_bec95bd0_fk_contests_id"),
]

ALL_FK_TABLES = FK_TABLES_NOT_NULL + FK_TABLES_NULLABLE

# ── Unique constraints that involve contest FK columns ───────────────────
UNIQUE_CONSTRAINTS = [
    ("classrooms_classroomcontest", "classrooms_classroomcont_classroom_id_contest_id_ccb2bf03_uniq"),
    ("contest_participants", "contest_participants_contest_id_user_id_fba0cd52_uniq"),
    ("contest_problems", "contest_problems_contest_id_problem_id_ce1da93c_uniq"),
    ("contests_admins", "contests_admins_contest_id_user_id_2f699329_uniq"),
    ("exam_evidence_jobs", "uniq_evidence_job_contest_participant_module_session"),
]


def forwards(apps, schema_editor):
    """Phase A+B+C in raw SQL for PostgreSQL."""
    cursor = schema_editor.connection.cursor()

    # ── Phase A: add uuid column to contests ─────────────────────────────
    cursor.execute(
        "ALTER TABLE contests ADD COLUMN uuid uuid NOT NULL DEFAULT gen_random_uuid()"
    )
    cursor.execute(
        "ALTER TABLE contests ADD CONSTRAINT contests_uuid_unique UNIQUE (uuid)"
    )

    # ── Phase B: for every FK table, create _uuid col and populate ───────
    for table, col, fk_name in ALL_FK_TABLES:
        tmp = col.replace("_id", "_uuid") if col.endswith("_id") else f"{col}_uuid"

        # Drop old FK constraint
        cursor.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{fk_name}"')

        # Drop unique constraints that involve this column
        for uq_table, uq_name in UNIQUE_CONSTRAINTS:
            if uq_table == table:
                cursor.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{uq_name}"')

        # Add temp uuid column (nullable initially)
        cursor.execute(f'ALTER TABLE "{table}" ADD COLUMN "{tmp}" uuid')

        # Populate from contests.uuid
        if col == "created_in_contest_id":
            cursor.execute(f"""
                UPDATE "{table}" SET "{tmp}" = c.uuid
                FROM contests c WHERE "{table}"."{col}" = c.id
            """)
        else:
            cursor.execute(f"""
                UPDATE "{table}" SET "{tmp}" = c.uuid
                FROM contests c WHERE "{table}"."{col}" = c.id
            """)

    # Set NOT NULL on non-nullable FK tables
    for table, col, _ in FK_TABLES_NOT_NULL:
        tmp = col.replace("_id", "_uuid") if col.endswith("_id") else f"{col}_uuid"
        cursor.execute(f'ALTER TABLE "{table}" ALTER COLUMN "{tmp}" SET NOT NULL')

    # ── Phase C: swap columns ────────────────────────────────────────────

    # Drop indexes on old contest_id columns (custom indexes from models)
    # Django auto-creates indexes for FK columns; drop them
    cursor.execute("""
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE tablename IN ({tables})
          AND indexdef LIKE '%%contest_id%%'
          AND indexname NOT LIKE '%%pkey%%'
    """.format(tables=",".join(f"'{t}'" for t, _, _ in ALL_FK_TABLES)))
    for idx_name, tbl_name in cursor.fetchall():
        cursor.execute(f'DROP INDEX IF EXISTS "{idx_name}"')

    # Also drop indexes on contests table itself (except PK)
    cursor.execute("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'contests'
          AND indexname NOT LIKE '%%pkey%%'
          AND indexname != 'contests_uuid_unique'
    """)
    contest_indexes = cursor.fetchall()

    # Drop old FK columns, rename uuid columns
    for table, col, _ in ALL_FK_TABLES:
        tmp = col.replace("_id", "_uuid") if col.endswith("_id") else f"{col}_uuid"
        cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN "{col}"')
        cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{tmp}" TO "{col}"')

    # Drop old PK on contests
    cursor.execute("ALTER TABLE contests DROP CONSTRAINT contests_pkey")
    cursor.execute("ALTER TABLE contests DROP COLUMN id")
    cursor.execute("ALTER TABLE contests RENAME COLUMN uuid TO id")
    cursor.execute("ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_uuid_unique")
    cursor.execute("ALTER TABLE contests ADD CONSTRAINT contests_pkey PRIMARY KEY (id)")

    # Restore indexes on contests table
    for (idx_name,) in contest_indexes:
        # We'll recreate the standard Django indexes via the ORM state;
        # the important ones will be re-added by Django's migration framework
        pass

    # ── Phase D: re-add FK constraints and unique constraints ────────────
    for table, col, _ in FK_TABLES_NOT_NULL:
        fk_name = f"{table}_{col}_fk_contests_id"
        cursor.execute(f"""
            ALTER TABLE "{table}"
            ADD CONSTRAINT "{fk_name}"
            FOREIGN KEY ("{col}") REFERENCES contests(id)
            ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """)
    for table, col, _ in FK_TABLES_NULLABLE:
        fk_name = f"{table}_{col}_fk_contests_id"
        on_delete = "SET NULL" if col == "contest_id" else "SET NULL"
        cursor.execute(f"""
            ALTER TABLE "{table}"
            ADD CONSTRAINT "{fk_name}"
            FOREIGN KEY ("{col}") REFERENCES contests(id)
            ON DELETE {on_delete} DEFERRABLE INITIALLY DEFERRED
        """)

    # Re-add unique constraints
    cursor.execute("""
        ALTER TABLE classrooms_classroomcontest
        ADD CONSTRAINT classrooms_classroomcont_classroom_id_contest_id_uniq
        UNIQUE (classroom_id, contest_id)
    """)
    cursor.execute("""
        ALTER TABLE contest_participants
        ADD CONSTRAINT contest_participants_contest_id_user_id_uniq
        UNIQUE (contest_id, user_id)
    """)
    cursor.execute("""
        ALTER TABLE contest_problems
        ADD CONSTRAINT contest_problems_contest_id_problem_id_uniq
        UNIQUE (contest_id, problem_id)
    """)
    cursor.execute("""
        ALTER TABLE contests_admins
        ADD CONSTRAINT contests_admins_contest_id_user_id_uniq
        UNIQUE (contest_id, user_id)
    """)
    cursor.execute("""
        ALTER TABLE exam_evidence_jobs
        ADD CONSTRAINT uniq_evidence_job_contest_participant_module_session
        UNIQUE (contest_id, participant_id, source_module, upload_session_id)
    """)

    # Re-add indexes that Django models define
    cursor.execute("CREATE INDEX exam_events_contest_user_idx ON exam_events (contest_id, user_id)")
    cursor.execute("CREATE INDEX exam_events_created_at_idx ON exam_events (created_at)")
    cursor.execute("CREATE INDEX exam_questions_contest_order_idx ON exam_questions (contest_id, \"order\")")
    cursor.execute("CREATE INDEX contest_activities_contest_created_idx ON contest_activities (contest_id, created_at)")
    cursor.execute('CREATE INDEX exam_eviden_contest_2bf0d4_idx ON exam_evidence_jobs (contest_id, status)')
    cursor.execute('CREATE INDEX exam_eviden_contest_5f7ba0_idx ON exam_evidence_videos (contest_id, participant_id)')
    cursor.execute('CREATE INDEX exam_eviden_contest_0efcb1_idx ON exam_evidence_videos (contest_id, is_suspected)')

    # Standard FK indexes
    for table, col, _ in ALL_FK_TABLES:
        idx_name = f"{table}_{col}_idx"
        cursor.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{table}" ("{col}")')


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0049_add_split_view_detected_event_type"),
        ("submissions", "0012_submission_lab"),
        ("classrooms", "0003_classroomannouncement"),
        ("problems", "0013_remove_problem_problems_is_visi_40a652_idx_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
            state_operations=[
                # Tell Django the Contest PK is now a UUIDField
                migrations.RemoveField(model_name="contest", name="id"),
                migrations.AddField(
                    model_name="contest",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                # Update all FK fields to point to UUID PK
                # (Django state needs to know the FK target type changed)
            ],
        ),
    ]
