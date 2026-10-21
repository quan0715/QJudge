"""Database-free checks for the shared PDF conversion boundary."""
import sys
from unittest.mock import patch

import pytest

from apps.contests.exporters.renderers.pdf import PDFRenderer
from apps.contests.exporters.renderers.student_report import StudentReportRenderer
from apps.contests.exporters.renderers.paper_exam_report import PaperExamReportRenderer
from apps.contests.exporters.renderers.paper_exam_sheet import PaperExamSheetRenderer
from apps.contests.exporters.utils import render_pdf, scale_css_pixels


@pytest.mark.parametrize('renderer_class', [
    PDFRenderer, StudentReportRenderer, PaperExamReportRenderer, PaperExamSheetRenderer,
])
def test_renderer_returns_readable_pdf(renderer_class):
    renderer = object.__new__(renderer_class)
    with patch.object(renderer, 'render_html', return_value='<h1>Export smoke test</h1>'):
        result = renderer.export()
    assert result.tell() == 0
    assert result.read().startswith(b'%PDF-')


def test_missing_pdf_dependency_reports_actionable_error():
    with patch.dict(sys.modules, {'weasyprint': None}):
        with pytest.raises(RuntimeError, match='WeasyPrint requires system libraries'):
            render_pdf('<p>test</p>')


def test_conversion_failure_is_not_hidden():
    with patch('weasyprint.HTML.write_pdf', side_effect=ValueError('conversion failed')):
        with pytest.raises(ValueError, match='conversion failed'):
            render_pdf('<p>test</p>')


def test_scale_pixels_preserves_other_units():
    assert scale_css_pixels('margin: -2px 1.5px; width: 50%; height: 2em;', 1.5) == (
        'margin: -3.0px 2.25px; width: 50%; height: 2em;'
    )
