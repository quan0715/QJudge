"""Database-free regression coverage for literal paper-exam answers."""
from types import SimpleNamespace

import pytest
from weasyprint import HTML

from apps.contests.exporters.renderers.paper_exam_report import PaperExamReportRenderer
from apps.contests.models import ExamQuestion


PLAIN_ANSWER = (
    'a * b * c; *value*\n'
    'cout << "<value>"; a < b && b > c;\n'
    '\n'
    '    a*=2;  i++;  j=i;\n'
    '\treturn  0;\n'
    '<script>alert("literal")</script>\n'
    '<img src="not-a-real-image" onerror="alert(1)">'
)


def render_answer(text, answer_format='plain_text', *, include_grading=True):
    renderer = PaperExamReportRenderer(None, None, include_grading=include_grading)
    question = ExamQuestion(
        question_type='essay',
        answer_format=answer_format,
        correct_answer='**Reference**',
        explanation='*Explanation*',
    )
    answer = SimpleNamespace(answer={'text': text})
    return renderer, renderer._render_subjective_question(question, answer)


@pytest.mark.parametrize('include_grading', [True, False])
def test_plain_text_answer_preserves_literal_syntax_and_whitespace(include_grading):
    _, rendered = render_answer(PLAIN_ANSWER, include_grading=include_grading)

    assert 'a * b * c; *value*\n' in rendered
    assert 'cout &lt;&lt; &quot;&lt;value&gt;&quot;; a &lt; b &amp;&amp; b &gt; c;' in rendered
    assert '\n\n    a*=2;  i++;  j=i;\n\treturn  0;\n' in rendered
    assert '&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt;' in rendered
    assert '&lt;img src=&quot;not-a-real-image&quot; onerror=&quot;alert(1)&quot;&gt;' in rendered
    assert '<script>' not in rendered
    assert '<img ' not in rendered
    assert '<em>value</em>' not in rendered


@pytest.mark.parametrize('answer_format', ['markdown', 'markdown_math', 'open_document'])
def test_non_plain_text_answers_retain_existing_markdown_rendering(answer_format):
    _, rendered = render_answer('*value* **strong**', answer_format)

    assert '<em>value</em> <strong>strong</strong>' in rendered


def test_plain_text_format_does_not_change_reference_or_explanation_rendering():
    _, rendered = render_answer('*literal*')

    assert '<strong>Reference</strong>' in rendered
    assert '<em>Explanation</em>' in rendered


def test_plain_text_pdf_layout_keeps_indentation_and_blank_lines():
    renderer, fragment = render_answer(
        'a * b * c; *value*\n\n    a*=2;  i++;  j=i;\ncout << "<value>";',
        include_grading=False,
    )
    # Use the real report stylesheet and WeasyPrint layout, not a CSS string assertion.
    document = HTML(string=f'<style>{renderer._get_report_css()}</style>{fragment}').render()
    lines = [
        box for page in document.pages for box in page._page_box.descendants()
        if type(box).__name__ == 'TextBox'
    ]
    texts = [box.text for box in lines]
    assert 'a * b * c; *value*' in texts
    assert '    a*=2;  i++;  j=i;' in texts
    assert 'cout << "<value>";' in texts
    first = next(box for box in lines if box.text == 'a * b * c; *value*')
    indented = next(box for box in lines if box.text == '    a*=2;  i++;  j=i;')
    following = next(box for box in lines if box.text == 'cout << "<value>";')
    assert indented.position_y - first.position_y == pytest.approx(
        2 * (following.position_y - indented.position_y)
    )
    assert document.write_pdf().startswith(b'%PDF-')
