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
    """Serializer for submission list."""
    user = serializers.SerializerMethodField()
    problem = ProblemListSerializer(read_only=True)
    
    def get_user(self, obj):
        from apps.users.serializers import UserSerializer
        
        # Default data
        data = UserSerializer(obj.user).data
        
        # If no contest or not anonymous, return real user data
        if not obj.contest or not obj.contest.anonymous_mode_enabled:
            return data

        request = self.context.get('request')
        viewer = request.user if request else None
        
        is_privileged = viewer and (viewer.is_staff or getattr(viewer, 'role', '') in ['teacher', 'admin'])
        is_owner = viewer and viewer == obj.user
        
        # If privileged or owner, they see real data (frontend can decide to show nickname too if added, but for now we keep username as real)
        # Actually, for consistency with scoreboard, we might want to return real username but maybe add a display_name field?
        # But replacing username is the safest for now.
        if is_privileged or is_owner:
            return data
            
        # For others, mask username with nickname
        from apps.contests.models import ContestParticipant
        try:
             participant = ContestParticipant.objects.get(contest=obj.contest, user=obj.user)
             nickname = participant.nickname
             if nickname:
                 data['username'] = nickname
                 # Remove sensitive info if any
                 if 'email' in data:
                     del data['email']
        except ContestParticipant.DoesNotExist:
             pass
        
        return data
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user',
            'problem',
            'contest',
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
