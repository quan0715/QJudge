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
        ]


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
    user = UserSerializer(read_only=True)
    problem = ProblemListSerializer(read_only=True)
    
    class Meta:
        model = Submission
        fields = [
            'id',
            'user',
            'problem',
            'contest',
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
        ]


class CreateSubmissionSerializer(serializers.ModelSerializer):
    """Serializer for creating a submission."""
    class Meta:
        model = Submission
        fields = [
            'id',
            'problem',
            'contest',
            'language',
            'code',
            'status',
            'created_at',
        ]
        read_only_fields = ['id', 'status', 'created_at']
        extra_kwargs = {
            'problem': {'required': True},
            'code': {'required': True},
            'language': {'required': True},
        }
    
    def validate(self, attrs):
        # Additional validation if needed
        return attrs
