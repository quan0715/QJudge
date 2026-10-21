"""Display labels for zero-based contest problem orders."""


def label_for_contest_problem_order(order: int) -> str:
    label = ""
    number = order + 1
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        label = chr(65 + remainder) + label
    return label
