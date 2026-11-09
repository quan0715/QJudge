"""Database-free coverage for report scores and their actual rendered SVG."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from apps.contests.exporters.renderers.student_report import StudentReportRenderer


def test_cumulative_score_includes_partial_points_and_never_counts_twice():
    start = datetime(2026, 11, 9, tzinfo=timezone.utc)
    renderer = object.__new__(StudentReportRenderer)
    renderer.scale = 1
    renderer.language = 'zh-TW'
    renderer.contest = SimpleNamespace(start_time=start, end_time=start + timedelta(hours=1))
    renderer._data_service = SimpleNamespace(get_contest_problems=lambda: [SimpleNamespace(problem_id=str(i), max_score=100) for i in range(5)])
    renderer.get_label = lambda key: key
    def sub(problem, status, score, minute):
        return SimpleNamespace(problem_id=str(problem), status=status, score=score, created_at=start+timedelta(minutes=minute))
    submissions = [sub(i, 'AC', 100, i+1) for i in range(4)] + [sub(4,'WA',30,8),sub(4,'WA',10,9),sub(0,'AC',100,10),sub(4,'SE',100,11),sub(4,'pending',100,12)]
    svg = renderer._generate_cumulative_chart_svg(submissions)
    assert 'data-final-score="430"' in svg
    assert 'data-solved="4"' in svg
    assert 'score_line' in svg
    assert 'solved_line' not in svg


def test_empty_score_trend_has_an_explicit_empty_state():
    renderer = object.__new__(StudentReportRenderer)
    renderer.scale = 1
    renderer.get_label = lambda key: key
    assert 'no_submissions' in renderer._generate_cumulative_chart_svg([])


def test_ac_uses_current_allocation_even_when_historical_partial_is_higher():
    start = datetime(2026, 11, 9, tzinfo=timezone.utc)
    renderer = object.__new__(StudentReportRenderer)
    renderer.scale = 1
    renderer.contest = SimpleNamespace(start_time=start,end_time=start+timedelta(hours=1))
    renderer.get_label = lambda key: key
    renderer._data_service = SimpleNamespace(get_contest_problems=lambda:[SimpleNamespace(problem_id='a',max_score=50)])
    submissions = [SimpleNamespace(problem_id='a',status='WA',score=80,created_at=start),SimpleNamespace(problem_id='a',status='AC',score=100,created_at=start+timedelta(minutes=10))]
    svg=renderer._generate_cumulative_chart_svg(submissions)
    assert 'data-final-score="50"' in svg
    assert 'data-solved="1"' in svg
    assert '>0:15<' in svg
    from xml.etree import ElementTree
    path = ElementTree.fromstring(svg).find('{http://www.w3.org/2000/svg}path').attrib['d']
    assert all(float(point.split(',')[1]) >= 20 for point in path[1:].split(' L'))
