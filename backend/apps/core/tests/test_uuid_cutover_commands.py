"""Exercise the operator-facing cutover reports, not private helper structure."""
import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.core.management import uuid_cutover
from apps.core.management.commands import verify_uuid_cutover


@pytest.mark.django_db
def test_preflight_baseline_can_be_verified(tmp_path):
    output = StringIO()
    baseline = tmp_path / 'baseline.json'
    call_command('preflight_uuid_cutover', output=str(baseline), stdout=output)
    before = json.loads(baseline.read_text())
    assert 'question_assets' in before['row_counts']
    assert before['pk_types']

    output = StringIO()
    call_command('verify_uuid_cutover', baseline=str(baseline), stdout=output)
    after = json.loads(output.getvalue())
    assert after['pk_types'] == before['pk_types']
    assert after['int_fk_candidates'] == before['int_fk_candidates']
    assert all(item['delta'] == 0 for item in after['row_count_diffs'])
    assert len(after['row_count_diffs']) == len(before['row_counts'])


@pytest.mark.parametrize('command', ['preflight_uuid_cutover', 'verify_uuid_cutover'])
def test_fail_on_issues_still_rejects_integer_primary_keys(monkeypatch, command):
    monkeypatch.setattr(uuid_cutover, 'collect_row_counts', lambda tables: {})
    monkeypatch.setattr(uuid_cutover, 'collect_pk_types', lambda: [
        {'table_name': 'problems', 'udt_name': 'int8'},
    ])
    monkeypatch.setattr(uuid_cutover, 'collect_int_fk_candidates', lambda: [])
    monkeypatch.setattr(verify_uuid_cutover.Command, '_collect_orphan_counts', lambda self: [])
    with pytest.raises(CommandError):
        call_command(command, fail_on_issues=True, stdout=StringIO())
