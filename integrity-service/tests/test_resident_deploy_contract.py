"""Production deployment must start and check the sole Resident runtime."""

from pathlib import Path


def test_deploy_uses_resident_credentials_and_readiness():
    script = (Path(__file__).resolve().parents[2] / "scripts/deploy-prod.sh").read_text()
    assert "bootstrap_integrity_secrets.py --resident-gid 10001" in script
    assert '"Integrity resident" "integrity-resident" "http://localhost:8011/ready"' in script
    assert "integrity-worker-image" not in script
    assert "integrity-controller" not in script
