from __future__ import annotations

from uuid import UUID

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contests.services.integrity_commands import (
    IntegrityCommandRejected,
    authenticate_integrity_run,
    build_integrity_bootstrap,
    execute_integrity_command,
    validate_command_envelope,
)


class _IntegrityRunTokenView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @staticmethod
    def _token_bytes(request) -> bytes | None:
        authorization = request.META.get("HTTP_AUTHORIZATION")
        if type(authorization) is not str or not authorization.startswith("Bearer "):
            return None
        token = authorization[7:]
        if not token or token != token.strip() or any(character.isspace() for character in token):
            return None
        try:
            return token.encode("ascii")
        except UnicodeEncodeError:
            return None

    def _authenticate(
        self,
        request,
        run_id: UUID,
        *,
        unavailable_code: str,
    ):
        token_bytes = self._token_bytes(request)
        if token_bytes is None:
            return None, None, Response(
                {"code": "invalid_integrity_run_token"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            run, token_digest = authenticate_integrity_run(run_id, token_bytes)
        except Exception:
            return None, None, Response(
                {"code": unavailable_code},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if run is None:
            return None, None, Response(
                {"code": "invalid_integrity_run_scope"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return run, token_digest, None


class IntegrityBootstrapView(_IntegrityRunTokenView):
    def get(self, request, run_id: UUID):
        run, _token_digest, error = self._authenticate(
            request,
            run_id,
            unavailable_code="integrity_bootstrap_temporarily_unavailable",
        )
        if error is not None:
            return error
        try:
            payload = build_integrity_bootstrap(run)
        except IntegrityCommandRejected as exc:
            return Response(
                {"code": exc.code},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            return Response(
                {"code": "integrity_bootstrap_temporarily_unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(payload)


class IntegrityCommandsView(_IntegrityRunTokenView):
    def post(self, request, run_id: UUID):
        _run, token_digest, error = self._authenticate(
            request,
            run_id,
            unavailable_code="integrity_command_temporarily_unavailable",
        )
        if error is not None:
            return error

        body = request.data
        if type(body) is not dict or set(body) != {"commands"}:
            return Response(
                {"code": "invalid_command_batch"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        commands = body.get("commands")
        if type(commands) is not list or not (1 <= len(commands) <= 100):
            return Response(
                {"code": "invalid_command_batch_size"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        try:
            for command in commands:
                validate_command_envelope(command, run_id)
        except IntegrityCommandRejected as exc:
            payload = {"code": exc.code}
            if exc.command_id:
                payload["command_id"] = exc.command_id
            return Response(payload, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        accepted_command_ids = []
        archive_uploads = []
        for command in commands:
            try:
                outcome = execute_integrity_command(
                    run_id,
                    command,
                    authenticated_token_digest=token_digest,
                )
            except IntegrityCommandRejected as exc:
                if exc.code == "invalid_integrity_run_scope":
                    return Response(
                        {"code": "invalid_integrity_run_scope"},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                payload = {"code": exc.code}
                command_id = exc.command_id or (
                    command.get("command_id") if type(command) is dict else ""
                )
                if command_id:
                    payload["command_id"] = command_id
                return Response(
                    payload,
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            except Exception:
                return Response(
                    {"code": "integrity_command_temporarily_unavailable"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            accepted_command_ids.append(outcome.command_id)
            if command.get("kind") == "create_archive_upload":
                archive_uploads.append(outcome.result)

        return Response(
            {
                "accepted_command_ids": accepted_command_ids,
                "archive_uploads": archive_uploads,
            }
        )
