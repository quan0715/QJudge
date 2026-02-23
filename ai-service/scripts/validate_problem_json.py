#!/usr/bin/env python3
"""
QJudge Problem JSON 驗證腳本

驗證 AI 生成的題目 JSON 是否符合 QJudge Problem API 格式。

Usage:
    python scripts/validate_problem_json.py <json_file>
    python scripts/validate_problem_json.py --stdin
    echo '{"title": "test"}' | python scripts/validate_problem_json.py --stdin
"""

import json
import sys
from pathlib import Path
from typing import Any

# ANSI color codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class ValidationError:
    def __init__(self, path: str, message: str, severity: str = "error"):
        self.path = path
        self.message = message
        self.severity = severity  # "error" or "warning"

    def __str__(self):
        color = RED if self.severity == "error" else YELLOW
        return f"{color}[{self.severity.upper()}]{RESET} {self.path}: {self.message}"


def validate_problem_json(data: dict) -> list[ValidationError]:
    """驗證題目 JSON 格式"""
    errors: list[ValidationError] = []

    # Required top-level fields
    required_fields = ["title", "difficulty"]
    for field in required_fields:
        if field not in data:
            errors.append(ValidationError(field, f"缺少必填欄位 '{field}'"))

    # Validate title
    if "title" in data:
        if not isinstance(data["title"], str) or not data["title"].strip():
            errors.append(ValidationError("title", "title 必須是非空字串"))

    # Validate difficulty
    if "difficulty" in data:
        valid_difficulties = ["easy", "medium", "hard"]
        if data["difficulty"] not in valid_difficulties:
            errors.append(
                ValidationError(
                    "difficulty",
                    f"difficulty 必須是 {valid_difficulties} 之一，目前為 '{data['difficulty']}'",
                )
            )

    # Validate time_limit
    if "time_limit" in data:
        if not isinstance(data["time_limit"], int) or data["time_limit"] <= 0:
            errors.append(ValidationError("time_limit", "time_limit 必須是正整數（毫秒）"))

    # Validate memory_limit
    if "memory_limit" in data:
        if not isinstance(data["memory_limit"], int) or data["memory_limit"] <= 0:
            errors.append(ValidationError("memory_limit", "memory_limit 必須是正整數（MB）"))

    # Validate translations
    if "translations" not in data:
        errors.append(ValidationError("translations", "缺少必填欄位 'translations'"))
    else:
        errors.extend(validate_translations(data["translations"]))

    # Validate test_cases
    if "test_cases" not in data:
        errors.append(ValidationError("test_cases", "缺少必填欄位 'test_cases'"))
    else:
        errors.extend(validate_test_cases(data["test_cases"]))

    # Validate language_configs
    if "language_configs" in data:
        errors.extend(validate_language_configs(data["language_configs"]))
    else:
        errors.append(
            ValidationError("language_configs", "建議提供 language_configs", "warning")
        )

    # Validate new_tag_names
    if "new_tag_names" in data:
        if not isinstance(data["new_tag_names"], list):
            errors.append(ValidationError("new_tag_names", "new_tag_names 必須是陣列"))
        elif not all(isinstance(t, str) for t in data["new_tag_names"]):
            errors.append(ValidationError("new_tag_names", "new_tag_names 的每個元素必須是字串"))
    else:
        errors.append(
            ValidationError("new_tag_names", "建議提供 new_tag_names 標籤", "warning")
        )

    return errors


def validate_translations(translations: Any) -> list[ValidationError]:
    """驗證 translations 欄位"""
    errors: list[ValidationError] = []

    if not isinstance(translations, list):
        errors.append(ValidationError("translations", "translations 必須是陣列"))
        return errors

    if len(translations) == 0:
        errors.append(ValidationError("translations", "translations 不能為空"))
        return errors

    # Check for zh-TW translation
    has_zh_tw = any(t.get("language") == "zh-TW" for t in translations if isinstance(t, dict))
    if not has_zh_tw:
        errors.append(ValidationError("translations", "translations 必須包含 'zh-TW' 語言版本"))

    # Validate each translation
    required_translation_fields = ["language", "title", "description", "input_description", "output_description"]
    for i, trans in enumerate(translations):
        if not isinstance(trans, dict):
            errors.append(ValidationError(f"translations[{i}]", "每個翻譯必須是物件"))
            continue

        for field in required_translation_fields:
            if field not in trans:
                errors.append(ValidationError(f"translations[{i}].{field}", f"缺少必填欄位 '{field}'"))
            elif not isinstance(trans[field], str):
                errors.append(ValidationError(f"translations[{i}].{field}", f"'{field}' 必須是字串"))
            elif not trans[field].strip():
                errors.append(ValidationError(f"translations[{i}].{field}", f"'{field}' 不能為空"))

        # Validate language code
        if "language" in trans:
            valid_languages = ["zh-TW", "en"]
            if trans["language"] not in valid_languages:
                errors.append(
                    ValidationError(
                        f"translations[{i}].language",
                        f"language 必須是 {valid_languages} 之一",
                    )
                )

    return errors


def validate_test_cases(test_cases: Any) -> list[ValidationError]:
    """驗證 test_cases 欄位"""
    errors: list[ValidationError] = []

    if not isinstance(test_cases, list):
        errors.append(ValidationError("test_cases", "test_cases 必須是陣列"))
        return errors

    if len(test_cases) == 0:
        errors.append(ValidationError("test_cases", "test_cases 不能為空"))
        return errors

    sample_count = 0
    hidden_count = 0
    hidden_score_total = 0

    required_fields = ["input_data", "output_data", "is_sample", "score"]
    for i, tc in enumerate(test_cases):
        if not isinstance(tc, dict):
            errors.append(ValidationError(f"test_cases[{i}]", "每個測試案例必須是物件"))
            continue

        for field in required_fields:
            if field not in tc:
                errors.append(ValidationError(f"test_cases[{i}].{field}", f"缺少必填欄位 '{field}'"))

        # Validate input_data and output_data
        for field in ["input_data", "output_data"]:
            if field in tc:
                if not isinstance(tc[field], str):
                    errors.append(ValidationError(f"test_cases[{i}].{field}", f"'{field}' 必須是字串"))
                elif not tc[field].endswith("\n"):
                    errors.append(
                        ValidationError(
                            f"test_cases[{i}].{field}",
                            f"'{field}' 應以換行符 '\\n' 結尾",
                            "warning",
                        )
                    )

        # Validate is_sample
        if "is_sample" in tc:
            if not isinstance(tc["is_sample"], bool):
                errors.append(ValidationError(f"test_cases[{i}].is_sample", "is_sample 必須是布林值"))
            elif tc["is_sample"]:
                sample_count += 1
            else:
                hidden_count += 1

        # Validate score
        if "score" in tc:
            if not isinstance(tc["score"], int) or tc["score"] < 0:
                errors.append(ValidationError(f"test_cases[{i}].score", "score 必須是非負整數"))
            elif not tc.get("is_sample", False):
                hidden_score_total += tc["score"]

        # Validate order (optional)
        if "order" in tc:
            if not isinstance(tc["order"], int) or tc["order"] < 0:
                errors.append(ValidationError(f"test_cases[{i}].order", "order 必須是非負整數"))

    # Check sample and hidden test counts
    if sample_count < 2:
        errors.append(
            ValidationError(
                "test_cases",
                f"建議至少 2 個範例測試案例 (is_sample=true)，目前有 {sample_count} 個",
                "warning",
            )
        )

    if hidden_count < 2:
        errors.append(
            ValidationError(
                "test_cases",
                f"建議至少 2 個隱藏測試案例 (is_sample=false)，目前有 {hidden_count} 個",
                "warning",
            )
        )

    # Check hidden test score total
    if hidden_count > 0 and hidden_score_total != 100:
        errors.append(
            ValidationError(
                "test_cases",
                f"隱藏測試案例分數總和應為 100，目前為 {hidden_score_total}",
                "warning",
            )
        )

    return errors


def validate_language_configs(configs: Any) -> list[ValidationError]:
    """驗證 language_configs 欄位"""
    errors: list[ValidationError] = []

    if not isinstance(configs, list):
        errors.append(ValidationError("language_configs", "language_configs 必須是陣列"))
        return errors

    valid_languages = ["cpp", "python", "java", "javascript", "c"]
    required_fields = ["language", "is_enabled"]

    for i, config in enumerate(configs):
        if not isinstance(config, dict):
            errors.append(ValidationError(f"language_configs[{i}]", "每個語言設定必須是物件"))
            continue

        for field in required_fields:
            if field not in config:
                errors.append(ValidationError(f"language_configs[{i}].{field}", f"缺少必填欄位 '{field}'"))

        if "language" in config and config["language"] not in valid_languages:
            errors.append(
                ValidationError(
                    f"language_configs[{i}].language",
                    f"language 必須是 {valid_languages} 之一",
                )
            )

        if "is_enabled" in config and not isinstance(config["is_enabled"], bool):
            errors.append(ValidationError(f"language_configs[{i}].is_enabled", "is_enabled 必須是布林值"))

    return errors


def main():
    # Parse arguments
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <json_file>")
        print(f"       {sys.argv[0]} --stdin")
        sys.exit(1)

    # Read JSON data
    if sys.argv[1] == "--stdin":
        try:
            data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            print(f"{RED}[ERROR]{RESET} JSON 解析失敗: {e}")
            sys.exit(1)
    else:
        json_file = Path(sys.argv[1])
        if not json_file.exists():
            print(f"{RED}[ERROR]{RESET} 檔案不存在: {json_file}")
            sys.exit(1)
        try:
            data = json.loads(json_file.read_text())
        except json.JSONDecodeError as e:
            print(f"{RED}[ERROR]{RESET} JSON 解析失敗: {e}")
            sys.exit(1)

    # Validate
    print("=" * 50)
    print(" QJudge Problem JSON 驗證")
    print("=" * 50)
    print()

    errors = validate_problem_json(data)

    # Separate errors and warnings
    error_list = [e for e in errors if e.severity == "error"]
    warning_list = [e for e in errors if e.severity == "warning"]

    # Print results
    if error_list:
        print(f"{RED}錯誤 ({len(error_list)}){RESET}")
        for e in error_list:
            print(f"  {e}")
        print()

    if warning_list:
        print(f"{YELLOW}警告 ({len(warning_list)}){RESET}")
        for e in warning_list:
            print(f"  {e}")
        print()

    # Summary
    print("=" * 50)
    if not error_list and not warning_list:
        print(f"{GREEN}✓ 驗證通過！{RESET}")
        sys.exit(0)
    elif not error_list:
        print(f"{YELLOW}⚠ 驗證通過（有 {len(warning_list)} 個警告）{RESET}")
        sys.exit(0)
    else:
        print(f"{RED}✗ 驗證失敗（{len(error_list)} 個錯誤，{len(warning_list)} 個警告）{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
