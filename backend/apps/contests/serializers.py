"""
Serializers for contests app.
"""
from rest_framework import serializers
from .models import (
    Contest,
    ContestProblem,
    ContestParticipant,
    ContestQuestion,
    ContestAnnouncement
)
from apps.users.serializers import UserSerializer
from apps.problems.serializers import ProblemListSerializer


class ContestProblemSerializer(serializers.ModelSerializer):
    """Serializer for problems within a contest."""
    problem = ProblemListSerializer(read_only=True)
    
    class Meta:
        model = ContestProblem
        fields = ['id', 'problem', 'order', 'score']


class ContestListSerializer(serializers.ModelSerializer):
    """Serializer for contest list."""
    creator = UserSerializer(read_only=True)
    participant_count = serializers.IntegerField(read_only=True)
    is_registered = serializers.SerializerMethodField()
    has_left = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'title',
            'start_time',
            'end_time',
            'creator',
            'is_public',
            'participant_count',
            'is_registered',
            'has_left',
            'status',
        ]

    def get_status(self, obj):
        from django.utils import timezone
        now = timezone.now()
        if now < obj.start_time:
            return 'upcoming'
        elif now > obj.end_time:
            return 'ended'
        return 'running'

    def get_is_registered(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return ContestParticipant.objects.filter(contest=obj, user=request.user).exists()

    def get_has_left(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        participant = ContestParticipant.objects.filter(contest=obj, user=request.user).first()
        return participant.left_at is not None if participant else False


class ContestDetailSerializer(serializers.ModelSerializer):
    """Serializer for contest detail."""
    creator = UserSerializer(read_only=True)
    problems = serializers.SerializerMethodField()
    is_registered = serializers.SerializerMethodField()
    has_left = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'title',
            'description',
            'rules',
            'start_time',
            'end_time',
            'creator',
            'is_public',
            'allow_view_results',
            'problems',
            'is_registered',
            'has_left',
            'status',
        ]
    
    def get_status(self, obj):
        from django.utils import timezone
        now = timezone.now()
        if now < obj.start_time:
            return 'upcoming'
        elif now > obj.end_time:
            return 'ended'
        return 'running'
    
    def get_problems(self, obj):
        """Get problems if contest started or user is creator."""
        request = self.context.get('request')
        if not request:
            return []
            
        # Check if user is creator or admin
        is_staff = request.user.is_staff or request.user == obj.creator
        
        # Check if contest started
        from django.utils import timezone
        has_started = timezone.now() >= obj.start_time
        
        if is_staff or has_started:
            contest_problems = ContestProblem.objects.filter(contest=obj).order_by('order')
            return ContestProblemSerializer(contest_problems, many=True).data
            
        return []

    def get_is_registered(self, obj):
        """Check if current user is registered."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return ContestParticipant.objects.filter(contest=obj, user=request.user).exists()

    def get_has_left(self, obj):
        """Check if current user has left the contest."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        participant = ContestParticipant.objects.filter(contest=obj, user=request.user).first()
        return participant.left_at is not None if participant else False


class ContestRegisterSerializer(serializers.Serializer):
    """Serializer for contest registration."""
    password = serializers.CharField(required=False, allow_blank=True)


class ContestParticipantSerializer(serializers.ModelSerializer):
    """Serializer for contest participants (standings)."""
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = ContestParticipant
        fields = ['user', 'score', 'rank', 'joined_at']


class ContestQuestionSerializer(serializers.ModelSerializer):
    """Serializer for contest Q&A."""
    user = UserSerializer(read_only=True)
    replied_by = UserSerializer(read_only=True)
    
    class Meta:
        model = ContestQuestion
        fields = [
            'id',
            'title',
            'content',
            'reply',
            'user',
            'replied_by',
            'replied_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['reply', 'replied_by', 'replied_at']


class ContestAnnouncementSerializer(serializers.ModelSerializer):
    """Serializer for contest announcements."""
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = ContestAnnouncement
        fields = ['id', 'title', 'content', 'created_by', 'created_at', 'updated_at']


class ContestAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage contests."""
    problems = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )
    problem_list = ContestProblemSerializer(source='contestproblem_set', many=True, read_only=True)
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'title',
            'description',
            'rules',
            'start_time',
            'end_time',
            'is_public',
            'password',
            'allow_view_results',
            'allow_multiple_joins',
            'ban_tab_switching',
            'problems',
            'problem_list',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
        
    def create(self, validated_data):
        problems_data = validated_data.pop('problems', [])
        contest = Contest.objects.create(**validated_data)
        
        from apps.problems.models import Problem
        from apps.problems.services import ProblemService
        
        for index, problem_id in enumerate(problems_data):
            try:
                problem = Problem.objects.get(id=problem_id)
                # If problem is not owned by this contest, clone it
                if problem.contest != contest:
                    problem = ProblemService.clone_problem(problem, contest, contest.creator)
                
                ContestProblem.objects.create(
                    contest=contest,
                    problem=problem,
                    order=index
                )
            except Problem.DoesNotExist:
                continue
            
        return contest
        
    def update(self, instance, validated_data):
        problems_data = validated_data.pop('problems', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if problems_data is not None:
            instance.contestproblem_set.all().delete()
            
            from apps.problems.models import Problem
            from apps.problems.services import ProblemService
            
            for index, problem_id in enumerate(problems_data):
                try:
                    problem = Problem.objects.get(id=problem_id)
                    # If problem is not owned by this contest, clone it
                    if problem.contest != instance:
                        # Check if we already have a copy of this source problem in this contest?
                        # To avoid re-cloning if user saves multiple times.
                        # But here we deleted all links.
                        # If the problem passed in IS the source problem, we clone.
                        # If the problem passed in IS ALREADY a copy (contest=instance), we keep it.
                        problem = ProblemService.clone_problem(problem, instance, instance.creator)
                    
                    ContestProblem.objects.create(
                        contest=instance,
                        problem=problem,
                        order=index
                    )
                except Problem.DoesNotExist:
                    continue
                
        return instance
