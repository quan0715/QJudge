import json
import os
from collections import defaultdict

def flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def check_i18n():
    locales_dir = 'frontend/src/i18n/locales'
    languages = ['en', 'ja', 'ko', 'zh-TW']
    namespaces = ['admin', 'chatbot', 'classroom', 'common', 'contest', 'docs', 'landing', 'problem']

    data = {}
    flattened_data = {}

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
                        print(f"Error decoding {file_path}")
            else:
                print(f"Missing file: {file_path}")

    # 1. Coverage Check
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
                    print(f"Namespace '{ns}', Language '{lang}' missing keys: {sorted(list(missing))}")
            else:
                print(f"Namespace '{ns}', Language '{lang}' is completely missing.")

    # 2. Duplicate Values Check (Same value, different keys within a namespace)
    print("\n=== 2. Duplicate Values Check (Possible merge candidates) ===")
    for ns in namespaces:
        for lang in languages:
            if ns not in flattened_data[lang]: continue
            
            val_to_keys = defaultdict(list)
            for key, val in flattened_data[lang][ns].items():
                if isinstance(val, str):
                  val_to_keys[val.lower()].append(key)
            
            duplicates = {val: keys for val, keys in val_to_keys.items() if len(keys) > 1}
            if duplicates:
                print(f"Namespace '{ns}', Language '{lang}' has duplicate values:")
                for val, keys in duplicates.items():
                    print(f"  - '{val}': {keys}")

    # 3. Cross-namespace Redundancy (Values that appear in many namespaces but could be in 'common')
    print("\n=== 3. Cross-namespace Redundancy (Candidates for 'common') ===")
    val_across_ns = defaultdict(set)
    for lang in languages:
      for ns in namespaces:
        if ns not in flattened_data[lang]: continue
        if ns == 'common': continue
        
        for key, val in flattened_data[lang][ns].items():
          if isinstance(val, str) and val.strip():
            val_across_ns[val.lower()].add(ns)
    
    potential_common = {val: ns_list for val, ns_list in val_across_ns.items() if len(ns_list) > 2}
    for val, ns_list in sorted(potential_common.items()):
      print(f"  - '{val}' appears in namespaces: {sorted(list(ns_list))}")

if __name__ == "__main__":
    check_i18n()
