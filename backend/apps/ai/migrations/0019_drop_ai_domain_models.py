"""Remove Django's retired AI domain tables.

AI Service is now the sole owner of sessions, messages, runs, events, usage,
and artifacts.  Historical migrations remain intact so a new database can
reconstruct the old state before this migration removes it.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0018_cleanup_legacy_model_ids"),
    ]

    operations = [
        migrations.DeleteModel(name="AIStreamEvent"),
        migrations.DeleteModel(name="AIArtifact"),
        migrations.DeleteModel(name="AIChatRun"),
        migrations.DeleteModel(name="AIExecutionLog"),
        migrations.DeleteModel(name="AIMessage"),
        migrations.DeleteModel(name="UserAICredit"),
        migrations.DeleteModel(name="AISession"),
    ]
