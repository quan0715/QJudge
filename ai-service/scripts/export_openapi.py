"""Export the canonical OpenAPI contract with deterministic formatting."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import create_app


def schema_bytes() -> bytes:
    return (
        json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"
    ).encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(schema_bytes())


if __name__ == "__main__":
    main()
