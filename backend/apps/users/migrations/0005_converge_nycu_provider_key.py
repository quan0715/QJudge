from django.db import migrations, models


LEGACY_NYCU_PROVIDER = "nycu-oauth"
NYCU_PROVIDER = "nycu"


def converge_nycu_provider_key(apps, schema_editor):
    User = apps.get_model("users", "User")
    ExternalIdentity = apps.get_model("users", "ExternalIdentity")

    for legacy_identity in ExternalIdentity.objects.filter(provider_key=LEGACY_NYCU_PROVIDER).iterator():
        canonical_identity = ExternalIdentity.objects.filter(
            provider_key=NYCU_PROVIDER,
            subject=legacy_identity.subject,
        ).first()
        if canonical_identity is None:
            legacy_identity.provider_key = NYCU_PROVIDER
            legacy_identity.save(update_fields=["provider_key", "updated_at"])
            continue

        update_fields = []
        if not canonical_identity.email and legacy_identity.email:
            canonical_identity.email = legacy_identity.email
            update_fields.append("email")
        if not canonical_identity.profile_snapshot and legacy_identity.profile_snapshot:
            canonical_identity.profile_snapshot = legacy_identity.profile_snapshot
            update_fields.append("profile_snapshot")
        if (
            legacy_identity.last_login_at
            and (
                canonical_identity.last_login_at is None
                or legacy_identity.last_login_at > canonical_identity.last_login_at
            )
        ):
            canonical_identity.last_login_at = legacy_identity.last_login_at
            update_fields.append("last_login_at")
        if update_fields:
            update_fields.append("updated_at")
            canonical_identity.save(update_fields=update_fields)
        legacy_identity.delete()

    User.objects.filter(auth_provider=LEGACY_NYCU_PROVIDER).update(auth_provider=NYCU_PROVIDER)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0004_externalidentity"),
    ]

    operations = [
        migrations.RunPython(converge_nycu_provider_key, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="auth_provider",
            field=models.CharField(
                choices=[
                    ("email", "Email/Password"),
                    ("nycu", "NYCU OAuth"),
                    ("google", "Google"),
                    ("github", "GitHub"),
                ],
                db_index=True,
                default="email",
                max_length=20,
                verbose_name="認證方式",
            ),
        ),
    ]
