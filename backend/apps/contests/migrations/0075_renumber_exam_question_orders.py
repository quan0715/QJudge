"""Renumber duplicate ExamQuestion orders before adding the unique constraint.

The exam editor used to send explicit ``order`` values from the client
when creating / duplicating questions, and the backend honoured them
without checking for collisions. Existing contests therefore can have
multiple ``ExamQuestion`` rows sharing the same ``order``, which shows
up in the question stats gallery as duplicate ``Q0``, ``Q1`` cards.

We renumber every contest's questions to a contiguous ``0..N-1`` range
here. The follow-up migration (``0076``) adds the deferrable
``UniqueConstraint`` so this state can't reappear.
"""

from django.db import migrations


def renumber_existing(apps, schema_editor):
    ExamQuestion = apps.get_model("contests", "ExamQuestion")

    contest_ids = list(
        ExamQuestion.objects.values_list("contest_id", flat=True).distinct()
    )

    for contest_id in contest_ids:
        questions = list(
            ExamQuestion.objects.filter(contest_id=contest_id)
            .order_by("order", "created_at", "id")
        )
        if not questions:
            continue

        plan = [
            (q.pk, new_order)
            for new_order, q in enumerate(questions)
            if q.order != new_order
        ]
        if not plan:
            continue

        # Two-pass write: shift to a disjoint negative range first so we
        # never collide while re-allocating final orders.
        for new_order, q in enumerate(questions):
            ExamQuestion.objects.filter(pk=q.pk).update(order=-1 - new_order)
        for new_order, q in enumerate(questions):
            ExamQuestion.objects.filter(pk=q.pk).update(order=new_order)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0074_exam_evidence_frame"),
    ]

    operations = [
        migrations.RunPython(renumber_existing, noop_reverse),
    ]
