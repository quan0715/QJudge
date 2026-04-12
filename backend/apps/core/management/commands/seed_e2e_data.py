"""
Management command to seed E2E test data.
Creates test users, problems, contests, and sample submissions.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.users.models import UserProfile
from apps.problems.models import Problem, TestCase, LanguageConfig
from apps.question_bank.question_assets import write_coding_content_to_asset
from apps.contests.models import Contest, ContestParticipant, ExamQuestion
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.question_bank.models import Question, QuestionBank
from apps.question_bank.bank_workflows import upsert_exam_question_into_bank, upsert_problem_into_bank


User = get_user_model()


class Command(BaseCommand):
    help = '建立 E2E 測試資料（用戶、題目、競賽）'

    @staticmethod
    def _bind_problem(contest, problem, order):
        """Create a ContestQuestionBinding for a coding problem."""
        from apps.question_bank.question_assets import ensure_problem_question_asset
        if not problem.question_asset_id:
            ensure_problem_question_asset(problem=problem, actor=problem.created_by or contest.owner)
            problem.refresh_from_db(fields=["question_asset", "question_version"])
        from django.db.models import Sum
        score = max(1, int(problem.test_cases.aggregate(total=Sum('score'))['total'] or 100))
        ContestQuestionBinding.objects.get_or_create(
            contest=contest,
            coding_problem=problem,
            defaults={
                "question_asset": problem.question_asset,
                "question_version": problem.question_version,
                "binding_type": QuestionAsset.AssetType.CODING,
                "order": order,
                "score": score,
                "source_mode": "manual",
            },
        )

    def handle(self, *args, **options):
        self.stdout.write('開始建立 E2E 測試資料...')
        
        # 1. Create test users
        self._create_users()
        
        # 2. Create test problems
        self._create_problems()
        
        # 3. Create test contests
        self._create_contests()

        # 4. Create test classroom
        self._create_classrooms()

        # 5. Create test question bank
        self._create_question_banks()

        # 6. Bind contests to E2E classroom (admin URLs need bound_classroom_id)
        self._bind_classroom_contests()

        self.stdout.write(self.style.SUCCESS('✓ E2E 測試資料建立完成'))

    def _create_users(self):
        """建立測試用戶"""
        self.stdout.write('建立測試用戶...')
        
        users_data = [
            {
                'username': 'admin',
                'email': 'admin@example.com',
                'password': 'admin123',
                'role': 'admin',
                'is_superuser': True,
                'is_staff': True
            },
            {
                'username': 'teacher',
                'email': 'teacher@example.com',
                'password': 'teacher123',
                'role': 'teacher',
                'is_superuser': False,
                'is_staff': False
            },
            {
                'username': 'student',
                'email': 'student@example.com',
                'password': 'student123',
                'role': 'student',
                'is_superuser': False,
                'is_staff': False
            },
            {
                'username': 'student2',
                'email': 'student2@example.com',
                'password': 'student123',
                'role': 'student',
                'is_superuser': False,
                'is_staff': False
            },
        ]
        
        for user_data in users_data:
            username = user_data['username']
            email = user_data['email']
            # Look up by username OR email to handle both collision cases
            existing = User.objects.filter(username=username).first() or User.objects.filter(email=email).first()
            if existing:
                existing.username = username
                existing.email = email
                existing.set_password(user_data['password'])
                existing.role = user_data['role']
                existing.is_superuser = user_data['is_superuser']
                existing.is_staff = user_data['is_staff']
                existing.save()
                user = existing
                self.stdout.write(f'  ✓ 更新用戶: {username}')
            else:
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=user_data['password']
                )
                user.role = user_data['role']
                user.is_superuser = user_data['is_superuser']
                user.is_staff = user_data['is_staff']
                user.save()
                self.stdout.write(f'  ✓ 建立用戶: {username}')
            
            # Ensure profile exists + E2E 可直達教室／競賽管理（RequireCompletedOnboarding）
            profile, p_created = UserProfile.objects.get_or_create(user=user)
            if p_created:
                self.stdout.write(f'  ✓ 建立用戶資料: {username}')
            if profile.onboarding_completed_at is None:
                profile.onboarding_completed_at = timezone.now()
                profile.save(update_fields=['onboarding_completed_at', 'updated_at'])

    def _create_problems(self):
        """建立測試題目"""
        self.stdout.write('建立測試題目...')
        
        admin = User.objects.filter(is_superuser=True).first()
        
        # Problem 1: A+B Problem
        prob1, created = Problem.objects.get_or_create(
            slug='a-plus-b',
            defaults={
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'order': 1
            }
        )

        if created:
            asset, version = write_coding_content_to_asset(
                owner=admin, title="A+B Problem", prompt="計算兩個整數 $a$ 和 $b$ 的和。",
                difficulty="easy",
                translations=[{
                    "language": "zh-TW", "title": "A+B Problem",
                    "description": "計算兩個整數 $a$ 和 $b$ 的和。",
                    "input_description": "輸入包含兩個整數 $a$ 和 $b$，用空格分隔。",
                    "output_description": "輸出一個整數，即 $a$ 和 $b$ 的和。",
                    "hint": "使用標準輸入輸出。",
                }],
                actor=admin,
            )
            prob1.question_asset = asset
            prob1.question_version = version
            prob1.save(update_fields=["question_asset", "question_version"])
            
            TestCase.objects.create(
                problem=prob1,
                input_data="1 2",
                output_data="3",
                is_sample=True,
                is_hidden=False,
                score=30,
                order=1
            )
            TestCase.objects.create(
                problem=prob1,
                input_data="10 20",
                output_data="30",
                is_sample=False,
                is_hidden=False,
                score=30,
                order=2
            )
            TestCase.objects.create(
                problem=prob1,
                input_data="-100 100",
                output_data="0",
                is_sample=False,
                is_hidden=True,
                score=40,
                order=3
            )
            
            LanguageConfig.objects.create(
                problem=prob1,
                language='cpp',
                is_enabled=True,
                template_code="""#include <iostream>

using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}"""
            )
            self.stdout.write('  ✓ 建立題目: A+B Problem')
        else:
            self.stdout.write('  - 題目已存在: A+B Problem')

        # Problem 2: Hello World
        prob2, created = Problem.objects.get_or_create(
            slug='hello-world',
            defaults={
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'order': 2
            }
        )

        if created:
            asset, version = write_coding_content_to_asset(
                owner=admin, title="Hello World", prompt='撰寫一個程式輸出 "Hello, World!"。',
                difficulty="easy",
                translations=[{
                    "language": "zh-TW", "title": "Hello World",
                    "description": '撰寫一個程式輸出 "Hello, World!"。',
                    "input_description": "無輸入。",
                    "output_description": '輸出字串 "Hello, World!"。',
                    "hint": "",
                }],
                actor=admin,
            )
            prob2.question_asset = asset
            prob2.question_version = version
            prob2.save(update_fields=["question_asset", "question_version"])

            TestCase.objects.create(
                problem=prob2,
                input_data="",
                output_data="Hello, World!",
                is_sample=True,
                is_hidden=False,
                score=100,
                order=1
            )
            
            LanguageConfig.objects.create(
                problem=prob2,
                language='cpp',
                is_enabled=True,
                template_code="""#include <iostream>

using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}"""
            )
            self.stdout.write('  ✓ 建立題目: Hello World')
        else:
            self.stdout.write('  - 題目已存在: Hello World')

        # Problem 3: Factorial
        prob3, created = Problem.objects.get_or_create(
            slug='factorial',
            defaults={
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'order': 3
            }
        )

        if created:
            asset, version = write_coding_content_to_asset(
                owner=admin, title="Factorial", prompt='計算給定整數 $n$ 的階乘 $n!$。',
                difficulty="medium",
                translations=[{
                    "language": "zh-TW", "title": "階乘計算",
                    "description": '計算給定整數 $n$ 的階乘 $n!$。',
                    "input_description": "輸入一個整數 $n$ ($0 \\leq n \\leq 10$)。",
                    "output_description": '輸出 $n!$ 的值。',
                    "hint": "$0! = 1$, $n! = n \\times (n-1) \\times ... \\times 1$",
                }],
                actor=admin,
            )
            prob3.question_asset = asset
            prob3.question_version = version
            prob3.save(update_fields=["question_asset", "question_version"])

            TestCase.objects.create(
                problem=prob3,
                input_data="5",
                output_data="120",
                is_sample=True,
                is_hidden=False,
                score=50,
                order=1
            )
            TestCase.objects.create(
                problem=prob3,
                input_data="0",
                output_data="1",
                is_sample=False,
                is_hidden=False,
                score=25,
                order=2
            )
            TestCase.objects.create(
                problem=prob3,
                input_data="10",
                output_data="3628800",
                is_sample=False,
                is_hidden=True,
                score=25,
                order=3
            )
            
            LanguageConfig.objects.create(
                problem=prob3,
                language='cpp',
                is_enabled=True,
                template_code="""#include <iostream>

using namespace std;

int main() {
    int n;
    cin >> n;
    
    // TODO: Calculate factorial
    
    return 0;
}"""
            )
            self.stdout.write('  ✓ 建立題目: Factorial')
        else:
            self.stdout.write('  - 題目已存在: Factorial')

    def _create_contests(self):
        """建立測試競賽"""
        self.stdout.write('建立測試競賽...')
        
        teacher = User.objects.filter(username='teacher').first()
        
        # Contest 1: Active Contest
        now = timezone.now()
        contest1, created = Contest.objects.get_or_create(
            name="E2E Test Contest",
            defaults={
                'description': '這是一個用於 E2E 測試的競賽',
                'start_time': now - timedelta(hours=1),
                'end_time': now + timedelta(hours=2),
                'owner': teacher,
                'status': 'published',
                'cheat_detection_enabled': False,
                'scoreboard_visible_during_contest': True,
            }
        )
        
        if created:
            # Add problems to contest
            problems = Problem.objects.filter(question_asset__title__in=['A+B Problem', 'Hello World'])
            for idx, problem in enumerate(problems):
                self._bind_problem(contest1, problem, idx)
            self.stdout.write('  ✓ 建立競賽: E2E Test Contest')
        else:
            # Always refresh times so contests don't expire between seed runs
            contest1.start_time = now - timedelta(hours=1)
            contest1.end_time = now + timedelta(hours=2)
            contest1.save(update_fields=['start_time', 'end_time'])
            self.stdout.write('  ✓ 更新競賽時間: E2E Test Contest')

        # Contest 2: Upcoming Contest
        contest2, created = Contest.objects.get_or_create(
            name="Upcoming Contest",
            defaults={
                'description': '即將開始的競賽',
                'start_time': now + timedelta(days=1),
                'end_time': now + timedelta(days=1, hours=2),
                'owner': teacher,
                'status': 'published',
                'cheat_detection_enabled': False,
            }
        )

        if created:
            problems = Problem.objects.filter(question_asset__title='Factorial')
            for idx, problem in enumerate(problems):
                self._bind_problem(contest2, problem, idx)
            self.stdout.write('  ✓ 建立競賽: Upcoming Contest')
        else:
            contest2.start_time = now + timedelta(days=1)
            contest2.end_time = now + timedelta(days=1, hours=2)
            contest2.save(update_fields=['start_time', 'end_time'])
            self.stdout.write('  ✓ 更新競賽時間: Upcoming Contest')

        # Contest 3: Exam Mode Contest (for anti-cheat E2E tests)
        contest3, created = Contest.objects.get_or_create(
            name="E2E Exam Mode Contest",
            defaults={
                'description': '考試模式 E2E 測試用',
                'start_time': now - timedelta(hours=1),
                'end_time': now + timedelta(hours=2),
                'owner': teacher,
                'status': 'published',
                'contest_type': 'paper_exam',
                'cheat_detection_enabled': True,
                'max_cheat_warnings': 2,
                'allow_auto_unlock': False,
            }
        )

        if created:
            problems = Problem.objects.filter(question_asset__title='A+B Problem')
            for idx, problem in enumerate(problems):
                self._bind_problem(contest3, problem, idx)
            self.stdout.write('  ✓ 建立競賽: E2E Exam Mode Contest')
        else:
            contest3.start_time = now - timedelta(hours=1)
            contest3.end_time = now + timedelta(hours=2)
            contest3.save(update_fields=['start_time', 'end_time'])
            self.stdout.write('  ✓ 更新競賽時間: E2E Exam Mode Contest')

        # Ensure exam questions exist (idempotent, runs even if contest already existed)
        ExamQuestion.objects.get_or_create(
            contest=contest3,
            order=0,
            defaults={
                'question_type': 'single_choice',
                'prompt': '1 + 1 = ?',
                'options': ['1', '2', '3', '4'],
                'correct_answer': '2',
                'score': 10,
            }
        )
        ExamQuestion.objects.get_or_create(
            contest=contest3,
            order=1,
            defaults={
                'question_type': 'true_false',
                'prompt': 'Python 是一種程式語言。',
                'options': ['True', 'False'],
                'correct_answer': 'True',
                'score': 10,
            }
        )

        # Draft coding contest: empty list for isolated editor E2E
        draft_coding, dcreated = Contest.objects.get_or_create(
            name="E2E Draft Coding Editor",
            defaults={
                'description': 'E2E 題目編輯測試用草稿程式競賽',
                'start_time': now + timedelta(days=7),
                'end_time': now + timedelta(days=7, hours=3),
                'owner': teacher,
                'status': 'draft',
                'contest_type': 'coding',
                'cheat_detection_enabled': False,
            },
        )
        if dcreated:
            self.stdout.write('  ✓ 建立競賽: E2E Draft Coding Editor')
        else:
            draft_coding.start_time = now + timedelta(days=7)
            draft_coding.end_time = now + timedelta(days=7, hours=3)
            draft_coding.save(update_fields=['start_time', 'end_time'])
            self.stdout.write('  - 草稿程式競賽已存在: E2E Draft Coding Editor')

    def _create_classrooms(self):
        """建立測試教室"""
        self.stdout.write('建立測試教室...')
        teacher = User.objects.filter(username='teacher').first()
        classroom, created = Classroom.objects.get_or_create(
            name="E2E Test Classroom",
            defaults={
                'owner': teacher,
                'invite_code': 'E2ETEST',
            }
        )
        if created:
            self.stdout.write('  ✓ 建立教室: E2E Test Classroom')
        else:
            self.stdout.write('  - 教室已存在: E2E Test Classroom')

        for username in ['student', 'student2']:
            user = User.objects.filter(username=username).first()
            if user:
                _, mem_created = ClassroomMember.objects.get_or_create(
                    classroom=classroom, user=user,
                    defaults={'role': 'student'},
                )
                if mem_created:
                    self.stdout.write(f'  ✓ 加入成員: {username}')

    def _create_question_banks(self):
        """建立測試題庫"""
        self.stdout.write('建立測試題庫...')
        teacher = User.objects.filter(username='teacher').first()
        bank, created = QuestionBank.objects.get_or_create(
            name="E2E Test Bank",
            owner=teacher,
            defaults={
                'description': 'E2E 測試用題庫',
                'category': QuestionBank.Category.CODING,
            }
        )
        if created:
            self.stdout.write('  ✓ 建立題庫: E2E Test Bank')
        else:
            self.stdout.write('  - 題庫已存在: E2E Test Bank')

        # At least one coding row for QuestionSourcePanel (coding mode)
        prob_ab = Problem.objects.filter(question_asset__title="A+B Problem").first()
        if prob_ab and teacher:
            upsert_problem_into_bank(problem=prob_ab, bank=bank, created_by=teacher)
            self.stdout.write('  ✓ 題庫題目: A+B Problem → E2E Test Bank')

        # Exam bank + one single_choice row for paper editor source tab
        exam_bank, ecreated = QuestionBank.objects.get_or_create(
            name="E2E Exam Bank",
            owner=teacher,
            defaults={
                'description': 'E2E 紙本測試題庫',
                'category': QuestionBank.Category.EXAM,
            },
        )
        if not ecreated and exam_bank.category != QuestionBank.Category.EXAM:
            exam_bank.category = QuestionBank.Category.EXAM
            exam_bank.save(update_fields=['category'])
        if ecreated:
            self.stdout.write('  ✓ 建立題庫: E2E Exam Bank')

        src_contest, _ = Contest.objects.get_or_create(
            name="E2E Exam Bank Source Contest",
            defaults={
                'owner': teacher,
                'contest_type': 'paper_exam',
                'status': 'draft',
                'description': '僅供種子匯入紙本題庫（勿用於 E2E 流程）',
            },
        )
        eq, _ = ExamQuestion.objects.get_or_create(
            contest=src_contest,
            order=0,
            defaults={
                'question_type': 'single_choice',
                'prompt': 'E2E bank seed: 2+2=?',
                'options': ['3', '4', '5'],
                'correct_answer': 1,
                'score': 5,
            },
        )
        if teacher and not Question.objects.filter(
            bank=exam_bank, metadata__legacy_exam_question_id=str(eq.id)
        ).exists():
            upsert_exam_question_into_bank(eq, bank=exam_bank, created_by=teacher)
            self.stdout.write('  ✓ 題庫題目: exam seed → E2E Exam Bank')

    def _bind_classroom_contests(self):
        """將常用競賽綁定到 E2E Test Classroom（/classrooms/.../admin 需要）"""
        self.stdout.write('綁定競賽與 E2E 教室...')
        classroom = Classroom.objects.filter(name="E2E Test Classroom").first()
        if not classroom:
            self.stdout.write(self.style.WARNING('  - 跳過：找不到 E2E Test Classroom'))
            return
        names = [
            "E2E Exam Mode Contest",
            "E2E Test Contest",
            "E2E Draft Coding Editor",
        ]
        for name in names:
            contest = Contest.objects.filter(name=name).first()
            if not contest:
                continue
            _, bound = ClassroomContest.objects.get_or_create(
                classroom=classroom,
                contest=contest,
            )
            if bound:
                self.stdout.write(f'  ✓ 綁定: {name}')
            else:
                self.stdout.write(f'  - 已綁定: {name}')
