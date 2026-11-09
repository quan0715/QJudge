"""Database-free regression coverage for the coding report's actual PDF tables."""
from html.parser import HTMLParser
from pathlib import Path

from django.template.loader import render_to_string
from weasyprint import HTML


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
