from django.db import transaction
from .models import Problem, ProblemTranslation, TestCase, LanguageConfig
import re
import uuid

class ProblemService:
    @staticmethod
    def generate_contest_problem_id() -> str:
        """
        為競賽題目生成下一個可用的 Q 編號（Q001, Q002...）
        """
        from django.db.models import Max
        
        # 找出所有 Q 開頭的 display_id
        contest_problems = Problem.objects.filter(
            display_id__startswith='Q'
        ).values_list('display_id', flat=True)
        
        if not contest_problems:
            return 'Q001'
        
        # 提取數字並找到最大值
        numbers = []
        for pid in contest_problems:
            match = re.match(r'Q(\d+)', pid)
            if match:
                numbers.append(int(match.group(1)))
        
        next_num = max(numbers) + 1 if numbers else 1
        return f'Q{next_num:03d}'
    
    @staticmethod
    def generate_practice_problem_id() -> str:
        """
        為練習題生成下一個可用的 P 編號（P001, P002...）
        """
        from django.db.models import Max
        
        # 找出所有 P 開頭的 display_id
        practice_problems = Problem.objects.filter(
            display_id__startswith='P'
        ).values_list('display_id', flat=True)
        
        if not practice_problems:
            return 'P001'
        
        # 提取數字並找到最大值
        numbers = []
        for pid in practice_problems:
            match = re.match(r'P(\d+)', pid)
            if match:
                numbers.append(int(match.group(1)))
        
        next_num = max(numbers) + 1 if numbers else 1
        return f'P{next_num:03d}'
    @staticmethod
    @transaction.atomic
    def clone_problem(source_problem: Problem, contest, created_by) -> Problem:
        """
        Clone a problem for a specific contest.
        """
        
        # Generate Q number for contest problem
        display_id = ProblemService.generate_contest_problem_id()
        
        # 1. Clone Problem instance
        new_problem = Problem.objects.create(
            title=f"{source_problem.title} (Copy)",
            slug=f"{source_problem.slug}-{contest.id}-copy", # Ensure unique slug
            display_id=display_id,
            difficulty=source_problem.difficulty,
            time_limit=source_problem.time_limit,
            memory_limit=source_problem.memory_limit,
            is_visible=False,
            # Use new MVP fields instead of deprecated ones
            is_practice_visible=False,
            created_in_contest=contest,
            created_by=created_by
        )
        
        # Handle slug uniqueness better if needed
        if Problem.objects.filter(slug=new_problem.slug).exclude(id=new_problem.id).exists():
            new_problem.slug = f"{source_problem.slug}-{contest.id}-{uuid.uuid4().hex[:8]}"
            new_problem.save()

        # 2. Clone Translations
        translations = source_problem.translations.all()
        for trans in translations:
            ProblemTranslation.objects.create(
                problem=new_problem,
                language=trans.language,
                title=trans.title,
                description=trans.description,
                input_description=trans.input_description,
                output_description=trans.output_description,
                hint=trans.hint
            )

        # 3. Clone Test Cases
        test_cases = source_problem.test_cases.all()
        for tc in test_cases:
            TestCase.objects.create(
                problem=new_problem,
                input_data=tc.input_data,
                output_data=tc.output_data,
                is_sample=tc.is_sample,
                score=tc.score,
                order=tc.order,
                is_hidden=tc.is_hidden
            )

        # 4. Clone Language Configs
        configs = source_problem.language_configs.all()
        for config in configs:
            LanguageConfig.objects.create(
                problem=new_problem,
                language=config.language,
                template_code=config.template_code,
                is_enabled=config.is_enabled,
                order=config.order
            )
            
        return new_problem

    @staticmethod
    @transaction.atomic
    def create_contest_problem(contest, created_by, title="New Problem") -> Problem:
        """
        Create a new empty problem for a contest.
        Uses new MVP fields: is_practice_visible=False, created_in_contest=contest
        """
        # Generate Q number for contest problem
        display_id = ProblemService.generate_contest_problem_id()
        slug = f"contest-{contest.id}-problem-{uuid.uuid4().hex[:8]}"
        
        problem = Problem.objects.create(
            title=title,
            slug=slug,
            display_id=display_id,
            difficulty='medium',
            is_visible=False,
            # New MVP fields
            is_practice_visible=False,  # Contest problems are not visible in practice by default
            created_in_contest=contest,  # Track the source contest
            created_by=created_by
        )
        
        return problem
