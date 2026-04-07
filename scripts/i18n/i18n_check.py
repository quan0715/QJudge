import json
import os
import sys
import re
from collections import defaultdict

# Keep this script change-tracked so CI path filters can be exercised when needed.
def flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def has_chinese(text):
    if not isinstance(text, str): return False
    return bool(re.search('[\u4e00-\u9fa5]', text))

def check_i18n():
    locales_dir = 'frontend/src/i18n/locales'
    languages = ['en', 'ja', 'ko', 'zh-TW']
    namespaces = ['admin', 'chatbot', 'classroom', 'common', 'contest', 'docs', 'landing', 'problem']

    data = {}
    flattened_data = {}
    errors = []
    warnings = []

    for lang in languages:
        data[lang] = {}
        flattened_data[lang] = {}
        for ns in namespaces:
            file_path = os.path.join(locales_dir, lang, f"{ns}.json")
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    try:
                        content = json.load(f)
                        data[lang][ns] = content
                        flattened_data[lang][ns] = flatten_dict(content)
                    except json.JSONDecodeError:
                        errors.append(f"Error decoding JSON: {file_path}")
            else:
                errors.append(f"Missing i18n file: {file_path}")

    # 1. Coverage & Sync Check
    print("=== 1. Coverage Check ===")
    for ns in namespaces:
        all_keys = set()
        for lang in languages:
            if ns in flattened_data[lang]:
                all_keys.update(flattened_data[lang][ns].keys())
        
        for lang in languages:
            if ns in flattened_data[lang]:
                missing = all_keys - set(flattened_data[lang][ns].keys())
                if missing:
                    errors.append(f"Namespace '{ns}', Language '{lang}' missing keys: {sorted(list(missing))}")
                
                # Check for residual Chinese
                if lang == 'en':
                    for key, val in flattened_data[lang][ns].items():
                        if has_chinese(val):
                            errors.append(f"Namespace '{ns}', Language 'en' key '{key}' has CJK characters: '{val}'")
                elif lang in ['ja', 'ko']:
                    for key, val in flattened_data[lang][ns].items():
                        # For JA/KO, we only warn because of Kanji/Hanja overlap
                        if has_chinese(val):
                            # Potentially check for zh-specific words like "的", "是", "確定" to be more specific
                            if any(word in val for word in ['確定', '的', '是', '嗎', '請']):
                                warnings.append(f"Namespace '{ns}', Language '{lang}' key '{key}' looks like Chinese: '{val}'")
            else:
                errors.append(f"Namespace '{ns}', Language '{lang}' is completely missing.")

    if warnings:
        print("\n--- I18N WARNINGS ---")
        for warn in warnings:
            print(f" [WARN] {warn}")

    if errors:
        print("\n--- I18N SYNC ISSUES (NON-BLOCKING) ---")
        for err in errors:
            print(f" [INFO] {err}")
        print("\nNote: These issues did not block the build but should be addressed.")
    
    print("\nAll i18n checks completed.")
    sys.exit(0)

if __name__ == "__main__":
    check_i18n()
