from django.core.management.base import BaseCommand
from oauth2_provider.models import Application


class Command(BaseCommand):
    help = "Create a fallback public OAuth Application for MCP clients that don't support DCR"

    def add_arguments(self, parser):
        parser.add_argument(
            "--client-id",
            default="qjudge-mcp-public",
            help="Client ID for the fallback application (default: qjudge-mcp-public)",
        )
        parser.add_argument(
            "--redirect-uris",
            default="http://localhost:3000/callback http://127.0.0.1:3000/callback",
            help="Space-separated redirect URIs",
        )

    def handle(self, *args, **options):
        client_id = options["client_id"]
        redirect_uris = options["redirect_uris"]

        app, created = Application.objects.get_or_create(
            client_id=client_id,
            defaults={
                "name": "QJudge MCP (Fallback)",
                "client_secret": "",
                "client_type": Application.CLIENT_PUBLIC,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "redirect_uris": redirect_uris,
                "skip_authorization": False,
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(f"Created OAuth Application: client_id={client_id}")
            )
        else:
            self.stdout.write(
                self.style.WARNING(f"OAuth Application already exists: client_id={client_id}")
            )
