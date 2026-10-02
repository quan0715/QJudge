"""Five operations for private paper-exam appeal tickets; grading stays separate."""
from django.db import transaction
from django.db.models import Max, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from apps.core.api.envelope import envelope
from ..models import Contest, ContestParticipant, ExamAnswer, GradeAppeal, GradeAppealMessage
from ..permissions import can_manage_contest
from ..serializers import ExamAnswerDetailSerializer
from ..services.exam_scoring import ExamScoringService


class MessageInput(serializers.Serializer):
    content = serializers.CharField(max_length=5000, trim_whitespace=True)


class AppealInput(MessageInput):
    exam_answer = serializers.IntegerField(min_value=1)


class ClosedAppeal(APIException):
    status_code = 409
    default_detail = '申訴已結案，無法新增留言。'
    default_code = 'appeal_closed'


class GradeAppealViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AppealInput
    envelope_error_actions = {'list', 'create', 'retrieve', 'messages', 'close'}

    def _contest(self):
        contest = get_object_or_404(Contest, pk=self.kwargs['contest_pk'], contest_type='paper_exam')
        if not can_manage_contest(self.request.user, contest):
            if not ContestParticipant.objects.filter(contest=contest, user=self.request.user).exists():
                raise PermissionDenied('無法存取此考試的申訴。')
            if not contest.results_published:
                raise PermissionDenied('成績尚未公布，暫時無法存取申訴。')
        return contest

    def _tickets(self, contest):
        tickets = GradeAppeal.objects.filter(exam_answer__participant__contest=contest)
        if not can_manage_contest(self.request.user, contest):
            tickets = tickets.filter(exam_answer__participant__user=self.request.user)
        return tickets

    @staticmethod
    def _summary(ticket):
        answer = ticket.exam_answer
        user = answer.participant.user
        return {
            'id': ticket.id, 'exam_answer': answer.id,
            'question_id': str(answer.question_id), 'question_order': answer.question.order,
            'question_prompt': answer.question.prompt,
            'student_id': user.id, 'student_username': user.username,
            'status': ticket.status, 'created_at': ticket.created_at,
            'closed_at': ticket.closed_at, 'closed_by': ticket.closed_by_id,
            'last_message_at': getattr(ticket, 'last_message_at', None),
        }

    def _detail(self, ticket):
        # Re-fetch after mutations, including related rows, so responses never use stale messages.
        ticket = GradeAppeal.objects.select_related(
            'exam_answer__participant__user', 'exam_answer__question', 'exam_answer__graded_by',
        ).prefetch_related(Prefetch('messages', queryset=GradeAppealMessage.objects.select_related('author'))).get(pk=ticket.pk)
        answer = ticket.exam_answer
        scoring = ExamScoringService(answer.participant.contest)
        breakdown = scoring.get_participant_breakdown(answer.participant)
        current_score = next(item['score'] for item in breakdown.items if item['question_id'] == answer.question_id)
        messages = list(ticket.messages.all())
        data = self._summary(ticket)
        data.update({
            'last_message_at': messages[-1].created_at if messages else ticket.created_at,
            'messages': [{'id': m.id, 'author_id': m.author_id,
                          'author_username': m.author.username if m.author else '已刪除的使用者',
                          'content': m.content, 'created_at': m.created_at} for m in messages],
            'answer': ExamAnswerDetailSerializer(answer).data,
            'current_score': current_score,
            'current_max_score': float(scoring.get_effective_max_scores()[answer.question_id]),
            'answer_format': answer.question.answer_format,
        })
        return data

    def list(self, request, contest_pk=None):
        contest = self._contest()
        tickets = self._tickets(contest).select_related('exam_answer__participant__user', 'exam_answer__question').annotate(
            last_message_at=Max('messages__created_at'),
        ).order_by('-last_message_at', '-id')
        data = [self._summary(t) for t in tickets]
        return envelope(data, meta={'count': len(data)})

    def retrieve(self, request, pk=None, contest_pk=None):
        ticket = get_object_or_404(self._tickets(self._contest()), pk=pk)
        return envelope(self._detail(ticket))

    @transaction.atomic
    def create(self, request, contest_pk=None):
        contest = self._contest()
        serializer = AppealInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Lock the answer before checking the one-to-one ticket: concurrent opens share one first message.
        answer = get_object_or_404(ExamAnswer.objects.select_for_update(),
            pk=serializer.validated_data['exam_answer'], participant__contest=contest,
            question__contest=contest, participant__user=request.user)
        if not contest.results_published:
            raise PermissionDenied('成績尚未公布，無法提出申訴。')
        if answer.score is None:
            raise ValidationError('此題尚未批改，無法提出申訴。')
        ticket, created = GradeAppeal.objects.get_or_create(exam_answer=answer)
        if created:
            GradeAppealMessage.objects.create(appeal=ticket, author=request.user, content=serializer.validated_data['content'])
        return envelope(self._detail(ticket), status=201 if created else 200)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def messages(self, request, pk=None, contest_pk=None):
        ticket = get_object_or_404(self._tickets(self._contest()).select_for_update(), pk=pk)
        if ticket.status == 'closed':
            raise ClosedAppeal()
        serializer = MessageInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        GradeAppealMessage.objects.create(appeal=ticket, author=request.user, content=serializer.validated_data['content'])
        return envelope(self._detail(ticket), status=201)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def close(self, request, pk=None, contest_pk=None):
        contest = self._contest()
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('只有此考試的管理者可以結案。')
        ticket = get_object_or_404(self._tickets(contest).select_for_update(), pk=pk)
        if ticket.status != 'closed':
            ticket.status = 'closed'
            ticket.closed_at = timezone.now()
            ticket.closed_by = request.user
            ticket.save(update_fields=['status', 'closed_at', 'closed_by'])
        return envelope(self._detail(ticket))
