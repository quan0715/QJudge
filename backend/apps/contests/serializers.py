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
    user_status = serializers.SerializerMethodField()
    
    class Meta:
        model = ContestProblem
        fields = ['id', 'problem', 'order', 'score', 'user_status']

    def get_user_status(self, obj):
        """Get status for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
            
        # Check for submissions in this contest for this problem by this user
        # We need to look up submissions where contest=obj.contest and problem=obj.problem
        from apps.submissions.models import Submission
        
        # Check for AC first
        has_ac = Submission.objects.filter(
            contest=obj.contest,
            problem=obj.problem,
            user=request.user,
            status='AC'
        ).exists()
        
        if has_ac:
            return 'AC'
            
        # Check for any other submission
        has_attempt = Submission.objects.filter(
            contest=obj.contest,
            problem=obj.problem,
            user=request.user
        ).exists()
        
        if has_attempt:
            return 'attempted'
            
        return None


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
            'is_ended',
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
            'is_ended',
            'allow_view_results',
            'problems',
            'is_registered',
            'has_left',
            'status',
            'current_user_role',
            'permissions',
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
        
        
        # Check if user is registered
        is_registered = ContestParticipant.objects.filter(
            contest=obj, 
            user=request.user, 
            left_at__isnull=True
        ).exists()
        
        if is_staff or has_started or is_registered:
            problem_list = obj.contestproblem_set.select_related('problem').order_by('order')
            return ContestProblemSerializer(problem_list, many=True).data
        
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

    current_user_role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    def get_current_user_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
            
        user = request.user
        if user.is_staff or user.role == 'admin':
            return 'admin'
        if user == obj.creator or user.role == 'teacher':
            # Note: A teacher who didn't create the contest is still a teacher, 
            # but might have limited permissions compared to creator.
            # For simplicity, we return 'teacher' but permissions will handle specifics.
            return 'teacher'
        return 'student'

    def get_permissions(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return {}
            
        user = request.user
        is_admin = user.is_staff or user.role == 'admin'
        is_creator = user == obj.creator
        
        return {
            'can_edit': is_admin or is_creator,
            'can_delete': is_admin, # Only admin can delete for now
            'can_end_contest': is_admin or is_creator,
            'can_manage_problems': is_admin or is_creator,
            'can_view_all_submissions': is_admin or is_creator,
            'can_export_scores': is_admin or is_creator,
        }


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
    student_name = serializers.CharField(source='user.username', read_only=True)
    student_id = serializers.CharField(source='user.id', read_only=True)
    answered_by = serializers.CharField(source='replied_by.username', read_only=True)
    answer = serializers.CharField(source='reply', required=False)
    contest_id = serializers.CharField(source='contest.id', read_only=True)
    
    class Meta:
        model = ContestQuestion
        fields = [
            'id',
            'contest_id',
            'title',
            'content',
            'answer',
            'student_name',
            'student_id',
            'answered_by',
            'replied_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['answer', 'answered_by', 'replied_at', 'student_name', 'student_id', 'contest_id']


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
            'is_ended',
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
