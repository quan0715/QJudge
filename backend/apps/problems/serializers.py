"""
Serializers for problems app.
"""
from rest_framework import serializers
from .models import (
    CodingProblem,
    Problem,  # backward-compat alias for CodingProblem
    ProblemTranslation,
    TestCase,
    LanguageConfig,
    Tag,
    ProblemDiscussion,
    ProblemDiscussionComment,
)
from .services import ProblemService


class ProblemTranslationSerializer(serializers.ModelSerializer):
    """Serializer for problem translations."""
    class Meta:
        model = ProblemTranslation
        fields = [
            'language',
            'title',
            'description',
            'input_description',
            'output_description',
            'hint',
        ]


class TestCaseSerializer(serializers.ModelSerializer):
    """Serializer for test cases."""
    # Explicitly define fields to preserve whitespace
    # Django REST Framework's CharField defaults to trim_whitespace=True,
    # which would strip leading/trailing spaces from test case data.
    # This breaks problems that require specific whitespace in output (e.g., ASCII art).
    input_data = serializers.CharField(trim_whitespace=False, allow_blank=True)
    output_data = serializers.CharField(trim_whitespace=False, allow_blank=True)
    
    class Meta:
        model = TestCase
        fields = [
            'id',
            'input_data',
            'output_data',
            'is_sample',
            'score',
            'weight_percent',
            'order',
            'is_hidden',
        ]
        read_only_fields = ['id']


class LanguageConfigListSerializer(serializers.ListSerializer):
    """Drop malformed placeholder rows (e.g. language='') before child validation."""

    def to_internal_value(self, data):
        if not isinstance(data, list):
            return super().to_internal_value(data)

        cleaned = []
        for item in data:
            if not isinstance(item, dict):
                cleaned.append(item)
                continue
            language = str(item.get("language") or "").strip()
            if not language:
                continue
            normalized = dict(item)
            normalized["language"] = language
            cleaned.append(normalized)
        return super().to_internal_value(cleaned)


class LanguageConfigSerializer(serializers.ModelSerializer):
    """Serializer for language configuration."""

    class Meta:
        model = LanguageConfig
        fields = ['id', 'language', 'template_code', 'is_enabled', 'order']
        list_serializer_class = LanguageConfigListSerializer


class TagSerializer(serializers.ModelSerializer):
    """Serializer for tags."""
    slug = serializers.SlugField(required=False, allow_blank=True)

    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug', 'description', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        from django.utils.text import slugify
        slug = validated_data.get('slug')
        if not slug:
            slug = slugify(validated_data['name'])
            if not slug:
                import uuid
                slug = f"tag-{uuid.uuid4().hex[:8]}"
            # Handle conflicts by appending a number
            base_slug = slug
            counter = 1
            while Tag.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            validated_data['slug'] = slug
        return super().create(validated_data)


class TestRunSerializer(serializers.Serializer):
    """Serializer for test run requests."""

    class CustomTestCaseSerializer(serializers.Serializer):
        input = serializers.CharField(
            required=True,
            allow_blank=True,
            help_text='Custom input for the program'
        )

    language = serializers.ChoiceField(
        choices=['cpp', 'python', 'java', 'c'],
        required=True,
        help_text='Programming language'
    )
    code = serializers.CharField(
        required=True,
        help_text='Source code to execute'
    )
    use_samples = serializers.BooleanField(
        required=False,
        default=True,
        help_text='Whether to include sample test cases'
    )
    custom_test_cases = CustomTestCaseSerializer(
        many=True,
        required=False,
        help_text='Custom test cases (input only)'
    )


class SimpleUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.CharField(required=False, allow_blank=True)


class ProblemDiscussionSerializer(serializers.ModelSerializer):
    user = SimpleUserSerializer(read_only=True)
    comments_count = serializers.SerializerMethodField()
    comments = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = ProblemDiscussion
        fields = [
            "id",
            "problem",
            "title",
            "content",
            "is_deleted",
            "created_at",
            "updated_at",
            "user",
            "comments_count",
            "comments",
            "like_count",
            "is_liked",
        ]
        read_only_fields = [
            "id",
            "problem",
            "is_deleted",
            "created_at",
            "updated_at",
            "user",
            "comments_count",
            "comments",
            "like_count",
            "is_liked",
        ]

    def get_comments_count(self, obj):
        return obj.comments.count()

    def get_comments(self, obj):
        """Return all comments for this discussion with nested structure."""
        comments = obj.comments.select_related("user").order_by("created_at")
        return ProblemDiscussionCommentSerializer(
            comments, many=True, context=self.context
        ).data

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_is_liked(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class ProblemDiscussionCommentSerializer(serializers.ModelSerializer):
    user = SimpleUserSerializer(read_only=True)
    like_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = ProblemDiscussionComment
        fields = [
            "id",
            "discussion",
            "parent",
            "content",
            "is_deleted",
            "created_at",
            "updated_at",
            "user",
            "like_count",
            "is_liked",
        ]
        read_only_fields = [
            "id",
            "discussion",
            "is_deleted",
            "created_at",
            "updated_at",
            "user",
            "like_count",
            "is_liked",
        ]

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_is_liked(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class ProblemListSerializer(serializers.ModelSerializer):
    """Serializer for problem list (minimal info)."""
    title = serializers.SerializerMethodField()
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    
    class Meta:
        model = Problem
        fields = [
            'id',
            'title',
            'slug',
            'difficulty',
            'submission_count',
            'accepted_count',
            'wa_count',
            'tle_count',
            'mle_count',
            're_count',
            'ce_count',
            'acceptance_rate',
            'created_at',
            'created_by',
            'question_asset_id',
            'question_version_id',
            'language_configs',
            'is_solved',
            'tags',
        ]
    
    is_solved = serializers.BooleanField(read_only=True, default=False)
    
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    
    created_by = serializers.ReadOnlyField(source='created_by.username')
    
    def get_title(self, obj):
        """Get title in requested language, preferring QuestionAsset as source of truth."""
        lang = self.context.get('language', 'zh-TW')

        # Try Asset payload translations first
        if obj.question_asset_id:
            try:
                translations = (obj.question_asset.payload or {}).get("translations", [])
                if translations:
                    match_langs = ['zh-TW', 'zh-hant'] if lang == 'zh-TW' else [lang]
                    for t in translations:
                        if t.get("language") in match_langs:
                            return t.get("title") or obj.effective_title
                    return translations[0].get("title") or obj.effective_title
            except Exception:
                pass

        # Fallback to ProblemTranslation rows
        if lang == 'zh-TW':
            translation = obj.translations.filter(language__in=['zh-TW', 'zh-hant']).first()
        else:
            translation = obj.translations.filter(language=lang).first()
        if translation:
            return translation.title
        translation = obj.translations.first()
        return translation.title if translation else f"Problem {obj.id}"

class ProblemDetailSerializer(serializers.ModelSerializer):
    """Serializer for problem detail (full info)."""
    translation = serializers.SerializerMethodField()
    samples = serializers.SerializerMethodField()
    translations = ProblemTranslationSerializer(many=True, read_only=True)
    test_cases = TestCaseSerializer(many=True, read_only=True)
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    
    class Meta:
        model = Problem
        fields = [
            'id',
            'title',  # Original title (fallback)
            'slug',
            'difficulty',
            'time_limit',
            'memory_limit',
            'submission_count',
            'accepted_count',
            'wa_count',
            'tle_count',
            'mle_count',
            're_count',
            'ce_count',
            'acceptance_rate',
            'question_asset_id',
            'question_version_id',
            'translation',
            'samples',
            'translations',
            'test_cases',
            'language_configs',
            'tags',
            'forbidden_keywords',
            'required_keywords',
        ]
    
    def get_translation(self, obj):
        """Get translation for requested language."""
        lang = self.context.get('language', 'zh-TW')
        # Support both zh-TW and zh-hant for backward compatibility
        if lang == 'zh-TW':
            translation = obj.translations.filter(language__in=['zh-TW', 'zh-hant']).first()
        else:
            translation = obj.translations.filter(language=lang).first()
        
        if not translation:
            # Fallback to first available
            translation = obj.translations.first()
            
        if translation:
            return ProblemTranslationSerializer(translation).data
        return None
    
    def get_samples(self, obj):
        """Get sample test cases."""
        samples = obj.test_cases.filter(is_sample=True).order_by('order')
        return TestCaseSerializer(samples, many=True).data


class OrphanProblemSerializer(serializers.ModelSerializer):
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    contests = serializers.SerializerMethodField()
    draft_state = serializers.SerializerMethodField()

    class Meta:
        model = Problem
        fields = [
            'id',
            'title',
            'slug',
            'difficulty',
            'created_by',
            'created_by_username',
            'question_asset_id',
            'submission_count',
            'accepted_count',
            'created_at',
            'updated_at',
            'draft_state',
            'contests',
        ]

    def get_draft_state(self, obj):
        return "draft" if obj.question_asset_id else "orphan"

    def get_contests(self, obj):
        seen = {}

        for binding in obj.contest_bindings.select_related("contest").all():
            contest = binding.contest
            seen[str(contest.id)] = {
                "id": str(contest.id),
                "name": contest.name,
                "status": contest.status,
            }

        for contest_problem in obj.contestproblem_set.select_related("contest").all():
            contest = contest_problem.contest
            seen.setdefault(
                str(contest.id),
                {
                    "id": str(contest.id),
                    "name": contest.name,
                    "status": contest.status,
                },
            )

        return list(seen.values())


class ResolveOrphanProblemSerializer(serializers.Serializer):
    owner_id = serializers.IntegerField(required=True)
    question_bank_uuid = serializers.UUIDField(required=False)


class ProblemAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage problems."""
    translations = ProblemTranslationSerializer(many=True, required=False)
    test_cases = TestCaseSerializer(many=True, required=False)
    language_configs = LanguageConfigSerializer(many=True, required=False)
    tags = TagSerializer(many=True, read_only=True)  # Read: return full tag objects
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)
    
    # New Tag UX fields (write-only)
    existing_tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True
    )
    new_tag_names = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )
    
    class Meta:
        model = Problem
        fields = [
            'id',
            'title',
            'slug',
            'difficulty',
            'time_limit',
            'memory_limit',
            'order',
            'created_by',
            'created_at',
            'updated_at',
            'submission_count',
            'accepted_count',
            'wa_count',
            'tle_count',
            'mle_count',
            're_count',
            'ce_count',
            'acceptance_rate',
            'question_asset_id',
            'question_version_id',
            'translations',
            'test_cases',
            'language_configs',
            'tags',
            'existing_tag_ids',
            'new_tag_names',
            'forbidden_keywords',
            'required_keywords',
        ]
        read_only_fields = [
            'created_by',
            'created_at',
            'updated_at',
            'acceptance_rate',
            'question_asset_id',
            'question_version_id',
        ]
    
    def _normalize_and_validate_test_case_weights(self, test_cases_data):
        """
        Normalize testcase weights to percentage semantics.
        Backward-compatible: if weight_percent missing, fallback to score.
        """
        if not test_cases_data:
            return

        weights = []
        for idx, tc in enumerate(test_cases_data):
            raw_weight = tc.get('weight_percent', None)
            if raw_weight is None:
                raw_weight = tc.get('score', None)

            if raw_weight is None:
                raise serializers.ValidationError(
                    {
                        'test_cases': [
                            f'test_cases[{idx}].weight_percent is required (or provide legacy score)'
                        ]
                    }
                )

            try:
                weight = int(raw_weight)
            except (TypeError, ValueError):
                raise serializers.ValidationError(
                    {'test_cases': [f'test_cases[{idx}].weight_percent must be an integer']}
                )

            if weight < 0 or weight > 100:
                raise serializers.ValidationError(
                    {'test_cases': [f'test_cases[{idx}].weight_percent must be between 0 and 100']}
                )

            tc['weight_percent'] = weight
            # Keep legacy score in sync for transition compatibility.
            tc['score'] = weight
            weights.append(weight)

        if sum(weights) != 100:
            raise serializers.ValidationError(
                {'test_cases': ['test_cases weight_percent total must equal 100']}
            )

    def create(self, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)

        self._normalize_and_validate_test_case_weights(test_cases_data)

        return ProblemService.create_problem_adapter(
            validated_data=validated_data,
            translations_data=translations_data,
            test_cases_data=test_cases_data,
            language_configs_data=language_configs_data,
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )
    
    def update(self, instance, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)

        self._normalize_and_validate_test_case_weights(test_cases_data)

        return ProblemService.update_problem_adapter(
            instance,
            validated_data=validated_data,
            translations_data=translations_data,
            test_cases_data=test_cases_data,
            language_configs_data=language_configs_data,
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )
