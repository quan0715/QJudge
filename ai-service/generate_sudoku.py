#!/usr/bin/env python3
"""
數獨題目生成器

功能：
1. 生成完整有效的數獨盤面
2. 挖空生成謎題，確保唯一解
3. 生成不同難度的數獨題目
4. 輸出 JSON 格式的測資
"""

import random
import copy
import json
from typing import List, Tuple, Optional, Dict, Set
import itertools


class SudokuGenerator:
    def __init__(self):
        self.N = 9
        self.subgrid_size = 3
        
    def print_board(self, board: List[List[str]]) -> None:
        """打印數獨盤面"""
        for i in range(self.N):
            if i % 3 == 0 and i != 0:
                print("-" * 21)
            for j in range(self.N):
                if j % 3 == 0 and j != 0:
                    print("|", end=" ")
                print(board[i][j], end=" ")
            print()
    
    def board_to_string(self, board: List[List[str]]) -> str:
        """將數獨盤面轉換為單行字符串"""
        return ''.join([''.join(row) for row in board])
    
    def string_to_board(self, s: str) -> List[List[str]]:
        """將字符串轉換為數獨盤面"""
        board = []
        for i in range(self.N):
            row = list(s[i*self.N:(i+1)*self.N])
            board.append(row)
        return board
    
    def is_valid(self, board: List[List[str]], row: int, col: int, num: str) -> bool:
        """檢查在 board[row][col] 放置 num 是否有效"""
        # 檢查行
        for j in range(self.N):
            if board[row][j] == num:
                return False
        
        # 檢查列
        for i in range(self.N):
            if board[i][col] == num:
                return False
        
        # 檢查 3x3 子網格
        start_row = (row // 3) * 3
        start_col = (col // 3) * 3
        for i in range(start_row, start_row + 3):
            for j in range(start_col, start_col + 3):
                if board[i][j] == num:
                    return False
        
        return True
    
    def solve_sudoku(self, board: List[List[str]]) -> bool:
        """使用回溯法求解數獨，返回是否有解"""
        def find_empty(board):
            for i in range(self.N):
                for j in range(self.N):
                    if board[i][j] == '.':
                        return (i, j)
            return None
        
        def solve():
            empty = find_empty(board)
            if not empty:
                return True
            
            row, col = empty
            
            # 隨機嘗試數字增加多樣性
            numbers = list("123456789")
            random.shuffle(numbers)
            
            for num in numbers:
                if self.is_valid(board, row, col, num):
                    board[row][col] = num
                    if solve():
                        return True
                    board[row][col] = '.'
            
            return False
        
        # 創建副本避免修改原盤面
        board_copy = copy.deepcopy(board)
        return solve()
    
    def count_solutions(self, board: List[List[str]], limit: int = 2) -> int:
        """計算數獨的解的數量，最多計算到 limit 個"""
        def find_empty(board):
            for i in range(self.N):
                for j in range(self.N):
                    if board[i][j] == '.':
                        return (i, j)
            return None
        
        def count_solutions_helper(board_copy, count):
            empty = find_empty(board_copy)
            if not empty:
                return count + 1
            
            row, col = empty
            
            solutions = 0
            for num in "123456789":
                if self.is_valid(board_copy, row, col, num):
                    board_copy[row][col] = num
                    new_count = count_solutions_helper(board_copy, count)
                    board_copy[row][col] = '.'
                    
                    if new_count >= limit:
                        return limit
                    solutions = new_count - count
            
            return count + solutions
        
        board_copy = copy.deepcopy(board)
        return count_solutions_helper(board_copy, 0)
    
    def generate_full_board(self) -> List[List[str]]:
        """生成一個完整的有效數獨盤面"""
        # 從一個空的盤面開始
        board = [['.' for _ in range(self.N)] for _ in range(self.N)]
        
        # 填充對角線的 3x3 子網格（它們是獨立的）
        for block in range(3):
            nums = list("123456789")
            random.shuffle(nums)
            for i in range(3):
                for j in range(3):
                    row = block * 3 + i
                    col = block * 3 + j
                    board[row][col] = nums[i * 3 + j]
        
        # 使用回溯法填充剩餘的格子
        def solve(board):
            for i in range(self.N):
                for j in range(self.N):
                    if board[i][j] == '.':
                        nums = list("123456789")
                        random.shuffle(nums)
                        for num in nums:
                            if self.is_valid(board, i, j, num):
                                board[i][j] = num
                                if solve(board):
                                    return True
                                board[i][j] = '.'
                        return False
            return True
        
        solve(board)
        return board
    
    def generate_puzzle(self, full_board: List[List[str]], difficulty: str = "medium") -> Tuple[List[List[str]], int]:
        """
        從完整盤面挖空生成謎題
        
        difficulty: "easy", "medium", "hard"
        返回: (謎題盤面, 挖空數量)
        """
        # 複製完整盤面
        puzzle = copy.deepcopy(full_board)
        
        # 根據難度決定挖空數量範圍
        if difficulty == "easy":
            min_empties, max_empties = 30, 40
        elif difficulty == "medium":
            min_empties, max_empties = 40, 50
        else:  # hard
            min_empties, max_empties = 50, 60
        
        target_empties = random.randint(min_empties, max_empties)
        
        # 隨機順序挖空，確保唯一解
        positions = [(i, j) for i in range(self.N) for j in range(self.N)]
        random.shuffle(positions)
        
        empties = 0
        removed_positions = []
        
        for row, col in positions:
            if empties >= target_empties:
                break
            
            # 保存當前數字
            original = puzzle[row][col]
            if original == '.':
                continue
            
            # 嘗試挖空
            puzzle[row][col] = '.'
            
            # 檢查是否仍然有唯一解
            if self.count_solutions(puzzle, limit=2) == 1:
                empties += 1
                removed_positions.append((row, col, original))
            else:
                # 恢復數字
                puzzle[row][col] = original
        
        # 如果需要更多挖空，嘗試從保留的位置中挖空
        if empties < target_empties:
            filled_positions = [(i, j) for i in range(self.N) for j in range(self.N) 
                               if puzzle[i][j] != '.']
            random.shuffle(filled_positions)
            
            for row, col in filled_positions:
                if empties >= target_empties:
                    break
                
                original = puzzle[row][col]
                puzzle[row][col] = '.'
                
                if self.count_solutions(puzzle, limit=2) == 1:
                    empties += 1
                    removed_positions.append((row, col, original))
                else:
                    puzzle[row][col] = original
        
        return puzzle, empties
    
    def generate_puzzle_with_guaranteed_uniqueness(self, difficulty: str = "medium") -> Tuple[List[List[str]], List[List[str]]]:
        """生成有唯一解的數獨謎題，返回謎題和解答"""
        attempts = 0
        max_attempts = 20
        
        while attempts < max_attempts:
            # 生成完整盤面
            solution = self.generate_full_board()
            
            # 生成謎題
            puzzle, empties = self.generate_puzzle(solution, difficulty)
            
            # 驗證唯一解
            if self.count_solutions(puzzle, limit=2) == 1:
                return puzzle, solution
            
            attempts += 1
        
        # 如果多次嘗試失敗，使用更保守的方法
        solution = self.generate_full_board()
        puzzle = copy.deepcopy(solution)
        
        # 移除一些數字，確保唯一解
        positions = [(i, j) for i in range(self.N) for j in range(self.N)]
        random.shuffle(positions)
        
        # 根據難度決定保留的數字數量
        if difficulty == "easy":
            keep_count = random.randint(40, 45)
        elif difficulty == "medium":
            keep_count = random.randint(30, 35)
        else:  # hard
            keep_count = random.randint(25, 30)
        
        # 隨機保留一些數字
        keep_positions = positions[:keep_count]
        for i in range(self.N):
            for j in range(self.N):
                if (i, j) not in keep_positions:
                    puzzle[i][j] = '.'
        
        # 再次驗證唯一解
        if self.count_solutions(puzzle, limit=2) == 1:
            return puzzle, solution
        
        # 最後手段：返回較簡單的謎題
        return self.generate_puzzle_with_guaranteed_uniqueness("easy")
    
    def generate_test_cases(self) -> Dict:
        """生成測資，包括 samples 和 test_cases"""
        test_cases = {
            "samples": [],
            "test_cases": []
        }
        
        # 生成 2 個 samples（簡單難度）
        print("生成範例測資 (簡單難度)...")
        for i in range(2):
            puzzle, solution = self.generate_puzzle_with_guaranteed_uniqueness("easy")
            puzzle_str = self.board_to_string(puzzle)
            solution_str = self.board_to_string(solution)
            
            test_cases["samples"].append({
                "id": f"sample_{i+1}",
                "puzzle": puzzle_str,
                "solution": solution_str,
                "difficulty": "easy",
                "description": f"範例測資 {i+1} - 簡單難度"
            })
            print(f"範例 {i+1} 生成完成")
        
        # 生成 5 個 test_cases（不同難度）
        difficulties = ["easy", "easy", "medium", "medium", "hard"]
        print("\n生成測試測資 (不同難度)...")
        for i, difficulty in enumerate(difficulties):
            puzzle, solution = self.generate_puzzle_with_guaranteed_uniqueness(difficulty)
            puzzle_str = self.board_to_string(puzzle)
            solution_str = self.board_to_string(solution)
            
            test_cases["test_cases"].append({
                "id": f"test_{i+1}",
                "puzzle": puzzle_str,
                "solution": solution_str,
                "difficulty": difficulty,
                "description": f"測試測資 {i+1} - {difficulty}難度"
            })
            print(f"測試 {i+1} ({difficulty}) 生成完成")
        
        return test_cases
    
    def validate_test_cases(self, test_cases: Dict) -> bool:
        """驗證所有測資的唯一解性"""
        print("\n驗證測資唯一解性...")
        
        all_valid = True
        
        # 驗證 samples
        for sample in test_cases["samples"]:
            puzzle = self.string_to_board(sample["puzzle"])
            solution = self.string_to_board(sample["solution"])
            
            # 檢查解答是否正確
            for i in range(self.N):
                for j in range(self.N):
                    if puzzle[i][j] != '.' and puzzle[i][j] != solution[i][j]:
                        print(f"錯誤: {sample['id']} 的解答與謎題不一致")
                        all_valid = False
            
            # 檢查唯一解
            num_solutions = self.count_solutions(puzzle, limit=2)
            if num_solutions != 1:
                print(f"錯誤: {sample['id']} 有 {num_solutions} 個解 (應只有 1 個)")
                all_valid = False
            else:
                print(f"{sample['id']}: ✓ 唯一解驗證通過")
        
        # 驗證 test_cases
        for test in test_cases["test_cases"]:
            puzzle = self.string_to_board(test["puzzle"])
            
            # 檢查唯一解
            num_solutions = self.count_solutions(puzzle, limit=2)
            if num_solutions != 1:
                print(f"錯誤: {test['id']} 有 {num_solutions} 個解 (應只有 1 個)")
                all_valid = False
            else:
                print(f"{test['id']}: ✓ 唯一解驗證通過")
        
        return all_valid


def main():
    """主函數"""
    print("數獨測資生成器")
    print("=" * 50)
    
    # 創建生成器實例
    generator = SudokuGenerator()
    
    # 生成測資
    test_cases = generator.generate_test_cases()
    
    # 驗證測資
    is_valid = generator.validate_test_cases(test_cases)
    
    if is_valid:
        print("\n所有測資驗證成功！")
        
        # 輸出 JSON 檔案
        output_file = "/app/sudoku_test_cases.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(test_cases, f, indent=2, ensure_ascii=False)
        
        print(f"\n測資已保存至: {output_file}")
        
        # 顯示一些統計資訊
        print("\n生成統計:")
        print(f"範例測資: {len(test_cases['samples'])} 個")
        print(f"測試測資: {len(test_cases['test_cases'])} 個")
        
        # 顯示難度分佈
        difficulties = {}
        for test in test_cases["test_cases"]:
            diff = test["difficulty"]
            difficulties[diff] = difficulties.get(diff, 0) + 1
        
        print("測試測資難度分佈:")
        for diff, count in difficulties.items():
            print(f"  {diff}: {count} 個")
        
        # 顯示一個範例
        print("\n範例測資 1 預覽:")
        sample = test_cases["samples"][0]
        puzzle = generator.string_to_board(sample["puzzle"])
        generator.print_board(puzzle)
        
        return test_cases
    else:
        print("\n錯誤: 部分測資驗證失敗")
        return None


if __name__ == "__main__":
    main()