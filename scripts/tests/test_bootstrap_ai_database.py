from pathlib import Path


def test_bootstrap_skips_sequences_owned_by_tables() -> None:
    script = (
        Path(__file__).resolve().parents[1] / "db" / "bootstrap-ai-database.sh"
    ).read_text()

    assert "relkind IN ('r', 'p', 'S', 'v', 'm', 'f')" in script
    assert "pg_depend" in script
    assert "dependency.objid = pg_class.oid" in script
