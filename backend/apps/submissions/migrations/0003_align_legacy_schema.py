from django.db import migrations

from apps.core.legacy_schema_alignment import build_alignment

# Catalog produced by the baseline migrations on an empty PostgreSQL database.
EXPECTED_CONSTRAINTS = (
    ("screen_events", "screen_events_pkey", "p", "PRIMARY KEY (id)"),
    ("screen_events", "screen_events_submission_id_f70f8c68_fk_submissions_id", "f", "FOREIGN KEY (submission_id) REFERENCES submissions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submission_results", "submission_results_pkey", "p", "PRIMARY KEY (id)"),
    ("submission_results", "submission_results_submission_id_e9be85ab_fk_submissions_id", "f", "FOREIGN KEY (submission_id) REFERENCES submissions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submission_results", "submission_results_test_case_id_ab7a7233_fk_test_cases_id", "f", "FOREIGN KEY (test_case_id) REFERENCES test_cases(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submissions", "submissions_contest_id_3c8de7a5_fk_contests_id", "f", "FOREIGN KEY (contest_id) REFERENCES contests(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submissions", "submissions_contest_question_bin_e563cded_fk_contest_q", "f", "FOREIGN KEY (contest_question_binding_id) REFERENCES contest_question_bindings(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submissions", "submissions_pkey", "p", "PRIMARY KEY (id)"),
    ("submissions", "submissions_problem_id_f3412834_fk_problems_id", "f", "FOREIGN KEY (problem_id) REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED"),
    ("submissions", "submissions_user_id_14b0d84e_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
)

EXPECTED_INDEXES = (
    ("screen_events", "screen_events_submission_id_f70f8c68", "CREATE INDEX screen_events_submission_id_f70f8c68 ON screen_events USING btree (submission_id)"),
    ("submission_results", "submission_results_submission_id_e9be85ab", "CREATE INDEX submission_results_submission_id_e9be85ab ON submission_results USING btree (submission_id)"),
    ("submission_results", "submission_results_test_case_id_ab7a7233", "CREATE INDEX submission_results_test_case_id_ab7a7233 ON submission_results USING btree (test_case_id)"),
    ("submissions", "sub_contest_src_created_idx", "CREATE INDEX sub_contest_src_created_idx ON submissions USING btree (contest_id, source_type, created_at DESC)"),
    ("submissions", "sub_problem_created_idx", "CREATE INDEX sub_problem_created_idx ON submissions USING btree (problem_id, created_at DESC)"),
    ("submissions", "sub_src_test_created_idx", "CREATE INDEX sub_src_test_created_idx ON submissions USING btree (source_type, is_test, created_at DESC)"),
    ("submissions", "sub_status_created_idx", "CREATE INDEX sub_status_created_idx ON submissions USING btree (status, created_at DESC)"),
    ("submissions", "sub_user_created_idx", "CREATE INDEX sub_user_created_idx ON submissions USING btree (user_id, created_at DESC)"),
    ("submissions", "submissions_contest_id_3c8de7a5", "CREATE INDEX submissions_contest_id_3c8de7a5 ON submissions USING btree (contest_id)"),
    ("submissions", "submissions_contest_question_binding_id_e563cded", "CREATE INDEX submissions_contest_question_binding_id_e563cded ON submissions USING btree (contest_question_binding_id)"),
    ("submissions", "submissions_created_at_6d31a06a", "CREATE INDEX submissions_created_at_6d31a06a ON submissions USING btree (created_at)"),
    ("submissions", "submissions_problem_id_f3412834", "CREATE INDEX submissions_problem_id_f3412834 ON submissions USING btree (problem_id)"),
    ("submissions", "submissions_source_type_62c73e3a", "CREATE INDEX submissions_source_type_62c73e3a ON submissions USING btree (source_type)"),
    ("submissions", "submissions_source_type_62c73e3a_like", "CREATE INDEX submissions_source_type_62c73e3a_like ON submissions USING btree (source_type varchar_pattern_ops)"),
    ("submissions", "submissions_status_1cff8c79", "CREATE INDEX submissions_status_1cff8c79 ON submissions USING btree (status)"),
    ("submissions", "submissions_status_1cff8c79_like", "CREATE INDEX submissions_status_1cff8c79_like ON submissions USING btree (status varchar_pattern_ops)"),
    ("submissions", "submissions_status_dcc854_idx", "CREATE INDEX submissions_status_dcc854_idx ON submissions USING btree (status)"),
    ("submissions", "submissions_user_id_14b0d84e", "CREATE INDEX submissions_user_id_14b0d84e ON submissions USING btree (user_id)"),
    ("submissions", "submissions_user_id_34eafe_idx", "CREATE INDEX submissions_user_id_34eafe_idx ON submissions USING btree (user_id, problem_id)"),
)


class Migration(migrations.Migration):
    dependencies = [
        ("submissions", "0002_baseline"),
    ]

    operations = [
        migrations.RunPython(
            build_alignment(EXPECTED_CONSTRAINTS, EXPECTED_INDEXES),
            migrations.RunPython.noop,
        ),
    ]
