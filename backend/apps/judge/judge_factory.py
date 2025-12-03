"""
Judge factory for multi-language support
"""
from typing import Union
from .base_judge import BaseJudge
from .docker_runner import CppJudge
from .python_judge import PythonJudge


def get_judge(language: str) -> BaseJudge:
    """
    根據語言取得對應的 Judge 實例
    
    Args:
        language: 語言名稱（不區分大小寫）
                 支援: 'cpp', 'c++', 'python', 'py'
    
    Returns:
        BaseJudge: 對應語言的 Judge 實例
    
    Raises:
        ValueError: 不支援的語言
    
    Examples:
        >>> judge = get_judge('cpp')
        >>> result = judge.execute(code, input, expected, 1000, 128)
        
        >>> judge = get_judge('python')
        >>> result = judge.execute(code, input, expected, 1000, 128)
    """
    language_map = {
        'cpp': CppJudge,
        'c++': CppJudge,
        'c': CppJudge,  # 暫時也用 C++ judge
        'python': PythonJudge,
        'py': PythonJudge,
        'python3': PythonJudge,
    }
    
    language_lower = language.lower().strip()
    judge_class = language_map.get(language_lower)
    
    if not judge_class:
        supported = ', '.join(sorted(set(language_map.keys())))
        raise ValueError(
            f"Unsupported language: '{language}'. "
            f"Supported languages: {supported}"
        )
    
    return judge_class()


def get_supported_languages():
    """
    取得所有支援的語言列表
    
    Returns:
        List[Dict]: 語言資訊列表
    """
    return [
        {
            'id': 'cpp',
            'name': 'C++',
            'display_name': 'C++ (C++20)',
            'aliases': ['c++', 'cpp', 'c'],
            'judge_class': 'CppJudge'
        },
        {
            'id': 'python',
            'name': 'Python',
            'display_name': 'Python 3.11',
            'aliases': ['python', 'py', 'python3'],
            'judge_class': 'PythonJudge'
        },
    ]
