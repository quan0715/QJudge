"""
測試判題系統的腳本

使用方式：
1. 在 Docker 環境中測試：
   docker exec oj_backend_dev python test_judge.py

2. 或直接執行：
   python backend/test_judge.py
"""

import sys
import os

# 添加 backend 到 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# Django setup
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.judge.docker_runner import CppJudge

def test_simple_cpp():
    """測試簡單的 C++ 程序"""
    print("=" * 60)
    print("測試 1: 簡單的 A + B 問題")
    print("=" * 60)
    
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
    
    judge = CppJudge()
    result = judge.execute(
        code=code,
        input_data="1 2",
        expected_output="3",
        time_limit=1000,  # 1 second
        memory_limit=128  # 128 MB
    )
    
    print(f"狀態: {result['status']}")
    print(f"輸出: {result['output']}")
    print(f"錯誤: {result['error']}")
    print(f"時間: {result['time']} ms")
    print(f"記憶體: {result['memory']} KB")
    print()
    
    return result['status'] == 'AC'

def test_compile_error():
    """測試編譯錯誤"""
    print("=" * 60)
    print("測試 2: 編譯錯誤")
    print("=" * 60)
    
    code = """
#include <iostream>
using namespace std;

int main() {
    int a, b
    cin >> a >> b;  // 缺少分號
    cout << a + b << endl;
    return 0;
}
"""
    
    judge = CppJudge()
    result = judge.execute(
        code=code,
        input_data="1 2",
        expected_output="3",
        time_limit=1000,
        memory_limit=128
    )
    
    print(f"狀態: {result['status']}")
    print(f"輸出: {result['output'][:200]}")
    print(f"錯誤: {result['error'][:200]}")
    print()
    
    return result['status'] == 'CE'

def test_wrong_answer():
    """測試答案錯誤"""
    print("=" * 60)
    print("測試 3: 答案錯誤")
    print("=" * 60)
    
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
    
    judge = CppJudge()
    result = judge.execute(
        code=code,
        input_data="2 3",
        expected_output="5",
        time_limit=1000,
        memory_limit=128
    )
    
    print(f"狀態: {result['status']}")
    print(f"輸出: {result['output']}")
    print(f"錯誤: {result['error']}")
    print()
    
    return result['status'] == 'WA'

def test_time_limit():
    """測試時間限制"""
    print("=" * 60)
    print("測試 4: 時間限制超過（TLE）")
    print("=" * 60)
    
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
    
    judge = CppJudge()
    result = judge.execute(
        code=code,
        input_data="",
        expected_output="0",
        time_limit=100,  # 100ms - 應該會超時
        memory_limit=128
    )
    
    print(f"狀態: {result['status']}")
    print(f"輸出: {result['output'][:100]}")
    print(f"錯誤: {result['error']}")
    print()
    
    return result['status'] == 'TLE'

if __name__ == '__main__':
    print("\n開始測試判題系統...\n")
    
    tests = [
        ("AC - 正確答案", test_simple_cpp),
        ("CE - 編譯錯誤", test_compile_error),
        ("WA - 答案錯誤", test_wrong_answer),
        ("TLE - 超時", test_time_limit),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            print(f"❌ 測試 {name} 發生錯誤: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("測試結果摘要")
    print("=" * 60)
    for name, passed in results:
        status = "✅ 通過" if passed else "❌ 失敗"
        print(f"{status} - {name}")
    
    passed_count = sum(1 for _, p in results if p)
    print(f"\n總計: {passed_count}/{len(results)} 個測試通過")
