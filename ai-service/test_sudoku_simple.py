#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app')

from generate_sudoku import SudokuGenerator

# 簡單測試生成器功能
def test_generator():
    print("測試數獨生成器...")
    generator = SudokuGenerator()
    
    # 測試完整盤面生成
    print("1. 測試完整盤面生成...")
    full_board = generator.generate_full_board()
    print("完整盤面:")
    generator.print_board(full_board)
    
    # 測試唯一解驗證
    print("\n2. 測試唯一解驗證...")
    puzzle, solution = generator.generate_puzzle_with_guaranteed_uniqueness("easy")
    print("謎題 (簡單):")
    generator.print_board(puzzle)
    print("\n解答:")
    generator.print_board(solution)
    
    # 檢查唯一解
    num_solutions = generator.count_solutions(puzzle, limit=2)
    print(f"\n解的数量: {num_solutions}")
    if num_solutions == 1:
        print("✓ 唯一解驗證通過")
    else:
        print("✗ 唯一解驗證失敗")
    
    return True

if __name__ == "__main__":
    test_generator()