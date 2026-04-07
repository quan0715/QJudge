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

def analyze_i18n():
    locales_dir = 'frontend/src/i18n/locales'
    languages = ['en', 'zh-TW', 'ja', 'ko']
    namespaces = ['admin', 'chatbot', 'classroom', 'common', 'contest', 'docs', 'landing', 'problem']

    flattened = {}
    for lang in languages:
        flattened[lang] = {}
        for ns in namespaces:
            path = f"{locales_dir}/{lang}/{ns}.json"
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    flattened[lang][ns] = flatten_dict(json.load(f))

    # 1. Global value frequency (Semantic similarity)
    # Map (lang, value) -> list of (namespace, key)
    val_map = defaultdict(list)
    for lang in languages:
        for ns, keys in flattened[lang].items():
            for k, v in keys.items():
                if isinstance(v, str):
                    val_map[(lang, v.strip().lower())].append((ns, k))

    # Identify values that appear with DIFFERENT keys but same meaning
    # e.g., 'cancel' appears as 'button.cancel' and 'modal.cancel'
    print("### Redundant Keys by Value ###")
    
    # We focus on English first as a proxy for semantics
    en_vals = defaultdict(set)
    for (lang, val), locations in val_map.items():
        if lang == 'en':
            for ns, k in locations:
                en_vals[val].add(f"{ns}.{k}")
    
    for val, keys in sorted(en_vals.items()):
        if len(keys) > 1:
            # Check if these keys also have the same value in other languages
            is_identical_everywhere = True
            other_lang_vals = {}
            for lang in languages:
                if lang == 'en': continue
                vals_for_these_keys = set()
                for ns_k in keys:
                    ns, k = ns_k.split('.', 1)
                    if ns in flattened[lang] and k in flattened[lang][ns]:
                        vals_for_these_keys.add(flattened[lang][ns][k])
                other_lang_vals[lang] = vals_for_these_keys
                if len(vals_for_these_keys) > 1:
                    is_identical_everywhere = False
            
            if is_identical_everywhere:
                print(f"Value '{val}' is identical across all languages for keys: {sorted(list(keys))}")
            else:
                print(f"Value '{val}' (EN) has DIFFERENT translations in other languages for keys: {sorted(list(keys))}")
                for lang, v_set in other_lang_vals.items():
                    print(f"  {lang}: {v_set}")

if __name__ == "__main__":
    analyze_i18n()
