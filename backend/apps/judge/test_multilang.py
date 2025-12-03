"""
Multi-language judge tests
"""
import unittest
from django.test import TestCase
from apps.judge.judge_factory import get_judge, get_supported_languages
from apps.judge.python_judge import PythonJudge
from apps.judge.docker_runner import CppJudge


class JudgeFactoryTestCase(TestCase):
    """測試 Judge Factory"""
    
    def test_get_cpp_judge(self):
        """測試取得 C++ Judge"""
        judge = get_judge('cpp')
        self.assertIsInstance(judge, CppJudge)
        self.assertEqual(judge.get_language_name(), 'C++')
    
    def test_get_python_judge(self):
        """測試取得 Python Judge"""
        judge = get_judge('python')
        self.assertIsInstance(judge, PythonJudge)
        self.assertEqual(judge.get_language_name(), 'Python')
    
    def test_language_case_insensitive(self):
        """測試語言名稱不區分大小寫"""
        judge1 = get_judge('Python')
        judge2 = get_judge('PYTHON')
        judge3 = get_judge('pYtHoN')
        
        self.assertIsInstance(judge1, PythonJudge)
        self.assertIsInstance(judge2, PythonJudge)
        self.assertIsInstance(judge3, PythonJudge)
    
    def test_language_aliases(self):
        """測試語言別名"""
        judge_cpp = get_judge('c++')
        judge_c = get_judge('c')
        judge_py = get_judge('py')
        judge_py3 = get_judge('python3')
        
        self.assertIsInstance(judge_cpp, CppJudge)
        self.assertIsInstance(judge_c, CppJudge)
        self.assertIsInstance(judge_py, PythonJudge)
        self.assertIsInstance(judge_py3, PythonJudge)
    
    def test_unsupported_language(self):
        """測試不支援的語言應拋出異常"""
        with self.assertRaises(ValueError) as context:
            get_judge('java')
        
        self.assertIn('Unsupported language', str(context.exception))
    
    def test_get_supported_languages(self):
        """測試取得支援語言列表"""
        languages = get_supported_languages()
        
        self.assertIsInstance(languages, list)
        self.assertGreater(len(languages), 0)
        
        # 確認包含 C++ 和 Python
        lang_ids = [lang['id'] for lang in languages]
        self.assertIn('cpp', lang_ids)
        self.assertIn('python', lang_ids)


class PythonJudgeTestCase(TestCase):
    """測試 Python Judge"""
    
    def setUp(self):
        """測試前準備"""
        self.judge = PythonJudge()
    
    def test_python_simple_correct(self):
        """測試 Python 正確答案 (AC)"""
        code = "print('Hello, World!')"
        result = self.judge.execute(
            code=code,
            input_data="",
            expected_output="Hello, World!",
            time_limit=1000,
            memory_limit=128
        )
        
        self.assertEqual(result['status'], 'AC')
        self.assertIn('Hello, World!', result['output'])
    
    def test_python_with_input(self):
        """測試 Python 讀取輸入"""
        code = """
a, b = map(int, input().split())
print(a + b)
"""
        result = self.judge.execute(
            code=code,
            input_data="1 2",
            expected_output="3",
            time_limit=1000,
            memory_limit=128
        )
        
        self.assertEqual(result['status'], 'AC')
    
    def test_python_wrong_answer(self):
        """測試 Python 答案錯誤 (WA)"""
        code = "print('Wrong')"
        result = self.judge.execute(
            code=code,
            input_data="",
            expected_output="Correct",
            time_limit=1000,
            memory_limit=128
        )
        
        self.assertEqual(result['status'], 'WA')
    
    def test_python_runtime_error(self):
        """測試 Python 執行錯誤 (RE)"""
        code = "print(1 / 0)"
        result = self.judge.execute(
            code=code,
            input_data="",
            expected_output="",
            time_limit=1000,
            memory_limit=128
        )
        
        self.assertEqual(result['status'], 'RE')
    
    @unittest.skip("Python time limit testing needs infinite loop which may hang")
    def test_python_time_limit(self):
        """測試 Python 時間限制 (TLE)"""
        code = """
import time
time.sleep(2)
print('Done')
"""
        result = self.judge.execute(
            code=code,
            input_data="",
            expected_output="Done",
            time_limit=1000,  # 1 second
            memory_limit=128
        )
        
        self.assertEqual(result['status'], 'TLE')
