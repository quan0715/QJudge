"""
Base Judge interface for multi-language support
"""
from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseJudge(ABC):
    """
    抽象 Judge 基類，定義所有語言 Judge 的共同介面
    
    所有語言的 Judge 都應繼承此類並實作 execute 方法
    """
    
    @abstractmethod
    def execute(
        self,
        code: str,
        input_data: str,
        expected_output: str,
        time_limit: int,  # milliseconds
        memory_limit: int  # MB
    ) -> Dict[str, Any]:
        """
        執行代碼並評測
        
        Args:
            code: 原始碼
            input_data: 標準輸入
            expected_output: 預期輸出
            time_limit: 時間限制（毫秒）
            memory_limit: 記憶體限制（MB）
        
        Returns:
            Dict with keys:
                - status: str - AC, WA, TLE, CE, RE, SE, MLE
                - output: str - 程式輸出
                - error: str - 錯誤訊息
                - time: int - 執行時間（毫秒）
                - memory: int - 記憶體使用（KB）
        """
        pass
    
    @abstractmethod
    def get_language_name(self) -> str:
        """返回語言名稱，例如 'C++', 'Python'"""
        pass
    
    @abstractmethod
    def get_language_version(self) -> str:
        """返回語言版本，例如 'C++20', 'Python 3.11'"""
        pass
