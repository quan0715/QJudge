from django.db import migrations

from apps.core.legacy_schema_alignment import build_alignment

# Catalog produced by the baseline migrations on an empty PostgreSQL database.
EXPECTED_CONSTRAINTS = (
    ("problem_language_configs", "problem_language_configs_pkey", "p", "PRIMARY KEY (id)"),
    ("problem_language_configs", "problem_language_configs_problem_id_fdbcae0f_fk_problems_id", "f", "FOREIGN KEY (problem_id) REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED"),
    ("problem_language_configs", "problem_language_configs_problem_id_language_12aa0904_uniq", "u", "UNIQUE (problem_id, language)"),
    ("problems", "problems_created_by_id_f51f7473_fk_users_id", "f", "FOREIGN KEY (created_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("problems", "problems_pkey", "p", "PRIMARY KEY (id)"),
    ("problems", "problems_question_asset_id_59169564_fk_question_assets_id", "f", "FOREIGN KEY (question_asset_id) REFERENCES question_assets(id) DEFERRABLE INITIALLY DEFERRED"),
    ("problems", "problems_question_version_id_6dbeb5ae_fk_question_versions_id", "f", "FOREIGN KEY (question_version_id) REFERENCES question_versions(id) DEFERRABLE INITIALLY DEFERRED"),
    ("problems", "problems_slug_key", "u", "UNIQUE (slug)"),
    ("problems_tags", "problems_tags_codingproblem_id_871e64fd_fk_problems_id", "f", "FOREIGN KEY (codingproblem_id) REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED"),
    ("problems_tags", "problems_tags_codingproblem_id_tag_id_1a4fc499_uniq", "u", "UNIQUE (codingproblem_id, tag_id)"),
    ("problems_tags", "problems_tags_pkey", "p", "PRIMARY KEY (id)"),
    ("problems_tags", "problems_tags_tag_id_a6d84095_fk_tags_id", "f", "FOREIGN KEY (tag_id) REFERENCES tags(id) DEFERRABLE INITIALLY DEFERRED"),
    ("tags", "tags_name_key", "u", "UNIQUE (name)"),
    ("tags", "tags_pkey", "p", "PRIMARY KEY (id)"),
    ("tags", "tags_slug_key", "u", "UNIQUE (slug)"),
    ("test_cases", "test_cases_pkey", "p", "PRIMARY KEY (id)"),
    ("test_cases", "test_cases_problem_id_2d7f24e4_fk_problems_id", "f", "FOREIGN KEY (problem_id) REFERENCES problems(id) DEFERRABLE INITIALLY DEFERRED"),
    ("test_cases", "test_cases_weight_percent_check", "c", "CHECK ((weight_percent >= 0))"),
)

EXPECTED_INDEXES = (
    ("problem_language_configs", "problem_language_configs_problem_id_fdbcae0f", "CREATE INDEX problem_language_configs_problem_id_fdbcae0f ON problem_language_configs USING btree (problem_id)"),
    ("problems", "problems_created_by_id_f51f7473", "CREATE INDEX problems_created_by_id_f51f7473 ON problems USING btree (created_by_id)"),
    ("problems", "problems_question_asset_id_59169564", "CREATE INDEX problems_question_asset_id_59169564 ON problems USING btree (question_asset_id)"),
    ("problems", "problems_question_version_id_6dbeb5ae", "CREATE INDEX problems_question_version_id_6dbeb5ae ON problems USING btree (question_version_id)"),
    ("problems", "problems_slug_beceac20_like", "CREATE INDEX problems_slug_beceac20_like ON problems USING btree (slug varchar_pattern_ops)"),
    ("problems_tags", "problems_tags_codingproblem_id_871e64fd", "CREATE INDEX problems_tags_codingproblem_id_871e64fd ON problems_tags USING btree (codingproblem_id)"),
    ("problems_tags", "problems_tags_tag_id_a6d84095", "CREATE INDEX problems_tags_tag_id_a6d84095 ON problems_tags USING btree (tag_id)"),
    ("tags", "tags_name_d06e0d9e_like", "CREATE INDEX tags_name_d06e0d9e_like ON tags USING btree (name varchar_pattern_ops)"),
    ("tags", "tags_slug_92625acc_like", "CREATE INDEX tags_slug_92625acc_like ON tags USING btree (slug varchar_pattern_ops)"),
    ("test_cases", "test_cases_problem_id_2d7f24e4", "CREATE INDEX test_cases_problem_id_2d7f24e4 ON test_cases USING btree (problem_id)"),
)


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0002_baseline"),
    ]

    operations = [
        migrations.RunPython(
            build_alignment(EXPECTED_CONSTRAINTS, EXPECTED_INDEXES),
            migrations.RunPython.noop,
        ),
    ]
