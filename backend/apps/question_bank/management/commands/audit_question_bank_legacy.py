from __future__ import annotations

import json
from dataclasses import asdict, dataclass

from django.core.management.base import BaseCommand, CommandError

from apps.question_bank.models import (
    ContestQuestionBinding,
    Question,
    QuestionBankMembership,
    QuestionCodingExt,
)


@dataclass(frozen=True)
class AuditMetric:
    count: int
    sample_ids: list[str]


class Command(BaseCommand):
    help = "Audit remaining legacy question-bank adapter data before dropping legacy schema."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json",
            action="store_true",
            help="Emit machine-readable JSON output.",
        )
        parser.add_argument(
            "--sample-size",
            type=int,
            default=5,
            help="Number of sample ids to include for each blocker metric.",
        )

    def handle(self, *args, **options):
        sample_size = max(0, int(options.get("sample_size") or 0))
        metrics = self._collect_metrics(sample_size=sample_size)
        blockers = {
            key: metric
            for key, metric in metrics.items()
            if metric.count > 0
        }

        payload = {
            "status": "FAIL" if blockers else "PASS",
            "metrics": {key: asdict(metric) for key, metric in metrics.items()},
            "blockers": sorted(blockers.keys()),
            "next_step": (
                "Run/verify backfill_question_assets, remove runtime legacy references, then re-run this audit."
                if blockers
                else "Legacy question-bank adapter data is clear for schema-drop planning."
            ),
        }

        if options.get("json"):
            self.stdout.write(json.dumps(payload, indent=2, sort_keys=True))
        else:
            self._write_human_report(payload)

        if blockers:
            raise CommandError(
                "Question-bank legacy audit failed; blockers remain: "
                + ", ".join(sorted(blockers.keys()))
            )

    def _collect_metrics(self, *, sample_size: int) -> dict[str, AuditMetric]:
        return {
            "legacy_questions": self._metric(Question.objects.order_by("id"), sample_size),
            "legacy_coding_ext": self._metric(QuestionCodingExt.objects.order_by("question_id"), sample_size, field="question_id"),
            "memberships_with_legacy_question": self._metric(
                QuestionBankMembership.objects.filter(legacy_question_id__isnull=False).order_by("id"),
                sample_size,
            ),
            "contest_bindings_with_legacy_exam_question": self._metric(
                ContestQuestionBinding.objects.filter(legacy_exam_question_id__isnull=False).order_by("id"),
                sample_size,
            ),
            "memberships_without_asset": self._metric(
                QuestionBankMembership.objects.filter(question_asset_id__isnull=True).order_by("id"),
                sample_size,
            ),
            "memberships_without_latest_version": self._metric(
                QuestionBankMembership.objects.filter(question_asset__latest_version_id__isnull=True).order_by("id"),
                sample_size,
            ),
        }

    @staticmethod
    def _metric(queryset, sample_size: int, *, field: str = "id") -> AuditMetric:
        sample_ids = [
            str(value)
            for value in queryset.values_list(field, flat=True)[:sample_size]
        ]
        return AuditMetric(count=queryset.count(), sample_ids=sample_ids)

    def _write_human_report(self, payload: dict) -> None:
        self.stdout.write("=== Question Bank Legacy Audit ===")
        self.stdout.write(f"status={payload['status']}")
        self.stdout.write("")

        for key, metric in payload["metrics"].items():
            samples = ", ".join(metric["sample_ids"]) if metric["sample_ids"] else "-"
            self.stdout.write(f"{key}={metric['count']} sample_ids={samples}")

        self.stdout.write("")
        if payload["blockers"]:
            self.stdout.write(self.style.ERROR("Blockers:"))
            for blocker in payload["blockers"]:
                self.stdout.write(f"- {blocker}")
        else:
            self.stdout.write(self.style.SUCCESS("No legacy blockers found."))

        self.stdout.write("")
        self.stdout.write(payload["next_step"])
