"""
Serializers for problems app.
"""
from rest_framework import serializers
from .models import (
    CodingProblem,
    Problem,  # backward-compat alias for CodingProblem
    TestCase,
    LanguageConfig,
    Tag,
)
from .services import ProblemService


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
    """Serializer for test run requests — executes against all problem test cases."""

    language = serializers.ChoiceField(
        choices=['cpp', 'c', 'python', 'java'],
        required=True,
        help_text='Programming language'
    )
    code = serializers.CharField(
        required=True,
        help_text='Source code to execute'
    )
    contest_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text='Optional contest context for participant access enforcement',
    )


class ProblemListSerializer(serializers.ModelSerializer):
    """Serializer for problem list (minimal info)."""
    title = serializers.SerializerMethodField()
    difficulty = serializers.SerializerMethodField()
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
        """Get title from QuestionAsset (source of truth)."""
        if obj.question_asset_id:
            try:
                return obj.question_asset.title or f"Problem {obj.id}"
            except Exception:
                pass
        return getattr(obj, 'title', None) or f"Problem {obj.id}"

    def get_difficulty(self, obj):
        """Get difficulty from QuestionAsset (source of truth)."""
        if obj.question_asset_id:
            try:
                return (obj.question_asset.payload or {}).get("difficulty", "medium")
            except Exception:
                pass
        return getattr(obj, 'difficulty', 'medium')

class ProblemDetailSerializer(serializers.ModelSerializer):
    """Serializer for problem detail (full info)."""
    title = serializers.SerializerMethodField()
    difficulty = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    input_description = serializers.SerializerMethodField()
    output_description = serializers.SerializerMethodField()
    hint = serializers.SerializerMethodField()
    samples = serializers.SerializerMethodField()
    test_cases = TestCaseSerializer(many=True, read_only=True)
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    question_version_id = serializers.UUIDField(source='question_version.id', read_only=True)

    class Meta:
        model = Problem
        fields = [
            'id',
            'title',
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
            'description',
            'input_description',
            'output_description',
            'hint',
            'samples',
            'test_cases',
            'language_configs',
            'tags',
            'forbidden_keywords',
            'required_keywords',
        ]

    def get_title(self, obj):
        """Get title from QuestionAsset (source of truth)."""
        if obj.question_asset_id:
            try:
                return obj.question_asset.title or f"Problem {obj.id}"
            except Exception:
                pass
        return getattr(obj, 'title', None) or f"Problem {obj.id}"

    def get_difficulty(self, obj):
        """Get difficulty from QuestionAsset (source of truth)."""
        if obj.question_asset_id:
            try:
                return (obj.question_asset.payload or {}).get("difficulty", "medium")
            except Exception:
                pass
        return getattr(obj, 'difficulty', 'medium')

    def _get_content_field(self, obj, field_name):
        if not obj.question_asset_id:
            return ''
        try:
            from apps.question_bank.question_assets import extract_content_from_payload
            payload = obj.question_asset.payload or {}
            content = extract_content_from_payload(payload)
            return content.get(field_name, '')
        except Exception:
            pass
        return ''

    def get_description(self, obj):
        return self._get_content_field(obj, 'description')

    def get_input_description(self, obj):
        return self._get_content_field(obj, 'input_description')

    def get_output_description(self, obj):
        return self._get_content_field(obj, 'output_description')

    def get_hint(self, obj):
        return self._get_content_field(obj, 'hint')

    def get_samples(self, obj):
        """Get sample test cases."""
        samples = obj.test_cases.filter(is_sample=True).order_by('order')
        return TestCaseSerializer(samples, many=True).data


class OrphanProblemSerializer(serializers.ModelSerializer):
    question_asset_id = serializers.UUIDField(source='question_asset.id', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    contests = serializers.SerializerMethodField()
    draft_state = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    difficulty = serializers.SerializerMethodField()

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

    def get_title(self, obj):
        if obj.question_asset_id:
            try:
                return obj.question_asset.title or f"Problem {obj.id}"
            except Exception:
                pass
        return getattr(obj, 'title', None) or f"Problem {obj.id}"

    def get_difficulty(self, obj):
        if obj.question_asset_id:
            try:
                return (obj.question_asset.payload or {}).get("difficulty", "medium")
            except Exception:
                pass
        return getattr(obj, 'difficulty', 'medium')

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

        return list(seen.values())


class ProblemAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage problems."""
    title = serializers.CharField(required=False, default='')
    difficulty = serializers.CharField(required=False, default='medium')
    description = serializers.CharField(allow_blank=True, required=False, default='')
    input_description = serializers.CharField(allow_blank=True, required=False, default='')
    output_description = serializers.CharField(allow_blank=True, required=False, default='')
    hint = serializers.CharField(allow_blank=True, required=False, default='')
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
            'description',
            'input_description',
            'output_description',
            'hint',
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
        """
        if not test_cases_data:
            return

        weights = []
        for idx, tc in enumerate(test_cases_data):
            raw_weight = tc.get('weight_percent', None)

            if raw_weight is None:
                raise serializers.ValidationError(
                    {
                        'test_cases': [
                            f'test_cases[{idx}].weight_percent is required'
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
            # Persist score as the runtime weight source for judge-side logic.
            tc['score'] = weight
            weights.append(weight)

        if sum(weights) != 100:
            raise serializers.ValidationError(
                {'test_cases': ['test_cases weight_percent total must equal 100']}
            )

    def create(self, validated_data):
        content_fields = {
            'description': validated_data.pop('description', ''),
            'input_description': validated_data.pop('input_description', ''),
            'output_description': validated_data.pop('output_description', ''),
            'hint': validated_data.pop('hint', ''),
        }
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)

        self._normalize_and_validate_test_case_weights(test_cases_data)

        return ProblemService.create_problem_adapter(
            validated_data=validated_data,
            content_fields=content_fields,
            test_cases_data=test_cases_data,
            language_configs_data=language_configs_data,
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )
    
    def update(self, instance, validated_data):
        content_fields = {
            'description': validated_data.pop('description', ''),
            'input_description': validated_data.pop('input_description', ''),
            'output_description': validated_data.pop('output_description', ''),
            'hint': validated_data.pop('hint', ''),
        }
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)

        self._normalize_and_validate_test_case_weights(test_cases_data)

        return ProblemService.update_problem_adapter(
            instance,
            validated_data=validated_data,
            content_fields=content_fields,
            test_cases_data=test_cases_data,
            language_configs_data=language_configs_data,
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Override content fields from QuestionAsset (source of truth)
        if instance.question_asset_id:
            try:
                from apps.question_bank.question_assets import extract_content_from_payload
                asset = instance.question_asset
                data['title'] = asset.title or data.get('title', '')
                data['difficulty'] = (asset.payload or {}).get("difficulty", data.get('difficulty', 'medium'))
                payload = asset.payload or {}
                content = extract_content_from_payload(payload)
                data['description'] = content['description']
                data['input_description'] = content['input_description']
                data['output_description'] = content['output_description']
                data['hint'] = content['hint']
            except Exception:
                pass
        return data
