"""ExamAnswerViewSet — student answer submission and TA grading."""
from decimal import Decimal, ROUND_HALF_UP
from statistics import median

from django.utils import timezone
from django.db.models import Sum
from django.core.cache import cache
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import (
    Contest,
    ContestParticipant,
    ExamQuestion,
    ExamAnswer,
    ExamStatus,
    ExamQuestionType,
)
from ..serializers import (
    ExamAnswerSerializer,
    ExamAnswerDetailSerializer,
    ExamAnswerGradingSerializer,
    ExamAnswerSubmitSerializer,
    ExamAnswerGradeSerializer,
)
from ..permissions import can_manage_contest
from apps.core.api.envelope import envelope
from ..services.anti_cheat_session import build_device_conflict_payload
from ..services.question_edit_lock import maybe_lock_from_exam_answer
from .exam_validation_response import validate_exam_operation_for_view


class ExamAnswerViewSet(viewsets.GenericViewSet):
    """
    ViewSet for exam answer operations.
    Students submit/retrieve answers; TAs grade answers and view results.
    """
    permission_classes = [permissions.IsAuthenticated]

    # Actions in this set return errors in the new envelope shape.
    # See apps.core.api.envelope (success shape) and apps.core.exceptions
    # (error shape). Other actions retain the legacy `{success, error}` format.
    envelope_error_actions = {"all_answers"}

    def _get_contest(self, contest_pk):
        return get_object_or_404(Contest, pk=contest_pk)

    @staticmethod
    def _question_detail_cache_key(contest_id, question_id):
        return f"contest:{contest_id}:exam_question_detail:{question_id}:v2"

    def _invalidate_dashboard_cache(self, contest_id, question_id=None):
        if question_id is not None:
            cache.delete(self._question_detail_cache_key(contest_id, question_id))

    def _student_participants_qs(self, contest):
        return ContestParticipant.objects.filter(
            contest=contest,
            user__role='student',
        ).select_related('user')

    @staticmethod
    def _build_score_distribution(scores, max_score):
        buckets = [
            {
                'range_label': f'{index * 10}-{index * 10 + 9}%',
                'count': 0,
            }
            for index in range(9)
        ]
        buckets.append({
            'range_label': '90-100%',
            'count': 0,
        })

        if max_score <= 0:
            buckets[0]['count'] = len(scores)
            return buckets

        for score in scores:
            normalized = max(0.0, min((float(score or 0) / float(max_score)) * 100, 100.0))
            bucket_index = 9 if normalized >= 90 else int(normalized // 10)
            buckets[bucket_index]['count'] += 1

        return buckets

    @staticmethod
    def _build_question_score_bands(scores, max_score):
        if not scores:
            return []

        counts = {}
        for score in scores:
            decimal_score = Decimal(str(score or 0)).quantize(
                Decimal('0.01'),
                rounding=ROUND_HALF_UP,
            ).normalize()
            label = format(decimal_score, 'f').rstrip('0').rstrip('.')
            if '.' in label:
                label = label.rstrip('0').rstrip('.')
            if label == '':
                label = '0'
            counts[label] = counts.get(label, 0) + 1

        def _score_sort_key(label):
            return Decimal(label)

        return [
            {'label': label, 'count': counts[label]}
            for label in sorted(counts.keys(), key=_score_sort_key)
        ]

    @staticmethod
    def _extract_selected_values(answer):
        if not isinstance(answer, dict):
            return []
        selected = answer.get('selected')
        if selected is None:
            return []
        if isinstance(selected, list):
            return selected
        return [selected]

    @classmethod
    def _matches_option(cls, selected_values, option_value, option_index):
        option_letter = chr(65 + option_index)
        normalized = {str(option_value), str(option_index), option_letter}
        return any(str(value) in normalized for value in selected_values)

    @classmethod
    def _build_option_distribution(cls, question, answers, participants_by_id):
        options = question.options or []
        correct_answer = question.correct_answer
        total = len(answers) or 1
        distribution = []

        for index, option in enumerate(options):
            count = 0
            participants = []
            for answer in answers:
                selected_values = cls._extract_selected_values(answer.get('answer'))
                if cls._matches_option(selected_values, option, index):
                    count += 1
                    participant = participants_by_id.get(answer['participant_id'])
                    if participant is not None:
                        participants.append({
                            'participant_id': participant.id,
                            'username': participant.user.username,
                            'nickname': participant.nickname or None,
                            'display_name': participant.nickname or participant.user.username,
                        })

            if isinstance(correct_answer, list):
                correct_values = correct_answer
            elif correct_answer is None:
                correct_values = []
            else:
                correct_values = [correct_answer]

            is_correct = cls._matches_option(correct_values, option, index)
            distribution.append({
                'label': f'{chr(65 + index)}. {option}',
                'count': count,
                'percent': round((count / total) * 100),
                'is_correct': is_correct,
                'participants': participants,
            })

        return distribution

    # ── Student endpoints ──

    @action(detail=False, methods=['post'], url_path='submit')
    def submit_answer(self, request, contest_pk=None):
        """Submit or update a single answer (auto-save)."""
        contest = self._get_contest(contest_pk)
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=True
        )
        if error_response is not None:
            return error_response

        # Device guard (hard block)
        conflict_payload = build_device_conflict_payload(contest, participant, request)
        if conflict_payload is not None:
            return Response(conflict_payload, status=status.HTTP_409_CONFLICT)

        serializer = ExamAnswerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_id = serializer.validated_data['question_id']
        try:
            question = ExamQuestion.objects.get(
                id=question_id, contest=contest
            )
        except ExamQuestion.DoesNotExist:
            return Response(
                {'error': 'Question not found in this contest.'},
                status=status.HTTP_404_NOT_FOUND
            )

        answer_obj, created = ExamAnswer.objects.update_or_create(
            participant=participant,
            question=question,
            defaults={'answer': serializer.validated_data['answer']}
        )
        # 首次建立時記錄題目快照（後續更新答案不覆蓋快照）
        if created:
            answer_obj.question_snapshot = question.to_snapshot()
        # Auto-grade objective questions
        answer_obj.auto_grade()
        answer_obj.save()
        maybe_lock_from_exam_answer(exam_answer=answer_obj)
        self._invalidate_dashboard_cache(contest.id, answer_obj.question_id)

        return Response(
            ExamAnswerSerializer(answer_obj).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='my-answers')
    def my_answers(self, request, contest_pk=None):
        """Get all answers for the current student in this contest."""
        contest = self._get_contest(contest_pk)
        participant, error_response = validate_exam_operation_for_view(
            contest, request.user, require_in_progress=False
        )
        if error_response is not None:
            return error_response
        if participant is None:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Device guard (hard block, skip if already submitted)
        if participant.exam_status != ExamStatus.SUBMITTED:
            conflict_payload = build_device_conflict_payload(contest, participant, request)
            if conflict_payload is not None:
                return Response(conflict_payload, status=status.HTTP_409_CONFLICT)

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question')
        return Response(ExamAnswerSerializer(answers, many=True).data)

    @action(detail=False, methods=['get'], url_path='results')
    def results(self, request, contest_pk=None):
        """Get graded results (only when results are published)."""
        contest = self._get_contest(contest_pk)

        # Check if results are published
        if not contest.results_published:
            if not can_manage_contest(request.user, contest):
                return Response(
                    {'error': 'Results have not been published yet.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            participant = ContestParticipant.objects.get(
                contest=contest, user=request.user
            )
        except ContestParticipant.DoesNotExist:
            return Response(
                {'error': 'Not registered for this contest.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        answers = ExamAnswer.objects.filter(
            participant=participant
        ).select_related('question', 'graded_by')
        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    # ── TA/Admin endpoints ──

    @action(detail=False, methods=['get'], url_path='all-answers')
    def all_answers(self, request, contest_pk=None):
        """List all answers for all students (TA/admin only).

        Query params:
        - `participant_id` / `user_id`: filter by participant.
        - `question_id`: filter by question.
        - `projection=grading`: return slim rows wrapped in
          `{"data": [...], "meta": {"count": N, "projection": "grading"}}`.
          Drops per-row question/participant name duplicates. Consumers join via
          `/exam-questions/` and the participants list.

        Without `projection`, returns a bare array of ExamAnswerDetailSerializer
        payloads (backward compatible)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can view all answers.')

        answers = ExamAnswer.objects.filter(
            participant__contest=contest
        ).select_related('participant__user', 'question', 'graded_by')

        # Optional filters
        participant_id = request.query_params.get('participant_id')
        user_id = request.query_params.get('user_id')
        question_id = request.query_params.get('question_id')
        if participant_id:
            answers = answers.filter(participant_id=participant_id)
        elif user_id:
            answers = answers.filter(participant__user_id=user_id)
        if question_id:
            answers = answers.filter(question_id=question_id)

        projection = request.query_params.get('projection')
        if projection == 'grading':
            data = ExamAnswerGradingSerializer(answers, many=True).data
            meta = {
                'count': len(data),
                'projection': 'grading',
            }
            if question_id:
                meta['question_id'] = question_id
            return envelope(data, meta=meta)

        return Response(ExamAnswerDetailSerializer(answers, many=True).data)

    # Aliases consumed by the `?kind=` filter on dashboard-summary; shared with
    # ContestExamQuestionViewSet so the two endpoints agree on aliases.
    _DASHBOARD_KIND_ALIAS = {
        'subjective': {ExamQuestionType.SHORT_ANSWER, ExamQuestionType.ESSAY},
        'objective': {
            ExamQuestionType.TRUE_FALSE,
            ExamQuestionType.SINGLE_CHOICE,
            ExamQuestionType.MULTIPLE_CHOICE,
        },
    }

    @classmethod
    def _parse_dashboard_kind(cls, raw):
        """Translate ``?kind=<alias|csv>`` to a set of enum values or ``None``."""
        if not raw:
            return None
        tokens = {t.strip() for t in raw.split(',') if t.strip()}
        if not tokens:
            return None
        all_values = set(ExamQuestionType.values)
        kinds = set()
        for tok in tokens:
            if tok in cls._DASHBOARD_KIND_ALIAS:
                kinds |= cls._DASHBOARD_KIND_ALIAS[tok]
            elif tok in all_values:
                kinds.add(tok)
        return kinds

    @action(detail=False, methods=['get'], url_path='dashboard-summary')
    def dashboard_summary(self, request, contest_pk=None):
        """Contest result dashboard summary (teacher/admin only).

        Supports ``?kind=<alias|csv of enums>`` to filter the per-question
        ``questions`` array (e.g. ``?kind=subjective``). Contest-level summary
        (average, median, score distribution) is always computed over all
        questions so numbers stay consistent across callers.
        """
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can view dashboard summary.')

        kind_filter = self._parse_dashboard_kind(request.query_params.get('kind'))

        participants = list(
            self._student_participants_qs(contest).values('id', 'exam_status')
        )
        participant_ids = [item['id'] for item in participants]
        participant_count = len(participant_ids)
        completed_count = sum(
            1 for item in participants if item['exam_status'] == ExamStatus.SUBMITTED
        )

        questions = list(
            ExamQuestion.objects.filter(contest=contest).order_by('order', 'created_at')
        )
        max_total_score = sum(question.score for question in questions)

        answers = list(
            ExamAnswer.objects.filter(participant_id__in=participant_ids)
            .select_related('question')
            .values(
                'participant_id',
                'question_id',
                'score',
                'is_correct',
                'graded_at',
            )
        )

        participant_scores = {participant_id: 0 for participant_id in participant_ids}
        question_stats = {
            str(question.id): {
                'answer_count': 0,
                'graded_count': 0,
                'score_sum': 0.0,
                'zero_count': 0,
                'full_count': 0,
                'correct_count': 0,
            }
            for question in questions
        }

        question_lookup = {str(question.id): question for question in questions}

        for answer in answers:
            question_id = str(answer['question_id'])
            question = question_lookup.get(question_id)
            if question is None:
                continue
            stats = question_stats[question_id]
            stats['answer_count'] += 1

            score = answer['score']
            if score is not None:
                numeric_score = float(score)
                stats['graded_count'] += 1
                stats['score_sum'] += numeric_score
                participant_scores[answer['participant_id']] += numeric_score
                if numeric_score == 0:
                    stats['zero_count'] += 1
                if numeric_score >= float(question.score):
                    stats['full_count'] += 1

            if answer['is_correct'] is True:
                stats['correct_count'] += 1

        total_scores = list(participant_scores.values())
        average_score = round(sum(total_scores) / participant_count, 1) if participant_count else 0
        median_score = round(median(total_scores)) if total_scores else 0

        question_summaries = []
        for question in questions:
            if kind_filter is not None and question.question_type not in kind_filter:
                continue
            question_id = str(question.id)
            stats = question_stats[question_id]
            answer_count = stats['answer_count']
            graded_count = stats['graded_count']
            missing_count = max(participant_count - answer_count, 0)
            average_question_score = (
                round(stats['score_sum'] / graded_count, 1) if graded_count else 0
            )
            score_rate = round((average_question_score / question.score) * 100) if question.score else 0
            zero_rate = round((stats['zero_count'] / graded_count) * 100) if graded_count else 0
            full_rate = round((stats['full_count'] / graded_count) * 100) if graded_count else 0

            summary = {
                'question_id': question_id,
                'order': question.order,
                'title': question.prompt,
                'kind': question.question_type,
                'max_score': question.score,
                'answer_count': answer_count,
                'missing_count': missing_count,
                'average_score': average_question_score,
                'score_rate': score_rate,
                'zero_rate': zero_rate,
                'full_rate': full_rate,
                'status': 'grading' if question.question_type in {ExamQuestionType.SHORT_ANSWER, ExamQuestionType.ESSAY} and graded_count < answer_count else 'stable',
            }

            if question.question_type in {
                ExamQuestionType.SINGLE_CHOICE,
                ExamQuestionType.MULTIPLE_CHOICE,
                ExamQuestionType.TRUE_FALSE,
            }:
                correct_rate = round((stats['correct_count'] / answer_count) * 100) if answer_count else 0
                summary['objective_stats'] = {
                    'correct_rate': correct_rate,
                }
            else:
                pending_count = max(answer_count - graded_count, 0)
                grading_rate = round((graded_count / answer_count) * 100) if answer_count else 0
                summary['subjective_stats'] = {
                    'graded_count': graded_count,
                    'pending_count': pending_count,
                    'grading_rate': grading_rate,
                }

            question_summaries.append(summary)

        payload = {
            'contest': {
                'id': str(contest.id),
                'name': contest.name,
                'course': '',
                'contest_type': 'paper_exam',
                'participant_count': participant_count,
                'completed_count': completed_count,
                'results_published': contest.results_published,
            },
            'summary': {
                'average_score': average_score,
                'median_score': median_score,
                'max_total_score': max_total_score,
            },
            'score_distribution': self._build_score_distribution(total_scores, max_total_score),
            'questions': question_summaries,
        }
        return Response(payload)

    @action(detail=False, methods=['get'], url_path='question-detail')
    def question_detail(self, request, contest_pk=None):
        """Single-question dashboard detail (teacher/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can view question detail.')

        question_id = request.query_params.get('question_id')
        if not question_id:
            return Response(
                {'error': 'question_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache_key = self._question_detail_cache_key(contest.id, question_id)
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload)

        question = get_object_or_404(ExamQuestion, pk=question_id, contest=contest)
        participants = list(self._student_participants_qs(contest))
        participant_ids = [participant.id for participant in participants]
        participants_by_id = {participant.id: participant for participant in participants}
        participant_count = len(participant_ids)

        answers = list(
            ExamAnswer.objects.filter(
                participant_id__in=participant_ids,
                question=question,
            ).values('id', 'participant_id', 'answer', 'score', 'graded_at', 'feedback')
        )
        graded_scores = [float(answer['score']) for answer in answers if answer['score'] is not None]
        missing_count = max(participant_count - len(answers), 0)
        answered_participant_ids = {answer['participant_id'] for answer in answers}
        omitted_participants = [
            {
                'participant_id': participant.id,
                'username': participant.user.username,
                'nickname': participant.nickname or None,
                'display_name': participant.nickname or participant.user.username,
            }
            for participant in participants
            if participant.id not in answered_participant_ids
        ]

        payload = {
            'question_id': str(question.id),
            'kind': question.question_type,
            'score_bands': self._build_question_score_bands(graded_scores, question.score),
            'responses': [
                {
                    'exam_answer_id': answer['id'],
                    'participant_id': answer['participant_id'],
                    'username': participants_by_id[answer['participant_id']].user.username,
                    'nickname': participants_by_id[answer['participant_id']].nickname or None,
                    'display_name': (
                        participants_by_id[answer['participant_id']].nickname
                        or participants_by_id[answer['participant_id']].user.username
                    ),
                    'score': float(answer['score']) if answer['score'] is not None else None,
                    'graded_at': answer['graded_at'],
                    'feedback': answer.get('feedback') or '',
                    'answer': answer['answer'],
                }
                for answer in answers
            ],
        }

        if question.question_type in {
            ExamQuestionType.SINGLE_CHOICE,
            ExamQuestionType.MULTIPLE_CHOICE,
            ExamQuestionType.TRUE_FALSE,
        }:
            payload['option_distribution'] = self._build_option_distribution(
                question,
                answers,
                participants_by_id,
            )
            payload['omitted_count'] = missing_count
            payload['omitted_participants'] = omitted_participants
        else:
            graded_count = sum(1 for answer in answers if answer['graded_at'] is not None)
            payload['grading_progress'] = {
                'graded': graded_count,
                'total': len(answers),
            }

        cache.set(cache_key, payload, timeout=60)
        return Response(payload)

    @action(detail=True, methods=['post'], url_path='grade')
    def grade_answer(self, request, contest_pk=None, pk=None):
        """Grade a single answer (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can grade answers.')

        answer_obj = get_object_or_404(
            ExamAnswer.objects.filter(participant__contest=contest),
            pk=pk
        )

        serializer = ExamAnswerGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer_obj.score = serializer.validated_data['score']
        answer_obj.feedback = serializer.validated_data.get('feedback', '')
        answer_obj.graded_by = request.user
        answer_obj.graded_at = timezone.now()
        answer_obj.is_correct = answer_obj.score > 0
        answer_obj.save()
        self._invalidate_dashboard_cache(contest.id, answer_obj.question_id)

        # Update participant total score
        total = ExamAnswer.objects.filter(
            participant=answer_obj.participant,
            score__isnull=False
        ).aggregate(total=Sum('score'))['total'] or 0
        rounded_total = Decimal(total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        answer_obj.participant.score = int(rounded_total)
        answer_obj.participant.save(update_fields=['score'])

        return Response(ExamAnswerDetailSerializer(answer_obj).data)

    @action(detail=False, methods=['post'], url_path='batch-grade')
    def batch_grade(self, request, contest_pk=None):
        """Batch grade multiple answers at once (TA/admin only).

        Request body: {"grades": [{"exam_answer_id": 123, "score": 8.5, "feedback": "..."}]}
        """
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can grade answers.')

        grades = request.data.get('grades', [])
        if not isinstance(grades, list) or not grades:
            return Response(
                {'error': 'grades must be a non-empty array'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        results = []
        affected_participants = set()
        affected_question_ids = set()

        for entry in grades:
            answer_id = entry.get('exam_answer_id')
            score_val = entry.get('score')
            feedback_val = entry.get('feedback', '')

            if answer_id is None or score_val is None:
                results.append({'exam_answer_id': answer_id, 'status': 'error', 'detail': 'exam_answer_id and score required'})
                continue

            serializer = ExamAnswerGradeSerializer(data={'score': score_val, 'feedback': feedback_val})
            if not serializer.is_valid():
                results.append({'exam_answer_id': answer_id, 'status': 'error', 'detail': serializer.errors})
                continue

            validated_score = serializer.validated_data['score']
            validated_feedback = serializer.validated_data.get('feedback', '')

            if validated_score < 0:
                results.append({'exam_answer_id': answer_id, 'status': 'error', 'detail': {'score': ['Ensure this value is greater than or equal to 0.']}})
                continue

            answer_obj = ExamAnswer.objects.filter(
                participant__contest=contest, pk=answer_id,
            ).first()
            if not answer_obj:
                results.append({'exam_answer_id': answer_id, 'status': 'error', 'detail': 'not found'})
                continue

            answer_obj.score = validated_score
            answer_obj.feedback = validated_feedback
            answer_obj.graded_by = request.user
            answer_obj.graded_at = now
            answer_obj.is_correct = validated_score > 0
            answer_obj.save()

            affected_participants.add(answer_obj.participant_id)
            affected_question_ids.add(answer_obj.question_id)
            results.append({'exam_answer_id': answer_id, 'status': 'ok', 'score': float(validated_score)})

        # Recalculate affected participant total scores
        for pid in affected_participants:
            participant = ContestParticipant.objects.get(pk=pid)
            total = ExamAnswer.objects.filter(
                participant=participant, score__isnull=False,
            ).aggregate(total=Sum('score'))['total'] or 0
            rounded_total = Decimal(total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            participant.score = int(rounded_total)
            participant.save(update_fields=['score'])

        # Invalidate caches
        for qid in affected_question_ids:
            self._invalidate_dashboard_cache(contest.id, qid)

        return Response({'results': results, 'graded_count': sum(1 for r in results if r['status'] == 'ok')})

    @action(detail=True, methods=['post'], url_path='ungrade')
    def ungrade_answer(self, request, contest_pk=None, pk=None):
        """Revoke grading for a single answer (TA/admin only)."""
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can revoke grading.')

        answer_obj = get_object_or_404(
            ExamAnswer.objects.filter(participant__contest=contest),
            pk=pk
        )

        answer_obj.score = None
        answer_obj.feedback = ''
        answer_obj.graded_by = None
        answer_obj.graded_at = None
        answer_obj.is_correct = None
        answer_obj.save()
        self._invalidate_dashboard_cache(contest.id, answer_obj.question_id)

        # Recalculate participant total score
        total = ExamAnswer.objects.filter(
            participant=answer_obj.participant,
            score__isnull=False
        ).aggregate(total=Sum('score'))['total'] or 0
        rounded_total = Decimal(total).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        answer_obj.participant.score = int(rounded_total)
        answer_obj.participant.save(update_fields=['score'])

        return Response(ExamAnswerDetailSerializer(answer_obj).data)
