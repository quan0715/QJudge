import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("contests", "0063_source_question_id_indexes"),
        ("question_bank", "0010_questionbank_unique_active_bank_per_user_category"),
    ]

    operations = [
        migrations.CreateModel(
            name="QuestionAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("asset_type", models.CharField(choices=[("coding", "Coding"), ("true_false", "True/False"), ("single_choice", "Single Choice"), ("multiple_choice", "Multiple Choice"), ("short_answer", "Short Answer"), ("essay", "Essay"), ("reading_set", "Reading Set")], db_index=True, max_length=32)),
                ("title", models.CharField(blank=True, default="", max_length=255)),
                ("prompt", models.TextField(blank=True, default="")),
                ("status", models.CharField(choices=[("draft", "Draft"), ("active", "Active"), ("archived", "Archived")], db_index=True, default="active", max_length=20)),
                ("visibility", models.CharField(choices=[("private", "Private"), ("public", "Public")], db_index=True, default="private", max_length=20)),
                ("version_state", models.CharField(choices=[("draft", "Draft"), ("published", "Published")], db_index=True, default="published", max_length=20)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="question_assets", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "question_assets",
                "ordering": ["-updated_at", "id"],
            },
        ),
        migrations.CreateModel(
            name="QuestionVersion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version_number", models.PositiveIntegerField()),
                ("title", models.CharField(blank=True, default="", max_length=255)),
                ("prompt", models.TextField(blank=True, default="")),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_question_versions", to=settings.AUTH_USER_MODEL)),
                ("question_asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="versions", to="question_bank.questionasset")),
            ],
            options={
                "db_table": "question_versions",
                "ordering": ["-version_number", "-created_at"],
            },
        ),
        migrations.AddField(
            model_name="questionasset",
            name="latest_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="question_bank.questionversion"),
        ),
        migrations.AddField(
            model_name="question",
            name="question_asset",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bank_question_adapters", to="question_bank.questionasset"),
        ),
        migrations.AddField(
            model_name="question",
            name="question_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bank_question_adapters", to="question_bank.questionversion"),
        ),
        migrations.CreateModel(
            name="QuestionBankMembership",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("order", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("added_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="added_question_bank_memberships", to=settings.AUTH_USER_MODEL)),
                ("bank", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="asset_memberships", to="question_bank.questionbank")),
                ("legacy_question", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="asset_membership", to="question_bank.question")),
                ("question_asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="bank_memberships", to="question_bank.questionasset")),
            ],
            options={
                "db_table": "question_bank_memberships",
                "ordering": ["order", "created_at"],
            },
        ),
        migrations.CreateModel(
            name="ContestQuestionBinding",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("binding_type", models.CharField(choices=[("coding", "Coding"), ("true_false", "True/False"), ("single_choice", "Single Choice"), ("multiple_choice", "Multiple Choice"), ("short_answer", "Short Answer"), ("essay", "Essay"), ("reading_set", "Reading Set")], max_length=32)),
                ("order", models.IntegerField(default=0)),
                ("score", models.PositiveIntegerField(default=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="question_bindings", to="contests.contest")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_contest_question_bindings", to=settings.AUTH_USER_MODEL)),
                ("legacy_contest_problem", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="question_binding", to="contests.contestproblem")),
                ("legacy_exam_question", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="question_binding", to="contests.examquestion")),
                ("question_asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contest_bindings", to="question_bank.questionasset")),
                ("question_version", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="contest_bindings", to="question_bank.questionversion")),
            ],
            options={
                "db_table": "contest_question_bindings",
                "ordering": ["order", "created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="questionasset",
            index=models.Index(fields=["owner", "asset_type"], name="question_as_owner_i_27ccd4_idx"),
        ),
        migrations.AddIndex(
            model_name="questionasset",
            index=models.Index(fields=["status", "visibility"], name="question_as_status_7ef55c_idx"),
        ),
        migrations.AddConstraint(
            model_name="questionversion",
            constraint=models.UniqueConstraint(fields=("question_asset", "version_number"), name="unique_question_version_per_asset"),
        ),
        migrations.AddConstraint(
            model_name="questionbankmembership",
            constraint=models.UniqueConstraint(fields=("bank", "question_asset"), name="unique_bank_membership_per_asset"),
        ),
        migrations.AddIndex(
            model_name="contestquestionbinding",
            index=models.Index(fields=["contest", "order"], name="contest_que_contest_f33ed3_idx"),
        ),
        migrations.AddIndex(
            model_name="contestquestionbinding",
            index=models.Index(fields=["question_asset"], name="contest_que_questio_c4a50d_idx"),
        ),
    ]
