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
            'created_at',
            'created_by',
            'language_configs',
        ]
    
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


class ProblemDetailSerializer(serializers.ModelSerializer):
    """Serializer for problem detail (full info)."""
    translation = serializers.SerializerMethodField()
    samples = serializers.SerializerMethodField()
    translations = ProblemTranslationSerializer(many=True, read_only=True)
    test_cases = TestCaseSerializer(many=True, read_only=True)
    language_configs = LanguageConfigSerializer(many=True, read_only=True)
    display_id = serializers.CharField(read_only=True)
    
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


class ProblemAdminSerializer(serializers.ModelSerializer):
    """Serializer for admin/teacher to manage problems."""
    translations = ProblemTranslationSerializer(many=True, required=False)
    test_cases = TestCaseSerializer(many=True, required=False)
    language_configs = LanguageConfigSerializer(many=True, required=False)
    
    class Meta:
        model = Problem
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        translations_data = validated_data.pop('translations', [])
        test_cases_data = validated_data.pop('test_cases', [])
        language_configs_data = validated_data.pop('language_configs', [])
        
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
