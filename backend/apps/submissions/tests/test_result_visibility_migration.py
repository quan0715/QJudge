"""The previous release must still insert results after a code-only rollback."""
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.problems.models import CodingProblem, TestCase as ProblemTestCase
from apps.submissions.models import Submission, SubmissionResult
from apps.users.models import User


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('start', ['0003_align_legacy_schema', '0004_preserve_result_visibility'])
def test_old_result_writer_survives_visibility_upgrade(start):
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    old_apps = executor.loader.project_state([('submissions', '0003_align_legacy_schema')]).apps
    old_result = old_apps.get_model('submissions', 'SubmissionResult')
    assert 'is_hidden' not in {field.name for field in old_result._meta.fields}

    try:
        executor.migrate([('submissions', start)])
        start_apps = executor.loader.project_state([('submissions', start)]).apps
        start_result = start_apps.get_model('submissions', 'SubmissionResult')
        user = User.objects.create_user(username='rollback-writer', email='rollback@example.com')
        problem = CodingProblem.objects.create(slug='rollback-case', created_by=user)
        submission = Submission.objects.create(user=user, problem=problem, language='python', code='print(1)')
        public = ProblemTestCase.objects.create(problem=problem, input_data='', output_data='1', is_hidden=False)
        hidden = ProblemTestCase.objects.create(problem=problem, input_data='', output_data='2', is_hidden=True)
        records = []
        for case in [public, hidden, None]:
            values = {'submission_id': submission.pk, 'test_case_id': case.pk if case else None, 'status': 'AC'}
            if start == '0004_preserve_result_visibility':
                values['is_hidden'] = case.is_hidden if case else True
            records.append(start_result.objects.create(**values))

        if start == '0004_preserve_result_visibility':
            # A later test-case edit must not rewrite existing result snapshots.
            public.is_hidden = True
            public.save(update_fields=['is_hidden'])
            hidden.is_hidden = False
            hidden.save(update_fields=['is_hidden'])

        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        # Preserve 0004's existing snapshots/backfill, including missing test cases.
        assert list(SubmissionResult.objects.filter(pk__in=[r.pk for r in records]).order_by('pk').values_list('is_hidden', flat=True)) == [False, True, True]

        # This historical ORM generates the same INSERT column list as main,
        # omitting the new non-null column. No schema rollback is performed.
        inserted = old_result.objects.create(submission_id=submission.pk, test_case_id=public.pk, status='AC')
        assert SubmissionResult.objects.get(pk=inserted.pk).is_hidden is True
        # New writers can still explicitly publish public-case visibility.
        current = SubmissionResult.objects.create(submission=submission, test_case=public, status='AC', is_hidden=False)
        assert SubmissionResult.objects.get(pk=current.pk).is_hidden is False
    finally:
        # Leave the shared test database at its original migration leaves.
        MigrationExecutor(connection).migrate(latest)
