"""Database-free checks for the shared PDF conversion boundary."""
import sys
from unittest.mock import patch

import pytest

from apps.contests.exporters.renderers.student_report import StudentReportRenderer
from apps.contests.exporters.utils import render_pdf, scale_css_pixels


def test_pdf_stream_is_readable_from_start():
    result = render_pdf('<h1>Export smoke test</h1>')
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


def test_report_scale_is_bounded():
    for requested, expected in [(0.1, 0.5), (5.0, 2.0), (1.2, 1.2)]:
        assert StudentReportRenderer(None, None, scale=requested).scale == expected
