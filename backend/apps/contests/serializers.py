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
)
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
    has_finished_exam = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    lock_reason = serializers.SerializerMethodField()
    problems = serializers.SerializerMethodField()
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'name',
            'description',
            'start_time',
            'end_time',
            'status',
            'visibility',
            'exam_mode_enabled',
            'scoreboard_visible_during_contest',
            'owner_username',
            'created_at',
            'updated_at',
            # Computed fields
            'current_user_role',
            'permissions',
            'has_joined',
            'has_started',
            'started_at',
            'has_finished_exam',
            'is_locked',
            'lock_reason',
            'problems',
        ]

    def get_is_locked(self, obj):
        """Check if current user is locked."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        registration = obj.registrations.filter(user=request.user).first()
        return registration.is_locked if registration else False

    def get_lock_reason(self, obj):
        """Get lock reason for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        registration = obj.registrations.filter(user=request.user).first()
        return registration.lock_reason if registration else None
    
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

    def get_has_finished_exam(self, obj):
        """Check if current user has finished the exam."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        registration = obj.registrations.filter(user=request.user).first()
        return registration.has_finished_exam if registration else False
    
    def get_problems(self, obj):
        """Get contest problems with labels."""
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
            'start_time',
            'end_time',
            'visibility',
            'password',
            'exam_mode_enabled',
            'scoreboard_visible_during_contest',
        ]
        read_only_fields = ['id']
    
    def validate(self, data):
        """Validate contest data."""
        # For private contests, password should be provided
        if data.get('visibility') == 'private' and not data.get('password'):
            raise serializers.ValidationError({
                'password': 'Password is required for private contests.'
            })
        
        # Validate time range
        if data.get('start_time') and data.get('end_time'):
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError({
                    'end_time': 'End time must be after start time.'
                })
        
        return data
    
    def create(self, validated_data):
        """Create contest with current user as owner."""
        request = self.context.get('request')
        validated_data['owner'] = request.user
        validated_data['status'] = 'inactive'  # Always start as inactive

        
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


class ContestProblemCreateSerializer(serializers.Serializer):
    """
    Serializer for adding a problem to a contest.
    """
    problem_id = serializers.IntegerField()
    label = serializers.CharField(max_length=10)
    order = serializers.IntegerField(default=0)
    score = serializers.IntegerField(default=100)


# ============================================================================
# Clarification Serializers (New)
# ============================================================================

class ClarificationSerializer(serializers.ModelSerializer):
    """
    Serializer for clarifications/Q&A.
    """
    author_username = serializers.CharField(source='author.username', read_only=True)
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
            'question',
            'answer',
            'is_public',
            'status',
            'created_at',
            'answered_at',
        ]
        read_only_fields = ['author', 'status', 'answered_at', 'author_username', 'problem_title']


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


class ContestParticipantSerializer(serializers.ModelSerializer):
    """
    Serializer for contest participants (for standings/scoreboard).
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = ContestParticipant
        fields = ['user_id', 'username', 'user', 'score', 'rank', 'joined_at', 'has_finished_exam', 'is_locked', 'lock_reason']


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
