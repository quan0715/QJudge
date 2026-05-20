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
from .grading import run_question_grading


DEFAULT_BACKEND_URL = os.environ.get("QJUDGE_BACKEND_URL", "http://localhost:8000")
DEFAULT_MODEL_ID = "deepseek-v4-thinking"

console = Console()
app = typer.Typer(help="QJudge Paper CLI")
auth_app = typer.Typer(help="Authentication commands")
app.add_typer(auth_app, name="auth")


def _token_cache() -> TokenCache:
    return TokenCache()


def _load_payload_or_exit() -> dict[str, Any]:
    payload = _token_cache().load()
    if not payload:
        console.print("[red]Not logged in.[/red] Run `qjudge-paper auth login` first.")
        raise typer.Exit(1)
    return payload


def _ensure_access_token(base_url: str) -> str:
    cache = _token_cache()
    payload = cache.load()
    if not payload:
        console.print("[red]Not logged in.[/red] Run `qjudge-paper auth login` first.")
        raise typer.Exit(1)
    if cache.is_access_token_fresh():
        return str(payload["access_token"])

    refresh_token = payload.get("refresh_token")
    client_id = payload.get("client_id")
    issuer = payload.get("issuer") or base_url
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
    for key in ("name", "title", "display_name", "username", "id"):
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
            resolved_classroom_id = str(classroom["id"])
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


def main() -> None:
    app()
