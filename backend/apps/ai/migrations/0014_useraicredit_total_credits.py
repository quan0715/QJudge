# 新增 total_credits 欄位，並依歷史 token 總量以 R1 費率做保守回填。

from django.db import migrations, models


# Backfill 時無法還原「每次 run 的模型」，以預設模型（R1）的費率做保守估計。
# 公式需與 apps/ai/credits.py 保持一致。
BACKFILL_INPUT_RATE = 55
BACKFILL_OUTPUT_RATE = 219
BACKFILL_SCALE = 400_000


def backfill_total_credits(apps, schema_editor):
    UserAICredit = apps.get_model("ai", "UserAICredit")
    for row in UserAICredit.objects.iterator(chunk_size=500):
        inp = int(row.total_input_tokens or 0)
        out = int(row.total_output_tokens or 0)
        cost_scaled = inp * BACKFILL_INPUT_RATE + out * BACKFILL_OUTPUT_RATE
        credits = 0 if cost_scaled <= 0 else -(-cost_scaled // BACKFILL_SCALE)
        if row.total_credits != credits:
            row.total_credits = credits
            row.save(update_fields=["total_credits"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0013_rename_ai_aichatru_user_id_bddaba_idx_ai_aichatru_user_id_a770b6_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="useraicredit",
            name="total_credits",
            field=models.BigIntegerField(
                default=0,
                help_text="依 usage_to_credits 由 token × 模型單價換算之累計點數",
                verbose_name="累計 AI Credits",
            ),
        ),
        migrations.RunPython(backfill_total_credits, noop_reverse),
    ]
