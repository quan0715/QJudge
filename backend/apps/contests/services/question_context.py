"""Complete question text for consumers that display one child at a time."""


def question_prompt_with_context(question) -> str:
    """Keep editable prompts separate; include shared instructions for grading/export."""
    if not question.group_id:
        return question.prompt or ''
    group = question.group
    context = '\n\n'.join(part for part in (
        f'### {group.title.strip()}' if group.title.strip() else '',
        group.shared_stem_markdown.strip(),
    ) if part)
    if not context:
        return question.prompt or ''
    return f'{context}\n\n---\n\n{question.prompt or ""}'
