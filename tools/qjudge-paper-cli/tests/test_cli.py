from pathlib import Path

from typer.testing import CliRunner

from qjudge_paper_cli.app import app


def test_auth_status_reports_logged_out(tmp_path: Path):
    runner = CliRunner()

    result = runner.invoke(
        app,
        ["auth", "status"],
        env={"QJUDGE_PAPER_TOKEN_CACHE": str(tmp_path / "auth.json")},
    )

    assert result.exit_code == 1
    assert "Not logged in" in result.output
