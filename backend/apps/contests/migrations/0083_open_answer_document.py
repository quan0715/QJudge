# Generated for structured open-answer document support.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0082_exam_question_groups_answer_format"),
    ]

    operations = [
        migrations.AddField(
            model_name="examquestion",
            name="reference_answer_document",
            field=models.JSONField(
                blank=True,
                help_text="open_document 題型使用的結構化評分參考答案",
                null=True,
                verbose_name="評分參考答案文件",
            ),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="explanation_document",
            field=models.JSONField(
                blank=True,
                help_text="open_document 題型使用的結構化詳解",
                null=True,
                verbose_name="詳解文件",
            ),
        ),
        migrations.AlterField(
            model_name="examquestion",
            name="answer_format",
            field=models.CharField(
                choices=[
                    ("plain_text", "純文字"),
                    ("markdown", "Markdown"),
                    ("markdown_math", "Markdown + 數學式"),
                    ("open_document", "開放作答紙"),
                ],
                default="plain_text",
                max_length=32,
                verbose_name="答案格式",
            ),
        ),
    ]
