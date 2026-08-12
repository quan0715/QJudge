from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(name="Subscription"),
        migrations.DeleteModel(name="WebhookEvent"),
    ]
