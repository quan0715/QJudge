"""
Serializers for problems app.
"""
from rest_framework import serializers
from .models import Problem, ProblemTranslation, TestCase, LanguageConfig


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
        ]
    
    is_solved = serializers.BooleanField(read_only=True, default=False)
    
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    
    created_by = serializers.ReadOnlyField(source='created_by.username')
    
    def get_title(self, obj):
        """Get title in requested language or default."""
        lang = self.context.get('language', 'zh-hant')
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
        ]
    
    def get_translation(self, obj):
        """Get translation for requested language."""
        lang = self.context.get('language', 'zh-hant')
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
                'title': obj.created_in_contest.title,
                'start_time': obj.created_in_contest.start_time,
                'end_time': obj.created_in_contest.end_time,
            }
        return None


class ProblemAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage problems."""
    translations = ProblemTranslationSerializer(many=True, required=False)
    test_cases = TestCaseSerializer(many=True, required=False)
    language_configs = LanguageConfigSerializer(many=True, required=False)
    
    class Meta:
        model = Problem
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'acceptance_rate']
    
    def create(self, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        
        # Auto-generate slug if empty
        if not validated_data.get('slug'):
            import uuid
            base_slug = validated_data.get('title', 'problem').lower()
            base_slug = ''.join(c if c.isalnum() or c in '-_' else '-' for c in base_slug)
            validated_data['slug'] = f"{base_slug}-{uuid.uuid4().hex[:8]}"
        
        problem = Problem.objects.create(**validated_data)
        
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
