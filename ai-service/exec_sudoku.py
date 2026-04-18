#!/usr/bin/env python3
import subprocess
import os

def run_script(script_name):
    """執行指定的 Python 腳本"""
    print(f"\n{'='*60}")
    print(f"執行: {script_name}")
    print(f"{'='*60}")
    
    result = subprocess.run(
        ["python", script_name],
        capture_output=True,
        text=True,
        encoding='utf-8'
    )
    
    # 輸出結果
    if result.stdout:
        # 限制輸出長度，避免過多內容
        lines = result.stdout.split('\n')
        for i, line in enumerate(lines):
            if i < 100:  # 最多顯示 100 行
                print(line)
            elif i == 100:
                print("... (輸出過長，已截斷)")
                break
    
    if result.stderr:
        print("\n錯誤輸出:")
        print(result.stderr)
    
    print(f"返回碼: {result.returncode}")
    return result.returncode

def main():
    print("開始執行數獨測資生成流程")
    
    # 先檢查檔案是否存在
    if not os.path.exists("/app/sudoku_generator.py"):
        print("錯誤: sudoku_generator.py 不存在")
        return 1
    
    # 執行生成器
    ret = run_script("/app/run_generator.py")
    
    if ret == 0:
        print("\n" + "="*60)
        print("執行成功！")
        print("="*60)
        
        # 檢查生成的 JSON 檔案
        if os.path.exists("/app/sudoku_test_cases.json"):
            print("\n生成的 JSON 檔案資訊:")
            import json
            with open("/app/sudoku_test_cases.json", 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"範例測資數量: {len(data['samples'])}")
                print(f"測試測資數量: {len(data['test_cases'])}")
                
                # 顯示第一個測資的預覽
                if data['samples']:
                    sample = data['samples'][0]
                    print(f"\n第一個範例測資預覽:")
                    print(f"ID: {sample['id']}")
                    print(f"難度: {sample['difficulty']}")
                    print(f"空白格數: {sample['empties']}")
                    print(f"謎題前 30 字符: {sample['puzzle'][:30]}...")
        else:
            print("警告: JSON 檔案未生成")
    else:
        print("\n執行失敗")
        return ret
    
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())