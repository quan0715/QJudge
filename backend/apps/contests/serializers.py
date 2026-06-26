"""
Serializers for contests app.
"""
from drf_spectacular.utils import extend_schema_field, inline_serializer
from rest_framework import serializers
from django.utils import timezone
from .models import (
    Contest,
    ExamQuestion,
    ExamQuestionAnswerFormat,
    ExamQuestionGroup,
    ExamQuestionType,
    ContestParticipant,
    ContestAnnouncement,
    Clarification,
    ExamEvent,
    ExamEvidenceFrame,
    ContestActivity,
    ExamStatus,
    AssignmentState,
    ExamAnswer,
)
from django.db.models import Sum
from .permissions import can_manage_contest, get_contest_permissions, get_contest_scope_role
from .services.attendance import build_attendance_status
from .services.open_answer_document import validate_open_answer_document
from apps.users.serializers import UserSerializer

LEGACY_CONTEST_ACCESS_FIELDS = {"requires_password", "password"}
MAX_SUBJECTIVE_ANSWER_TEXT_BYTES = 32 * 1024


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
    question_edit_locked = serializers.BooleanField(read_only=True)
    question_edit_locked_at = serializers.DateTimeField(read_only=True)
    question_edit_lock_trigger = serializers.CharField(read_only=True)
    attendance_status = serializers.SerializerMethodField()
    delivery_mode = serializers.CharField(read_only=True)
    
    class Meta:
        model = Contest
        fields = [
            'id',
            'name',
            'start_time',
            'end_time',
            'status',
            'visibility',
            'attendance_check_enabled',
            'attendance_photo_policy',
            'delivery_mode',
            'counts_toward_grade',
            'owner_username',
            'participant_count',
            'is_registered',
            'attendance_status',
            'question_edit_locked',
            'question_edit_locked_at',
            'question_edit_lock_trigger',
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

    def get_attendance_status(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return build_attendance_status(obj, None)
        participant = obj.registrations.filter(user=user).first()
        return build_attendance_status(obj, participant)


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
    submit_reason = serializers.SerializerMethodField()
    exam_status = serializers.SerializerMethodField()
    assignment_state = serializers.SerializerMethodField()
    accepted_at = serializers.SerializerMethodField()
    submitted_at = serializers.SerializerMethodField()
    problems = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    admins = serializers.SerializerMethodField()
    is_classroom_bound = serializers.SerializerMethodField()
    bound_classroom_id = serializers.SerializerMethodField()
    exam_questions_count = serializers.SerializerMethodField()
    question_edit_locked = serializers.BooleanField(read_only=True)
    question_edit_locked_at = serializers.DateTimeField(read_only=True)
    question_edit_lock_trigger = serializers.CharField(read_only=True)

    # SSoT computed flags — frontend should consume these instead of deriving from examStatus
    is_exam_monitored = serializers.SerializerMethodField()
    requires_fullscreen = serializers.SerializerMethodField()
    can_submit_exam = serializers.SerializerMethodField()
    attendance_status = serializers.SerializerMethodField()

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
            'attendance_check_enabled',
            'attendance_photo_policy',
            'contest_type',
            'delivery_mode',
            'counts_toward_grade',
            'cheat_detection_enabled',
            'anticheat_device_policy',
            'warning_timeout_seconds',
            'screen_share_recovery_grace_ms',
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
            'left_at',
            'locked_at',
            'lock_reason',
            'submit_reason',
            'exam_status',
            'assignment_state',
            'accepted_at',
            'submitted_at',
            'problems',
            'allow_multiple_joins',
            'max_cheat_warnings',
            'participant_count',
            'admins',
            'is_classroom_bound',
            'bound_classroom_id',
            'results_published',
            'exam_questions_count',
            'question_edit_locked',
            'question_edit_locked_at',
            'question_edit_lock_trigger',
            'attendance_status',
            'is_exam_monitored',
            'requires_fullscreen',
            'can_submit_exam',
        ]

    def _get_request_user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        return user

    def _get_current_registration(self, obj):
        user = self._get_request_user()
        if user is None:
            return None

        cache = self.context.setdefault('_contest_registration_cache', {})
        cache_key = (obj.pk, user.pk)
        if cache_key not in cache:
            cache[cache_key] = obj.registrations.filter(user=user).first()
        return cache[cache_key]

    def get_lock_reason(self, obj):
        """Get lock reason for current user."""
        registration = self._get_current_registration(obj)
        return registration.lock_reason if registration else None

    def get_locked_at(self, obj):
        """Get locked_at timestamp for current user."""
        registration = self._get_current_registration(obj)
        return registration.locked_at if registration else None

    def get_exam_status(self, obj):
        """Get exam status for current user."""
        registration = self._get_current_registration(obj)
        return registration.exam_status if registration else None

    def get_submit_reason(self, obj):
        """Get submit reason for current user."""
        registration = self._get_current_registration(obj)
        return registration.submit_reason if registration else None

    def get_assignment_state(self, obj):
        registration = self._get_current_registration(obj)
        if not registration:
            return None
        if obj.delivery_mode != 'practice':
            return AssignmentState.ACCEPTED
        return registration.assignment_state

    def get_accepted_at(self, obj):
        registration = self._get_current_registration(obj)
        return registration.accepted_at if registration else None

    def get_submitted_at(self, obj):
        registration = self._get_current_registration(obj)
        return registration.submitted_at if registration else None
    
    def get_current_user_role(self, obj):
        """Get user's role in this contest."""
        user = self._get_request_user()
        if user is None:
            return 'anonymous'
        return get_contest_scope_role(user, obj)
    
    def get_permissions(self, obj):
        """Get all permissions for current user."""
        user = self._get_request_user()
        if user is None:
            return get_contest_permissions(None, obj)
        return get_contest_permissions(user, obj)
    
    def get_has_joined(self, obj):
        """Check if current user has registered."""
        return self._get_current_registration(obj) is not None
    
    def get_has_started(self, obj):
        """Check if current user has started the exam."""
        registration = self._get_current_registration(obj)
        return bool(registration and registration.started_at)

    def get_started_at(self, obj):
        """Get start time for current user."""
        registration = self._get_current_registration(obj)
        return registration.started_at if registration else None

    def get_left_at(self, obj):
        """Get left time for current user."""
        registration = self._get_current_registration(obj)
        return registration.left_at if registration else None

    def get_participant_count(self, obj):
        """Get total number of participants."""
        return obj.registrations.count()

    def get_admins(self, obj):
        """Get list of admin users for this contest."""
        admins = obj.admins.all()
        return [{'id': u.id, 'username': u.username} for u in admins]

    def _get_primary_classroom_binding(self, obj):
        return (
            obj.classroom_bindings.select_related('classroom')
            .order_by('bound_at')
            .first()
        )

    def get_is_classroom_bound(self, obj):
        return self._get_primary_classroom_binding(obj) is not None

    def get_bound_classroom_id(self, obj):
        binding = self._get_primary_classroom_binding(obj)
        if binding is None:
            return None
        return str(binding.classroom.uuid)

    def get_exam_questions_count(self, obj):
        """紙筆題數量"""
        return obj.exam_questions.count()

    # -- SSoT computed flags --
    MONITORED_STATUSES = {"in_progress", "paused", "locked"}
    SUBMITTABLE_STATUSES = {"in_progress", "paused", "locked"}
    FULLSCREEN_STATUSES = {"in_progress", "locked"}

    def get_is_exam_monitored(self, obj):
        if not obj.cheat_detection_enabled:
            return False
        reg = self._get_current_registration(obj)
        return bool(reg and reg.exam_status in self.MONITORED_STATUSES)

    def get_requires_fullscreen(self, obj):
        if not obj.cheat_detection_enabled:
            return False
        reg = self._get_current_registration(obj)
        return bool(reg and reg.exam_status in self.FULLSCREEN_STATUSES)

    def get_can_submit_exam(self, obj):
        reg = self._get_current_registration(obj)
        return bool(reg and reg.exam_status in self.SUBMITTABLE_STATUSES)

    def get_attendance_status(self, obj):
        return build_attendance_status(obj, self._get_current_registration(obj))

    def get_problems(self, obj):
        """
        Get contest problems with labels.
        Problems are ONLY visible to:
        1. Owner/Admin/Contest-Admin: always visible
        2. Registered participants: only during published contest period
        
        Non-registered users NEVER see problem structure.
        """
        user = self._get_request_user()

        is_privileged = bool(user and can_manage_contest(user, obj))

        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        def _get_coding_bindings():
            return (
                obj.question_bindings
                .filter(binding_type=QuestionAsset.AssetType.CODING)
                .select_related('coding_problem', 'question_asset', 'question_version')
                .order_by('order')
            )

        # Privileged users can always see problems
        if is_privileged:
            return ContestProblemSerializer(_get_coding_bindings(), many=True, context=self.context).data

        # Check if user is a registered participant
        is_participant = self._get_current_registration(obj) is not None

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
            return ContestProblemSerializer(_get_coding_bindings(), many=True, context=self.context).data

        # Hide problems if contest hasn't started yet
        if obj.start_time and now < obj.start_time:
            return []

        return ContestProblemSerializer(_get_coding_bindings(), many=True, context=self.context).data


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
            'attendance_check_enabled',
            'attendance_photo_policy',
            'contest_type',
            'delivery_mode',
            'counts_toward_grade',
            'cheat_detection_enabled',
            'anticheat_device_policy',
            'warning_timeout_seconds',
            'screen_share_recovery_grace_ms',
            'scoreboard_visible_during_contest',
            'allow_multiple_joins',
            'max_cheat_warnings',
            'status',
            'results_published',
        ]
        read_only_fields = ['id']

    def to_internal_value(self, data):
        legacy_errors = {
            field: "Contest password access was removed. Use attendance_check_enabled."
            for field in LEGACY_CONTEST_ACCESS_FIELDS
            if field in data
        }
        if legacy_errors:
            raise serializers.ValidationError(legacy_errors)
        return super().to_internal_value(data)
    
    def validate(self, data):
        """Validate contest data."""
        status_in_data = 'status' in data
        target_status = data.get('status') if status_in_data else (self.instance.status if self.instance else None)

        has_start_time = 'start_time' in data
        has_end_time = 'end_time' in data
        start_time = data.get('start_time') if has_start_time else (self.instance.start_time if self.instance else None)
        end_time = data.get('end_time') if has_end_time else (self.instance.end_time if self.instance else None)

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({
                'end_time': 'End time must be after start time.'
            })

        if target_status == 'published':
            if not start_time:
                raise serializers.ValidationError({
                    'start_time': 'Start time is required before publishing.'
                })
            if not end_time:
                raise serializers.ValidationError({
                    'end_time': 'End time is required before publishing.'
                })
            if end_time <= start_time:
                raise serializers.ValidationError({
                    'end_time': 'End time must be after start time.'
                })

        if target_status == 'draft':
            data['results_published'] = False
        
        return data


# ============================================================================
# Contest Problem Serializers
# ============================================================================

class ContestProblemSerializer(serializers.ModelSerializer):
    """
    Serializer for coding problems within a contest.
    Reads from ContestQuestionBinding. The ``id`` field is the binding UUID.
    """
    from apps.question_bank.models import ContestQuestionBinding

    problem_id = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    difficulty = serializers.SerializerMethodField()
    label = serializers.CharField(read_only=True)
    score = serializers.SerializerMethodField()
    max_score = serializers.SerializerMethodField()
    source_bank = serializers.SerializerMethodField()
    source_question_id = serializers.UUIDField(read_only=True)
    source_mode = serializers.CharField(read_only=True)
    user_status = serializers.SerializerMethodField()
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    binding_id = serializers.SerializerMethodField()
    in_question_bank = serializers.SerializerMethodField()

    class Meta:
        from apps.question_bank.models import ContestQuestionBinding
        model = ContestQuestionBinding
        fields = [
            'id',
            'problem_id',
            'title',
            'label',
            'order',
            'score',
            'max_score',
            'source_bank',
            'source_question_id',
            'source_mode',
            'question_asset_id',
            'question_version_id',
            'binding_id',
            'difficulty',
            'user_status',
            'in_question_bank',
        ]

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_problem_id(self, obj):
        if obj.coding_problem_id:
            return str(obj.coding_problem_id)
        return str(obj.question_asset_id) if obj.question_asset_id else None

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj):
        if obj.question_asset_id:
            try:
                return obj.question_asset.title
            except Exception:
                pass
        if obj.coding_problem_id:
            try:
                return obj.coding_problem.question_asset.title if obj.coding_problem.question_asset_id else None
            except Exception:
                pass
        return None

    @extend_schema_field(serializers.CharField())
    def get_difficulty(self, obj):
        if obj.question_asset_id:
            try:
                return (obj.question_asset.payload or {}).get("difficulty", "medium")
            except Exception:
                pass
        if obj.coding_problem_id:
            try:
                return (obj.coding_problem.question_asset.payload or {}).get("difficulty", "medium") if obj.coding_problem.question_asset_id else "medium"
            except Exception:
                pass
        return "medium"

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_user_status(self, obj):
        """Get submission status for current user."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        if not obj.coding_problem_id:
            return None

        from apps.submissions.models import Submission

        has_ac = Submission.objects.filter(
            contest=obj.contest,
            problem_id=obj.coding_problem_id,
            user=request.user,
            status='AC',
            source_type='contest'
        ).exists()

        if has_ac:
            return 'AC'

        has_attempt = Submission.objects.filter(
            contest=obj.contest,
            problem_id=obj.coding_problem_id,
            user=request.user,
            source_type='contest'
        ).exists()

        if has_attempt:
            return 'attempted'

        return None

    @extend_schema_field(serializers.IntegerField())
    def get_score(self, obj):
        return obj.score

    @extend_schema_field(serializers.IntegerField())
    def get_max_score(self, obj):
        return obj.score

    @extend_schema_field(inline_serializer(
        name="SourceBankInfo",
        fields={
            "id": serializers.CharField(),
            "name": serializers.CharField(),
        },
        allow_null=True,
    ))
    def get_source_bank(self, obj):
        if not obj.source_bank_id:
            return None
        return {
            'id': str(obj.source_bank_id),
            'name': obj.source_bank_name or '',
        }

    @extend_schema_field(serializers.CharField())
    def get_binding_id(self, obj):
        return str(obj.id)

    @extend_schema_field(serializers.BooleanField())
    def get_in_question_bank(self, obj):
        # Prefer the annotated value (O(1)) over a per-row query.
        if hasattr(obj, '_in_question_bank'):
            return obj._in_question_bank
        if not obj.question_asset_id:
            return False
        from apps.question_bank.models import QuestionBankMembership
        return QuestionBankMembership.objects.filter(
            question_asset_id=obj.question_asset_id,
        ).exists()



# ============================================================================
# Exam Question Serializers
# ============================================================================

class ExamQuestionStudentSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for students — hides correct_answer.
    """

    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    binding_id = serializers.SerializerMethodField()
    group_id = serializers.UUIDField(source='group.id', read_only=True, allow_null=True)

    class Meta:
        model = ExamQuestion
        fields = [
            'id',
            'contest',
            'question_type',
            'prompt',
            'options',
            'score',
            'score_policy',
            'score_policy_config',
            'order',
            'group_id',
            'order_in_group',
            'answer_format',
            'question_asset_id',
            'question_version_id',
            'binding_id',
        ]
        read_only_fields = fields

    def get_binding_id(self, obj):
        binding = getattr(obj, 'question_binding', None)
        return str(binding.id) if binding else None


class ExamQuestionSerializer(serializers.ModelSerializer):
    """
    Serializer for paper-style exam questions (admin/teacher).
    """
    source_bank = serializers.SerializerMethodField()
    source_question_id = serializers.UUIDField(read_only=True)
    source_mode = serializers.CharField(read_only=True)
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    binding_id = serializers.SerializerMethodField()
    group_id = serializers.UUIDField(required=False, allow_null=True)
    effective_max_score = serializers.SerializerMethodField()

    class Meta:
        model = ExamQuestion
        fields = [
            'id',
            'contest',
            'question_type',
            'prompt',
            'options',
            'correct_answer',
            'reference_answer_document',
            'explanation',
            'explanation_document',
            'score',
            'score_policy',
            'score_policy_config',
            'effective_max_score',
            'order',
            'group_id',
            'order_in_group',
            'answer_format',
            'source_bank',
            'source_question_id',
            'source_mode',
            'question_asset_id',
            'question_version_id',
            'binding_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['contest', 'created_at', 'updated_at']

    def get_effective_max_score(self, obj):
        """Post-redistribution effective max score for this question."""
        effective_map = self.context.get('effective_max_scores')
        if effective_map and obj.id in effective_map:
            return round(effective_map[obj.id], 2)
        return float(obj.score)

    def get_source_bank(self, obj):
        if not obj.source_bank_id:
            return None
        return {
            'id': str(obj.source_bank_id),
            'name': obj.source_bank_name or '',
        }

    def get_binding_id(self, obj):
        binding = getattr(obj, 'question_binding', None)
        return str(binding.id) if binding else None

    def validate_options(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('options must be an array')
        if not all(isinstance(item, str) and item.strip() for item in value):
            raise serializers.ValidationError('options must contain non-empty strings')
        return [item.strip() for item in value]

    def validate_score(self, value):
        if value <= 0:
            raise serializers.ValidationError('score must be greater than 0')
        return value

    def validate_answer_format(self, value):
        if value not in ExamQuestionAnswerFormat.values:
            raise serializers.ValidationError('invalid answer_format')
        return value

    def validate_reference_answer_document(self, value):
        if value is None:
            return None
        return validate_open_answer_document(value)

    def validate_explanation_document(self, value):
        if value is None:
            return None
        return validate_open_answer_document(value)

    def validate(self, attrs):
        question_type = attrs.get('question_type') or getattr(self.instance, 'question_type', None)
        options = attrs.get('options')
        correct_answer = attrs.get('correct_answer')
        group_id = attrs.get('group_id') if 'group_id' in attrs else getattr(self.instance, 'group_id', None)
        contest = self.context.get('contest') or getattr(self.instance, 'contest', None)
        answer_format = attrs.get('answer_format') or getattr(
            self.instance,
            'answer_format',
            ExamQuestionAnswerFormat.PLAIN_TEXT,
        )

        if group_id is not None and contest is not None:
            if not ExamQuestionGroup.objects.filter(id=group_id, contest=contest).exists():
                raise serializers.ValidationError({'group_id': 'group must belong to this contest'})

        if question_type in {ExamQuestionType.SINGLE_CHOICE, ExamQuestionType.MULTIPLE_CHOICE}:
            merged_options = options if options is not None else getattr(self.instance, 'options', [])
            if len(merged_options) < 2:
                raise serializers.ValidationError({'options': 'choice questions require at least 2 options'})

        if question_type == ExamQuestionType.TRUE_FALSE:
            merged_options = options if options is not None else getattr(self.instance, 'options', [])
            if merged_options and len(merged_options) != 2:
                raise serializers.ValidationError({'options': 'true_false should have exactly 2 options when provided'})

        if question_type in {ExamQuestionType.ESSAY, ExamQuestionType.SHORT_ANSWER} and options is not None and len(options) > 0:
            raise serializers.ValidationError({'options': f'{question_type} question should not define options'})

        if (
            answer_format == ExamQuestionAnswerFormat.OPEN_DOCUMENT
            and question_type not in {ExamQuestionType.ESSAY, ExamQuestionType.SHORT_ANSWER}
        ):
            raise serializers.ValidationError({
                'answer_format': 'open_document is only supported for subjective questions'
            })

        if question_type in {ExamQuestionType.TRUE_FALSE, ExamQuestionType.SINGLE_CHOICE, ExamQuestionType.MULTIPLE_CHOICE}:
            merged_answer = correct_answer if 'correct_answer' in attrs else getattr(self.instance, 'correct_answer', None)
            if merged_answer in (None, ''):
                raise serializers.ValidationError({'correct_answer': 'objective question requires correct_answer'})

            if question_type == ExamQuestionType.SINGLE_CHOICE and isinstance(merged_answer, list):
                raise serializers.ValidationError({'correct_answer': 'single_choice expects one answer index/value'})

            if question_type == ExamQuestionType.MULTIPLE_CHOICE:
                if not isinstance(merged_answer, list) or len(merged_answer) == 0:
                    raise serializers.ValidationError({'correct_answer': 'multiple_choice expects a non-empty answer array'})

            if question_type == ExamQuestionType.TRUE_FALSE:
                if isinstance(merged_answer, bool):
                    return attrs
                if isinstance(merged_answer, int) and merged_answer in {0, 1}:
                    return attrs
                if isinstance(merged_answer, str) and merged_answer.lower() in {'true', 'false'}:
                    return attrs
                raise serializers.ValidationError({'correct_answer': 'true_false expects true/false'})

        return attrs


class ExamQuestionGroupSerializer(serializers.ModelSerializer):
    """Serializer for contest-local question groups."""

    total_score = serializers.SerializerMethodField()

    class Meta:
        model = ExamQuestionGroup
        fields = [
            'id',
            'title',
            'shared_stem_markdown',
            'order',
            'total_score',
        ]
        read_only_fields = ['id', 'total_score']

    def get_total_score(self, obj):
        if hasattr(obj, 'total_score_annotated') and obj.total_score_annotated is not None:
            return obj.total_score_annotated
        from .models import ExamQuestionScorePolicy
        return obj.questions.exclude(
            score_policy=ExamQuestionScorePolicy.EXCLUDED
        ).aggregate(total=Sum('score'))['total'] or 0


# ============================================================================
# Clarification Serializers (New)
# ============================================================================

class ClarificationSerializer(serializers.ModelSerializer):
    """
    Serializer for clarifications/Q&A.
    """
    author_username = serializers.CharField(source='author.username', read_only=True)
    author_display_name = serializers.SerializerMethodField()
    problem_title = serializers.SerializerMethodField()

    def get_problem_title(self, obj):
        if obj.problem_id and obj.problem.question_asset_id:
            try:
                return obj.problem.question_asset.title
            except Exception:
                pass
        return None
    
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
        profile = getattr(obj.author, 'profile', None)
        return getattr(profile, 'display_name', '') or obj.author.username


class ClarificationCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a clarification.
    """
    problem_id = serializers.UUIDField(required=False, allow_null=True)
    
    class Meta:
        model = Clarification
        fields = ['problem_id', 'question']

    def create(self, validated_data):
        problem_id = validated_data.pop('problem_id', None)
        problem = None
        if problem_id:
            from apps.problems.models import CodingProblem
            try:
                problem = CodingProblem.objects.get(id=problem_id)
            except CodingProblem.DoesNotExist:
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
    DEFAULT_METADATA_MAX_SIZE = 8192  # bytes
    CLIPBOARD_METADATA_MAX_SIZE = 65536  # bytes

    client_observed_at_ms = serializers.IntegerField(required=False, min_value=0)
    server_time_offset_ms = serializers.IntegerField(required=False)
    evidence_anchor_at_ms = serializers.IntegerField(required=False, min_value=0)
    evidence_mode = serializers.ChoiceField(
        required=False,
        choices=ExamEvidenceFrame.EvidenceMode.choices,
    )
    event_idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=160)

    class Meta:
        model = ExamEvent
        fields = [
            'event_type',
            'metadata',
            'client_observed_at_ms',
            'server_time_offset_ms',
            'evidence_anchor_at_ms',
            'evidence_mode',
            'event_idempotency_key',
        ]

    def validate(self, attrs):
        metadata = attrs.get('metadata')
        if metadata is not None:
            import json
            event_type = attrs.get('event_type')
            max_size = (
                self.CLIPBOARD_METADATA_MAX_SIZE
                if event_type == 'clipboard_action'
                else self.DEFAULT_METADATA_MAX_SIZE
            )
            serialized = json.dumps(metadata, ensure_ascii=False)
            if len(serialized.encode('utf-8')) > max_size:
                raise serializers.ValidationError(
                    {'metadata': f"Metadata exceeds maximum size of {max_size} bytes."}
                )
        return attrs


class AnticheatUrlsQuerySerializer(serializers.Serializer):
    MODULE_CHOICES = ("screen_share", "webcam")
    count = serializers.IntegerField(required=False, min_value=1, max_value=300, default=30)
    upload_session_id = serializers.RegexField(
        required=False,
        allow_blank=True,
        max_length=64,
        regex=r"^[A-Za-z0-9_-]+$",
    )
    start_seq = serializers.IntegerField(required=False, min_value=1, default=1)
    module = serializers.ChoiceField(required=False, choices=MODULE_CHOICES, default="screen_share")


class EvidenceUploadIntentFrameSerializer(serializers.Serializer):
    client_captured_at_ms = serializers.IntegerField(min_value=0)
    seq = serializers.IntegerField(min_value=1)


class EvidenceUploadIntentSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(min_value=1)
    evidence_cluster_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    source_module = serializers.ChoiceField(choices=ExamEvidenceFrame.SourceModule.choices)
    evidence_mode = serializers.ChoiceField(
        choices=ExamEvidenceFrame.EvidenceMode.choices,
        default=ExamEvidenceFrame.EvidenceMode.ANCHOR_WINDOW,
    )
    upload_session_id = serializers.RegexField(
        required=False,
        allow_blank=True,
        max_length=64,
        regex=r"^[A-Za-z0-9_-]+$",
    )
    frames = EvidenceUploadIntentFrameSerializer(many=True, allow_empty=True, max_length=30)
    unavailable_reason = serializers.CharField(required=False, allow_blank=True, max_length=160)


class EvidenceUploadConfirmItemSerializer(serializers.Serializer):
    evidence_frame_id = serializers.IntegerField(min_value=1)
    object_key = serializers.CharField()
    byte_size = serializers.IntegerField(required=False, min_value=0)
    sha256 = serializers.RegexField(
        required=False,
        allow_blank=True,
        max_length=64,
        regex=r"^[A-Fa-f0-9]{64}$|^$",
    )


class EvidenceUploadConfirmSerializer(serializers.Serializer):
    event_id = serializers.IntegerField(required=False, min_value=1)
    upload_session_id = serializers.RegexField(
        required=False,
        allow_blank=True,
        max_length=64,
        regex=r"^[A-Za-z0-9_-]+$",
    )
    frames = EvidenceUploadConfirmItemSerializer(many=True, allow_empty=False, max_length=30)


class ActiveSessionClearSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=True, min_value=1)


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


class ContestParticipantSerializer(serializers.ModelSerializer):
    """
    Serializer for contest participants (for standings/scoreboard).
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.SerializerMethodField()
    account_role = serializers.CharField(source='user.role', read_only=True)
    auth_provider = serializers.CharField(source='user.auth_provider', read_only=True)
    score = serializers.SerializerMethodField()
    total_score = serializers.SerializerMethodField()
    connection_status = serializers.SerializerMethodField()
    last_heartbeat_at = serializers.SerializerMethodField()
    live_monitoring_online = serializers.SerializerMethodField()
    live_monitoring_sources = serializers.SerializerMethodField()
    
    class Meta:
        model = ContestParticipant
        fields = [
            'user_id', 'username', 'user', 'score', 'total_score', 'rank', 
            'joined_at', 'exam_status',
            'lock_reason', 'violation_count', 'submit_reason',
            'display_name', 'account_role', 'auth_provider',
            'connection_status', 'last_heartbeat_at', 'live_monitoring_online', 'live_monitoring_sources',
        ]

    def _get_last_heartbeat(self, obj):
        if hasattr(obj, '_last_heartbeat_cached'):
            return obj._last_heartbeat_cached
        from apps.contests.services.anti_cheat_session import get_last_heartbeat

        obj._last_heartbeat_cached = get_last_heartbeat(obj.contest_id, obj.user_id)
        return obj._last_heartbeat_cached

    def _get_live_publisher(self, obj):
        if hasattr(obj, '_live_publisher_cached'):
            return obj._live_publisher_cached
        if hasattr(obj, '_live_publishers_cached'):
            publishers = obj._live_publishers_cached
            obj._live_publisher_cached = publishers[0] if publishers else None
            return obj._live_publisher_cached
        from apps.contests.services.realtime_sfu_registry import get_publisher

        obj._live_publisher_cached = get_publisher(obj.contest_id, obj.user_id)
        return obj._live_publisher_cached

    def _get_live_publishers(self, obj):
        if hasattr(obj, '_live_publishers_cached'):
            return obj._live_publishers_cached
        from apps.contests.services.realtime_sfu_registry import get_publishers

        obj._live_publishers_cached = get_publishers(obj.contest_id, obj.user_id)
        return obj._live_publishers_cached

    def get_connection_status(self, obj):
        if self._get_live_publisher(obj):
            return 'live'
        if self._get_last_heartbeat(obj):
            return 'online'
        return 'offline'

    def get_last_heartbeat_at(self, obj):
        return self._get_last_heartbeat(obj)

    def get_live_monitoring_online(self, obj):
        return bool(self._get_live_publisher(obj))

    def get_live_monitoring_sources(self, obj):
        sources = []
        for publisher in self._get_live_publishers(obj):
            source = publisher.get('source_module') if isinstance(publisher, dict) else None
            if source in ('screen_share', 'webcam') and source not in sources:
                sources.append(source)
        return sources

    @staticmethod
    def _score_to_float(value):
        return float(value or 0)

    def get_score(self, obj):
        return self._score_to_float(obj.score)
    
    def get_total_score(self, obj):
        """計算參賽者的實際總分。
        優先使用 ViewSet 注入的 total_score_annotated 以避免 N+1。
        """
        if hasattr(obj, 'total_score_annotated'):
            return self._score_to_float(obj.total_score_annotated)

        # Fallback (Slow path)
        if obj.contest.contest_type == 'paper_exam':
            # Paper exam: use persisted score (maintained by ExamScoringService,
            # respects score_policy: excluded/full_marks/redistribute)
            return self._score_to_float(obj.score)

        from apps.submissions.models import Submission
        from django.db.models import Max
        from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

        # Coding contest: best submission score per problem
        bindings = ContestQuestionBinding.objects.filter(
            contest=obj.contest,
            binding_type=QuestionAsset.AssetType.CODING,
        ).select_related('coding_problem')
        total = 0

        for binding in bindings:
            if not binding.coding_problem_id:
                continue
            best_submission = Submission.objects.filter(
                contest=obj.contest,
                problem=binding.coding_problem,
                user=obj.user,
                source_type='contest',
                is_test=False
            ).aggregate(max_score=Max('score'))

            if best_submission['max_score']:
                total += best_submission['max_score']

        return total

    def get_display_name(self, obj):
        profile = getattr(obj.user, 'profile', None)
        return getattr(profile, 'display_name', '') or ""

# ============================================================================
# Exam Answer Serializers
# ============================================================================


class ExamAnswerSerializer(serializers.ModelSerializer):
    """Read serializer for exam answers (student view)."""
    question_id = serializers.UUIDField(source='question.id', read_only=True)

    class Meta:
        model = ExamAnswer
        fields = [
            'id', 'question_id', 'answer',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ExamAnswerDetailSerializer(serializers.ModelSerializer):
    """Read serializer with grading info (for results / TA view).
    優先從 question_snapshot 讀取題目資料，fallback 到 question.*。
    """
    question_id = serializers.UUIDField(source='question.id', read_only=True)
    question_prompt = serializers.SerializerMethodField()
    question_type = serializers.SerializerMethodField()
    question_explanation = serializers.SerializerMethodField()
    max_score = serializers.SerializerMethodField()
    question_options = serializers.SerializerMethodField()
    graded_by_username = serializers.CharField(
        source='graded_by.username', read_only=True, default=None
    )
    participant_user_id = serializers.SerializerMethodField()
    participant_username = serializers.SerializerMethodField()
    participant_display_name = serializers.SerializerMethodField()

    class Meta:
        model = ExamAnswer
        fields = [
            'id', 'question_id', 'question_prompt', 'question_type',
            'question_options', 'question_explanation', 'max_score',
            'answer', 'is_correct', 'score', 'feedback',
            'question_snapshot',
            'graded_by_username', 'graded_at',
            'participant_user_id', 'participant_username', 'participant_display_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_question_prompt(self, obj):
        if obj.question_snapshot:
            return obj.question_snapshot.get('prompt', '')
        return obj.question.prompt

    def get_question_type(self, obj):
        if obj.question_snapshot:
            return obj.question_snapshot.get('question_type', '')
        return obj.question.question_type

    def get_question_explanation(self, obj):
        if obj.question_snapshot:
            return obj.question_snapshot.get('explanation', '')
        return obj.question.explanation

    def get_max_score(self, obj):
        if obj.question_snapshot:
            return obj.question_snapshot.get('score', 0)
        return obj.question.score

    def get_question_options(self, obj):
        if obj.question_snapshot:
            return obj.question_snapshot.get('options', [])
        return obj.question.options

    def get_participant_user_id(self, obj):
        return obj.participant.user_id

    def get_participant_username(self, obj):
        return obj.participant.user.username

    def get_participant_display_name(self, obj):
        profile = getattr(obj.participant.user, 'profile', None)
        return getattr(profile, 'display_name', '') or ""


class ExamAnswerGradingSerializer(serializers.ModelSerializer):
    """Slim serializer for grading screens.

    Drops redundant per-row duplicates (question_prompt/type/options/explanation/
    max_score/question_snapshot and participant_username/display_name). Consumers
    should join question info via GET /exam-questions/ and participant info via
    contest participants list — both are O(题数) / O(学生数) rather than
    O(answers)."""

    participant_user_id = serializers.SerializerMethodField()
    graded_by_username = serializers.CharField(
        source='graded_by.username', read_only=True, default=None
    )

    class Meta:
        model = ExamAnswer
        fields = [
            'id', 'question_id', 'participant_user_id',
            'answer', 'is_correct', 'score', 'feedback',
            'graded_by_username', 'graded_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_participant_user_id(self, obj):
        return obj.participant.user_id


class ExamAnswerSubmitSerializer(serializers.Serializer):
    """Serializer for submitting/updating a single answer."""
    question_id = serializers.UUIDField()
    answer = serializers.JSONField()

    def validate_answer(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('answer must be a JSON object')
        text = value.get('text')
        if isinstance(text, str) and len(text.encode('utf-8')) > MAX_SUBJECTIVE_ANSWER_TEXT_BYTES:
            raise serializers.ValidationError('answer text exceeds 32 KB')
        return value


class ExamAnswerGradeSerializer(serializers.Serializer):
    """Serializer for TA grading a single answer."""
    score = serializers.DecimalField(max_digits=6, decimal_places=2)
    feedback = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_score(self, value):
        if value < 0:
            raise serializers.ValidationError('score must be >= 0')
        return value


class ContestAnnouncementSerializer(serializers.ModelSerializer):
    """
    Serializer for contest announcements.
    """
    created_by = UserSerializer(read_only=True)
    
    class Meta:
        model = ContestAnnouncement
        fields = ['id', 'title', 'content', 'created_by', 'created_at', 'updated_at']
