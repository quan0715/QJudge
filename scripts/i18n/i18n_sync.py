import json
import os

def deep_update(base, source):
    for k, v in source.items():
        if isinstance(v, dict) and k in base and isinstance(base[k], dict):
            deep_update(base[k], v)
        else:
            if k not in base:
                base[k] = v
    return base

def sync_i18n():
    locales_dir = 'frontend/src/i18n/locales'
    base_lang = 'zh-TW'
    target_langs = ['en', 'ja', 'ko']
    namespaces = ['admin', 'chatbot', 'classroom', 'common', 'contest', 'docs', 'landing', 'problem']

    for ns in namespaces:
        base_path = os.path.join(locales_dir, base_lang, f"{ns}.json")
        if not os.path.exists(base_path): continue
        
        with open(base_path, 'r', encoding='utf-8') as f:
            base_content = json.load(f)

        for lang in target_langs:
            target_path = os.path.join(locales_dir, lang, f"{ns}.json")
            if os.path.exists(target_path):
                with open(target_path, 'r', encoding='utf-8') as f:
                    target_content = json.load(f)
            else:
                target_content = {}

            # Update target with missing keys from base
            updated_content = deep_update(target_content, base_content)
            
            # Sort keys for consistency
            def sort_dict(d):
                return {k: sort_dict(v) if isinstance(v, dict) else v for k, v in sorted(d.items())}
            
            sorted_content = sort_dict(updated_content)

            with open(target_path, 'w', encoding='utf-8') as f:
                json.dump(sorted_content, f, ensure_ascii=False, indent=2)
            print(f"Synced {lang}/{ns}.json")

if __name__ == "__main__":
    sync_i18n()
