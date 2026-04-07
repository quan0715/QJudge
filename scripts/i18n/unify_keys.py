import os
import re

# Mapping of old keys to new common keys
# Format: (namespace, old_key) -> new_common_key (without namespace if common is default)
replacements = {
    # Buttons / Core Actions
    ('contest', 'common.cancel'): 'button.cancel',
    ('contest', 'common.save'): 'button.save',
    ('contest', 'common.delete'): 'button.delete',
    ('contest', 'common.refresh'): 'action.refresh',
    ('contest', 'refreshing'): 'action.refreshing',
    ('contest', 'button.createContest'): 'page.createContest',
    
    ('problem', 'button.cancel'): 'button.cancel',
    ('problem', 'button.createProblem'): 'page.createProblem',
    ('problem', 'button.save'): 'button.save',
    
    ('chatbot', 'widget.renameModal.cancel'): 'button.cancel',
    ('chatbot', 'widget.deleteModal.cancel'): 'button.cancel',
    ('chatbot', 'approval.cancel'): 'button.cancel',
    ('chatbot', 'widget.deleteModal.submit'): 'button.delete',
    ('chatbot', 'widget.renameModal.submit'): 'button.save',
    
    ('classroom', 'announcement.modal.cancel'): 'button.cancel',
    ('classroom', 'bindContest.modal.cancel'): 'button.cancel',

    # Table headers
    ('contest', 'participants.headers.actions'): 'table.actions',
    ('contest', 'submissions.actions'): 'table.actions',
    ('contest', 'participantsAdmin.headers.actions'): 'table.actions',
}

# Directories to search
search_dirs = ['frontend/src']

def perform_replacements():
    count = 0
    for root, dirs, files in os.walk('frontend/src'):
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = content
                for (ns, old_key), new_key in replacements.items():
                    # Pattern 1: t('namespace.key') or t("namespace.key")
                    # Note: namespaces are often used like t('contest:common.cancel') 
                    # or if const { t } = useTranslation('contest'), then t('common.cancel')
                    
                    # Case 1: Explicit namespace in call: t('contest:common.cancel')
                    pattern1 = rf"t\(['\"]{ns}:{old_key}['\"]\)"
                    new_content = re.sub(pattern1, f"t('{new_key}')", new_content)
                    
                    # Case 2: Implicit namespace via hook: const { t } = useTranslation('contest')
                    # This is harder to do perfectly without a parser, but we can look for the hook in the same file.
                    if f"useTranslation('{ns}')" in content or f"useTranslation(\"{ns}\")" in content:
                        pattern2 = rf"t\(['\"]{old_key}['\"]\)"
                        new_content = re.sub(pattern2, f"t('{new_key}')", new_content)

                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {path}")
                    count += 1
    print(f"Total files updated: {count}")

if __name__ == "__main__":
    perform_replacements()
