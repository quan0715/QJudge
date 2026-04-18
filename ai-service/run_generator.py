#!/usr/bin/env python3
import sys
import json
sys.path.insert(0, '/app')

from sudoku_generator import main

if __name__ == "__main__":
    result = main()
    if result:
        print("\n" + "="*60)
        print("測資生成完成！以下是生成的 JSON 格式測資：")
        print("="*60)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("="*60)
        
        # 顯示一些關鍵統計
        total_samples = len(result["samples"])
        total_tests = len(result["test_cases"])
        
        print(f"\n總結：")
        print(f"範例測資 (samples): {total_samples} 個")
        print(f"測試測資 (test_cases): {total_tests} 個")
        
        # 計算難度分佈
        difficulty_count = {}
        for test in result["test_cases"]:
            diff = test["difficulty"]
            difficulty_count[diff] = difficulty_count.get(diff, 0) + 1
        
        print("\n測試測資難度分佈：")
        for diff, count in sorted(difficulty_count.items()):
            print(f"  {diff}: {count} 個")
        
        print("\n每個測資包含：")
        print("  - puzzle: 9x9 數獨盤面，'.' 表示空白，'1'-'9' 表示已填數字")
        print("  - solution: 完整解答")
        print("  - difficulty: 難度等級 (easy/medium/hard)")
        print("  - empties: 空白格數量")
        
        print("\n範例測資 1 詳細內容：")
        sample = result["samples"][0]
        print(f"  ID: {sample['id']}")
        print(f"  難度: {sample['difficulty']}")
        print(f"  空白格數: {sample['empties']}")
        print(f"  謎題字符串: {sample['puzzle']}")
        
        print("\n測試測資 1 詳細內容：")
        test = result["test_cases"][0]
        print(f"  ID: {test['id']}")
        print(f"  難度: {test['difficulty']}")
        print(f"  空白格數: {test['empties']}")
    else:
        print("測資生成失敗")