"""
Serializers for submissions app.
"""
from rest_framework import serializers
from .models import Submission, SubmissionResult, ScreenEvent
from apps.contests.permissions import can_manage_contest
from apps.problems.serializers import ProblemListSerializer
from apps.users.serializers import EmbeddedUserSerializer


def _get_total_test_cases(submission: Submission) -> int:
    return submission.problem.test_cases.count()


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

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if data['is_hidden'] and not self._can_see_hidden_cases(obj.submission):
            data['input'] = None
            data['expected_output'] = None
        return data

    def _can_see_hidden_cases(self, submission):
        """Hidden test data is visible to platform admins and managers of the submission's contest."""
        cache = self.__dict__.setdefault('_hidden_case_access', {})
        if submission.pk not in cache:
            request = self.context.get('request')
            user = request.user if request else None
            cache[submission.pk] = bool(
                user and user.is_authenticated and (
                    user.is_staff or user.is_superuser
                    or (submission.contest is not None and can_manage_contest(user, submission.contest))
                )
            )
        return cache[submission.pk]

    def get_input(self, obj):
        return obj.test_case.input_data if obj.test_case else obj.input_data

    def get_expected_output(self, obj):
        return obj.test_case.output_data if obj.test_case else obj.expected_output

    def get_is_hidden(self, obj):
        """Return whether this testcase is hidden."""
        return obj.is_hidden or bool(obj.test_case and obj.test_case.is_hidden)


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
    problem_id = serializers.UUIDField(source='problem.id', read_only=True)
    problem_title = serializers.SerializerMethodField()

    def get_problem_title(self, obj):
        if obj.problem_id and obj.problem.question_asset_id:
            try:
                return obj.problem.question_asset.title or f"Problem {obj.problem_id}"
            except Exception:
                pass
        return f"Problem {obj.problem_id}"
    contest_id = serializers.UUIDField(source='contest.id', read_only=True, allow_null=True)
    
    def get_username(self, obj):
        """Return submitter username."""
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
            'language',
            'status',
            'score',
            'exec_time',
            'memory_usage',
            'created_at',
        ]


class SubmissionDetailSerializer(serializers.ModelSerializer):
    """Serializer for submission detail."""
    user = EmbeddedUserSerializer(read_only=True)
    problem = ProblemListSerializer(read_only=True)
    results = SubmissionResultSerializer(many=True, read_only=True)
    screen_events = ScreenEventSerializer(many=True, read_only=True)
    total_test_cases = serializers.SerializerMethodField()
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user',
            'problem',
            'contest',
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
            'total_test_cases',
        ]

    def get_total_test_cases(self, obj):
        return _get_total_test_cases(obj)


class CreateSubmissionSerializer(serializers.ModelSerializer):
    """Serializer for creating a submission."""
    total_test_cases = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            'id',
            'problem',
            'contest',
            'language',
            'code',
            'status',
            'error_message',
            'created_at',
            'total_test_cases',
        ]
        read_only_fields = ['id', 'status', 'created_at']
        extra_kwargs = {
            'problem': {'required': True},
            'contest': {'required': True, 'allow_null': False},
            'code': {'required': True},
            'language': {'required': True},
        }
    
    def get_total_test_cases(self, obj):
        return _get_total_test_cases(obj)
