from __future__ import annotations

from uuid import UUID
import json

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contests.services.integrity_commands import (
    IntegrityCommandRejected,
    authenticate_integrity_run,
    build_integrity_bootstrap,
    execute_integrity_command,
    validate_command_envelope,
    authenticate_resident_service,
    resident_run_scope,
    build_resident_descriptor,
)
from apps.contests.models import ExamIntegrityRun
from apps.contests.infrastructure.integrity_worker_client import sign_resident_request


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
        service_digest = None
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if authorization.startswith("Resident "):
            token_digest = ""
            try:
                service_digest = authenticate_resident_service(authorization[9:])
                scoped = service_digest is not None and resident_run_scope(ExamIntegrityRun.objects.filter(pk=run_id).first())
                error = None if scoped else Response({"code": "invalid_integrity_run_scope"}, status=403)
            except Exception:
                error = Response({"code": "integrity_command_temporarily_unavailable"}, status=503)
        else:
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
                    **({"authenticated_service_digest": service_digest} if service_digest is not None else {}),
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


class IntegrityResidentDescriptorsView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if not authorization.startswith("Resident "):
            return Response({"code": "invalid_resident_service_identity"}, status=401)
        try:
            if authenticate_resident_service(authorization[9:]) is None:
                return Response({"code": "invalid_resident_service_identity"}, status=403)
            runs = list(ExamIntegrityRun.objects.select_related("contest").filter(
                execution_backend="resident", session_state__in=["prepared", "active", "draining"], data_state="open"
            ).order_by("id")[:257])
            if len(runs) > 256:
                return Response({"code": "resident_run_capacity_exceeded"}, status=503)
            descriptors, unavailable = [], []
            for run in runs:
                try:
                    descriptor = build_resident_descriptor(run)
                    body = json.dumps(descriptor, sort_keys=True, separators=(",", ":"), allow_nan=False)
                    headers = sign_resident_request(method="PUT", path=f"/v1/runs/{run.id}", run_id=run.id, revision=run.schedule_revision, body=body.encode())
                    descriptors.append({"body": body, "headers": headers})
                except Exception:
                    unavailable.append(str(run.id))
            return Response({"descriptors": descriptors, "unavailable_run_ids": unavailable})
        except Exception:
            return Response({"code": "resident_descriptors_unavailable"}, status=503)
