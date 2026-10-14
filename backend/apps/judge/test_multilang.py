"""
Multi-language judge tests
"""
from unittest import TestCase
from apps.judge.judge_factory import get_judge
from apps.judge.io_judge import IOJudge


class JudgeFactoryTestCase(TestCase):
    def test_get_cpp_judge(self):
        judge = get_judge('cpp')
        self.assertIsInstance(judge, IOJudge)

    def test_get_c_judge(self):
        judge = get_judge('c')
        self.assertIsInstance(judge, IOJudge)

    def test_get_python_judge(self):
        judge = get_judge('python')
        self.assertIsInstance(judge, IOJudge)

    def test_get_java_judge(self):
        judge = get_judge('java')
        self.assertIsInstance(judge, IOJudge)

    def test_language_case_insensitive(self):
        for alias in ('Python', 'PYTHON', 'pYtHoN'):
            judge = get_judge(alias)
            self.assertIsInstance(judge, IOJudge)

    def test_language_aliases(self):
        self.assertIsInstance(get_judge('c++'), IOJudge)
        self.assertIsInstance(get_judge('py'), IOJudge)
        self.assertIsInstance(get_judge('python3'), IOJudge)

    def test_unsupported_language(self):
        with self.assertRaises(ValueError) as ctx:
            get_judge('brainfuck')
        self.assertIn('Unsupported language', str(ctx.exception))
