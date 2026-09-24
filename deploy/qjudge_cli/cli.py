"""Command-line interface for QJudge deployments."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .check import check_env
from .envfile import load
from .example import render
from .ingress import render_ingress, render_nginx
from .lint import lint_compose_text

DEPLOY_DIR = Path(__file__).resolve().parent.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qjudge")
    commands = parser.add_subparsers(dest="command", required=True)
    check_parser = commands.add_parser("check", help="validate deploy/.env")
    check_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    commands.add_parser("env-example", help="print the .env.example generated from the schema")
    lint_parser = commands.add_parser("lint-compose", help="check compose files against the schema")
    lint_parser.add_argument("files", type=Path, nargs="+")
    ingress_parser = commands.add_parser("ingress", help="list the entry points to configure outside QJudge")
    ingress_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    ingress_parser.add_argument("--nginx", action="store_true", help="print a reverse proxy server block")
    args = parser.parse_args(argv)

    if args.command == "env-example":
        sys.stdout.write(render())
        return 0
    if args.command == "lint-compose":
        return _lint(args.files)
    if args.command == "ingress":
        env = load(args.env_file)
        sys.stdout.write(render_nginx(env) if args.nginx else render_ingress(env))
        return 0
    return _check(args.env_file)


def _check(env_file: Path) -> int:
    if not env_file.is_file():
        print(f"{env_file}: not found")
        return 1
    errors = check_env(load(env_file))
    for error in errors:
        print(error)
    if errors:
        print(f"{len(errors)} problem(s) in {env_file}")
        return 1
    print(f"{env_file}: OK")
    return 0


def _lint(files: list[Path]) -> int:
    failed = False
    for path in files:
        for problem in lint_compose_text(path.read_text(encoding="utf-8")):
            print(f"{path}: {problem}")
            failed = True
    return 1 if failed else 0
