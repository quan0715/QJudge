from django.db import migrations

from apps.core.legacy_schema_alignment import build_alignment

# Catalog produced by the baseline migrations on an empty PostgreSQL database.
EXPECTED_CONSTRAINTS = (
    ("contest_question_bindings", "contest_question_bin_coding_problem_id_ba2f6f9b_fk_problems_", "f", "FOREIGN KEY (coding_problem_id) REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bin_exam_question_id_c1775875_fk_exam_ques", "f", "FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bin_question_asset_id_b44b350d_fk_question_", "f", "FOREIGN KEY (question_asset_id) REFERENCES question_assets(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bin_question_version_id_9832eb4f_fk_question_", "f", "FOREIGN KEY (question_version_id) REFERENCES question_versions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bindings_contest_id_88556693_fk_contests_id", "f", "FOREIGN KEY (contest_id) REFERENCES contests(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bindings_created_by_id_301054d1_fk_users_id", "f", "FOREIGN KEY (created_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("contest_question_bindings", "contest_question_bindings_exam_question_id_key", "u", "UNIQUE (exam_question_id)"),
    ("contest_question_bindings", "contest_question_bindings_pkey", "p", "PRIMARY KEY (id)"),
    ("contest_question_bindings", "contest_question_bindings_score_check", "c", "CHECK ((score >= 0))"),
    ("question_assets", "question_assets_latest_version_id_fe4ec159_fk_question_", "f", "FOREIGN KEY (latest_version_id) REFERENCES question_versions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_assets", "question_assets_owner_id_803b6a16_fk_users_id", "f", "FOREIGN KEY (owner_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_assets", "question_assets_pkey", "p", "PRIMARY KEY (id)"),
    ("question_bank_memberships", "question_bank_member_question_asset_id_05c7be4a_fk_question_", "f", "FOREIGN KEY (question_asset_id) REFERENCES question_assets(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_bank_memberships", "question_bank_memberships_added_by_id_8d3357e0_fk_users_id", "f", "FOREIGN KEY (added_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_bank_memberships", "question_bank_memberships_bank_id_a7556a59_fk_question_banks_id", "f", "FOREIGN KEY (bank_id) REFERENCES question_banks(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_bank_memberships", "question_bank_memberships_pkey", "p", "PRIMARY KEY (id)"),
    ("question_bank_memberships", "unique_bank_membership_per_asset", "u", "UNIQUE (bank_id, question_asset_id)"),
    ("question_banks", "question_banks_owner_id_a9c39219_fk_users_id", "f", "FOREIGN KEY (owner_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_banks", "question_banks_pkey", "p", "PRIMARY KEY (id)"),
    ("question_banks", "question_banks_uuid_key", "u", "UNIQUE (uuid)"),
    ("question_versions", "question_versions_created_by_id_394f9fc0_fk_users_id", "f", "FOREIGN KEY (created_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_versions", "question_versions_pkey", "p", "PRIMARY KEY (id)"),
    ("question_versions", "question_versions_question_asset_id_8d41ef48_fk_question_", "f", "FOREIGN KEY (question_asset_id) REFERENCES question_assets(id) DEFERRABLE INITIALLY DEFERRED"),
    ("question_versions", "question_versions_version_number_check", "c", "CHECK ((version_number >= 0))"),
    ("question_versions", "unique_question_version_per_asset", "u", "UNIQUE (question_asset_id, version_number)"),
)

EXPECTED_INDEXES = (
    ("contest_question_bindings", "contest_que_coding__b1149c_idx", "CREATE INDEX contest_que_coding__b1149c_idx ON contest_question_bindings USING btree (coding_problem_id)"),
    ("contest_question_bindings", "contest_que_contest_f33ed3_idx", "CREATE INDEX contest_que_contest_f33ed3_idx ON contest_question_bindings USING btree (contest_id, \"order\")"),
    ("contest_question_bindings", "contest_que_questio_c4a50d_idx", "CREATE INDEX contest_que_questio_c4a50d_idx ON contest_question_bindings USING btree (question_asset_id)"),
    ("contest_question_bindings", "contest_question_bindings_coding_problem_id_ba2f6f9b", "CREATE INDEX contest_question_bindings_coding_problem_id_ba2f6f9b ON contest_question_bindings USING btree (coding_problem_id)"),
    ("contest_question_bindings", "contest_question_bindings_contest_id_88556693", "CREATE INDEX contest_question_bindings_contest_id_88556693 ON contest_question_bindings USING btree (contest_id)"),
    ("contest_question_bindings", "contest_question_bindings_created_by_id_301054d1", "CREATE INDEX contest_question_bindings_created_by_id_301054d1 ON contest_question_bindings USING btree (created_by_id)"),
    ("contest_question_bindings", "contest_question_bindings_question_asset_id_b44b350d", "CREATE INDEX contest_question_bindings_question_asset_id_b44b350d ON contest_question_bindings USING btree (question_asset_id)"),
    ("contest_question_bindings", "contest_question_bindings_question_version_id_9832eb4f", "CREATE INDEX contest_question_bindings_question_version_id_9832eb4f ON contest_question_bindings USING btree (question_version_id)"),
    ("question_assets", "question_as_owner_i_27ccd4_idx", "CREATE INDEX question_as_owner_i_27ccd4_idx ON question_assets USING btree (owner_id, asset_type)"),
    ("question_assets", "question_assets_asset_type_0588542a", "CREATE INDEX question_assets_asset_type_0588542a ON question_assets USING btree (asset_type)"),
    ("question_assets", "question_assets_asset_type_0588542a_like", "CREATE INDEX question_assets_asset_type_0588542a_like ON question_assets USING btree (asset_type varchar_pattern_ops)"),
    ("question_assets", "question_assets_latest_version_id_fe4ec159", "CREATE INDEX question_assets_latest_version_id_fe4ec159 ON question_assets USING btree (latest_version_id)"),
    ("question_assets", "question_assets_owner_id_803b6a16", "CREATE INDEX question_assets_owner_id_803b6a16 ON question_assets USING btree (owner_id)"),
    ("question_bank_memberships", "question_bank_memberships_added_by_id_8d3357e0", "CREATE INDEX question_bank_memberships_added_by_id_8d3357e0 ON question_bank_memberships USING btree (added_by_id)"),
    ("question_bank_memberships", "question_bank_memberships_bank_id_a7556a59", "CREATE INDEX question_bank_memberships_bank_id_a7556a59 ON question_bank_memberships USING btree (bank_id)"),
    ("question_bank_memberships", "question_bank_memberships_question_asset_id_05c7be4a", "CREATE INDEX question_bank_memberships_question_asset_id_05c7be4a ON question_bank_memberships USING btree (question_asset_id)"),
    ("question_banks", "question_ba_owner_i_4e1d12_idx", "CREATE INDEX question_ba_owner_i_4e1d12_idx ON question_banks USING btree (owner_id, category)"),
    ("question_banks", "question_banks_category_f67e2b00", "CREATE INDEX question_banks_category_f67e2b00 ON question_banks USING btree (category)"),
    ("question_banks", "question_banks_category_f67e2b00_like", "CREATE INDEX question_banks_category_f67e2b00_like ON question_banks USING btree (category varchar_pattern_ops)"),
    ("question_banks", "question_banks_is_archived_546ba0db", "CREATE INDEX question_banks_is_archived_546ba0db ON question_banks USING btree (is_archived)"),
    ("question_banks", "question_banks_owner_id_a9c39219", "CREATE INDEX question_banks_owner_id_a9c39219 ON question_banks USING btree (owner_id)"),
    ("question_versions", "question_versions_created_by_id_394f9fc0", "CREATE INDEX question_versions_created_by_id_394f9fc0 ON question_versions USING btree (created_by_id)"),
    ("question_versions", "question_versions_question_asset_id_8d41ef48", "CREATE INDEX question_versions_question_asset_id_8d41ef48 ON question_versions USING btree (question_asset_id)"),
)


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0002_baseline"),
    ]

    operations = [
        migrations.RunPython(
            build_alignment(EXPECTED_CONSTRAINTS, EXPECTED_INDEXES),
            migrations.RunPython.noop,
        ),
    ]
