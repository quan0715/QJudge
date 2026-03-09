import os
import re

def clean_markdown(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if not lines:
        return

    modified = False
    
    # Terms to look for in blockquotes
    status_terms = ["文件狀態", "Document Status", "ステータス", "문서 상태"]
    
    # 1. Remove the first line if it's an H1 header
    # We skip leading blank lines to find the first actual content line
    first_content_idx = -1
    for i, line in enumerate(lines):
        if line.strip():
            first_content_idx = i
            break
            
    if first_content_idx != -1 and lines[first_content_idx].startswith('# '):
        # Mark for removal
        del lines[first_content_idx]
        modified = True
        
        # 2. Look for an "immediately following" blockquote
        # Skip blank lines after H1
        next_content_idx = -1
        for i in range(first_content_idx, len(lines)):
            if lines[i].strip():
                next_content_idx = i
                break
        
        if next_content_idx != -1 and lines[next_content_idx].startswith('> '):
            if any(term in lines[next_content_idx] for term in status_terms):
                del lines[next_content_idx]
                modified = True

    # 3. Remove any leading blank lines
    while lines and not lines[0].strip():
        lines.pop(0)
        modified = True

    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Cleaned: {file_path}")

def main():
    docs_dir = 'frontend/public/docs'
    for root, dirs, files in os.walk(docs_dir):
        for file in files:
            if file.endswith('.md'):
                clean_markdown(os.path.join(root, file))

if __name__ == "__main__":
    main()
