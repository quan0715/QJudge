import os
import django
import sys

# Setup Django environment
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.base')
django.setup()

from apps.problems.models import Problem, TestCase, ProblemTranslation, LanguageConfig
from apps.users.models import User

def create_test_problems():
    # Get admin user
    try:
        admin = User.objects.filter(is_superuser=True).first()
        if not admin:
            print("No admin user found. Please create one first.")
            return
    except Exception as e:
        print(f"Error getting admin user: {e}")
        return

    # 1. Create A+B Problem
    print("Creating A+B Problem...")
    prob1, created = Problem.objects.get_or_create(
        title="A+B Problem",
        defaults={
            'slug': 'a-plus-b',
            'difficulty': 'easy',
            'time_limit': 1000,
            'memory_limit': 128,
            'created_by': admin,
            'is_visible': True
        }
    )
    
    if created:
        # Create Translation
        ProblemTranslation.objects.create(
            problem=prob1,
            language='zh-hant',
            title="A+B Problem",
            description="Calculate the sum of two integers $a$ and $b$.",
            input_description="The input consists of two integers $a$ and $b$ separated by a space.",
            output_description="Output a single integer, the sum of $a$ and $b$.",
            hint="Use standard input/output."
        )
        
        # Create test cases for A+B
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
        
        # Enable C++
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
        print("A+B Problem created successfully.")
    else:
        print("A+B Problem already exists.")

    # 2. Create Hello World Problem
    print("Creating Hello World Problem...")
    prob2, created = Problem.objects.get_or_create(
        title="Hello World",
        defaults={
            'slug': 'hello-world',
            'difficulty': 'easy',
            'time_limit': 1000,
            'memory_limit': 128,
            'created_by': admin,
            'is_visible': True
        }
    )
    
    if created:
        # Create Translation
        ProblemTranslation.objects.create(
            problem=prob2,
            language='zh-hant',
            title="Hello World",
            description='Write a program that prints "Hello, World!".',
            input_description="No input.",
            output_description='Output the string "Hello, World!".',
            hint=""
        )

        # Create test cases for Hello World
        TestCase.objects.create(
            problem=prob2,
            input_data="",
            output_data="Hello, World!",
            is_sample=True,
            is_hidden=False,
            score=100,
            order=1
        )
        
        # Enable C++
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
        print("Hello World Problem created successfully.")
    else:
        print("Hello World Problem already exists.")

if __name__ == '__main__':
    create_test_problems()
