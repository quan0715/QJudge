"""
Consolidated Exam Scoring Service.

Single source of truth for all paper exam score calculations.
All endpoints, exporters, and serializers should use this service
instead of computing scores independently.

Design principles:
- score_policy is applied dynamically — ExamAnswer.score is never mutated
- ExamQuestion.score_policy controls whether a question is normal/excluded/full_marks
- Participant totals are derived data: computed on read from ExamAnswer.score and
  the questions' policies, never stored, so no write path can leave them stale
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from typing import Optional


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
        if not self.graded_count:
            return 0
        average = Decimal(str(self.score_sum / self.graded_count))
        return float(average.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


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
        totals = service.get_participant_totals([participant.id])
        dist = service.get_score_distribution(list(totals.values()))
    """

    def __init__(self, contest: Contest):
        self.contest = contest
        self._questions_cache: Optional[list] = None
        self._effective_max_cache: Optional[dict] = None

    SCORE_QUANTUM = Decimal("0.01")

    @classmethod
    def _round_score(cls, value) -> Decimal:
        """Canonical score precision for API and export totals."""
        return Decimal(str(value)).quantize(cls.SCORE_QUANTUM, rounding=ROUND_HALF_UP)

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
        total = sum(
            q.score for q in self.get_questions()
            if not q.is_excluded and not q.is_redistribute
        ) + sum(
            q.score for q in self.get_questions()
            if q.is_redistribute
        )
        return float(self._round_score(total))

    def get_effective_max_scores(self) -> dict:
        """Public accessor for per-question effective max scores after redistribution.

        Returns:
            {question_id: effective_max_score} for all questions.
        """
        return dict(self._compute_effective_max())

    def _compute_effective_max(self) -> dict:
        """
        Effective max score per question after redistribution (cached per instance).

        REDISTRIBUTE questions transfer their points proportionally to targets.
        If targets list is empty, distribute to ALL normal-policy questions.

        Returns:
            {question_id: effective_max_score}
        """
        if self._effective_max_cache is not None:
            return self._effective_max_cache
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

        self._effective_max_cache = effective
        return effective

    # ──────────────────────────────────────────────────────────────────
    # Participant totals — computed on read, never persisted
    # ──────────────────────────────────────────────────────────────────

    def _effective_question_score(self, question: QuestionScoreInfo, raw_score) -> Optional[Decimal]:
        """
        Policy-adjusted points one question contributes to a participant total.

        - normal: the answer's score, scaled when the question receives redistribution
        - full_marks: the question's original score, answered or not
        - excluded / redistribute: not counted (their points go nowhere / to targets)

        Returns None when the question contributes nothing (not counted, or
        not graded yet). This is the only place the score policy formula lives.
        """
        if question.is_excluded or question.is_redistribute:
            return None
        if question.is_full_marks:
            return Decimal(str(question.score))
        if raw_score is None:
            return None
        actual = Decimal(str(raw_score))
        effective_max = self._compute_effective_max()[question.id]
        if question.score > 0 and effective_max != question.score:
            actual = actual * Decimal(str(effective_max)) / Decimal(str(question.score))
        return actual

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

        effective_max = self._compute_effective_max()
        total_score = Decimal('0')
        graded_count = 0
        correct_count = 0
        items = []

        for q in self.get_questions():
            answer = answers_map.get(q.id)
            score_val = self._effective_question_score(
                q, answer.score if answer is not None else None,
            )
            if score_val is not None:
                total_score += score_val
                graded_count += 1
                if score_val >= Decimal(str(effective_max[q.id])):
                    correct_count += 1
            items.append({
                'question_id': q.id,
                'score': float(self._round_score(score_val)) if score_val is not None else None,
                'policy': q.score_policy,
            })

        return ParticipantScoreBreakdown(
            total_score=float(self._round_score(total_score)),
            max_total_score=self.get_max_total_score(),
            graded_count=graded_count,
            correct_count=correct_count,
            items=items,
        )

    def compute_participant_scores(self, participant_ids: list, answers: list) -> dict:
        """
        Compute per-participant total scores from a pre-fetched answer list.

        Args:
            participant_ids: list of participant ids
            answers: list of answer dicts with keys: participant_id, question_id, score

        Returns:
            {participant_id: total_score_float}
        """
        questions = self.get_questions()
        question_map = {q.id: q for q in questions}
        # Full-marks questions count for everyone, answered or not.
        full_marks = sum(
            (self._effective_question_score(q, None) for q in questions if q.is_full_marks),
            Decimal('0'),
        )
        scores = {pid: full_marks for pid in participant_ids}

        for answer in answers:
            q = question_map.get(answer['question_id'])
            if q is None or q.is_full_marks or answer['participant_id'] not in scores:
                continue
            score_val = self._effective_question_score(q, answer.get('score'))
            if score_val is not None:
                scores[answer['participant_id']] += score_val

        return {pid: float(self._round_score(score)) for pid, score in scores.items()}

    def get_participant_totals(self, participant_ids: list) -> dict:
        """{participant_id: total_score_float}, querying the answers itself."""
        answers = ExamAnswer.objects.filter(
            participant_id__in=participant_ids,
        ).values('participant_id', 'question_id', 'score')
        return self.compute_participant_scores(participant_ids, list(answers))


    def get_score_distribution(self, participant_scores: list[float]) -> ScoreDistribution:
        """
        Build score distribution from pre-computed participant scores.

        Args:
            participant_scores: list of total scores (floats)
        """
        max_total = self.get_max_total_score()
        avg = (
            float(self._round_score(sum(participant_scores) / len(participant_scores)))
            if participant_scores
            else 0
        )
        med = float(self._round_score(median(participant_scores))) if participant_scores else 0
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
