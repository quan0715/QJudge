"""
Data Transfer Objects for contest exporters.
These dataclasses provide a clean interface between data service and renderers.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any


@dataclass
class SampleCaseDTO:
    """Sample test case data."""
    input: str
    output: str


@dataclass
class ProblemDTO:
    """Problem data for export."""
    id: int
    label: str
    title: str
    description: str = ''
    input_description: str = ''
    output_description: str = ''
    hint: str = ''
    time_limit: int = 1000
    memory_limit: int = 128
    difficulty: str = 'medium'
    difficulty_display: str = 'Medium'
    sample_cases: List[SampleCaseDTO] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    max_score: int = 0
    required_keywords: List[str] = field(default_factory=list)
    forbidden_keywords: List[str] = field(default_factory=list)


@dataclass
class ContestProblemDTO:
    """Contest problem with order and score info."""
    id: int  # ContestProblem ID
    problem_id: int
    order: int
    label: str
    problem: ProblemDTO
    score: int = 0  # Max possible score from test cases


@dataclass
class ContestDTO:
    """Contest data for export."""
    id: int
    name: str
    description: str = ''
    rules: str = ''
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    exam_mode_enabled: bool = False
    status: str = 'published'
    scoreboard_visible_during_contest: bool = True


@dataclass
class ParticipantDTO:
    """Participant data."""
    user_id: int
    username: str
    email: str = ''
    nickname: str = ''
    exam_status: str = ''
    started_at: Optional[datetime] = None
    left_at: Optional[datetime] = None


@dataclass
class SubmissionDTO:
    """Submission data for reporting."""
    id: int
    user_id: int
    problem_id: int
    status: str
    score: int = 0
    language: str = ''
    code: str = ''
    created_at: Optional[datetime] = None
    is_test: bool = False


@dataclass
class ProblemStatsDTO:
    """Per-problem statistics for a user."""
    problem_id: int
    status: Optional[str] = None
    score: int = 0
    max_score: int = 0
    tries: int = 0
    time: int = 0  # Time in minutes from contest start


@dataclass
class UserStandingDTO:
    """User standing data."""
    user_id: int
    username: str
    display_name: str = ''
    solved: int = 0
    total_score: int = 0
    penalty: int = 0
    rank: int = 0
    problems: Dict[int, ProblemStatsDTO] = field(default_factory=dict)


@dataclass
class StandingsDTO:
    """Full standings data."""
    rank: Optional[int] = None
    total_participants: int = 0
    user_stats: Optional[UserStandingDTO] = None
    standings: List[UserStandingDTO] = field(default_factory=list)


@dataclass
class DifficultyStatsDTO:
    """Statistics by difficulty level."""
    easy: Dict[str, int] = field(default_factory=lambda: {
        'solved': 0, 'total': 0, 'score': 0, 'max_score': 0
    })
    medium: Dict[str, int] = field(default_factory=lambda: {
        'solved': 0, 'total': 0, 'score': 0, 'max_score': 0
    })
    hard: Dict[str, int] = field(default_factory=lambda: {
        'solved': 0, 'total': 0, 'score': 0, 'max_score': 0
    })
