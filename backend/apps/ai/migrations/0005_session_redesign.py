# Generated migration for AI Session redesign

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ai', '0004_allow_anonymous_sessions'),
    ]

    operations = [
        # 一次性執行所有操作，禁用觸發器來避免 PostgreSQL 的 pending trigger events 問題
        migrations.RunSQL(
            sql="""
            -- 禁用所有觸發器
            ALTER TABLE ai_aisession DISABLE TRIGGER ALL;
            ALTER TABLE ai_aimessage DISABLE TRIGGER ALL;
            ALTER TABLE ai_aiexecutionlog DISABLE TRIGGER ALL;

            -- 清空數據（先清空依賴表）
            DELETE FROM ai_aiexecutionlog;
            DELETE FROM ai_aimessage;
            DELETE FROM ai_aisession;

            -- 刪除外鍵約束
            ALTER TABLE ai_aimessage DROP CONSTRAINT ai_aimessage_session_id_29641548_fk_ai_aisession_id;
            ALTER TABLE ai_aiexecutionlog DROP CONSTRAINT ai_aiexecutionlog_session_id_5e413895_fk_ai_aisession_id;

            -- 添加臨時欄位到 ai_aisession
            ALTER TABLE ai_aisession ADD COLUMN session_id_new VARCHAR(36);

            -- 刪除 stage 和 is_active 欄位
            ALTER TABLE ai_aisession DROP COLUMN stage;
            ALTER TABLE ai_aisession DROP COLUMN is_active;

            -- 改變 ai_aisession 的 primary key
            ALTER TABLE ai_aisession DROP CONSTRAINT ai_aisession_pkey;
            ALTER TABLE ai_aisession DROP COLUMN id;
            ALTER TABLE ai_aisession RENAME COLUMN session_id_new TO session_id;
            ALTER TABLE ai_aisession ALTER COLUMN session_id SET NOT NULL;
            ALTER TABLE ai_aisession ADD PRIMARY KEY (session_id);

            -- 改變依賴表中的 session_id 列型別
            ALTER TABLE ai_aimessage ALTER COLUMN session_id TYPE VARCHAR(36) USING session_id::text;
            ALTER TABLE ai_aiexecutionlog ALTER COLUMN session_id TYPE VARCHAR(36) USING session_id::text;

            -- 重新創建外鍵約束
            ALTER TABLE ai_aimessage ADD CONSTRAINT ai_aimessage_session_id_fk FOREIGN KEY (session_id) REFERENCES ai_aisession(session_id) ON DELETE CASCADE;
            ALTER TABLE ai_aiexecutionlog ADD CONSTRAINT ai_aiexecutionlog_session_id_fk FOREIGN KEY (session_id) REFERENCES ai_aisession(session_id) ON DELETE CASCADE;

            -- 重新啟用觸發器
            ALTER TABLE ai_aisession ENABLE TRIGGER ALL;
            ALTER TABLE ai_aimessage ENABLE TRIGGER ALL;
            ALTER TABLE ai_aiexecutionlog ENABLE TRIGGER ALL;
            """,
            reverse_sql="""
            -- 禁用觸發器
            ALTER TABLE ai_aisession DISABLE TRIGGER ALL;
            ALTER TABLE ai_aimessage DISABLE TRIGGER ALL;
            ALTER TABLE ai_aiexecutionlog DISABLE TRIGGER ALL;

            -- 刪除外鍵約束
            ALTER TABLE ai_aimessage DROP CONSTRAINT ai_aimessage_session_id_fk;
            ALTER TABLE ai_aiexecutionlog DROP CONSTRAINT ai_aiexecutionlog_session_id_fk;

            -- 還原 ai_asession 表結構
            ALTER TABLE ai_aisession DROP CONSTRAINT ai_aisession_pkey;
            ALTER TABLE ai_aisession RENAME COLUMN session_id TO session_id_new;
            ALTER TABLE ai_aisession ADD COLUMN id SERIAL UNIQUE;
            ALTER TABLE ai_aisession ADD PRIMARY KEY (id);
            ALTER TABLE ai_aisession ADD COLUMN stage VARCHAR(50);
            ALTER TABLE ai_aisession ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

            -- 還原依賴表的列型別
            ALTER TABLE ai_aimessage ALTER COLUMN session_id TYPE BIGINT USING session_id::bigint;
            ALTER TABLE ai_aiexecutionlog ALTER COLUMN session_id TYPE BIGINT USING session_id::bigint;

            -- 重新創建外鍵約束
            ALTER TABLE ai_aimessage ADD CONSTRAINT ai_aimessage_session_id_29641548_fk_ai_aisession_id FOREIGN KEY (session_id) REFERENCES ai_aisession(id) ON DELETE CASCADE;
            ALTER TABLE ai_aiexecutionlog ADD CONSTRAINT ai_aiexecutionlog_session_id_5e413895_fk_ai_aisession_id FOREIGN KEY (session_id) REFERENCES ai_aisession(id) ON DELETE CASCADE;

            -- 重新啟用觸發器
            ALTER TABLE ai_aisession ENABLE TRIGGER ALL;
            ALTER TABLE ai_aimessage ENABLE TRIGGER ALL;
            ALTER TABLE ai_aiexecutionlog ENABLE TRIGGER ALL;
            """,
            state_operations=[
                # Tell Django that AISession PK changed from id to session_id
                migrations.RemoveField(
                    model_name='aisession',
                    name='id',
                ),
                migrations.RemoveField(
                    model_name='aisession',
                    name='stage',
                ),
                migrations.RemoveField(
                    model_name='aisession',
                    name='is_active',
                ),
                migrations.AddField(
                    model_name='aisession',
                    name='session_id',
                    field=models.CharField(
                        max_length=36,
                        primary_key=True,
                        serialize=False,
                        verbose_name='Claude SDK Session ID',
                        help_text='由 Claude Agent SDK 返回的唯一會話 ID',
                    ),
                ),
                # Update FK fields to reference new PK type
                migrations.AlterField(
                    model_name='aimessage',
                    name='session',
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='messages',
                        to='ai.aisession',
                        verbose_name='Session',
                    ),
                ),
                migrations.AlterField(
                    model_name='aiexecutionlog',
                    name='session',
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='execution_logs',
                        to='ai.aisession',
                        verbose_name='Session',
                    ),
                ),
            ],
        ),
    ]
