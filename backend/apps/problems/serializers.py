"""
Serializers for problems app.
"""
from rest_framework import serializers
from .models import Problem, ProblemTranslation, TestCase, LanguageConfig, Tag


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
    class Meta:
        model = TestCase
        fields = [
            'id',
            'input_data',
            'output_data',
            'is_sample',
            'score',
            'order',
            'is_hidden',
        ]
        read_only_fields = ['id']


class LanguageConfigSerializer(serializers.ModelSerializer):
    """Serializer for language configuration."""
    
    class Meta:
        model = LanguageConfig
        fields = ['id', 'language', 'template_code', 'is_enabled', 'order']


class TagSerializer(serializers.ModelSerializer):
    """Serializer for tags."""
    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug', 'description', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']


class TestRunSerializer(serializers.Serializer):
    """Serializer for test run requests."""
    language = serializers.ChoiceField(
        choices=['cpp', 'python', 'java', 'c'],
        required=True,
        help_text='Programming language'
    )
    source_code = serializers.CharField(
        required=True,
        help_text='Source code to execute'
    )
    custom_input = serializers.CharField(
        required=True,
        allow_blank=True,
        help_text='Custom input for the program'
    )


class ProblemListSerializer(serializers.ModelSerializer):
    """Serializer for problem list (minimal info)."""
    title = serializers.SerializerMethodField()
    display_id = serializers.CharField(read_only=True)
    
    class Meta:
        model = Problem
        fields = [
            'id',
            'display_id',
            'title',
            'slug',
            'difficulty',
            'submission_count',
            'accepted_count',
            'acceptance_rate',
            'is_visible',
            'is_practice_visible',
            'created_in_contest',
            'created_at',
            'created_by',
            'created_by',
            'language_configs',
            'is_solved',
            'tags',
        ]
    
    is_solved = serializers.BooleanField(read_only=True, default=False)
    
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    
    created_by = serializers.ReadOnlyField(source='created_by.username')
    
    def get_title(self, obj):
        """Get title in requested language or default."""
        lang = self.context.get('language', 'zh-TW')
        # Support both zh-TW and zh-hant for backward compatibility
        if lang == 'zh-TW':
            translation = obj.translations.filter(language__in=['zh-TW', 'zh-hant']).first()
        else:
            translation = obj.translations.filter(language=lang).first()
        if translation:
            return translation.title
        # Fallback to any translation or empty string
        translation = obj.translations.first()
        return translation.title if translation else f"Problem {obj.id}"


class ContestInfoSerializer(serializers.ModelSerializer):
    """Minimal serializer for contest info in problem detail."""
    class Meta:
        model = Problem._meta.get_field('created_in_contest').remote_field.model
        fields = ['id', 'title', 'start_time', 'end_time']


class ProblemDetailSerializer(serializers.ModelSerializer):
    """Serializer for problem detail (full info)."""
    translation = serializers.SerializerMethodField()
    samples = serializers.SerializerMethodField()
    translations = ProblemTranslationSerializer(many=True, read_only=True)
    test_cases = TestCaseSerializer(many=True, read_only=True)
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    display_id = serializers.CharField(read_only=True)
    created_in_contest = serializers.SerializerMethodField()
    
    class Meta:
        model = Problem
        fields = [
            'id',
            'display_id',
            'title',  # Original title (fallback)
            'slug',
            'difficulty',
            'time_limit',
            'memory_limit',
            'submission_count',
            'accepted_count',
            'acceptance_rate',
            'is_practice_visible',
            'created_in_contest',
            'translation',
            'samples',
            'translations',
            'test_cases',
            'language_configs',
            'tags',
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
    
    def get_created_in_contest(self, obj):
        """Get contest info if this problem was created in a contest."""
        if obj.created_in_contest:
            return {
                'id': obj.created_in_contest.id,
                'title': obj.created_in_contest.name,
                'start_time': obj.created_in_contest.start_time,
                'end_time': obj.created_in_contest.end_time,
            }
        return None


class ProblemAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage problems."""
    translations = ProblemTranslationSerializer(many=True, required=False)
    test_cases = TestCaseSerializer(many=True, required=False)
    language_configs = LanguageConfigSerializer(many=True, required=False)
    
    # New Tag UX fields
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
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'acceptance_rate']
    
    def _handle_tags(self, problem, validated_data):
        """Helper to handle tag association."""
        existing_tag_ids = validated_data.pop('existing_tag_ids', [])
        new_tag_names = validated_data.pop('new_tag_names', [])
        tags_data = validated_data.pop('tags', None) # Legacy support

        # If new UX fields are present, use them
        if existing_tag_ids is not None or new_tag_names is not None:
            all_tags = []
            
            # 1. Fetch existing tags
            if existing_tag_ids:
                existing_tags = Tag.objects.filter(id__in=existing_tag_ids)
                all_tags.extend(existing_tags)
            
            # 2. Create or get new tags
            if new_tag_names:
                for name in new_tag_names:
                    name = name.strip()
                    if not name:
                        continue
                        
                    # Generate slug from name
                    # Simple slugify: lowercase and replace spaces with hyphens
                    # For more robust slugify, use django.utils.text.slugify
                    from django.utils.text import slugify
                    slug = slugify(name)
                    if not slug:
                        # Fallback for non-ascii names if slugify returns empty
                        import uuid
                        slug = f"tag-{uuid.uuid4().hex[:8]}"
                    
                    # Ensure slug is unique enough or handle collision?
                    # The requirement says: get_or_create(slug=slug, defaults={'name': name})
                    # But if slug exists, we return it.
                    
                    tag, created = Tag.objects.get_or_create(
                        slug=slug,
                        defaults={'name': name}
                    )
                    all_tags.append(tag)
            
            problem.tags.set(all_tags)
            
        # Fallback to legacy 'tags' field if provided and new fields are NOT provided
        elif tags_data is not None:
            problem.tags.set(tags_data)

    def create(self, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        
        # Extract tag data but don't process yet
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)
        tags_data = validated_data.pop('tags', None)
        
        # Auto-generate slug if empty
        if not validated_data.get('slug'):
            import uuid
            base_slug = validated_data.get('title', 'problem').lower()
            base_slug = ''.join(c if c.isalnum() or c in '-_' else '-' for c in base_slug)
            validated_data['slug'] = f"{base_slug}-{uuid.uuid4().hex[:8]}"
        
        problem = Problem.objects.create(**validated_data)
        
        # Handle Tags
        # Re-inject tag data to use helper
        tag_context = {
            'existing_tag_ids': existing_tag_ids,
            'new_tag_names': new_tag_names,
            'tags': tags_data
        }
        self._handle_tags(problem, tag_context)
        
        for trans_data in translations_data:
            ProblemTranslation.objects.create(problem=problem, **trans_data)
            
        for tc_data in test_cases_data:
            TestCase.objects.create(problem=problem, **tc_data)
        
        for lc_data in language_configs_data:
            LanguageConfig.objects.create(problem=problem, **lc_data)
            
        return problem
    
    def update(self, instance, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        
        # Extract tag data
        existing_tag_ids = validated_data.pop('existing_tag_ids', None)
        new_tag_names = validated_data.pop('new_tag_names', None)
        tags_data = validated_data.pop('tags', None)
        
        
        # Auto-generate slug if empty
        if 'slug' in validated_data and not validated_data.get('slug'):
            import uuid
            # Use first translation title if available, otherwise use existing
            title_base = instance.title
            if translations_data:
                title_base = translations_data[0].get('title', instance.title)
            base_slug = title_base.lower() if title_base else 'problem'
            base_slug = ''.join(c if c.isalnum() or c in '-_' else '-' for c in base_slug)
            validated_data['slug'] = f"{base_slug}-{uuid.uuid4().hex[:8]}"
        
        # Update problem fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Handle Tags
        tag_context = {
            'existing_tag_ids': existing_tag_ids,
            'new_tag_names': new_tag_names,
            'tags': tags_data
        }
        self._handle_tags(instance, tag_context)
        
        # Update translations (simple replacement for now)
        if translations_data:
            instance.translations.all().delete()
            for trans_data in translations_data:
                ProblemTranslation.objects.create(problem=instance, **trans_data)
        
        # Update test cases (simple replacement for now)
        if test_cases_data:
            instance.test_cases.all().delete()
            for tc_data in test_cases_data:
                TestCase.objects.create(problem=instance, **tc_data)
        
        # Update language configs
        if language_configs_data:
            instance.language_configs.all().delete()
            for lc_data in language_configs_data:
                LanguageConfig.objects.create(problem=instance, **lc_data)
        
        return instance
