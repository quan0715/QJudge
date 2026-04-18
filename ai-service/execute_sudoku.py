#!/usr/bin/env python3
import subprocess
import sys

def run_command(cmd):
    """運行命令並返回結果"""
    print(f"\n執行: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print("輸出:")
        print(result.stdout[:2000])  # 限制輸出長度
    if result.stderr:
        print("錯誤:")
        print(result.stderr)
    return result.returncode

def main():
    print("開始執行數獨測資生成流程")
    print("=" * 60)
    
    # 1. 測試生成器基本功能
    print("\n1. 測試生成器基本功能...")
    ret1 = run_command("python /app/test_sudoku_simple.py")
    if ret1 != 0:
        print("基本功能測試失敗")
        return 1
    
    # 2. 生成完整測資
    print("\n2. 生成完整測資...")
    ret2 = run_command("python /app/run_sudoku_generator.py")
    if ret2 != 0:
        print("完整測資生成失敗")
        return 2
    
    # 3. 檢查生成的 JSON 檔案
    print("\n3. 檢查生成的 JSON 檔案...")
    ret3 = run_command("ls -la /app/sudoku_test_cases.json 2>/dev/null || echo '檔案不存在'")
    
    # 4. 顯示檔案大小和內容預覽
    print("\n4. 顯示檔案內容預覽...")
    ret4 = run_command("head -c 2000 /app/sudoku_test_cases.json 2>/dev/null || echo '無法讀取檔案'")
    
    print("\n" + "=" * 60)
    print("執行完成")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())