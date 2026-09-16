from django.db import migrations

from apps.core.legacy_schema_alignment import build_alignment

# Catalog produced by the baseline migrations on an empty PostgreSQL database.
EXPECTED_CONSTRAINTS = (
    ("external_identities", "external_identities_pkey", "p", "PRIMARY KEY (id)"),
    ("external_identities", "external_identities_user_id_6d6eda64_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("external_identities", "unique_external_identity_provider_subject", "u", "UNIQUE (provider_key, subject)"),
    ("teacher_activation_invites", "teacher_activation_invites_consumed_by_id_b948675a_fk_users_id", "f", "FOREIGN KEY (consumed_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("teacher_activation_invites", "teacher_activation_invites_created_by_id_c839da69_fk_users_id", "f", "FOREIGN KEY (created_by_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("teacher_activation_invites", "teacher_activation_invites_pkey", "p", "PRIMARY KEY (id)"),
    ("teacher_activation_invites", "teacher_activation_invites_target_user_id_77631cf2_fk_users_id", "f", "FOREIGN KEY (target_user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("teacher_activation_invites", "teacher_activation_invites_token_digest_key", "u", "UNIQUE (token_digest)"),
    ("user_login_records", "user_login_records_pkey", "p", "PRIMARY KEY (id)"),
    ("user_login_records", "user_login_records_user_id_86573911_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("user_profiles", "user_profiles_pkey", "p", "PRIMARY KEY (id)"),
    ("user_profiles", "user_profiles_user_id_8c5ab5fe_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("user_profiles", "user_profiles_user_id_key", "u", "UNIQUE (user_id)"),
    ("users", "email_users_must_have_password", "c", "CHECK (((NOT (((auth_provider)::text = 'email'::text) AND ((password)::text = ''::text))) OR (((auth_provider)::text = 'email'::text) AND (password IS NOT NULL))))"),
    ("users", "users_email_key", "u", "UNIQUE (email)"),
    ("users", "users_pkey", "p", "PRIMARY KEY (id)"),
    ("users", "users_username_key", "u", "UNIQUE (username)"),
    ("users_groups", "users_groups_group_id_2f3517aa_fk_auth_group_id", "f", "FOREIGN KEY (group_id) REFERENCES auth_group(id) DEFERRABLE INITIALLY DEFERRED"),
    ("users_groups", "users_groups_pkey", "p", "PRIMARY KEY (id)"),
    ("users_groups", "users_groups_user_id_f500bee5_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("users_groups", "users_groups_user_id_group_id_fc7788e8_uniq", "u", "UNIQUE (user_id, group_id)"),
    ("users_user_permissions", "users_user_permissio_permission_id_6d08dcd2_fk_auth_perm", "f", "FOREIGN KEY (permission_id) REFERENCES auth_permission(id) DEFERRABLE INITIALLY DEFERRED"),
    ("users_user_permissions", "users_user_permissions_pkey", "p", "PRIMARY KEY (id)"),
    ("users_user_permissions", "users_user_permissions_user_id_92473840_fk_users_id", "f", "FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED"),
    ("users_user_permissions", "users_user_permissions_user_id_permission_id_3b86cbdf_uniq", "u", "UNIQUE (user_id, permission_id)"),
)

EXPECTED_INDEXES = (
    ("external_identities", "external_id_provide_d58c14_idx", "CREATE INDEX external_id_provide_d58c14_idx ON external_identities USING btree (provider_key, email)"),
    ("external_identities", "external_id_user_id_94d6ea_idx", "CREATE INDEX external_id_user_id_94d6ea_idx ON external_identities USING btree (user_id, provider_key)"),
    ("external_identities", "external_identities_email_c56aa4a4", "CREATE INDEX external_identities_email_c56aa4a4 ON external_identities USING btree (email)"),
    ("external_identities", "external_identities_email_c56aa4a4_like", "CREATE INDEX external_identities_email_c56aa4a4_like ON external_identities USING btree (email varchar_pattern_ops)"),
    ("external_identities", "external_identities_provider_key_e7086a3c", "CREATE INDEX external_identities_provider_key_e7086a3c ON external_identities USING btree (provider_key)"),
    ("external_identities", "external_identities_provider_key_e7086a3c_like", "CREATE INDEX external_identities_provider_key_e7086a3c_like ON external_identities USING btree (provider_key varchar_pattern_ops)"),
    ("external_identities", "external_identities_user_id_6d6eda64", "CREATE INDEX external_identities_user_id_6d6eda64 ON external_identities USING btree (user_id)"),
    ("teacher_activation_invites", "teacher_act_email_9fee36_idx", "CREATE INDEX teacher_act_email_9fee36_idx ON teacher_activation_invites USING btree (email)"),
    ("teacher_activation_invites", "teacher_act_expires_7cad22_idx", "CREATE INDEX teacher_act_expires_7cad22_idx ON teacher_activation_invites USING btree (expires_at)"),
    ("teacher_activation_invites", "teacher_activation_invites_consumed_by_id_b948675a", "CREATE INDEX teacher_activation_invites_consumed_by_id_b948675a ON teacher_activation_invites USING btree (consumed_by_id)"),
    ("teacher_activation_invites", "teacher_activation_invites_created_by_id_c839da69", "CREATE INDEX teacher_activation_invites_created_by_id_c839da69 ON teacher_activation_invites USING btree (created_by_id)"),
    ("teacher_activation_invites", "teacher_activation_invites_email_5b405a82", "CREATE INDEX teacher_activation_invites_email_5b405a82 ON teacher_activation_invites USING btree (email)"),
    ("teacher_activation_invites", "teacher_activation_invites_email_5b405a82_like", "CREATE INDEX teacher_activation_invites_email_5b405a82_like ON teacher_activation_invites USING btree (email varchar_pattern_ops)"),
    ("teacher_activation_invites", "teacher_activation_invites_target_user_id_77631cf2", "CREATE INDEX teacher_activation_invites_target_user_id_77631cf2 ON teacher_activation_invites USING btree (target_user_id)"),
    ("teacher_activation_invites", "teacher_activation_invites_token_digest_a1084d1b_like", "CREATE INDEX teacher_activation_invites_token_digest_a1084d1b_like ON teacher_activation_invites USING btree (token_digest varchar_pattern_ops)"),
    ("user_login_records", "user_login__user_id_af7c24_idx", "CREATE INDEX user_login__user_id_af7c24_idx ON user_login_records USING btree (user_id, created_at DESC)"),
    ("user_login_records", "user_login_records_user_id_86573911", "CREATE INDEX user_login_records_user_id_86573911 ON user_login_records USING btree (user_id)"),
    ("users", "users_auth_pr_e717fd_idx", "CREATE INDEX users_auth_pr_e717fd_idx ON users USING btree (auth_provider, oauth_id)"),
    ("users", "users_auth_provider_cc2eec2d", "CREATE INDEX users_auth_provider_cc2eec2d ON users USING btree (auth_provider)"),
    ("users", "users_auth_provider_cc2eec2d_like", "CREATE INDEX users_auth_provider_cc2eec2d_like ON users USING btree (auth_provider varchar_pattern_ops)"),
    ("users", "users_email_0ea73cca_like", "CREATE INDEX users_email_0ea73cca_like ON users USING btree (email varchar_pattern_ops)"),
    ("users", "users_email_4b85f2_idx", "CREATE INDEX users_email_4b85f2_idx ON users USING btree (email)"),
    ("users", "users_oauth_id_4893a1c1", "CREATE INDEX users_oauth_id_4893a1c1 ON users USING btree (oauth_id)"),
    ("users", "users_oauth_id_4893a1c1_like", "CREATE INDEX users_oauth_id_4893a1c1_like ON users USING btree (oauth_id varchar_pattern_ops)"),
    ("users", "users_role_0ace22_idx", "CREATE INDEX users_role_0ace22_idx ON users USING btree (role)"),
    ("users", "users_role_f0571928", "CREATE INDEX users_role_f0571928 ON users USING btree (role)"),
    ("users", "users_role_f0571928_like", "CREATE INDEX users_role_f0571928_like ON users USING btree (role varchar_pattern_ops)"),
    ("users", "users_usernam_baeb4b_idx", "CREATE INDEX users_usernam_baeb4b_idx ON users USING btree (username)"),
    ("users", "users_username_e8658fc8_like", "CREATE INDEX users_username_e8658fc8_like ON users USING btree (username varchar_pattern_ops)"),
    ("users_groups", "users_groups_group_id_2f3517aa", "CREATE INDEX users_groups_group_id_2f3517aa ON users_groups USING btree (group_id)"),
    ("users_groups", "users_groups_user_id_f500bee5", "CREATE INDEX users_groups_user_id_f500bee5 ON users_groups USING btree (user_id)"),
    ("users_user_permissions", "users_user_permissions_permission_id_6d08dcd2", "CREATE INDEX users_user_permissions_permission_id_6d08dcd2 ON users_user_permissions USING btree (permission_id)"),
    ("users_user_permissions", "users_user_permissions_user_id_92473840", "CREATE INDEX users_user_permissions_user_id_92473840 ON users_user_permissions USING btree (user_id)"),
)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_baseline"),
    ]

    operations = [
        migrations.RunPython(
            build_alignment(EXPECTED_CONSTRAINTS, EXPECTED_INDEXES),
            migrations.RunPython.noop,
        ),
    ]
