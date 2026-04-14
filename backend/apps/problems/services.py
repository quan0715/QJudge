from django.db import transaction
from django.utils.text import slugify

from .models import CodingProblem, Problem, TestCase, LanguageConfig, Tag
import uuid


class ProblemService:
    @staticmethod
    def _clone_related(source_problem: CodingProblem, new_problem: CodingProblem) -> None:
        test_cases = source_problem.test_cases.all()
        for tc in test_cases:
            TestCase.objects.create(
                problem=new_problem,
                input_data=tc.input_data,
                output_data=tc.output_data,
                is_sample=tc.is_sample,
                score=tc.score,
                weight_percent=tc.weight_percent,
                order=tc.order,
                is_hidden=tc.is_hidden
            )

        configs = source_problem.language_configs.all()
        for config in configs:
            LanguageConfig.objects.create(
                problem=new_problem,
                language=config.language,
                template_code=config.template_code,
                is_enabled=config.is_enabled,
                order=config.order
            )

        if source_problem.tags.exists():
            new_problem.tags.set(source_problem.tags.all())

    @staticmethod
    def _ensure_unique_slug(base_slug: str, *, current_problem_id=None) -> str:
        base_slug = base_slug or "problem"
        slug = base_slug
        while CodingProblem.objects.filter(slug=slug).exclude(id=current_problem_id).exists():
            slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
        return slug

    @staticmethod
    def build_slug_from_title(title: str | None) -> str:
        raw_title = (title or "problem").strip().lower()
        slug_base = ''.join(c if c.isalnum() or c in '-_' else '-' for c in raw_title).strip('-')
        if not slug_base:
            slug_base = f"problem-{uuid.uuid4().hex[:8]}"
        return ProblemService._ensure_unique_slug(slug_base)

    @staticmethod
    def resolve_tags(*, existing_tag_ids=None, new_tag_names=None):
        if existing_tag_ids is None and new_tag_names is None:
            return None

        all_tags = []

        if existing_tag_ids:
            existing_tags = Tag.objects.filter(id__in=existing_tag_ids)
            all_tags.extend(existing_tags)

        if new_tag_names:
            unique_names = set()
            for name in new_tag_names:
                cleaned_name = str(name or "").strip()
                if cleaned_name:
                    unique_names.add(cleaned_name)

            for name in unique_names:
                tag_slug = slugify(name)
                if not tag_slug:
                    tag_slug = f"tag-{uuid.uuid4().hex[:8]}"

                tag, _ = Tag.objects.get_or_create(
                    slug=tag_slug,
                    defaults={'name': name}
                )
                all_tags.append(tag)

        return all_tags

    @staticmethod
    def replace_related(
        problem: CodingProblem,
        *,
        test_cases_data=None,
        language_configs_data=None,
    ) -> None:
        if test_cases_data is not None:
            problem.test_cases.all().delete()
            for tc_data in test_cases_data:
                TestCase.objects.create(problem=problem, **tc_data)

        if language_configs_data is not None:
            problem.language_configs.all().delete()
            for lc_data in language_configs_data:
                LanguageConfig.objects.create(problem=problem, **lc_data)

    @staticmethod
    @transaction.atomic
    def create_problem_adapter(
        *,
        validated_data,
        content_fields=None,
        test_cases_data=None,
        language_configs_data=None,
        existing_tag_ids=None,
        new_tag_names=None,
    ) -> CodingProblem:
        from apps.question_bank.question_assets import write_coding_content_to_asset

        content_fields = content_fields or {}
        test_cases_data = test_cases_data or []
        language_configs_data = language_configs_data or []

        # Pop content fields (owned by QuestionAsset, not CodingProblem)
        title = validated_data.pop("title", "")
        difficulty = validated_data.pop("difficulty", "medium")

        if not validated_data.get('slug'):
            validated_data['slug'] = ProblemService.build_slug_from_title(title)

        # 1. Resolve content for Asset
        owner = validated_data.get("created_by")

        prompt = content_fields.get("description", "")

        # 2. Write content to QuestionAsset first (source of truth)
        question_asset, question_version = write_coding_content_to_asset(
            owner=owner,
            title=title,
            prompt=prompt,
            difficulty=difficulty,
            content_fields=content_fields,
            time_limit=validated_data.get("time_limit", 1000),
            memory_limit=validated_data.get("memory_limit", 128),
            test_cases=[dict(tc) for tc in test_cases_data],
            language_configs=[dict(lc) for lc in language_configs_data],
            forbidden_keywords=validated_data.get("forbidden_keywords", []),
            required_keywords=validated_data.get("required_keywords", []),
            actor=owner,
        )

        # 3. Create CodingProblem with Asset link
        validated_data["question_asset"] = question_asset
        validated_data["question_version"] = question_version
        problem = CodingProblem.objects.create(**validated_data)

        # 4. Create execution-related objects
        ProblemService.replace_related(
            problem,
            test_cases_data=test_cases_data,
            language_configs_data=language_configs_data,
        )

        tags = ProblemService.resolve_tags(
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )
        if tags is not None:
            problem.tags.set(tags)

        return problem

    @staticmethod
    @transaction.atomic
    def update_problem_adapter(
        instance: CodingProblem,
        *,
        validated_data,
        content_fields=None,
        test_cases_data=None,
        language_configs_data=None,
        existing_tag_ids=None,
        new_tag_names=None,
    ) -> CodingProblem:
        from apps.question_bank.question_assets import (
            extract_content_from_payload,
            write_coding_content_to_asset,
        )

        content_fields = content_fields or {}

        # Pop content fields (owned by QuestionAsset, not CodingProblem)
        title = validated_data.pop("title", None)
        difficulty = validated_data.pop("difficulty", None)

        # Resolve current title/difficulty from asset for fallback
        current_title = ""
        current_difficulty = "medium"
        if instance.question_asset_id:
            try:
                current_title = instance.question_asset.title or ""
                current_difficulty = (instance.question_asset.payload or {}).get("difficulty", "medium")
            except Exception:
                pass
        title = title if title is not None else current_title
        difficulty = difficulty if difficulty is not None else current_difficulty

        if 'slug' in validated_data and not validated_data.get('slug'):
            validated_data['slug'] = ProblemService.build_slug_from_title(title)

        # 1. Update Problem's local execution fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        ProblemService.replace_related(
            instance,
            test_cases_data=test_cases_data if test_cases_data else None,
            language_configs_data=language_configs_data if language_configs_data else None,
        )

        tags = ProblemService.resolve_tags(
            existing_tag_ids=existing_tag_ids,
            new_tag_names=new_tag_names,
        )
        if tags is not None:
            instance.tags.set(tags)

        # 2. Write content to QuestionAsset (source of truth)
        owner = instance.created_by

        # Merge provided content_fields with existing payload (backward compat)
        existing_payload = (instance.question_asset.payload or {}) if instance.question_asset_id else {}
        effective_content = extract_content_from_payload(existing_payload)
        # Merge: provided fields override existing
        merged_content = {**effective_content, **{k: v for k, v in content_fields.items() if v}}
        prompt = merged_content.get("description", "")

        effective_test_cases = test_cases_data if test_cases_data else list(
            instance.test_cases.values(
                "input_data", "output_data", "is_sample",
                "score", "weight_percent", "order", "is_hidden",
            )
        )
        effective_lang_configs = language_configs_data if language_configs_data else list(
            instance.language_configs.values(
                "language", "template_code", "is_enabled", "order",
            )
        )

        question_asset, question_version = write_coding_content_to_asset(
            owner=owner,
            title=title,
            prompt=prompt,
            difficulty=difficulty,
            content_fields=merged_content,
            time_limit=instance.time_limit,
            memory_limit=instance.memory_limit,
            test_cases=effective_test_cases,
            language_configs=effective_lang_configs,
            forbidden_keywords=instance.forbidden_keywords or [],
            required_keywords=instance.required_keywords or [],
            legacy_problem_id=str(instance.id),
            existing_asset=instance.question_asset,
            actor=owner,
        )

        # Update the problem's asset link to the new version
        instance.question_asset = question_asset
        instance.question_version = question_version
        instance.save(update_fields=["question_asset", "question_version"])

        return instance

    @staticmethod
    @transaction.atomic
    def clone_problem(source_problem: CodingProblem, contest, created_by) -> CodingProblem:
        """
        Clone a problem for a specific contest.
        Source problem must already have a QuestionAsset (guaranteed by Phase 0).
        """
        if not source_problem.question_asset_id:
            from apps.question_bank.question_assets import ensure_problem_question_asset
            ensure_problem_question_asset(problem=source_problem, actor=created_by)

        new_problem = CodingProblem.objects.create(
            slug=f"{source_problem.slug}-{contest.id}-copy",
            time_limit=source_problem.time_limit,
            memory_limit=source_problem.memory_limit,
            created_by=created_by,
            question_asset=source_problem.question_asset,
            question_version=source_problem.question_version,
        )

        if CodingProblem.objects.filter(slug=new_problem.slug).exclude(id=new_problem.id).exists():
            new_problem.slug = f"{source_problem.slug}-{contest.id}-{uuid.uuid4().hex[:8]}"
            new_problem.save()

        ProblemService._clone_related(source_problem, new_problem)

        return new_problem

    @staticmethod
    @transaction.atomic
    def create_contest_problem(contest, created_by, title="New Problem") -> CodingProblem:
        """
        Create a new empty problem for a contest.
        Creates the QuestionAsset first (source of truth), then the Problem.
        """
        from apps.question_bank.question_assets import write_coding_content_to_asset

        slug = f"contest-{contest.id}-problem-{uuid.uuid4().hex[:8]}"

        question_asset, question_version = write_coding_content_to_asset(
            owner=created_by,
            title=title,
            prompt="",
            difficulty="medium",
            content_fields={},
            actor=created_by,
        )

        problem = CodingProblem.objects.create(
            slug=slug,
            created_by=created_by,
            question_asset=question_asset,
            question_version=question_version,
        )
        return problem
