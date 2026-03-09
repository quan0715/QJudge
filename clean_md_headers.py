import os
import re

dir_path = "/Users/quan/online_judge/frontend/public/docs/zh-TW/"
pattern = re.compile(r"^# .*\n\n> 文件狀態：.*\n\n", re.MULTILINE)

files = [f for f in os.listdir(dir_path) if f.endswith(".md")]

for filename in files:
    file_path = os.path.join(dir_path, filename)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check if it matches the pattern at the very beginning
    if content.startswith("# "):
        # Use re.sub with count=1 to only replace the first occurrence at the start
        # Actually, let's be more specific to ensure it's at the start
        new_content = re.sub(r"^# .*\n+(\r?\n)*> 文件狀態：.*\n+(\r?\n)*", "", content, count=1)
        
        if new_content != content:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Cleaned {filename}")
        else:
            # Maybe the pattern is slightly different (e.g. only one newline)
            # Try a more lenient match if the strict one failed but it starts with H1
            new_content = re.sub(r"^# .*\n+> 文件狀態：.*\n+", "", content, count=1)
            if new_content != content:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Cleaned {filename} (lenient)")
            else:
                print(f"Skipped {filename} (no match)")
    else:
        print(f"Skipped {filename} (no H1 at start)")
