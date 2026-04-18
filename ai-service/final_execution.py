#!/usr/bin/env python3
"""
最終執行腳本：生成數獨測資並顯示結果
"""

import subprocess
import os
import sys
import json

def run_command(cmd):
    """執行命令並返回輸出"""
    print(f"執行: {cmd}")
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True,
            encoding='utf-8'
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    print("=" * 70)
    print("數獨測資生成器 - 最終執行")
    print("=" * 70)
    
    # 1. 直接執行生成器
    print("\n1. 執行數獨測資生成器...")
    returncode, stdout, stderr = run_command("cd /app && python sudoku_generator.py")
    
    if returncode != 0:
        print(f"執行失敗，返回碼: {returncode}")
        if stderr:
            print(f"錯誤訊息:\n{stderr}")
        return 1
    
    # 顯示部分輸出
    lines = stdout.split('\n')
    for line in lines[:50]:  # 顯示前50行
        print(line)
    
    if len(lines) > 50:
        print("... (輸出過長，已截斷)")
    
    # 2. 檢查生成的檔案
    print("\n2. 檢查生成的 JSON 檔案...")
    json_file = "/app/sudoku_test_cases.json"
    if os.path.exists(json_file):
        print(f"✓ JSON 檔案已生成: {json_file}")
        
        # 讀取並顯示檔案內容
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            print(f"\n✓ 檔案內容摘要:")
            print(f"  範例測資 (samples): {len(data['samples'])} 個")
            print(f"  測試測資 (test_cases): {len(data['test_cases'])} 個")
            
            # 顯示難度分佈
            difficulty_count = {}
            for test in data["test_cases"]:
                diff = test["difficulty"]
                difficulty_count[diff] = difficulty_count.get(diff, 0) + 1
            
            print(f"\n  測試測資難度分佈:")
            for diff, count in sorted(difficulty_count.items()):
                print(f"    {diff}: {count} 個")
            
            # 顯示第一個範例測資
            if data["samples"]:
                sample = data["samples"][0]
                print(f"\n  範例測資 1:")
                print(f"    ID: {sample['id']}")
                print(f"    難度: {sample['difficulty']}")
                print(f"    空白格數: {sample['empties']}")
                print(f"    謎題字符串長度: {len(sample['puzzle'])}")
                
                # 將字符串轉換為 9x9 格式顯示
                puzzle_str = sample['puzzle']
                print(f"\n    9x9 格式:")
                for i in range(9):
                    row = puzzle_str[i*9:(i+1)*9]
                    if i % 3 == 0 and i != 0:
                        print("    " + "-"*21)
                    display_row = "    "
                    for j in range(9):
                        if j % 3 == 0 and j != 0:
                            display_row += "| "
                        display_row += row[j] + " "
                    print(display_row)
            
            # 顯示第一個測試測資
            if data["test_cases"]:
                test = data["test_cases"][0]
                print(f"\n  測試測資 1:")
                print(f"    ID: {test['id']}")
                print(f"    難度: {test['difficulty']}")
                print(f"    空白格數: {test['empties']}")
                
        except Exception as e:
            print(f"讀取 JSON 檔案失敗: {e}")
    else:
        print(f"✗ JSON 檔案未生成")
        return 1
    
    print("\n" + "=" * 70)
    print("執行完成！")
    print("=" * 70)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())