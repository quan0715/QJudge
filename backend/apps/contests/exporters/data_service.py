"""
Data service for contest exporters.
Provides a clean interface for querying contest data and calculating statistics.
"""
from typing import List, Optional, Dict, Any

from django.utils import timezone

from ..models import Contest, ContestParticipant
from apps.problems.models import Problem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
from apps.submissions.models import Submission

from .dto import (
    ContestDTO,
    ContestProblemDTO,
    ProblemDTO,
    SampleCaseDTO,
    ParticipantDTO,
    SubmissionDTO,
    StandingsDTO,
    UserStandingDTO,
    ProblemStatsDTO,
    DifficultyStatsDTO,
)


class ContestDataService:
    """
    Data service for fetching and processing contest data.
    Provides DTOs for use by renderers.
    """

    def __init__(self, contest: Contest, language: str = 'zh-TW'):
        self.contest = contest
        self.language = language
        self._problems_cache: Optional[List[ContestProblemDTO]] = None
        self._participants_cache: Optional[List[ParticipantDTO]] = None

    def get_contest_dto(self) -> ContestDTO:
        """Get contest data as DTO."""
        return ContestDTO(
            id=str(self.contest.id),
            name=self.contest.name,
            description=self.contest.description or '',
            rules=self.contest.rules or '',
            start_time=self.contest.start_time,
            end_time=self.contest.end_time,
            cheat_detection_enabled=getattr(self.contest, 'cheat_detection_enabled', False),
            status=self.contest.status,
            scoreboard_visible_during_contest=getattr(
                self.contest, 'scoreboard_visible_during_contest', True
            ),
        )

    def get_contest_problems(self) -> List[ContestProblemDTO]:
        """
        Get all problems in the contest, ordered, with score annotation.
        Results are cached for performance.
        """
        if self._problems_cache is not None:
            return self._problems_cache

        bindings = (
            ContestQuestionBinding.objects.filter(
                contest=self.contest,
                binding_type=QuestionAsset.AssetType.CODING,
            )
            .select_related('coding_problem', 'coding_problem__question_asset')
            .prefetch_related(
                'coding_problem__test_cases',
                'coding_problem__tags',
            )
            .order_by('order')
        )

        result = []
        for b in bindings:
            if not b.coding_problem:
                continue
            label = b.label or chr(65 + b.order)
            problem_dto = self._format_problem(b.coding_problem, label)
            problem_dto.max_score = b.score or 0

            result.append(ContestProblemDTO(
                id=b.id,
                problem_id=str(b.coding_problem_id),
                order=b.order,
                label=label,
                problem=problem_dto,
                max_score=b.score or 0,
            ))

        self._problems_cache = result
        return result

    def get_participants(self) -> List[ParticipantDTO]:
        """Get all participants in the contest."""
        if self._participants_cache is not None:
            return self._participants_cache

        participants = ContestParticipant.objects.filter(
            contest=self.contest
        ).select_related('user')

        result = []
        for p in participants:
            result.append(ParticipantDTO(
                user_id=p.user.id,
                username=p.user.username,
                email=getattr(p.user, 'email', ''),
                nickname=getattr(p, 'nickname', '') or '',
                exam_status=getattr(p, 'exam_status', ''),
                started_at=getattr(p, 'started_at', None),
                left_at=getattr(p, 'left_at', None),
            ))

        self._participants_cache = result
        return result

    def get_submissions(self, user_id: Optional[int] = None) -> List[SubmissionDTO]:
        """
        Get submissions for the contest.

        Args:
            user_id: If provided, filter to this user's submissions only
        """
        queryset = Submission.objects.filter(
            contest=self.contest,
            source_type='contest',
            is_test=False
        ).select_related('problem', 'user').order_by('created_at')

        if user_id is not None:
            queryset = queryset.filter(user_id=user_id)

        result = []
        for sub in queryset:
            result.append(SubmissionDTO(
                id=sub.id,
                user_id=sub.user.id,
                problem_id=str(sub.problem.id),
                status=sub.status,
                score=sub.score or 0,
                language=sub.language or '',
                code=sub.code or '',
                created_at=sub.created_at,
                is_test=sub.is_test,
            ))

        return result

    def calculate_standings(self, user_id: Optional[int] = None) -> StandingsDTO:
        """
        Calculate standings for all participants.

        Args:
            user_id: If provided, includes user-specific rank info

        Returns:
            StandingsDTO with full standings and optional user-specific stats
        """
        contest_problems = self.get_contest_problems()
        participants = self.get_participants()
        all_submissions = self.get_submissions()

        # Build stats for each participant
        stats: Dict[int, UserStandingDTO] = {}

        for p in participants:
            problem_stats = {}
            for cp in contest_problems:
                problem_stats[cp.problem_id] = ProblemStatsDTO(
                    problem_id=cp.problem_id,
                    max_score=cp.max_score,
                )

            stats[p.user_id] = UserStandingDTO(
                user_id=p.user_id,
                username=p.username,
                display_name=p.nickname or p.username,
                problems=problem_stats,
            )

        # Process submissions
        start_time = self.contest.start_time or self.contest.created_at

        for sub in all_submissions:
            uid = sub.user_id
            pid = sub.problem_id

            if uid not in stats or pid not in stats[uid].problems:
                continue

            p_stat = stats[uid].problems[pid]

            # Skip if already AC
            if p_stat.status == 'AC':
                continue

            if sub.status in ['pending', 'judging']:
                continue

            p_stat.tries += 1
            max_score = p_stat.max_score

            if sub.status == 'AC':
                p_stat.status = 'AC'
                time_diff = sub.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                p_stat.time = minutes

                stats[uid].solved += 1
                penalty = minutes + 20 * (p_stat.tries - 1)
                stats[uid].penalty += penalty

                score_diff = max_score - p_stat.score
                p_stat.score = max_score
                stats[uid].total_score += score_diff
            else:
                p_stat.status = sub.status
                submission_score = sub.score
                if submission_score > p_stat.score:
                    score_diff = submission_score - p_stat.score
                    p_stat.score = submission_score
                    stats[uid].total_score += score_diff

        # Sort standings: total_score (desc) > solved (desc) > penalty (asc)
        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x.total_score, -x.solved, x.penalty))

        for i, item in enumerate(standings_list):
            item.rank = i + 1

        # Find user's stats if requested
        user_rank = None
        user_stats = None

        if user_id is not None:
            for item in standings_list:
                if item.user_id == user_id:
                    user_rank = item.rank
                    user_stats = item
                    break

        return StandingsDTO(
            rank=user_rank,
            total_participants=len(standings_list),
            user_stats=user_stats,
            standings=standings_list,
        )

    def get_difficulty_stats(self, user_id: int) -> DifficultyStatsDTO:
        """
        Calculate difficulty statistics for a user.

        Args:
            user_id: User ID to calculate stats for

        Returns:
            DifficultyStatsDTO with breakdown by difficulty level
        """
        contest_problems = self.get_contest_problems()
        standings = self.calculate_standings(user_id)
        user_stats = standings.user_stats
        user_problems = user_stats.problems if user_stats else {}

        stats = DifficultyStatsDTO()

        for cp in contest_problems:
            difficulty = cp.problem.difficulty or 'medium'
            difficulty_data = getattr(stats, difficulty, None)

            if difficulty_data is None:
                continue

            difficulty_data['total'] += 1
            difficulty_data['max_score'] += cp.max_score

            # Check user's performance on this problem
            problem_stat = user_problems.get(cp.problem_id)
            if problem_stat:
                difficulty_data['score'] += problem_stat.score
                if problem_stat.status == 'AC':
                    difficulty_data['solved'] += 1

        return stats

    def get_user_best_submission(
        self,
        user_id: int,
        problem_id: str
    ) -> Optional[SubmissionDTO]:
        """
        Get the best submission for a user on a problem.
        Priority: AC submission > highest score > last submission

        Args:
            user_id: User ID
            problem_id: Problem ID

        Returns:
            Best SubmissionDTO or None if no submissions
        """
        submissions = self.get_submissions(user_id)
        problem_submissions = [s for s in submissions if s.problem_id == problem_id]

        if not problem_submissions:
            return None

        # First, try to find AC submission
        ac_submissions = [s for s in problem_submissions if s.status == 'AC']
        if ac_submissions:
            return ac_submissions[-1]  # Last AC

        # Otherwise, return the submission with highest score
        return max(problem_submissions, key=lambda s: (s.score, s.created_at))

    def get_user_last_ac_submission(
        self,
        user_id: int,
        problem_id: str
    ) -> Optional[SubmissionDTO]:
        """
        Get the last AC submission for a user on a problem.

        Args:
            user_id: User ID
            problem_id: Problem ID

        Returns:
            Last AC SubmissionDTO or None
        """
        submissions = self.get_submissions(user_id)
        pid = str(problem_id)
        ac_submissions = [
            s for s in submissions
            if s.problem_id == pid and s.status == 'AC'
        ]
        return ac_submissions[-1] if ac_submissions else None

    def _get_label(self, binding) -> str:
        """Return the display label for a contest problem binding (A, B, ...)."""
        return binding.label or chr(65 + binding.order)

    def _format_problem(self, problem: Problem, label: str) -> ProblemDTO:
        """Format a problem's content for export."""
        # Read translations from QuestionAsset (source of truth)
        title = ""
        description = ""
        input_description = ""
        output_description = ""
        hint = ""
        difficulty = "medium"
        difficulty_display = "中等"

        difficulty_display_map = {"easy": "簡單", "medium": "中等", "hard": "困難"}

        if problem.question_asset_id:
            try:
                from apps.question_bank.question_assets import extract_content_from_payload
                asset = problem.question_asset
                title = asset.title or ""
                payload = asset.payload or {}
                difficulty = payload.get("difficulty", "medium")
                difficulty_display = difficulty_display_map.get(difficulty, difficulty)
                content = extract_content_from_payload(payload)
                description = content.get("description", "")
                input_description = content.get("input_description", "")
                output_description = content.get("output_description", "")
                hint = content.get("hint", "")
            except Exception:
                pass

        # Get sample test cases
        sample_cases = problem.test_cases.filter(is_sample=True).order_by('id')

        return ProblemDTO(
            id=str(problem.id),
            label=label,
            title=title,
            description=description,
            input_description=input_description,
            output_description=output_description,
            hint=hint,
            time_limit=problem.time_limit,
            memory_limit=problem.memory_limit,
            difficulty=difficulty,
            difficulty_display=difficulty_display,
            sample_cases=[
                SampleCaseDTO(input=tc.input_data, output=tc.output_data)
                for tc in sample_cases
            ],
            tags=[tag.name for tag in problem.tags.all()],
            required_keywords=getattr(problem, 'required_keywords', []) or [],
            forbidden_keywords=getattr(problem, 'forbidden_keywords', []) or [],
        )
