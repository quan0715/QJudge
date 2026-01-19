"""
Serializers for contests app.
"""
from rest_framework import serializers
from django.utils import timezone
from .models import (
    Contest,
    ContestProblem,
    ContestParticipant,
    ContestAnnouncement,
    Clarification,
    ExamEvent,
    ContestActivity,
    ExamStatus,
)
from django.db.models import Sum
from .permissions import get_user_role_in_contest, get_contest_permissions
from apps.users.serializers import UserSerializer
from apps.problems.serializers import ProblemListSerializer


# ============================================================================
# Contest Serializers (Updated for new MVP flow)
# ============================================================================

class ContestListSerializer(serializers.ModelSerializer):
    """
    Serializer for contest list view.
    Returns minimal information for listing contests.
    """
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    participant_count = serializers.SerializerMethodField()
    is_registered = serializers.SerializerMethodField()
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'name',
            'start_time',
            'end_time',
            'status',
            'visibility',
            'owner_username',
            'participant_count',
            'is_registered',
            'created_at',
            'created_at',
        ]
    
    def get_participant_count(self, obj):
        """Get total number of participants."""
        return obj.registrations.count()

    def get_is_registered(self, obj):
        """Check if current user is registered."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.registrations.filter(user=request.user).exists()


class ContestDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for contest detail view.
    Includes role-based permissions and full contest information.
    """
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    current_user_role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    has_joined = serializers.SerializerMethodField()
    has_started = serializers.SerializerMethodField()
    started_at = serializers.SerializerMethodField()
    left_at = serializers.SerializerMethodField()
    locked_at = serializers.SerializerMethodField()
    lock_reason = serializers.SerializerMethodField()
    exam_status = serializers.SerializerMethodField()
    auto_unlock_at = serializers.SerializerMethodField()
    my_nickname = serializers.SerializerMethodField()
    problems = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    admins = serializers.SerializerMethodField()
    
    rule = serializers.CharField(source='rules', read_only=True)
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'name',
            'description',
            'rules',
            'rule',
            'start_time',
            'end_time',
            'status',
            'visibility',
            'exam_mode_enabled',
            'scoreboard_visible_during_contest',
            'owner_username',
            'created_at',
            'updated_at',
            'created_at',
            'updated_at',
            # Computed fields
            'my_nickname',
            'current_user_role',
            'permissions',
            'has_joined',
            'has_started',
            'started_at',
            'left_at',
            'locked_at',
            'lock_reason',
            'exam_status',
            'auto_unlock_at',
            'problems',
            'allow_multiple_joins',
            'max_cheat_warnings',
            'allow_auto_unlock',
            'auto_unlock_minutes',
            'anonymous_mode_enabled',
            'my_nickname',
            'participant_count',
            'admins',
        ]

    def get_my_nickname(self, obj):
        """Get nickname for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.nickname if registration else None

    def get_lock_reason(self, obj):
        """Get lock reason for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.lock_reason if registration else None

    def get_locked_at(self, obj):
        """Get locked_at timestamp for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.locked_at if registration else None

    def get_exam_status(self, obj):
        """Get exam status for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.exam_status if registration else None
    
    def get_auto_unlock_at(self, obj):
        """Calculate auto unlock time for current user if locked."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        if not registration or registration.exam_status != ExamStatus.LOCKED:
            return None
        if not registration.locked_at or not obj.allow_auto_unlock:
            return None
        
        minutes = obj.auto_unlock_minutes or 0
        return registration.locked_at + timezone.timedelta(minutes=minutes)
    
    def get_current_user_role(self, obj):
        """Get user's role in this contest."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 'student'
        return get_user_role_in_contest(request.user, obj)
    
    def get_permissions(self, obj):
        """Get all permissions for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return get_contest_permissions(None, obj)
        return get_contest_permissions(request.user, obj)
    
    def get_has_joined(self, obj):
        """Check if current user has registered."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.registrations.filter(user=request.user).exists()
    
    def get_has_started(self, obj):
        """Check if current user has started the exam."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        registration = obj.registrations.filter(user=request.user).first()
        return bool(registration and registration.started_at)

    def get_started_at(self, obj):
        """Get start time for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.started_at if registration else None

    def get_left_at(self, obj):
        """Get left time for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.left_at if registration else None

    def get_participant_count(self, obj):
        """Get total number of participants."""
        return obj.registrations.count()

    def get_admins(self, obj):
        """Get list of admin users for this contest."""
        admins = obj.admins.all()
        return [{'id': u.id, 'username': u.username} for u in admins]

    def get_has_finished_exam(self, obj):
        """Check if current user has finished the exam."""
        # If contest has ended, everyone is finished
        if obj.end_time and timezone.now() > obj.end_time:
            return True
            
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        registration = obj.registrations.filter(user=request.user).first()
        return registration.exam_status == ExamStatus.SUBMITTED if registration else False
    
    def get_problems(self, obj):
        """
        Get contest problems with labels.
        Problems are ONLY visible to:
        1. Owner/Admin/Contest-Admin: always visible
        2. Registered participants: only during published contest period
        
        Non-registered users NEVER see problem structure.
        """
        request = self.context.get('request')
        user = request.user if request else None

        # Check if user is owner or admin
        is_privileged = user and user.is_authenticated and (
            obj.owner == user or
            user.is_staff or
            getattr(user, 'role', '') == 'admin' or
            obj.admins.filter(pk=user.pk).exists()
        )

        # Privileged users can always see problems
        if is_privileged:
            contest_problems = obj.contest_problems.select_related('problem').order_by('order')
            return ContestProblemSerializer(contest_problems, many=True, context=self.context).data

        # Check if user is a registered participant
        is_participant = user and user.is_authenticated and \
            ContestParticipant.objects.filter(contest=obj, user=user).exists()

        # Non-registered users cannot see problems at all
        if not is_participant:
            return []

        # For participants, only show problems during published contest period
        now = timezone.now()

        # Hide problems for draft contests
        if obj.status == 'draft':
            return []

        # Archived contests are read-only but visible to participants
        if obj.status == 'archived':
            contest_problems = obj.contest_problems.select_related('problem').order_by('order')
            return ContestProblemSerializer(contest_problems, many=True, context=self.context).data

        # Hide problems if contest hasn't started yet
        if obj.start_time and now < obj.start_time:
            return []

        contest_problems = obj.contest_problems.select_related('problem').order_by('order')
        return ContestProblemSerializer(contest_problems, many=True, context=self.context).data


class ContestCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and updating contests.
    Minimal fields for creation, can be updated later.
    """
    class Meta:
        model = Contest
        fields = [
            'id',
            'name',
            'description',
            'rules',
            'start_time',
            'end_time',
            'visibility',
            'password',
            'exam_mode_enabled',
            'scoreboard_visible_during_contest',
            'allow_multiple_joins',
            'max_cheat_warnings',
            'allow_auto_unlock',
            'auto_unlock_minutes',
            'status',
            'anonymous_mode_enabled',
        ]
        read_only_fields = ['id']
    
    def validate(self, data):
        """Validate contest data."""
        # For private contests, password should be provided
        visibility = data.get('visibility')
        
        # Get effective visibility (from data or instance)
        if visibility is None and self.instance:
            visibility = self.instance.visibility
            
        if visibility == 'private':
            password_in_data = 'password' in data
            password = data.get('password')
            
            # If explicit empty password provided
            if password_in_data and not password:
                raise serializers.ValidationError({
                    'password': 'Password is required for private contests.'
                })
                
            # If no password provided, ensure existing password
            if not password_in_data:
                if not self.instance or not self.instance.password:
                     raise serializers.ValidationError({
                        'password': 'Password is required for private contests.'
                     })
        
        # Validate time range
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        
        # Handle partial updates for time check
        if self.instance:
            start_time = start_time if start_time is not None else self.instance.start_time
            end_time = end_time if end_time is not None else self.instance.end_time

        if start_time and end_time:
            if start_time >= end_time:
                raise serializers.ValidationError({
                    'end_time': 'End time must be after start time.'
                })
        
        return data
    
    def create(self, validated_data):
        """Create contest with current user as owner."""
        request = self.context.get('request')
        validated_data['owner'] = request.user
        validated_data['status'] = 'draft'  # Always start as draft

        
        return super().create(validated_data)


# ============================================================================
# Contest Problem Serializers
# ============================================================================

class ContestProblemSerializer(serializers.ModelSerializer):
    """
    Serializer for problems within a contest.
    Includes label and problem summary.
    """
    problem_id = serializers.IntegerField(source='problem.id', read_only=True)
    title = serializers.CharField(source='problem.title', read_only=True)
    difficulty = serializers.CharField(source='problem.difficulty', read_only=True)
    label = serializers.CharField(read_only=True)
    score = serializers.SerializerMethodField()
    user_status = serializers.SerializerMethodField()
    
    class Meta:
        model = ContestProblem
        fields = [
            'id',
            'problem_id',
            'title',
            'label',
            'order',
            'score',
            'difficulty',
            'user_status',
        ]
    
    def get_user_status(self, obj):
        """Get submission status for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        
        from apps.submissions.models import Submission
        
        # Check for AC
        has_ac = Submission.objects.filter(
            contest=obj.contest,
            problem=obj.problem,
            user=request.user,
            status='AC',
            source_type='contest'
        ).exists()
        
        if has_ac:
            return 'AC'
        
        # Check for any attempt
        has_attempt = Submission.objects.filter(
            contest=obj.contest,
            problem=obj.problem,
            user=request.user,
            source_type='contest'
        ).exists()
        
        if has_attempt:
            return 'attempted'
        
        return None

    def get_score(self, obj):
        # Allow pre-calculated/annotated score to avoid N+1
        if hasattr(obj, 'problem_score_sum'):
            return obj.problem_score_sum or 0
        # Fallback to aggregation
        return obj.problem.test_cases.aggregate(Sum('score'))['score__sum'] or 0


class ContestProblemCreateSerializer(serializers.Serializer):
    """
    Serializer for adding a problem to a contest.
    """
    problem_id = serializers.IntegerField()
    # label = serializers.CharField(max_length=10) # Dynamic now
    order = serializers.IntegerField(default=0)
    # score = serializers.IntegerField(default=100)


# ============================================================================
# Clarification Serializers (New)
# ============================================================================

class ClarificationSerializer(serializers.ModelSerializer):
    """
    Serializer for clarifications/Q&A.
    """
    author_username = serializers.CharField(source='author.username', read_only=True)
    author_display_name = serializers.SerializerMethodField()
    problem_title = serializers.CharField(source='problem.title', read_only=True, allow_null=True)
    
    class Meta:
        model = Clarification
        fields = [
            'id',
            'contest',
            'problem',
            'problem_title',
            'author',
            'author_username',
            'author_display_name',
            'question',
            'answer',
            'is_public',
            'status',
            'created_at',
            'answered_at',
        ]
        read_only_fields = ['author', 'status', 'answered_at', 'author_username', 'author_display_name', 'problem_title']

    def get_author_display_name(self, obj):
        """根據匿名模式返回適當的作者名稱"""
        request = self.context.get('request')
        contest = obj.contest
        
        if not contest.anonymous_mode_enabled:
            return obj.author.username
        
        # 管理者可見真實名稱
        if request and request.user.is_authenticated:
            from .permissions import get_user_role_in_contest
            role = get_user_role_in_contest(request.user, contest)
            if role in ['admin', 'teacher']:
                return obj.author.username
        
        # 查找該用戶的暱稱
        participant = ContestParticipant.objects.filter(
            contest=contest, user=obj.author
        ).first()
        return participant.nickname if participant else obj.author.username


class ClarificationCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a clarification.
    """
    problem_id = serializers.IntegerField(required=False, allow_null=True)
    
    class Meta:
        model = Clarification
        fields = ['problem_id', 'question']

    def create(self, validated_data):
        problem_id = validated_data.pop('problem_id', None)
        problem = None
        if problem_id:
            from apps.problems.models import Problem
            try:
                problem = Problem.objects.get(id=problem_id)
            except Problem.DoesNotExist:
                pass
        
        validated_data['problem'] = problem
        return super().create(validated_data)


class ClarificationReplySerializer(serializers.Serializer):
    """
    Serializer for replying to a clarification.
    """
    answer = serializers.CharField()
    is_public = serializers.BooleanField(default=True)


# ============================================================================
# Exam Event Serializers (New)
# ============================================================================

class ExamEventSerializer(serializers.ModelSerializer):
    """
    Serializer for exam events.
    """
    user_username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = ExamEvent
        fields = [
            'id',
            'contest',
            'user',
            'user_username',
            'event_type',
            'metadata',
            'created_at',
        ]
        read_only_fields = ['created_at', 'user_username']


class ExamEventCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating exam events."""
    class Meta:
        model = ExamEvent
        fields = ['event_type', 'metadata']


class ContestActivitySerializer(serializers.ModelSerializer):
    """Serializer for contest activities."""
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = ContestActivity
        fields = ['id', 'user', 'username', 'action_type', 'details', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


# ============================================================================
# Registration Serializers
# ============================================================================

class ContestRegistrationSerializer(serializers.Serializer):
    """
    Serializer for contest registration.
    """
    password = serializers.CharField(required=False, allow_blank=True)
    nickname = serializers.CharField(required=False, allow_blank=True, max_length=50)


class ContestParticipantSerializer(serializers.ModelSerializer):
    """
    Serializer for contest participants (for standings/scoreboard).
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    nickname = serializers.CharField(read_only=True)
    display_name = serializers.SerializerMethodField()
    total_score = serializers.SerializerMethodField()
    
    auto_unlock_at = serializers.SerializerMethodField()
    remaining_unlock_seconds = serializers.SerializerMethodField()
    
    class Meta:
        model = ContestParticipant
        fields = [
            'user_id', 'username', 'user', 'score', 'total_score', 'rank', 
            'joined_at', 'exam_status',
            'lock_reason', 'violation_count', 'auto_unlock_at', 'remaining_unlock_seconds',
            'nickname', 'display_name',
        ]
    
    def get_total_score(self, obj):
        """計算參賽者的實際總分（從提交記錄中計算，排除測試提交）"""
        from apps.submissions.models import Submission
        from django.db.models import Max
        
        # 取得競賽的所有題目
        contest_problems = obj.contest.contest_problems.all()
        total = 0
        
        for cp in contest_problems:
            # 取得該用戶在此題目的最高分（排除測試提交）
            best_submission = Submission.objects.filter(
                contest=obj.contest,
                problem=cp.problem,
                user=obj.user,
                source_type='contest',
                is_test=False  # Exclude test submissions
            ).aggregate(max_score=Max('score'))
            
            if best_submission['max_score']:
                total += best_submission['max_score']
        
        return total

    def get_display_name(self, obj):
        """根據權限返回適當的顯示名稱"""
        request = self.context.get('request')
        contest = obj.contest
        
        # 非匿名模式，直接返回真實用戶名
        if not contest.anonymous_mode_enabled:
            return obj.user.username
        
        # 管理者可見真實名稱
        if request and request.user.is_authenticated:
            from .permissions import get_user_role_in_contest
            role = get_user_role_in_contest(request.user, contest)
            if role in ['admin', 'teacher']:
                return obj.user.username
        
        # 其他用戶看暱稱 (nickname 預設為 username)
        return obj.nickname or obj.user.username

    def get_auto_unlock_at(self, obj):
        """Calculate auto unlock time if applicable."""
        if obj.exam_status != ExamStatus.LOCKED or not obj.locked_at or not obj.contest.allow_auto_unlock:
            return None
        
        minutes = obj.contest.auto_unlock_minutes or 0
        return obj.locked_at + timezone.timedelta(minutes=minutes)

    def get_remaining_unlock_seconds(self, obj):
        """Calculate remaining seconds until auto unlock."""
        unlock_at = self.get_auto_unlock_at(obj)
        if not unlock_at:
            return None
            
        now = timezone.now()
        if now >= unlock_at:
            return 0
            
        return int((unlock_at - now).total_seconds())


# ============================================================================
# Legacy Serializers (Kept for backward compatibility)
# ============================================================================




class ContestAnnouncementSerializer(serializers.ModelSerializer):
    """
    Serializer for contest announcements.
    """
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = ContestAnnouncement
        fields = ['id', 'title', 'content', 'created_by', 'created_at', 'updated_at']
