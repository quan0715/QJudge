"""Read-only self-scoped schedule; available before start and after submission."""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contests.models import ContestParticipant, ExamIntegrityRun
from apps.contests.services.anti_cheat_session import get_active_session, get_device_id


class ExamRuntimeStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, contest_pk):
        participant = get_object_or_404(ContestParticipant.objects.select_related("contest"),
                                       contest_id=contest_pk, user=request.user)
        contest = participant.contest
        run = ExamIntegrityRun.objects.filter(contest=contest).exclude(session_state="closed").order_by("-created_at").first()
        session = get_active_session(contest.pk, request.user.pk)
        same_device = bool(session and session.get("device_id") == get_device_id(request))
        return Response({
            "server_now": timezone.now().isoformat(),
            "start_time": contest.start_time.isoformat() if contest.start_time else None,
            "end_time": contest.end_time.isoformat() if contest.end_time else None,
            "schedule_revision": contest.schedule_revision,
            "exam_status": participant.exam_status,
            "participant_id": participant.pk,
            "integrity_run": None if run is None else {
                "id": str(run.pk), "execution_backend": run.execution_backend,
                "session_state": run.session_state, "schedule_revision": run.schedule_revision,
                "health": run.health,
                "accept_until": run.accept_until.isoformat() if run.accept_until else None,
            },
            "session_identity": {"active_device_matches": same_device,
                                 "device_id": session.get("device_id") if same_device else None},
        })
