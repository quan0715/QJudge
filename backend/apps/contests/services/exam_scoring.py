"""
Consolidated Exam Scoring Service.

Single source of truth for all paper exam score calculations.
All endpoints, exporters, and serializers should use this service
instead of computing scores independently.

Design principles:
- score_policy is applied dynamically — ExamAnswer.score is never mutated
- ExamQuestion.score_policy controls whether a question is normal/excluded/full_marks
- ContestParticipant.score is the persisted total (written by recalculate methods)
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Optional

from django.db.models import Sum

from ..models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionScorePolicy,
)


@dataclass
class QuestionScoreInfo:
    """Lightweight question info for scoring purposes."""
    id: object  # UUID
    order: int
    score: float  # max score for this question
    score_policy: str
    question_type: str
    prompt: str = ''  # question title/prompt for display
    score_policy_config: dict = field(default_factory=dict)

    @property
    def is_excluded(self) -> bool:
        return self.score_policy == ExamQuestionScorePolicy.EXCLUDED

    @property
    def is_full_marks(self) -> bool:
        return self.score_policy == ExamQuestionScorePolicy.FULL_MARKS

    @property
    def is_normal(self) -> bool:
        return self.score_policy == ExamQuestionScorePolicy.NORMAL

    @property
    def is_redistribute(self) -> bool:
        return self.score_policy == ExamQuestionScorePolicy.REDISTRIBUTE


@dataclass
class ParticipantScoreBreakdown:
    """Per-question score breakdown for a single participant."""
    total_score: float
    max_total_score: float
    graded_count: int
    correct_count: int
    items: list = field(default_factory=list)  # list of {question_id, score, policy}


@dataclass
class QuestionStats:
    """Aggregated stats for a single question."""
    question_id: object
    answer_count: int = 0
    graded_count: int = 0
    score_sum: float = 0.0
    zero_count: int = 0
    full_count: int = 0
    correct_count: int = 0

    @property
    def average_score(self) -> float:
        return round(self.score_sum / self.graded_count, 1) if self.graded_count else 0


@dataclass
class ScoreDistribution:
    """Contest-wide score statistics."""
    average_score: float
    median_score: float
    max_total_score: float
    participant_scores: list  # list of floats (per-participant totals)
    buckets: list  # 10 buckets for 0-9%, 10-19%, ..., 90-100%


class ExamScoringService:
    """
    Single source of truth for paper exam scoring.

    Usage:
        service = ExamScoringService(contest)
        max_score = service.get_max_total_score()
        service.recalculate_participant(participant)
        dist = service.get_score_distribution()
    """

    def __init__(self, contest: Contest):
        self.contest = contest
        self._questions_cache: Optional[list] = None

    # ──────────────────────────────────────────────────────────────────
    # Question context (cached per instance)
    # ──────────────────────────────────────────────────────────────────

    def get_questions(self) -> list[QuestionScoreInfo]:
        """All exam questions with score policy info, ordered by display order."""
        if self._questions_cache is None:
            qs = ExamQuestion.objects.filter(contest=self.contest).order_by('order', 'created_at')
            self._questions_cache = [
                QuestionScoreInfo(
                    id=q.id,
                    order=q.order,
                    score=float(q.score),
                    score_policy=q.score_policy,
                    question_type=q.question_type,
                    prompt=q.prompt or '',
                    score_policy_config=q.score_policy_config or {},
                )
                for q in qs
            ]
        return self._questions_cache

    def get_max_total_score(self) -> float:
        """
        Maximum achievable score.
        Excludes EXCLUDED questions. REDISTRIBUTE questions' points are moved to
        their targets, so total achievable remains sum(non-excluded).
        """
        return sum(
            q.score for q in self.get_questions()
            if not q.is_excluded and not q.is_redistribute
        ) + sum(
            q.score for q in self.get_questions()
            if q.is_redistribute
        )

    def get_full_marks_total(self) -> float:
        """Sum of max scores for FULL_MARKS questions."""
        return sum(
            q.score for q in self.get_questions()
            if q.is_full_marks
        )

    def get_normal_question_ids(self) -> list:
        """IDs of questions with NORMAL policy."""
        return [q.id for q in self.get_questions() if q.is_normal]

    def get_effective_max_scores(self) -> dict:
        """Public accessor for per-question effective max scores after redistribution.

        Returns:
            {question_id: effective_max_score} for all questions.
        """
        return self._compute_effective_max()

    def _compute_effective_max(self) -> dict:
        """
        Compute effective max score per question after redistribution.

        REDISTRIBUTE questions transfer their points proportionally to targets.
        If targets list is empty, distribute to ALL normal-policy questions.

        Returns:
            {question_id: effective_max_score}
        """
        questions = self.get_questions()
        q_map = {q.id: q for q in questions}
        effective = {q.id: q.score for q in questions}

        for q in questions:
            if not q.is_redistribute:
                continue
            # Determine targets
            target_ids = q.score_policy_config.get('redistribute_to', [])
            if not target_ids:
                # Default: all normal-policy questions
                target_ids = [t.id for t in questions if t.is_normal]
            else:
                # Convert string UUIDs to match question id types
                from uuid import UUID
                target_ids = [UUID(tid) if isinstance(tid, str) else tid for tid in target_ids]

            # Filter to valid targets: not excluded, not redistribute, not full_marks
            # (full_marks questions always contribute their original q.score, unaffected by redistribution)
            valid_targets = [
                tid for tid in target_ids
                if tid in q_map
                and not q_map[tid].is_excluded
                and not q_map[tid].is_redistribute
                and not q_map[tid].is_full_marks
            ]
            if not valid_targets:
                continue

            # Proportional distribution based on target scores
            total_target_score = sum(q_map[tid].score for tid in valid_targets)
            if total_target_score <= 0:
                continue

            for tid in valid_targets:
                bonus = q.score * (q_map[tid].score / total_target_score)
                effective[tid] += bonus

        return effective

    # ──────────────────────────────────────────────────────────────────
    # Single participant scoring
    # ──────────────────────────────────────────────────────────────────

    def calculate_participant_score(self, participant: ContestParticipant) -> float:
        """
        Compute a single participant's total score respecting all policies.

        - normal: use the answer's actual score (scaled if receiving redistribution)
        - excluded: contributes 0
        - full_marks: contribute the question's max score (scaled if receiving redistribution)
        - redistribute: contributes 0 (its points go to targets)

        Returns the computed total (also persisted to participant.score).
        """
        questions = self.get_questions()
        effective_max = self._compute_effective_max()
        has_redistribute = any(q.is_redistribute for q in questions)

        answers = ExamAnswer.objects.filter(
            participant=participant,
            score__isnull=False,
        ).values_list('question_id', 'score')
        answer_scores = {qid: float(s) for qid, s in answers}

        total = Decimal('0')
        for q in questions:
            if q.is_excluded or q.is_redistribute:
                continue
            if q.is_full_marks:
                # Full marks always contributes the original question score, regardless of redistribution
                total += Decimal(str(q.score))
                continue
            # Normal: scale if redistribution applies
            actual = answer_scores.get(q.id)
            if actual is None:
                continue
            if has_redistribute and q.score > 0 and effective_max[q.id] != q.score:
                scaled = actual * (effective_max[q.id] / q.score)
                total += Decimal(str(scaled))
            else:
                total += Decimal(str(actual))

        rounded = total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        participant.score = int(rounded)
        participant.save(update_fields=['score'])
        return float(participant.score)

    def recalculate_all(self) -> int:
        """
        Recalculate scores for all participants.
        Returns the number of participants updated.
        """
        questions = self.get_questions()
        effective_max = self._compute_effective_max()
        has_redistribute = any(q.is_redistribute for q in questions)
        full_marks_total = sum(q.score for q in questions if q.is_full_marks)

        participants = ContestParticipant.objects.filter(contest=self.contest)
        count = 0
        for participant in participants:
            answers = ExamAnswer.objects.filter(
                participant=participant,
                score__isnull=False,
            ).values_list('question_id', 'score')
            answer_scores = {qid: float(s) for qid, s in answers}

            total = Decimal(str(full_marks_total))
            for q in questions:
                if q.is_excluded or q.is_redistribute or q.is_full_marks:
                    continue
                actual = answer_scores.get(q.id)
                if actual is None:
                    continue
                if has_redistribute and q.score > 0 and effective_max[q.id] != q.score:
                    scaled = actual * (effective_max[q.id] / q.score)
                    total += Decimal(str(scaled))
                else:
                    total += Decimal(str(actual))

            rounded = total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            participant.score = int(rounded)
            participant.save(update_fields=['score'])
            count += 1
        return count

    # ──────────────────────────────────────────────────────────────────
    # Participant breakdown (for PDF reports)
    # ──────────────────────────────────────────────────────────────────

    def get_participant_breakdown(
        self, participant: ContestParticipant, answers_map: Optional[dict] = None
    ) -> ParticipantScoreBreakdown:
        """
        Per-question breakdown for a single participant.

        Args:
            participant: The participant to compute for
            answers_map: Optional pre-fetched {question_id: ExamAnswer} dict.
                         If None, will query DB.
        """
        if answers_map is None:
            answers = ExamAnswer.objects.filter(participant=participant).select_related('question')
            answers_map = {a.question_id: a for a in answers}

        questions = self.get_questions()
        effective_max = self._compute_effective_max()
        has_redistribute = any(q.is_redistribute for q in questions)
        max_total = self.get_max_total_score()
        total_score = 0.0
        graded_count = 0
        correct_count = 0
        items = []

        for q in questions:
            if q.is_excluded:
                items.append({'question_id': q.id, 'score': None, 'policy': q.score_policy})
                continue
            if q.is_redistribute:
                items.append({'question_id': q.id, 'score': None, 'policy': q.score_policy})
                continue
            if q.is_full_marks:
                # Full marks always contributes the original question score, regardless of redistribution
                total_score += q.score
                graded_count += 1
                correct_count += 1
                items.append({'question_id': q.id, 'score': float(q.score), 'policy': q.score_policy})
                continue
            # normal (possibly receiving redistribution)
            ans = answers_map.get(q.id)
            score_val = None
            if ans and ans.score is not None:
                actual = float(ans.score)
                if has_redistribute and q.score > 0 and effective_max[q.id] != q.score:
                    score_val = actual * (effective_max[q.id] / q.score)
                else:
                    score_val = actual
                total_score += score_val
                graded_count += 1
                if score_val >= effective_max[q.id]:
                    correct_count += 1
            items.append({'question_id': q.id, 'score': score_val, 'policy': q.score_policy})

        return ParticipantScoreBreakdown(
            total_score=total_score,
            max_total_score=max_total,
            graded_count=graded_count,
            correct_count=correct_count,
            items=items,
        )

    # ──────────────────────────────────────────────────────────────────
    # Contest-wide statistics (for dashboard)
    # ──────────────────────────────────────────────────────────────────

    def compute_participant_scores(self, participant_ids: list, answers: list) -> dict:
        """
        Compute per-participant total scores from a pre-fetched answer list.

        Args:
            participant_ids: list of participant UUIDs
            answers: list of answer dicts with keys: participant_id, question_id, score

        Returns:
            {participant_id: total_score_float}
        """
        questions = self.get_questions()
        effective_max = self._compute_effective_max()
        has_redistribute = any(q.is_redistribute for q in questions)
        question_map = {q.id: q for q in questions}
        full_marks_total = sum(effective_max[q.id] for q in questions if q.is_full_marks)

        scores = {pid: full_marks_total for pid in participant_ids}

        for answer in answers:
            score = answer.get('score')
            if score is None:
                continue
            qid = answer['question_id']
            q = question_map.get(qid)
            if q is None or q.is_excluded or q.is_redistribute or q.is_full_marks:
                continue
            actual = float(score)
            if has_redistribute and q.score > 0 and effective_max[q.id] != q.score:
                actual = actual * (effective_max[q.id] / q.score)
            scores[answer['participant_id']] += actual

        return scores

    def get_score_distribution(self, participant_scores: list[float]) -> ScoreDistribution:
        """
        Build score distribution from pre-computed participant scores.

        Args:
            participant_scores: list of total scores (floats)
        """
        max_total = self.get_max_total_score()
        avg = round(sum(participant_scores) / len(participant_scores), 1) if participant_scores else 0
        med = round(median(participant_scores)) if participant_scores else 0
        buckets = self._build_buckets(participant_scores, max_total)

        return ScoreDistribution(
            average_score=avg,
            median_score=med,
            max_total_score=max_total,
            participant_scores=participant_scores,
            buckets=buckets,
        )

    def get_question_stats(self, answers: list) -> dict[str, QuestionStats]:
        """
        Compute per-question statistics from a pre-fetched answer list.

        Args:
            answers: list of answer dicts with keys: question_id, score, is_correct, graded_at

        Returns:
            {str(question_id): QuestionStats}
        """
        questions = self.get_questions()
        question_lookup = {q.id: q for q in questions}
        stats = {str(q.id): QuestionStats(question_id=q.id) for q in questions}

        for answer in answers:
            qid = answer['question_id']
            question = question_lookup.get(qid)
            if question is None:
                continue
            s = stats[str(qid)]
            s.answer_count += 1

            score = answer.get('score')
            if score is not None:
                numeric = float(score)
                s.graded_count += 1
                s.score_sum += numeric
                if numeric == 0:
                    s.zero_count += 1
                if numeric >= question.score:
                    s.full_count += 1

            if answer.get('is_correct') is True:
                s.correct_count += 1

        return stats

    # ──────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_buckets(scores: list[float], max_score: float) -> list[dict]:
        """Build 10 histogram buckets (0-9%, 10-19%, ..., 90-100%)."""
        buckets = [
            {'range_label': f'{i * 10}-{i * 10 + 9}%', 'count': 0}
            for i in range(9)
        ]
        buckets.append({'range_label': '90-100%', 'count': 0})

        if max_score <= 0:
            buckets[0]['count'] = len(scores)
            return buckets

        for score in scores:
            normalized = max(0.0, min((float(score or 0) / float(max_score)) * 100, 100.0))
            bucket_index = 9 if normalized >= 90 else int(normalized // 10)
            buckets[bucket_index]['count'] += 1

        return buckets
