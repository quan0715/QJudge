"""
Django management command to create test data for development.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.problems.models import CodingProblem, TestCase, LanguageConfig
from apps.question_bank.question_assets import write_coding_content_to_asset

User = get_user_model()


class Command(BaseCommand):
    help = '建立測試帳號和測試題目'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('開始建立測試資料...'))

        # 建立測試使用者
        users = self.create_test_users()
        
        # 建立測試題目
        self.create_test_problems(users[0])  # 使用第一個使用者作為建立者
        
        self.stdout.write(self.style.SUCCESS('\n✅ 測試資料建立完成！'))

    def create_test_users(self):
        """建立三組測試帳號"""
        self.stdout.write('\n📝 建立測試使用者...')
        
        users_data = [
            {
                'username': 'student1',
                'email': 'student1@example.com',
                'password': 'password123',
                'role': 'student',
                'first_name': '測試',
                'last_name': '學生一'
            },
            {
                'username': 'student2',
                'email': 'student2@example.com',
                'password': 'password123',
                'role': 'student',
                'first_name': '測試',
                'last_name': '學生二'
            },
            {
                'username': 'teacher1',
                'email': 'teacher1@example.com',
                'password': 'password123',
                'role': 'teacher',
                'first_name': '測試',
                'last_name': '教師'
            },
        ]
        
        created_users = []
        for user_data in users_data:
            username = user_data.pop('username')
            password = user_data.pop('password')
            
            user, created = User.objects.get_or_create(
                username=username,
                defaults=user_data,
            )
            
            if created:
                user.set_password(password)
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  ✓ 建立使用者: {username} (密碼: {password}) - {user_data["role"]}'
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'  ⚠ 使用者已存在: {username}')
                )
            
            created_users.append(user)
        
        return created_users

    def create_test_problems(self, creator):
        """建立兩個測試題目"""
        self.stdout.write('\n📚 建立測試題目...')
        
        # 題目 1: A + B Problem
        problem1, created = CodingProblem.objects.get_or_create(
            slug='a-plus-b',
            defaults={
                'time_limit': 1000,
                'memory_limit': 128,
                'order': 1,
                'created_by': creator,
            }
        )

        if created:
            asset, version = write_coding_content_to_asset(
                owner=creator, title='A + B Problem', prompt='給定兩個整數 A 和 B，請計算 A + B 的值。',
                difficulty='easy',
                content_fields={
                    'description': '給定兩個整數 A 和 B，請計算 A + B 的值。',
                    'input_description': '一行包含兩個整數 A 和 B，以空格分隔。(-10^9 ≤ A, B ≤ 10^9)',
                    'output_description': '輸出一行，包含一個整數，表示 A + B 的結果。',
                    'hint': '這是一個簡單的加法問題。',
                },
                actor=creator,
            )
            problem1.question_asset = asset
            problem1.question_version = version
            problem1.save(update_fields=['question_asset', 'question_version'])
            self.stdout.write(self.style.SUCCESS('  ✓ 建立題目: A + B Problem'))
            
            # 建立語言配置
            LanguageConfig.objects.create(
                problem=problem1,
                language='cpp',
                template_code='''#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}''',
                is_enabled=True,
                order=1
            )
            
            LanguageConfig.objects.create(
                problem=problem1,
                language='python',
                template_code='''a, b = map(int, input().split())
print(a + b)''',
                is_enabled=True,
                order=2
            )
            
            # 建立測試案例
            test_cases = [
                {'input': '1 2', 'output': '3', 'is_sample': True},
                {'input': '5 7', 'output': '12', 'is_sample': True},
                {'input': '-1 1', 'output': '0', 'is_sample': False},
                {'input': '1000000000 1000000000', 'output': '2000000000', 'is_sample': False},
            ]
            
            for idx, tc in enumerate(test_cases):
                TestCase.objects.create(
                    problem=problem1,
                    input_data=tc['input'],
                    output_data=tc['output'],
                    is_sample=tc['is_sample'],
                    score=25,
                    order=idx + 1
                )
        else:
            self.stdout.write(self.style.WARNING('  ⚠ 題目已存在: A + B Problem'))

        # 題目 2: Fibonacci 數列
        problem2, created = CodingProblem.objects.get_or_create(
            slug='fibonacci-sequence',
            defaults={
                'time_limit': 2000,
                'memory_limit': 256,
                'order': 2,
                'created_by': creator,
            }
        )

        if created:
            asset, version = write_coding_content_to_asset(
                owner=creator, title='Fibonacci Sequence',
                prompt='Fibonacci 數列定義如下：\nF(0) = 0\nF(1) = 1\nF(n) = F(n-1) + F(n-2) for n >= 2\n\n給定一個整數 n，請計算第 n 個 Fibonacci 數。',
                difficulty='medium',
                content_fields={
                    'description': '''Fibonacci 數列定義如下：
F(0) = 0
F(1) = 1
F(n) = F(n-1) + F(n-2) for n ≥ 2

給定一個整數 n，請計算第 n 個 Fibonacci 數。''',
                    'input_description': '一個整數 n (0 ≤ n ≤ 30)',
                    'output_description': '輸出一行，包含一個整數，表示第 n 個 Fibonacci 數。',
                    'hint': '可以使用遞迴或迴圈來解決。注意效率問題！',
                },
                actor=creator,
            )
            problem2.question_asset = asset
            problem2.question_version = version
            problem2.save(update_fields=['question_asset', 'question_version'])
            self.stdout.write(self.style.SUCCESS('  ✓ 建立題目: Fibonacci Sequence'))
            
            # 建立語言配置
            LanguageConfig.objects.create(
                problem=problem2,
                language='cpp',
                template_code='''#include <iostream>
using namespace std;

int fibonacci(int n) {
    // TODO: 實作 Fibonacci 函數
    return 0;
}

int main() {
    int n;
    cin >> n;
    cout << fibonacci(n) << endl;
    return 0;
}''',
                is_enabled=True,
                order=1
            )
            
            LanguageConfig.objects.create(
                problem=problem2,
                language='python',
                template_code='''def fibonacci(n):
    # TODO: 實作 Fibonacci 函數
    return 0

n = int(input())
print(fibonacci(n))''',
                is_enabled=True,
                order=2
            )
            
            # 建立測試案例
            fib_values = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
            test_cases = []
            for i, val in enumerate(fib_values):
                test_cases.append({
                    'input': str(i),
                    'output': str(val),
                    'is_sample': i < 3,
                })
            
            for idx, tc in enumerate(test_cases):
                TestCase.objects.create(
                    problem=problem2,
                    input_data=tc['input'],
                    output_data=tc['output'],
                    is_sample=tc['is_sample'],
                    score=10,
                    order=idx + 1
                )
        else:
            self.stdout.write(self.style.WARNING('  ⚠ 題目已存在: Fibonacci Sequence'))
