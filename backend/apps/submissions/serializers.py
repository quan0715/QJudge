"""
Serializers for submissions app.
"""
from rest_framework import serializers
from .models import Submission, SubmissionResult, ScreenEvent
from apps.problems.serializers import ProblemListSerializer
from apps.users.serializers import UserSerializer


class SubmissionResultSerializer(serializers.ModelSerializer):
    """Serializer for submission results."""
    class Meta:
        model = SubmissionResult
        fields = [
            'id',
            'test_case',
            'status',
            'exec_time',
            'memory_usage',
            'output',
            'error_message',
            'input',
            'expected_output',
            'is_hidden',
        ]

    input = serializers.SerializerMethodField()
    expected_output = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()

    def get_input(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        is_privileged = user and (user.is_staff or getattr(user, 'role', '') in ['teacher', 'admin'])
        
        # If it's a custom test case (test_case is None), return the stored input
        if obj.test_case is None:
            return obj.input_data

        if is_privileged or obj.test_case.is_sample or not obj.test_case.is_hidden:
            return obj.test_case.input_data
        return None

    def get_expected_output(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        is_privileged = user and (user.is_staff or getattr(user, 'role', '') in ['teacher', 'admin'])
        
        # If it's a custom test case (test_case is None), return the stored expected output
        if obj.test_case is None:
            return obj.expected_output

        if is_privileged or obj.test_case.is_sample or not obj.test_case.is_hidden:
            return obj.test_case.output_data
        return None

    def get_is_hidden(self, obj):
        """Return whether this testcase is hidden."""
        if obj.test_case is None:
            return False
        return obj.test_case.is_hidden


class ScreenEventSerializer(serializers.ModelSerializer):
    """Serializer for screen events."""
    class Meta:
        model = ScreenEvent
        fields = [
            'event_type',
            'timestamp',
            'details',
        ]


class SubmissionListSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for submission list.
    Uses flat fields instead of nested serializers to reduce query count and response size.
    """
    # Use direct field access instead of nested serializers
    username = serializers.SerializerMethodField()
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    problem_id = serializers.IntegerField(source='problem.id', read_only=True)
    problem_title = serializers.CharField(source='problem.title', read_only=True)
    contest_id = serializers.IntegerField(source='contest.id', read_only=True, allow_null=True)
    
    def get_username(self, obj):
        """Handle anonymous mode for contests."""
        # If no contest or anonymous mode not enabled, return real username
        if not obj.contest or not obj.contest.anonymous_mode_enabled:
            return obj.user.username
        
        request = self.context.get('request')
        viewer = request.user if request else None
        
        # Privileged users or owners see real username
        is_privileged = viewer and (viewer.is_staff or getattr(viewer, 'role', '') in ['teacher', 'admin'])
        is_owner = viewer and viewer == obj.user
        
        if is_privileged or is_owner:
            return obj.user.username
        
        # For others, return nickname if available
        # Use annotated field from queryset (added via Subquery in ViewSet)
        if hasattr(obj, '_contest_nickname') and obj._contest_nickname:
            return obj._contest_nickname
        
        # Fallback to real username
        return obj.user.username
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user_id',
            'username',
            'problem_id',
            'problem_title',
            'contest_id',
            'source_type',
            'language',
            'status',
            'score',
            'exec_time',
            'memory_usage',
            'created_at',
        ]


class SubmissionDetailSerializer(serializers.ModelSerializer):
    """Serializer for submission detail."""
    user = UserSerializer(read_only=True)
    problem = ProblemListSerializer(read_only=True)
    results = SubmissionResultSerializer(many=True, read_only=True)
    screen_events = ScreenEventSerializer(many=True, read_only=True)
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user',
            'problem',
            'contest',
            'source_type',
            'language',
            'code',
            'status',
            'score',
            'exec_time',
            'memory_usage',
            'error_message',
            'created_at',
            'updated_at',
            'results',
            'screen_events',
            'custom_test_cases',
        ]


class CreateSubmissionSerializer(serializers.ModelSerializer):
    """Serializer for creating a submission."""
    class Meta:
        model = Submission
        fields = [
            'id',
            'problem',
            'contest',
            'source_type',
            'language',
            'code',
            'is_test',
            'custom_test_cases',
            'status',
            'created_at',
        ]
        read_only_fields = ['id', 'status', 'created_at']
        extra_kwargs = {
            'problem': {'required': True},
            'code': {'required': True},
            'language': {'required': True},
            'custom_test_cases': {'required': False},
        }
    
    def validate(self, attrs):
        # Additional validation if needed
        return attrs
