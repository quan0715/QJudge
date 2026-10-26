"""Display labels for ordered paper questions; IDs and scoring stay unchanged."""
from apps.question_bank.problem_labels import label_for_contest_problem_order


def build_paper_question_labels(questions, *, expand_question_numbers=False):
    labels = {}
    main_number = 0
    child_index = 0
    previous_group = None
    for question in questions:
        expanded = question.group_id and expand_question_numbers
        if not question.group_id or question.group_id != previous_group or expanded:
            main_number += 1
            child_index = 0
        suffix = ''
        if question.group_id and not expanded:
            suffix = f'({label_for_contest_problem_order(child_index).lower()})'
            child_index += 1
        labels[question.id] = f'{main_number}{suffix}'
        previous_group = question.group_id
    return labels
