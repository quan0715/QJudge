from __future__ import annotations

import json
import os
import time
import webbrowser
from pathlib import Path
from typing import Any

import typer
from rich.console import Console
from rich.table import Table

from .api import QJudgeApiClient
from .auth import (
    DEFAULT_SCOPE,
    OAuthConfig,
    TokenCache,
    create_loopback_server,
    create_pkce_pair,
    create_state,
    exchange_authorization_code,
    refresh_access_token,
    register_public_client,
    token_payload_with_expiry,
    wait_for_oauth_callback,
)
from .comparison import (
    compare_grade_files,
    parse_candidate_spec,
    write_comparison_outputs,
)
from .experiment import (
    DEFAULT_EXPERIMENT_MODELS,
    EXPERIMENT_PRESETS,
    run_grading_experiment,
)
from .grading import run_question_grading


DEFAULT_BACKEND_URL = os.environ.get("QJUDGE_BACKEND_URL", "http://localhost:8000")
DEFAULT_MODEL_ID = "deepseek-v4-flash"

console = Console()
app = typer.Typer(help="QJudge Paper CLI", pretty_exceptions_show_locals=False)
auth_app = typer.Typer(
    help="Authentication commands",
    pretty_exceptions_show_locals=False,
)
experiment_app = typer.Typer(
    help="Experiment commands",
    pretty_exceptions_show_locals=False,
)
app.add_typer(auth_app, name="auth")
app.add_typer(experiment_app, name="experiment")


def _token_cache() -> TokenCache:
    return TokenCache()


def _load_payload_or_exit() -> dict[str, Any]:
    payload = _token_cache().load()
    if not payload:
        console.print("[red]Not logged in.[/red] Run `qjudge-paper auth login` first.")
        raise typer.Exit(1)
    return payload


def _ensure_access_token(base_url: str, *, force_refresh: bool = False) -> str:
    cache = _token_cache()
    payload = cache.load()
    if not payload:
        console.print("[red]Not logged in.[/red] Run `qjudge-paper auth login` first.")
        raise typer.Exit(1)
    if not force_refresh and cache.is_access_token_fresh():
        return str(payload["access_token"])

    refresh_token = payload.get("refresh_token")
    client_id = payload.get("client_id")
    issuer = base_url.rstrip("/")
    if not refresh_token or not client_id:
        console.print("[red]Stored credentials cannot be refreshed.[/red]")
        raise typer.Exit(1)
    token_response = refresh_access_token(
        issuer=str(issuer),
        client_id=str(client_id),
        refresh_token=str(refresh_token),
    )
    next_payload = token_payload_with_expiry(
        issuer=str(issuer),
        client_id=str(client_id),
        token_response={
            **token_response,
            "refresh_token": token_response.get("refresh_token") or refresh_token,
        },
    )
    cache.save(next_payload)
    return str(next_payload["access_token"])


@auth_app.command("login")
def auth_login(
    backend_url: str = typer.Option(
        DEFAULT_BACKEND_URL,
        "--backend-url",
        help="QJudge backend/OAuth issuer base URL.",
    ),
) -> None:
    issuer = backend_url.rstrip("/")
    server, redirect_uri = create_loopback_server()
    verifier, challenge = create_pkce_pair()
    state = create_state()
    client_id = register_public_client(issuer=issuer, redirect_uri=redirect_uri)
    auth_url = OAuthConfig(
        issuer=issuer,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=DEFAULT_SCOPE,
    ).authorization_url(code_challenge=challenge, state=state)

    console.print("Opening browser for QJudge OAuth login...")
    console.print(auth_url)
    webbrowser.open(auth_url)
    code = wait_for_oauth_callback(server, expected_state=state)
    token_response = exchange_authorization_code(
        issuer=issuer,
        client_id=client_id,
        code=code,
        redirect_uri=redirect_uri,
        code_verifier=verifier,
    )
    payload = token_payload_with_expiry(
        issuer=issuer,
        client_id=client_id,
        token_response=token_response,
    )
    _token_cache().save(payload)
    console.print("[green]Logged in.[/green]")


@auth_app.command("status")
def auth_status() -> None:
    payload = _token_cache().load()
    if not payload:
        console.print("Not logged in.")
        raise typer.Exit(1)
    table = Table("Field", "Value")
    table.add_row("issuer", str(payload.get("issuer", "")))
    table.add_row("client_id", str(payload.get("client_id", "")))
    table.add_row("scope", str(payload.get("scope", "")))
    table.add_row("fresh", "yes" if _token_cache().is_access_token_fresh() else "no")
    console.print(table)


@auth_app.command("logout")
def auth_logout() -> None:
    _token_cache().delete()
    console.print("Logged out.")


def _item_label(item: dict[str, Any]) -> str:
    for key in (
        "name",
        "title",
        "contest_name",
        "prompt",
        "display_name",
        "username",
        "uuid",
        "contest_id",
        "id",
    ):
        value = item.get(key)
        if value:
            return str(value)
    contest = item.get("contest")
    if isinstance(contest, dict):
        return _item_label(contest)
    return json.dumps(item, ensure_ascii=False)[:80]


def _select(label: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    if not items:
        raise RuntimeError(f"No options available for {label}")
    try:
        import questionary

        choices = [
            questionary.Choice(title=_item_label(item), value=item)
            for item in items
        ]
        selected = questionary.select(label, choices=choices).ask()
        if selected is None:
            raise typer.Exit(1)
        return selected
    except ImportError:
        console.print(label)
        for index, item in enumerate(items, start=1):
            console.print(f"{index}. {_item_label(item)}")
        selected_index = typer.prompt("Select", type=int)
        return items[selected_index - 1]


def _contest_id(bound_contest: dict[str, Any]) -> str:
    contest = bound_contest.get("contest")
    if isinstance(contest, dict) and contest.get("id"):
        return str(contest["id"])
    for key in ("contest_id", "id"):
        if bound_contest.get(key):
            return str(bound_contest[key])
    raise RuntimeError("Could not resolve contest id")


def _classroom_api_id(classroom: dict[str, Any]) -> str:
    for key in ("uuid", "id"):
        value = classroom.get(key)
        if value:
            return str(value)
    raise RuntimeError("Could not resolve classroom id")


def _resolve_classroom_api_id(
    client: QJudgeApiClient,
    classroom_id: str,
) -> str:
    classrooms = client.list_classrooms()
    for classroom in classrooms:
        if (
            str(classroom.get("uuid")) == classroom_id
            or str(classroom.get("id")) == classroom_id
        ):
            return _classroom_api_id(classroom)
    return classroom_id


def _user_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            user = data.get("user")
            if isinstance(user, dict) and user.get("id") is not None:
                return str(user["id"])
        if payload.get("id") is not None:
            return str(payload["id"])
    return None


@app.command("grade")
def grade(
    backend_url: str = typer.Option(DEFAULT_BACKEND_URL, "--backend-url"),
    classroom_id: str | None = typer.Option(None, "--classroom-id"),
    contest_id: str | None = typer.Option(None, "--contest-id"),
    question_id: str | None = typer.Option(None, "--question-id"),
    model_id: str = typer.Option(DEFAULT_MODEL_ID, "--model-id"),
    output_dir: Path | None = typer.Option(None, "--output-dir"),
    yes: bool = typer.Option(False, "--yes", "-y"),
) -> None:
    access_token = _ensure_access_token(backend_url)
    client = QJudgeApiClient(base_url=backend_url, access_token=access_token)
    try:
        current_user = client.get_json("/api/v1/auth/me")
        resolved_classroom_id = classroom_id
        resolved_contest_id = contest_id
        resolved_question_id = question_id

        if not resolved_classroom_id:
            classroom = _select("Select classroom", client.list_classrooms())
            resolved_classroom_id = _classroom_api_id(classroom)
        else:
            resolved_classroom_id = _resolve_classroom_api_id(
                client,
                resolved_classroom_id,
            )
        if not resolved_contest_id:
            exam = _select(
                "Select exam",
                client.list_classroom_exams(resolved_classroom_id),
            )
            resolved_contest_id = _contest_id(exam)
        if not resolved_question_id:
            question = _select(
                "Select subjective question",
                client.list_subjective_questions(resolved_contest_id),
            )
            resolved_question_id = str(question["id"])

        if not yes:
            console.print(
                "This run is read-only: it will not write official exam grades."
            )
            if not typer.confirm("Start AI grading?"):
                raise typer.Exit(1)

        target_dir = output_dir or Path(
            "reports/qjudge-paper"
        ) / resolved_contest_id / resolved_question_id / time.strftime("%Y%m%d-%H%M%S")
        result = run_question_grading(
            client=client,
            classroom_id=resolved_classroom_id,
            contest_id=resolved_contest_id,
            question_id=resolved_question_id,
            model_id=model_id,
            output_dir=target_dir,
            user_id=_user_id(current_user),
        )
        console.print("[green]AI grading run completed.[/green]")
        console.print(f"Session: {result['session_id']}")
        console.print(f"Run: {result['run_id']}")
        console.print(f"Output: {target_dir}")
    finally:
        client.close()


@app.command("compare")
def compare(
    human_baseline: Path = typer.Option(
        ...,
        "--human-baseline",
        help="Path to human_baseline.csv exported by `qjudge-paper grade`.",
    ),
    candidate: list[str] = typer.Option(
        ...,
        "--candidate",
        "-c",
        help="Candidate grade file as candidate_id=/path/to/grade.csv.",
    ),
    output_csv: Path = typer.Option(
        Path("summary.csv"),
        "--output-csv",
        help="Path for merged comparison rows.",
    ),
    metrics_json: Path | None = typer.Option(
        None,
        "--metrics-json",
        help="Path for aggregate metrics JSON. Defaults beside output CSV.",
    ),
) -> None:
    candidate_paths: dict[str, Path] = {}
    for value in candidate:
        try:
            candidate_id, path = parse_candidate_spec(value)
        except ValueError as exc:
            raise typer.BadParameter(str(exc), param_hint="--candidate") from exc
        candidate_paths[candidate_id] = path

    summary_rows, metrics = compare_grade_files(
        human_baseline_path=human_baseline,
        candidate_grade_paths=candidate_paths,
    )
    resolved_metrics_json = metrics_json or output_csv.with_suffix(".metrics.json")
    write_comparison_outputs(
        summary_rows=summary_rows,
        metrics=metrics,
        output_csv=output_csv,
        metrics_json=resolved_metrics_json,
    )
    console.print("[green]Comparison completed.[/green]")
    console.print(f"Rows: {len(summary_rows)}")
    console.print(f"Summary: {output_csv}")
    console.print(f"Metrics: {resolved_metrics_json}")


def _preset_or_exit(preset: str | None) -> dict[str, Any]:
    if not preset:
        return {}
    config = EXPERIMENT_PRESETS.get(preset)
    if not config:
        available = ", ".join(sorted(EXPERIMENT_PRESETS))
        raise typer.BadParameter(
            f"Unknown preset '{preset}'. Available presets: {available}",
            param_hint="--preset",
        )
    return config


def _ordered_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return unique_values


def _parse_run_pairs(values: list[str] | None) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for value in values or []:
        if ":" not in value:
            raise typer.BadParameter(
                "Run pair must use QUESTION_ID:MODEL_ID.",
                param_hint="--run-pair",
            )
        question_id, model_id = [part.strip() for part in value.split(":", 1)]
        if not question_id or not model_id:
            raise typer.BadParameter(
                "Run pair must include both QUESTION_ID and MODEL_ID.",
                param_hint="--run-pair",
            )
        pairs.append((question_id, model_id))
    return pairs


@experiment_app.command("run")
def experiment_run(
    backend_url: str = typer.Option(DEFAULT_BACKEND_URL, "--backend-url"),
    classroom_id: str | None = typer.Option(None, "--classroom-id"),
    contest_id: str | None = typer.Option(None, "--contest-id"),
    question_id: list[str] | None = typer.Option(None, "--question-id"),
    model_id: list[str] | None = typer.Option(None, "--model-id"),
    run_pair: list[str] | None = typer.Option(
        None,
        "--run-pair",
        help=(
            "Exact question/model run pair as QUESTION_ID:MODEL_ID. "
            "Can be repeated for recovery runs."
        ),
    ),
    preset: str | None = typer.Option(
        None,
        "--preset",
        help=(
            "Experiment preset. Current built-in preset: "
            + ", ".join(sorted(EXPERIMENT_PRESETS))
        ),
    ),
    output_dir: Path = typer.Option(
        Path("reports/qjudge-paper-experiments"),
        "--output-dir",
    ),
    dataset_dir: Path | None = typer.Option(
        None,
        "--dataset-dir",
        help="Optional local exported exam dataset directory.",
    ),
    run_name: str | None = typer.Option(None, "--run-name"),
    concurrency: int = typer.Option(
        1,
        "--concurrency",
        min=1,
        help="Number of question/model runs to execute in parallel.",
    ),
    dry_run: bool = typer.Option(False, "--dry-run"),
    yes: bool = typer.Option(False, "--yes", "-y"),
) -> None:
    preset_config = _preset_or_exit(preset)
    resolved_run_pairs = _parse_run_pairs(run_pair)
    resolved_contest_id = contest_id or preset_config.get("contest_id")
    if not resolved_contest_id:
        raise typer.BadParameter(
            "Provide --contest-id or use a preset with a contest id.",
            param_hint="--contest-id",
        )

    pair_question_ids = _ordered_unique(
        [pair_question_id for pair_question_id, _ in resolved_run_pairs]
    )
    pair_model_ids = _ordered_unique(
        [pair_model_id for _, pair_model_id in resolved_run_pairs]
    )
    if resolved_run_pairs:
        resolved_question_ids = list(question_id or pair_question_ids)
        resolved_model_ids = list(model_id or pair_model_ids)
    else:
        resolved_question_ids = list(
            question_id or preset_config.get("question_ids") or []
        )
        resolved_model_ids = list(model_id or DEFAULT_EXPERIMENT_MODELS)

    if not resolved_question_ids:
        raise typer.BadParameter(
            "Provide at least one --question-id, --run-pair, or use a preset with question ids.",
            param_hint="--question-id",
        )

    if not resolved_model_ids:
        raise typer.BadParameter(
            "Provide at least one --model-id or --run-pair.",
            param_hint="--model-id",
        )

    table = Table("Question ID", "Model ID")
    display_pairs = resolved_run_pairs or [
        (resolved_question_id, resolved_model_id)
        for resolved_question_id in resolved_question_ids
        for resolved_model_id in resolved_model_ids
    ]
    for resolved_question_id, resolved_model_id in display_pairs:
        table.add_row(resolved_question_id, resolved_model_id)
    console.print(table)
    console.print(f"Experiment runs: {len(display_pairs)}")
    console.print(f"Concurrency: {concurrency}")
    if dataset_dir:
        console.print(f"Dataset: {dataset_dir}")
    console.print("This run is read-only: it will not write official exam grades.")
    if dry_run:
        console.print("[yellow]Dry run only; no OAuth or AI grading run started.[/yellow]")
        return
    if not yes and not typer.confirm("Start experiment?"):
        raise typer.Exit(1)

    access_token = _ensure_access_token(backend_url)
    client = QJudgeApiClient(base_url=backend_url, access_token=access_token)
    try:
        current_user = client.get_json("/api/v1/auth/me")
        result = run_grading_experiment(
            client=client,
            classroom_id=classroom_id,
            contest_id=str(resolved_contest_id),
            question_ids=resolved_question_ids,
            model_ids=resolved_model_ids,
            output_root=output_dir,
            user_id=_user_id(current_user),
            preset=preset,
            exam_key=preset_config.get("exam_key"),
            run_name=run_name,
            dataset_dir=dataset_dir,
            concurrency=concurrency,
            client_factory=lambda: QJudgeApiClient(
                base_url=backend_url,
                access_token=_ensure_access_token(backend_url, force_refresh=True),
            ),
            run_pairs=resolved_run_pairs or None,
        )
        summary = json.loads(Path(result["summary_json"]).read_text(encoding="utf-8"))
        console.print("[green]Experiment completed.[/green]")
        console.print(f"Output: {result['experiment_dir']}")
        console.print(f"Summary CSV: {result['summary_csv']}")
        console.print(f"Runs: {summary['completed_count']}/{summary['run_count']}")
        console.print(f"Total cost: {summary['total_cost_cents']} cents")
        console.print(f"Total elapsed: {summary['total_elapsed_seconds']} seconds")
    finally:
        client.close()


def main() -> None:
    app()
