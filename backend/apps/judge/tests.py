"""
Unit tests for the Judge Engine (CppJudge)
"""
from django.test import TestCase
from apps.judge.docker_runner import CppJudge


class CppJudgeTestCase(TestCase):
    """Test cases for C++ judge engine"""
    
    def setUp(self):
        """Set up test judge instance"""
        self.judge = CppJudge()
    
    def test_accepted_simple_addition(self):
        """Test AC status with simple A+B problem"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='1 2',
            expected_output='3',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'AC')
        self.assertEqual(result['output'].strip(), '3')
        self.assertEqual(result['error'], '')
    
    def test_accepted_multiple_test_cases(self):
        """Test AC status with multiple inputs"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}'''
        
        test_cases = [
            ('1 2', '3'),
            ('5 7', '12'),
            ('-1 1', '0'),
            ('100 200', '300'),
        ]
        
        for input_data, expected in test_cases:
            with self.subTest(input=input_data):
                result = self.judge.execute_cpp(
                    code=code,
                    input_data=input_data,
                    expected_output=expected,
                    time_limit=1000,
                    memory_limit=256
                )
                self.assertEqual(result['status'], 'AC')
                self.assertEqual(result['output'].strip(), expected)
    
    def test_wrong_answer(self):
        """Test WA status with incorrect output"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a - b << endl;  // Wrong: should be a + b
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='5 3',
            expected_output='8',  # Expecting 5+3=8, but code outputs 5-3=2
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'WA')
        self.assertEqual(result['output'].strip(), '2')
        self.assertIn('Wrong Answer', result['error'])
    
    def test_compilation_error(self):
        """Test CE status with syntax error"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int a, b
    cin >> a >> b;  // Missing semicolon above
    cout << a + b << endl;
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='1 2',
            expected_output='3',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'CE')
        self.assertIn('error', result['error'].lower())
    
    def test_runtime_error_division_by_zero(self):
        """Test RE status with division by zero"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int a = 1;
    int b = 0;
    cout << a / b << endl;  // Division by zero
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='',
            expected_output='',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'RE')
        self.assertIn('Runtime Error', result['error'])
    
    def test_runtime_error_segfault(self):
        """Test RE status with segmentation fault"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int* p = nullptr;
    cout << *p << endl;  // Dereferencing null pointer
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='',
            expected_output='',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'RE')
    
    def test_time_limit_exceeded(self):
        """Test TLE status with infinite loop"""
        code = '''#include <iostream>
using namespace std;

int main() {
    while (true) {
        // Infinite loop
    }
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='',
            expected_output='',
            time_limit=100,  # Very short time limit
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'TLE')
        self.assertIn('Time Limit Exceeded', result['error'])
    
    def test_multiline_io(self):
        """Test with multiline input and output"""
        code = '''#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {
        cout << i << endl;
    }
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='5',
            expected_output='1\n2\n3\n4\n5',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'AC')
    
    def test_string_io(self):
        """Test with string input and output"""
        code = '''#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    getline(cin, name);
    cout << "Hello, " << name << "!" << endl;
    return 0;
}'''
        
        result = self.judge.execute_cpp(
            code=code,
            input_data='World',
            expected_output='Hello, World!',
            time_limit=1000,
            memory_limit=256
        )
        
        self.assertEqual(result['status'], 'AC')
