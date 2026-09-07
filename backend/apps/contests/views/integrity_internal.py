from __future__ import annotations

from uuid import UUID
import json

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contests.services.integrity_commands import (
    IntegrityCommandRejected,
    execute_integrity_command,
    validate_command_envelope,
    authenticate_resident_service,
    resident_run_scope,
    build_resident_descriptor,
)
from apps.contests.models import ExamIntegrityRun
from apps.contests.infrastructure.integrity_worker_client import sign_resident_request


class IntegrityCommandsView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, run_id: UUID):
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if not authorization.startswith("Resident "):
            return Response(
                {"code": "invalid_integrity_run_token"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            service_digest = authenticate_resident_service(authorization[9:])
            scoped = service_digest is not None and resident_run_scope(
                ExamIntegrityRun.objects.filter(pk=run_id).first()
            )
        except Exception:
            return Response(
                {"code": "integrity_command_temporarily_unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not scoped:
            return Response(
                {"code": "invalid_integrity_run_scope"},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        for command in commands:
            try:
                outcome = execute_integrity_command(
                    run_id,
                    command,
                    authenticated_service_digest=service_digest,
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

        return Response(
            {
                "accepted_command_ids": accepted_command_ids,
            }
        )


class IntegrityResidentFinalizeView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, run_id):
        from apps.contests.services.integrity_finalize import finalize_control
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if not authorization.startswith("Resident "):
            return Response({"code": "invalid_resident_service_identity"}, status=401)
        try:
            digest = authenticate_resident_service(authorization[9:])
            if digest is None:
                return Response({"code": "invalid_resident_service_identity"}, status=403)
            return Response(finalize_control(run_id, request.data, digest=digest))
        except IntegrityCommandRejected as error:
            return Response({"code": error.code}, status=403 if error.code == "invalid_integrity_run_scope" else 409)
        except (ValueError, KeyError, TypeError):
            return Response({"code": "invalid_finalize_request"}, status=422)
        except ExamIntegrityRun.DoesNotExist:
            return Response({"code": "invalid_integrity_run_scope"}, status=403)
        except Exception:
            return Response({"code": "resident_finalize_unavailable"}, status=503)


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
                session_state__in=["prepared", "active", "draining"], data_state="open"
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
