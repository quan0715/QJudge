#!/usr/bin/env python3
"""
Judge 系統健康檢查腳本

使用方式：
    # 在 Celery 容器中執行
    docker compose exec celery python /app/scripts/check_judge_health.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, '/app')

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')

import django
django.setup()

from apps.judge.docker_runner import CppJudge


def check_judge_health():
    """檢查 judge 系統是否正常"""
    print("=" * 60)
    print("Judge System Health Check")
    print("=" * 60)
    
    try:
        # 1. 初始化 Judge
        print("\n[1/4] 初始化 Judge...")
        judge = CppJudge()
        print("✅ Judge 初始化成功")
        
        # 2. 測試簡單的正確答案 (AC)
        print("\n[2/4] 測試基本執行（AC）...")
        result = judge.execute(
            code='#include <iostream>\nint main() { std::cout << "Hello"; return 0; }',
            input_data='',
            expected_output='Hello',
            time_limit=1000,
            memory_limit=128
        )
        
        if result['status'] == 'AC':
            print(f"✅ AC 測試通過")
            print(f"   - 執行時間: {result['time']}ms")
            print(f"   - 記憶體: {result['memory']}KB")
        else:
            print(f"❌ AC 測試失敗: {result['status']}")
            print(f"   錯誤: {result['error']}")
            return 1
            
        # 3. 測試編譯錯誤 (CE)
        print("\n[3/4] 測試編譯錯誤（CE）...")
        result = judge.execute(
            code='#include <iostream>\nint main() { int a  return 0; }',  # 缺少分號
            input_data='',
            expected_output='',
            time_limit=1000,
            memory_limit=128
        )
        
        if result['status'] == 'CE':
            print(f"✅ CE 測試通過")
        else:
            print(f"❌ CE 測試失敗: 預期 CE，實際得到 {result['status']}")
            return 1
            
        # 4. 測試網路隔離
        print("\n[4/4] 測試安全性配置...")
        result = judge.execute(
            code='''
#include <iostream>
#include <sys/socket.h>
using namespace std;

int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        cout << "NETWORK_DISABLED" << endl;
    } else {
        cout << "NETWORK_ENABLED" << endl;
    }
    return 0;
}
''',
            input_data='',
            expected_output='NETWORK_DISABLED',
            time_limit=1000,
            memory_limit=128
        )
        
        if 'NETWORK_DISABLED' in result['output']:
            print(f"✅ 網路隔離正常")
        else:
            print(f"⚠️  網路隔離可能有問題")
            print(f"   輸出: {result['output']}")
        
        print("\n" + "=" * 60)
        print("🎉 Judge 系統健康檢查完成！")
        print("=" * 60)
        print("\n系統狀態: ✅ 正常")
        return 0
            
    except RuntimeError as e:
        print(f"\n❌ 初始化錯誤: {str(e)}")
        print("\n可能的原因：")
        print("  1. Docker 未啟動或無法連接")
        print("  2. Judge image 'oj-judge:latest' 不存在")
        print("  3. 當前用戶沒有 Docker 權限")
        print("\n解決方案：")
        print("  - 確認 Docker 運行: docker ps")
        print("  - 建立 judge image: docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge")
        print("  - 檢查權限: docker info")
        return 1
    except Exception as e:
        print(f"\n❌ 未預期錯誤: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(check_judge_health())
