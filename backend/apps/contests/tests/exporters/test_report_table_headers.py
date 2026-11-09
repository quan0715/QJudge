"""Database-free regression coverage for the coding report's actual PDF tables."""
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace

from django.template.loader import render_to_string
from weasyprint import HTML
from apps.contests.exporters.renderers.student_report import StudentReportRenderer


class TableHeaders(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = 0
        self.headings = 0

    def handle_starttag(self, tag, attrs):
        self.tables += tag == 'table'
        self.headings += tag == 'th'


def test_coding_result_tables_have_headers_on_every_printed_page():
    item = {
        'label': 'A', 'score': 30, 'max_score': 100,
        'ac_count': 0, 'wa_count': 3, 'status_icon': '◐',
    }
    context = {
        'title': '題目繳交狀況', 'column1': [item] * 80, 'column2': [item] * 80,
        'headers': {
            'problem': '題號', 'score': '得分 / 配分', 'ac': 'AC',
            'non_ac': '非 AC', 'result': '結果',
        },
    }
    html = render_to_string('exports/partials/student_report/problem_grid.html', context)
    parser = TableHeaders()
    parser.feed(html)
    assert parser.tables == 2
    assert parser.headings >= 10
    root = Path(__file__).resolve().parents[2]
    css = (root / 'static/exports/report-base.css').read_text()
    css += (root / 'static/exports/student-report.css').read_text()
    doc = HTML(string=f'<style>{css}</style>{html}').render()
    assert len(doc.pages) > 1

    def text(box):
        return ' '.join([getattr(box, 'text', '')] + [text(c) for c in box.all_children()])

    assert all('非 AC' in text(page._page_box) for page in doc.pages)


def test_coding_result_icons_render_four_distinct_status_colors():
    renderer = StudentReportRenderer(contest=None, user=None)
    renderer._data_service = SimpleNamespace(get_contest_problems=lambda: [
        SimpleNamespace(problem_id=label, max_score=100, problem=SimpleNamespace(label=label))
        for label in 'ABCD'
    ])
    renderer._standings_cache = SimpleNamespace(user_stats=SimpleNamespace(problems={
        'A': SimpleNamespace(status='AC', score=100, max_score=100),
        'B': SimpleNamespace(status='WA', score=30, max_score=100),
        'C': SimpleNamespace(status='WA', score=0, max_score=100),
    }))
    renderer._submissions_cache = [
        SimpleNamespace(problem_id='A', status='AC'),
        SimpleNamespace(problem_id='B', status='WA'),
        SimpleNamespace(problem_id='C', status='WA'),
    ]
    root = Path(__file__).resolve().parents[2]
    css = (root / 'static/exports/student-report.css').read_text()
    doc = HTML(string=f'<style>{css}</style>{renderer._render_problem_grid()}').render()
    icons = {}

    def collect(box):
        value = getattr(box, 'text', '').strip()
        if value in {'✓', '◐', '✗', '—'}:
            icons[value] = box.style['color'].coordinates
        for child in box.all_children():
            collect(child)

    for page in doc.pages:
        collect(page._page_box)
    assert set(icons) == {'✓', '◐', '✗', '—'}
    assert len(set(icons.values())) == 4
    red, green, blue = icons['✓']
    assert green > red and green > blue
    red, green, blue = icons['◐']
    assert red > green > blue
    red, green, blue = icons['✗']
    assert red > 2 * green and red > 2 * blue
    red, green, blue = icons['—']
    assert red == green == blue
