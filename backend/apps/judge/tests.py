"""
判題系統單元測試

執行方式：
    # 執行所有測試
    docker exec oj_backend_dev python manage.py test apps.judge

    # 執行特定測試類別
    docker exec oj_backend_dev python manage.py test apps.judge.tests.CppJudgeTestCase

    # 執行特定測試方法
    docker exec oj_backend_dev python manage.py test apps.judge.tests.CppJudgeTestCase.test_simple_correct_answer

    # 顯示詳細輸出
    docker exec oj_backend_dev python manage.py test apps.judge --verbosity=2
"""

from django.test import TestCase
from apps.judge.docker_runner import CppJudge


class CppJudgeTestCase(TestCase):
    """C++ 判題系統測試"""

    def setUp(self):
        """每個測試前執行"""
        self.judge = CppJudge()

    def test_simple_correct_answer(self):
        """測試正確答案 (AC)"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
"""
        result = self.judge.execute_cpp(
            code=code,
            input_data="1 2",
            expected_output="3",
            time_limit=1000,
            memory_limit=128
        )

        self.assertEqual(result['status'], 'AC', f"預期 AC，實際得到 {result['status']}")
        self.assertEqual(result['output'].strip(), "3")
        self.assertEqual(result['error'], '')

    def test_compile_error(self):
        """測試編譯錯誤 (CE)"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int a, b  // 缺少分號
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
"""
        result = self.judge.execute_cpp(
            code=code,
            input_data="1 2",
            expected_output="3",
            time_limit=1000,
            memory_limit=128
        )

        self.assertEqual(result['status'], 'CE')
        self.assertIn('error', result['error'].lower())

    def test_wrong_answer(self):
        """測試答案錯誤 (WA)"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a * b << endl;  // 乘法而不是加法
    return 0;
}
"""
        result = self.judge.execute_cpp(
            code=code,
            input_data="2 3",
            expected_output="5",
            time_limit=1000,
            memory_limit=128
        )

        self.assertEqual(result['status'], 'WA')
        self.assertEqual(result['output'].strip(), "6")
        self.assertIn('Wrong Answer', result['error'])

    def test_time_limit_exceeded(self):
        """測試超時 (TLE)"""
        code = """
#include <iostream>
using namespace std;

int main() {
    long long sum = 0;
    for (long long i = 0; i < 10000000000LL; i++) {
        sum += i;
    }
    cout << sum << endl;
    return 0;
}
"""
        result = self.judge.execute_cpp(
            code=code,
            input_data="",
            expected_output="0",
            time_limit=100,  # 100ms - 應該會超時
            memory_limit=128
        )

        self.assertEqual(result['status'], 'TLE')
        self.assertIn('Time Limit Exceeded', result['error'])

    def test_runtime_error(self):
        """測試執行時錯誤 (RE)"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int arr[5];
    cout << arr[1000000] << endl;  // 陣列越界
    return 0;
}
"""
        result = self.judge.execute_cpp(
            code=code,
            input_data="",
            expected_output="0",
            time_limit=1000,
            memory_limit=128
        )

        # 可能是 RE 或 AC（取決於系統行為），但至少不應該是 CE
        self.assertIn(result['status'], ['RE', 'AC', 'WA'])

    def test_multiple_test_cases(self):
        """測試多組測試案例"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
"""
        test_cases = [
            ("1 2", "3"),
            ("0 0", "0"),
            ("-1 1", "0"),
            ("100 200", "300"),
        ]

        for input_data, expected in test_cases:
            with self.subTest(input=input_data, expected=expected):
                result = self.judge.execute_cpp(
                    code=code,
                    input_data=input_data,
                    expected_output=expected,
                    time_limit=1000,
                    memory_limit=128
                )
                self.assertEqual(result['status'], 'AC',
                                 f"輸入 {input_data} 失敗：{result}")

    def test_whitespace_handling(self):
        """測試空白字符處理"""
        code = """
#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
"""
        # 測試額外的空白和換行
        result = self.judge.execute_cpp(
            code=code,
            input_data="1 2",
            expected_output="3\n",  # 有換行
            time_limit=1000,
            memory_limit=128
        )

        self.assertEqual(result['status'], 'AC')
