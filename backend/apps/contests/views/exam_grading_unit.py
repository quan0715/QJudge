"""AI grading units: a frozen scope, durable drafts, and per-answer grade writes.

Grading judgment (rubric, deductions, feedback) belongs to the agent; this API only
keeps the scope, stores drafts and writes grades without overwriting a teacher's.
"""
from uuid import UUID

from django.db import DatabaseError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from ..models import Contest, ExamAnswer, ExamBatchGradeWrite, ExamGradingUnit, ExamQuestion
from ..permissions import can_manage_contest
from ..serializers import ExamAnswerGradeSerializer
from ..services.paper_question_labels import build_paper_question_labels


def identifier(data, name):
    try:
        return UUID(str(data.get(name)))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({name: 'A valid UUID is required.'})


def summary(unit):
    return unit.progress


def detail(unit):
    return {**unit.snapshot, **summary(unit), 'rubric': unit.rubric, 'grades': list(unit.drafts.values())}


def compare_grades(unit, actual):
    """Readback comparison; existing or cleared teacher grades are not retry targets."""
    missing, retry, conflicts, matched = [], [], [], 0
    for target in unit.snapshot['answers']:
        if not target['writable']:
            continue
        aid = target['exam_answer_id']
        draft, grade = unit.drafts.get(aid), actual.get(aid)
        if draft is None:
            missing.append(aid)
        elif grade is None:
            conflicts.append({'exam_answer_id': aid, 'reason': 'answer_missing'})
        elif grade['score'] is None:
            if unit.results.get(aid, {}).get('status') in ('ok', 'skipped'):
                conflicts.append({'exam_answer_id': aid, 'reason': 'grade_cleared_after_submission'})
            else:
                retry.append(aid)
        elif float(grade['score']) == float(draft['score']) and grade['feedback'] == draft.get('feedback', ''):
            matched += 1
        else:
            conflicts.append({'exam_answer_id': aid, 'reason': 'official_grade_differs',
                              'score': float(grade['score']), 'feedback': grade['feedback']})
    return {'matched_count': matched, 'missing_draft_ids': missing,
            'retry_answer_ids': retry, 'conflicts': conflicts,
            'complete': not (missing or retry or conflicts)}


class ExamGradingUnitMixin:
    def _grading_scope(self, request, contest_pk, data, write=False):
        contest = self._get_contest(contest_pk)
        if not can_manage_contest(request.user, contest):
            raise PermissionDenied('Only contest staff can access grading drafts.')
        if write and contest.results_published:
            raise ValidationError('Published results cannot be graded.')
        session_id = identifier(data, 'session_id')
        if ExamGradingUnit.objects.filter(contest=contest, session_id=session_id).exclude(grader=request.user).exists():
            raise PermissionDenied('This grading session belongs to another teacher.')
        return contest, ExamGradingUnit.objects.filter(contest=contest, grader=request.user, session_id=session_id)

    def _grading_attempt(self, request, contest_pk):
        contest, units = self._grading_scope(request, contest_pk, request.data, write=True)
        unit = get_object_or_404(units, run_id=identifier(request.data, 'run_id'), unit_id=request.data.get('unit_id'))
        return contest, unit

    @action(detail=False, methods=['get', 'post'], url_path='grading-unit')
    def grading_unit(self, request, contest_pk=None):
        data = request.query_params if request.method == 'GET' else request.data
        contest, units = self._grading_scope(request, contest_pk, data, write=request.method == 'POST')
        unit_id = data.get('unit_id')
        if not isinstance(unit_id, str) or not unit_id.strip() or len(unit_id) > 255:
            raise ValidationError('unit_id must be a non-empty string up to 255 characters.')
        if request.method == 'GET':
            if data.get('run_id'):
                units = units.filter(run_id=identifier(data, 'run_id'))
            return Response(detail(get_object_or_404(units.filter(unit_id=unit_id).order_by('-created_at', '-pk')[:1])))
        run_id = identifier(data, 'run_id')
        ids = data.get('question_ids')
        if not isinstance(ids, list) or not ids:
            raise ValidationError('question_ids must be a non-empty array.')
        try:
            ids = list(dict.fromkeys(str(UUID(str(q))) for q in ids))
        except (ValueError, TypeError):
            raise ValidationError('question_ids must contain UUIDs.')
        # Contest lock serializes session ownership and lazy snapshot creation.
        with transaction.atomic():
            Contest.objects.select_for_update().get(pk=contest.pk)
            if ExamGradingUnit.objects.filter(contest=contest, session_id=identifier(data, 'session_id')).exclude(grader=request.user).exists():
                raise PermissionDenied('This grading session belongs to another teacher.')
            existing = units.filter(run_id=run_id, unit_id=unit_id).first()
            if existing:
                if set(existing.snapshot['question_ids']) != set(ids):
                    raise ValidationError('The existing unit has a different question scope.')
                return Response(detail(existing))
            selected = list(ExamQuestion.objects.filter(contest=contest, pk__in=ids).select_related('group'))
            if len(selected) != len(ids):
                raise ValidationError('A question is outside this contest.')
            groups = {q.group_id for q in selected if q.group_id}
            questions = list(ExamQuestion.objects.filter(contest=contest).filter(Q(pk__in=ids) | Q(group_id__in=groups)).select_related('group').order_by('order', 'created_at'))
            answers = ExamAnswer.objects.filter(participant__contest=contest, question__in=questions).order_by('participant_id', 'question__order', 'pk')
            # Labels follow the whole paper so a group reads 3(a)/3(b) as students saw it.
            labels = build_paper_question_labels(
                contest.exam_questions.only('id', 'group_id', 'order').order_by('order', 'id'),
                expand_question_numbers=contest.expand_question_numbers,
            )
            snapshot = {
                'question_ids': ids, 'teacher_note': data.get('teacher_note', ''),
                'questions': [{
                    'question_id': str(q.pk), 'label': labels[q.pk], 'order': q.order, 'prompt': q.prompt,
                    'reference_answer': q.correct_answer, 'reference_answer_document': q.reference_answer_document,
                    'explanation': q.explanation, 'explanation_document': q.explanation_document,
                    'max_score': q.score, 'question_type': q.question_type, 'answer_format': q.answer_format,
                    'score_policy': q.score_policy, 'score_policy_config': q.score_policy_config,
                    'options': q.options, 'group_id': str(q.group_id) if q.group_id else None,
                    'shared_stem': q.group.shared_stem_markdown if q.group else '',
                } for q in questions],
                'answers': [{
                    'exam_answer_id': str(a.pk), 'question_id': str(a.question_id),
                    'participant_id': str(a.participant_id), 'answer': a.answer,
                    'writable': a.score is None and str(a.question_id) in ids,
                    'original_score': float(a.score) if a.score is not None else None,
                    'original_feedback': a.feedback,
                } for a in answers],
            }
            unit = units.create(contest=contest, grader=request.user, session_id=identifier(data, 'session_id'), run_id=run_id, unit_id=unit_id, snapshot=snapshot)
        return Response(detail(unit))

    @action(detail=False, methods=['post'], url_path='grading-draft')
    def grading_draft(self, request, contest_pk=None):
        contest, unit = self._grading_attempt(request, contest_pk)
        grades = request.data.get('grades', [])
        if not isinstance(grades, list):
            raise ValidationError('grades must be an array.')
        with transaction.atomic():
            if Contest.objects.select_for_update().get(pk=contest.pk).results_published:
                raise ValidationError('Published results cannot be graded.')
            unit = ExamGradingUnit.objects.select_for_update().get(pk=unit.pk)
            targets = {a['exam_answer_id']: a for a in unit.snapshot['answers'] if a['writable']}
            max_scores = {q['question_id']: q['max_score'] for q in unit.snapshot['questions']}
            for entry in grades:
                aid = str(entry.get('exam_answer_id')) if isinstance(entry, dict) else None
                if aid not in targets:
                    raise ValidationError('Each grade needs a writable exam_answer_id of this unit.')
                if unit.results.get(aid, {}).get('status') in ('ok', 'skipped'):
                    raise ValidationError('This answer was already submitted.')
                if isinstance(entry.get('score'), bool):
                    raise ValidationError('score must be a number.')
                serializer = ExamAnswerGradeSerializer(data=entry)
                serializer.is_valid(raise_exception=True)
                score = serializer.validated_data['score']
                if score < 0 or score > max_scores[targets[aid]['question_id']]:
                    raise ValidationError('Score must be between zero and the question maximum.')
                unit.drafts[aid] = {'exam_answer_id': aid, 'score': float(score), 'feedback': serializer.validated_data['feedback']}
            if 'rubric' in request.data:
                unit.rubric = request.data['rubric']
            unit.save(update_fields=['drafts', 'rubric', 'updated_at'])
        return Response(summary(unit))

    @action(detail=False, methods=['post'], url_path='grading-verify')
    def grading_verify(self, request, contest_pk=None):
        contest, units = self._grading_scope(request, contest_pk, request.data)
        unit = get_object_or_404(units, run_id=identifier(request.data, 'run_id'), unit_id=request.data.get('unit_id'))
        ids = [a['exam_answer_id'] for a in unit.snapshot['answers'] if a['writable']]
        actual = {str(a['pk']): a for a in ExamAnswer.objects.filter(
            pk__in=ids, participant__contest=contest).values('pk', 'score', 'feedback')}
        return Response({'unit_id': unit.unit_id, **compare_grades(unit, actual)})

    @action(detail=False, methods=['post'], url_path='grading-submit')
    def grading_submit(self, request, contest_pk=None):
        contest, unit = self._grading_attempt(request, contest_pk)
        targets = [a for a in unit.snapshot['answers'] if a['writable']]
        if any(a['exam_answer_id'] not in unit.drafts for a in targets):
            raise ValidationError('Every target answer requires a saved draft before submission.')
        selected = request.data.get('answer_ids')
        if selected is not None:
            authorized = {a['exam_answer_id'] for a in targets}
            if not isinstance(selected, list) or not selected or any(str(aid) not in authorized for aid in selected):
                raise ValidationError("answer_ids must be a non-empty array of this unit's writable answer IDs.")
            selected = {str(aid) for aid in selected}
            targets = [a for a in targets if a['exam_answer_id'] in selected]
        for target in targets:
            aid = target['exam_answer_id']
            try:
                with transaction.atomic():
                    # A fresh publication check and lock avoids writing after publish.
                    current_contest = Contest.objects.select_for_update().get(pk=contest.pk)
                    if current_contest.results_published:
                        raise ValidationError('Published results cannot be graded.')
                    unit = ExamGradingUnit.objects.select_for_update().get(pk=unit.pk)
                    if unit.results.get(aid, {}).get('status') in ('ok', 'skipped'):
                        continue
                    answer = ExamAnswer.objects.select_for_update().filter(pk=aid, participant__contest=contest, question_id=target['question_id']).first()
                    result = {'exam_answer_id': aid}
                    if answer is None:
                        result.update(status='error', detail='Answer no longer exists.')
                    elif answer.score is not None or ExamBatchGradeWrite.objects.filter(answer=answer, session_id=unit.session_id, run_id=unit.run_id).exists():
                        # A teacher's grade, or one this run already wrote and a teacher later cleared.
                        result.update(status='skipped')
                    else:
                        grade = unit.drafts[aid]
                        now = timezone.now()
                        answer.score, answer.feedback = grade['score'], grade['feedback']
                        answer.graded_by, answer.graded_at = request.user, now
                        answer.is_correct = grade['score'] > 0
                        answer.save()
                        ExamBatchGradeWrite.objects.create(
                            answer=answer, session_id=unit.session_id, run_id=unit.run_id, grader=request.user,
                            score=grade['score'], feedback=grade['feedback'], graded_at=now,
                        )
                        result.update(status='ok', score=grade['score'])
                        transaction.on_commit(lambda qid=answer.question_id: self._invalidate_dashboard_cache(contest.pk, qid))
                    unit.results[aid] = result
                    unit.save(update_fields=['results', 'updated_at'])
            except DatabaseError:
                # The row transaction rolled back; durable drafts remain retryable.
                with transaction.atomic():
                    unit = ExamGradingUnit.objects.select_for_update().get(pk=unit.pk)
                    if unit.results.get(aid, {}).get('status') not in ('ok', 'skipped'):
                        unit.results[aid] = {'exam_answer_id': aid, 'status': 'error', 'detail': 'Grade write failed; retry submission.'}
                        unit.save(update_fields=['results', 'updated_at'])
        with transaction.atomic():
            unit = ExamGradingUnit.objects.select_for_update().get(pk=unit.pk)
            unit.snapshot['submitted'] = True
            unit.save(update_fields=['snapshot', 'updated_at'])
        results = list(unit.results.values())
        failed = sum(r['status'] == 'error' for r in results)
        return Response({'unit_id': unit.unit_id, 'written': sum(r['status'] == 'ok' for r in results),
                         'skipped': sum(r['status'] == 'skipped' for r in results), 'failed': failed,
                         'results': results, 'is_error': failed > 0})

    @action(detail=False, methods=['get'], url_path='grading-progress')
    def grading_progress(self, request, contest_pk=None):
        _, units = self._grading_scope(request, contest_pk, request.query_params)
        latest = {}
        for unit in units.only('unit_id', 'progress').order_by('-created_at', '-pk'):
            latest.setdefault(unit.unit_id, summary(unit))
        return Response({'units': list(latest.values())})

    @action(detail=False, methods=['get'], url_path='grading-export')
    def grading_export(self, request, contest_pk=None):
        contest, units = self._grading_scope(request, contest_pk, request.query_params)
        units = list(units.filter(run_id=identifier(request.query_params, 'run_id')).order_by('created_at', 'pk'))
        ids = {a['exam_answer_id'] for u in units for a in u.snapshot['answers'] if a['writable']}
        actual = {str(a['pk']): {'score': float(a['score']) if a['score'] is not None else None,
                               'feedback': a['feedback']}
                  for a in ExamAnswer.objects.filter(pk__in=ids, participant__contest=contest).values('pk', 'score', 'feedback')}
        return Response({'units': [{**detail(u), 'results': u.results} for u in units], 'official_grades': actual})
