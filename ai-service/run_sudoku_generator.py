#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app')

from generate_sudoku import SudokuGenerator, main

if __name__ == "__main__":
    result = main()
    if result:
        print("\n" + "="*50)
        print("測資生成完成！")
        print("JSON 格式的測資:")
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("測資生成失敗")