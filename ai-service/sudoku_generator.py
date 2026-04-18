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
from typing import List, Tuple, Optional, Dict


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
    
    def find_empty(self, board: List[List[str]]) -> Optional[Tuple[int, int]]:
        """尋找空白格子"""
        for i in range(self.N):
            for j in range(self.N):
                if board[i][j] == '.':
                    return (i, j)
        return None
    
    def solve_sudoku(self, board: List[List[str]]) -> bool:
        """使用回溯法求解數獨，返回是否有解"""
        def solve(board_copy):
            empty = self.find_empty(board_copy)
            if not empty:
                return True
            
            row, col = empty
            
            # 隨機嘗試數字增加多樣性
            numbers = list("123456789")
            random.shuffle(numbers)
            
            for num in numbers:
                if self.is_valid(board_copy, row, col, num):
                    board_copy[row][col] = num
                    if solve(board_copy):
                        return True
                    board_copy[row][col] = '.'
            
            return False
        
        # 創建副本避免修改原盤面
        board_copy = copy.deepcopy(board)
        return solve(board_copy)
    
    def count_solutions(self, board: List[List[str]], limit: int = 2) -> int:
        """計算數獨的解的數量，最多計算到 limit 個"""
        def count_helper(board_copy):
            empty = self.find_empty(board_copy)
            if not empty:
                return 1
            
            row, col = empty
            total = 0
            
            for num in "123456789":
                if self.is_valid(board_copy, row, col, num):
                    board_copy[row][col] = num
                    total += count_helper(board_copy)
                    board_copy[row][col] = '.'
                    
                    if total >= limit:
                        return limit
            
            return total
        
        board_copy = copy.deepcopy(board)
        return count_helper(board_copy)
    
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
        def fill_remaining(board):
            for i in range(self.N):
                for j in range(self.N):
                    if board[i][j] == '.':
                        nums = list("123456789")
                        random.shuffle(nums)
                        for num in nums:
                            if self.is_valid(board, i, j, num):
                                board[i][j] = num
                                if fill_remaining(board):
                                    return True
                                board[i][j] = '.'
                        return False
            return True
        
        fill_remaining(board)
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
            target_empties = random.randint(35, 45)  # 35-45 個空白
        elif difficulty == "medium":
            target_empties = random.randint(46, 54)  # 46-54 個空白
        else:  # hard
            target_empties = random.randint(55, 60)  # 55-60 個空白
        
        # 隨機順序挖空
        positions = [(i, j) for i in range(self.N) for j in range(self.N)]
        random.shuffle(positions)
        
        empties = 0
        
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
            else:
                # 恢復數字
                puzzle[row][col] = original
        
        return puzzle, empties
    
    def generate_puzzle_with_guaranteed_uniqueness(self, difficulty: str = "medium") -> Tuple[List[List[str]], List[List[str]]]:
        """生成有唯一解的數獨謎題，返回謎題和解答"""
        # 生成完整盤面
        solution = self.generate_full_board()
        
        # 生成謎題
        puzzle, empties = self.generate_puzzle(solution, difficulty)
        
        # 確保有唯一解
        if self.count_solutions(puzzle, limit=2) != 1:
            # 如果沒有唯一解，調整難度
            return self.generate_puzzle_with_guaranteed_uniqueness("easy" if difficulty == "hard" else "easy")
        
        return puzzle, solution
    
    def generate_test_cases(self) -> Dict:
        """生成測資，包括 samples 和 test_cases"""
        test_cases = {
            "samples": [],
            "test_cases": []
        }
        
        print("生成範例測資 (簡單難度)...")
        # 生成 2 個 samples（簡單難度）
        for i in range(2):
            puzzle, solution = self.generate_puzzle_with_guaranteed_uniqueness("easy")
            puzzle_str = self.board_to_string(puzzle)
            solution_str = self.board_to_string(solution)
            
            test_cases["samples"].append({
                "id": f"sample_{i+1}",
                "puzzle": puzzle_str,
                "solution": solution_str,
                "difficulty": "easy",
                "empties": sum(1 for c in puzzle_str if c == '.'),
                "description": f"範例測資 {i+1} - 簡單難度"
            })
            print(f"範例 {i+1} 生成完成")
        
        print("\n生成測試測資 (不同難度)...")
        # 生成 5 個 test_cases（不同難度）
        difficulties = ["easy", "medium", "medium", "hard", "hard"]
        for i, difficulty in enumerate(difficulties):
            puzzle, solution = self.generate_puzzle_with_guaranteed_uniqueness(difficulty)
            puzzle_str = self.board_to_string(puzzle)
            solution_str = self.board_to_string(solution)
            
            test_cases["test_cases"].append({
                "id": f"test_{i+1}",
                "puzzle": puzzle_str,
                "solution": solution_str,
                "difficulty": difficulty,
                "empties": sum(1 for c in puzzle_str if c == '.'),
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
            valid_solution = True
            for i in range(self.N):
                for j in range(self.N):
                    if puzzle[i][j] != '.' and puzzle[i][j] != solution[i][j]:
                        print(f"錯誤: {sample['id']} 的解答與謎題不一致")
                        all_valid = False
                        valid_solution = False
                        break
                if not valid_solution:
                    break
            
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
        
        # 顯示統計資訊
        print("\n生成統計:")
        print(f"範例測資: {len(test_cases['samples'])} 個")
        print(f"測試測資: {len(test_cases['test_cases'])} 個")
        
        # 顯示難度分佈
        difficulties = {}
        for test in test_cases["test_cases"]:
            diff = test["difficulty"]
            difficulties[diff] = difficulties.get(diff, 0) + 1
        
        print("測試測資難度分佈:")
        for diff, count in sorted(difficulties.items()):
            print(f"  {diff}: {count} 個")
        
        # 顯示一個範例
        if test_cases["samples"]:
            print("\n範例測資 1 預覽:")
            sample = test_cases["samples"][0]
            print(f"ID: {sample['id']}")
            print(f"難度: {sample['difficulty']}")
            print(f"空白格數: {sample['empties']}")
            print("盤面:")
            puzzle = generator.string_to_board(sample["puzzle"])
            generator.print_board(puzzle)
        
        return test_cases
    else:
        print("\n錯誤: 部分測資驗證失敗")
        return None


if __name__ == "__main__":
    main()