"""
Models for labs (practice sets).
"""
from django.db import models
from django.contrib.auth import get_user_model

from apps.problems.models import Problem

User = get_user_model()


class Lab(models.Model):
    """
    Lab is a curated problem set with an optional due date.
    """
    title = models.CharField(max_length=255, verbose_name="標題")
    description = models.TextField(blank=True, verbose_name="描述")
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="owned_labs",
        verbose_name="建立者",
    )
    due_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="截止時間",
        help_text="未設定則不限制作答期限",
    )
    is_published = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="是否發布",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="建立時間")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新時間")

    problems = models.ManyToManyField(
        Problem,
        through="LabProblem",
        related_name="labs",
        verbose_name="題目",
    )

    class Meta:
        db_table = "labs"
        verbose_name = "Lab"
        verbose_name_plural = "Labs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class LabProblem(models.Model):
    """
    Lab problem mapping with ordering.
    """
    lab = models.ForeignKey(
        Lab,
        on_delete=models.CASCADE,
        related_name="lab_problems",
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="lab_problems",
    )
    order = models.IntegerField(default=0, verbose_name="排序")

    class Meta:
        db_table = "lab_problems"
        verbose_name = "Lab 題目"
        verbose_name_plural = "Lab 題目"
        ordering = ["order", "id"]
        unique_together = ["lab", "problem"]

    def __str__(self) -> str:
        return f"{self.lab_id}:{self.problem_id}"
