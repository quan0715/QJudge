"""Rewrite any historical ``deepseek-r1`` / ``deepseek-v3`` / ``deepseek-reasoner`` /
``deepseek-chat`` rows on ``AIChatRun`` and ``AIExecutionLog`` to ``deepseek-v4``.

Those canonical ids no longer exist in ``ai-service/services/model_factory.py``.
Leaving them in the DB causes session replay to hit ``ModelFactory.canonicalize_model_id``
fallback, which sends the row to the default (``openai-nano``) — wrong provider,
wrong billing. A one-shot rewrite keeps the registry minimal (no legacy alias
layer) and the data accurate.
"""

from __future__ import annotations

from django.db import migrations

LEGACY_IDS = ("deepseek-r1", "deepseek-v3", "deepseek-reasoner", "deepseek-chat")
REPLACEMENT = "deepseek-v4"


def forwards(apps, schema_editor):
    AIChatRun = apps.get_model("ai", "AIChatRun")
    AIExecutionLog = apps.get_model("ai", "AIExecutionLog")
    AIChatRun.objects.filter(model_id__in=LEGACY_IDS).update(model_id=REPLACEMENT)
    AIExecutionLog.objects.filter(model_used__in=LEGACY_IDS).update(model_used=REPLACEMENT)


def backwards(apps, schema_editor):
    # Irreversible — we cannot recover the original distribution across the 4
    # legacy ids. Left as no-op so ``migrate --fake`` can unwind safely.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0017_switch_defaults_to_deepseek_v4"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
