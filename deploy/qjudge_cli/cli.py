"""Command-line interface for QJudge deployments."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from .addon import ACTIONS, ADDONS, run_addon
from .check import check_env
from .envfile import load
from .example import render
from .ingress import render_ingress, render_nginx
from .init import run_init
from .lint import lint_compose_text
from .release import _version, read_version, rollback, upgrade
from .stack import bootstrap_secrets

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
    addon_parser = commands.add_parser("addon", help="initialize or start bundled storage and media")
    addon_parser.add_argument("name", choices=sorted(ADDONS))
    addon_parser.add_argument("action", choices=ACTIONS)
    addon_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    init_parser = commands.add_parser("init", help="create deploy/.env for a new installation")
    init_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    init_parser.add_argument("--non-interactive", action="store_true", help="fail instead of asking for missing keys")
    init_parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="preset a key")
    upgrade_parser = commands.add_parser("upgrade", help="build, back up, migrate and start a git ref")
    upgrade_parser.add_argument("ref")
    upgrade_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    rollback_parser = commands.add_parser("rollback", help="start the previously deployed version again")
    rollback_parser.add_argument("--env-file", type=Path, default=DEPLOY_DIR / ".env")
    secrets_parser = commands.add_parser("secrets", help="create missing AI OAuth and Integrity keys")
    secrets_parser.add_argument("--image", help="backend image to run the scripts with (default: the deployed version)")
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
    if args.command == "init":
        for item in args.set:
            if "=" not in item:
                parser.error(f"--set expects KEY=VALUE: {item}")
        values = dict(item.split("=", 1) for item in args.set)
        return run_init(DEPLOY_DIR, args.env_file, values, not args.non_interactive, subprocess.run)
    if args.command in ("addon", "upgrade", "rollback") and not args.env_file.is_file():
        print(f"{args.env_file}: not found")
        return 1
    if args.command == "upgrade":
        return upgrade(DEPLOY_DIR, args.env_file, args.ref)
    if args.command == "rollback":
        return rollback(DEPLOY_DIR, args.env_file)
    if args.command == "secrets":
        current = read_version(DEPLOY_DIR).get("current")
        image = args.image or (current and f"qjudge/backend:{_version(current)}")
        if not image:
            print(f"{DEPLOY_DIR / '.version'}: no deployed version; pass --image")
            return 1
        return 0 if bootstrap_secrets(DEPLOY_DIR, image, subprocess.run) else 1
    if args.command == "addon":
        return run_addon(DEPLOY_DIR, args.env_file, load(args.env_file), args.name, args.action)
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
