"""
Management command to seed E2E test data.
Creates test users, problems, contests, and sample submissions.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from apps.users.models import UserProfile
from apps.problems.models import Problem, TestCase, ProblemTranslation, LanguageConfig
from apps.contests.models import Contest, ContestProblem, ContestParticipant

User = get_user_model()


class Command(BaseCommand):
    help = '建立 E2E 測試資料（用戶、題目、競賽）'

    def handle(self, *args, **options):
        self.stdout.write('開始建立 E2E 測試資料...')
        
        # 1. Create test users
        self._create_users()
        
        # 2. Create test problems
        self._create_problems()
        
        # 3. Create test contests
        self._create_contests()
        
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
            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                user.set_password(user_data['password'])
                user.role = user_data['role']
                user.is_superuser = user_data['is_superuser']
                user.is_staff = user_data['is_staff']
                user.email = user_data['email']
                user.save()
                self.stdout.write(f'  ✓ 更新用戶: {username}')
            else:
                user = User.objects.create_user(
                    username=username,
                    email=user_data['email'],
                    password=user_data['password']
                )
                user.role = user_data['role']
                user.is_superuser = user_data['is_superuser']
                user.is_staff = user_data['is_staff']
                user.save()
                self.stdout.write(f'  ✓ 建立用戶: {username}')
            
            # Ensure profile exists
            if not hasattr(user, 'profile'):
                UserProfile.objects.create(user=user)
                self.stdout.write(f'  ✓ 建立用戶資料: {username}')

    def _create_problems(self):
        """建立測試題目"""
        self.stdout.write('建立測試題目...')
        
        admin = User.objects.filter(is_superuser=True).first()
        
        # Problem 1: A+B Problem
        prob1, created = Problem.objects.get_or_create(
            title="A+B Problem",
            defaults={
                'slug': 'a-plus-b',
                'difficulty': 'easy',
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'is_visible': True,
                'is_practice_visible': True,
                'display_id': 'P001',
                'order': 1
            }
        )
        
        if created:
            ProblemTranslation.objects.create(
                problem=prob1,
                language='zh-hant',
                title="A+B Problem",
                description="計算兩個整數 $a$ 和 $b$ 的和。",
                input_description="輸入包含兩個整數 $a$ 和 $b$，用空格分隔。",
                output_description="輸出一個整數，即 $a$ 和 $b$ 的和。",
                hint="使用標準輸入輸出。"
            )
            
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
            title="Hello World",
            defaults={
                'slug': 'hello-world',
                'difficulty': 'easy',
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'is_visible': True,
                'is_practice_visible': True,
                'display_id': 'P002',
                'order': 2
            }
        )
        
        if created:
            ProblemTranslation.objects.create(
                problem=prob2,
                language='zh-hant',
                title="Hello World",
                description='撰寫一個程式輸出 "Hello, World!"。',
                input_description="無輸入。",
                output_description='輸出字串 "Hello, World!"。',
                hint=""
            )

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
            title="Factorial",
            defaults={
                'slug': 'factorial',
                'difficulty': 'medium',
                'time_limit': 1000,
                'memory_limit': 128,
                'created_by': admin,
                'is_visible': True,
                'is_practice_visible': True,
                'display_id': 'P003',
                'order': 3
            }
        )
        
        if created:
            ProblemTranslation.objects.create(
                problem=prob3,
                language='zh-hant',
                title="階乘計算",
                description='計算給定整數 $n$ 的階乘 $n!$。',
                input_description="輸入一個整數 $n$ ($0 \\leq n \\leq 10$)。",
                output_description='輸出 $n!$ 的值。',
                hint="$0! = 1$, $n! = n \\times (n-1) \\times ... \\times 1$"
            )

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
                'visibility': 'public',
                'status': 'active',
                'exam_mode_enabled': False,
                'scoreboard_visible_during_contest': True,
                'allow_view_results': True,
            }
        )
        
        if created:
            # Add problems to contest
            problems = Problem.objects.filter(title__in=['A+B Problem', 'Hello World'])
            for idx, problem in enumerate(problems):
                ContestProblem.objects.create(
                    contest=contest1,
                    problem=problem,
                    order=idx
                )
            self.stdout.write('  ✓ 建立競賽: E2E Test Contest')
        else:
            self.stdout.write('  - 競賽已存在: E2E Test Contest')

        # Contest 2: Upcoming Contest
        contest2, created = Contest.objects.get_or_create(
            name="Upcoming Contest",
            defaults={
                'description': '即將開始的競賽',
                'start_time': now + timedelta(days=1),
                'end_time': now + timedelta(days=1, hours=2),
                'owner': teacher,
                'visibility': 'public',
                'status': 'inactive',
                'exam_mode_enabled': False,
            }
        )
        
        if created:
            problems = Problem.objects.filter(title='Factorial')
            for idx, problem in enumerate(problems):
                ContestProblem.objects.create(
                    contest=contest2,
                    problem=problem,
                    order=idx
                )
            self.stdout.write('  ✓ 建立競賽: Upcoming Contest')
        else:
            self.stdout.write('  - 競賽已存在: Upcoming Contest')
