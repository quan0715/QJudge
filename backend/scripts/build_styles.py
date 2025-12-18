#!/usr/bin/env python3
"""
Design tokens → SCSS variables → CSS compilation pipeline.

Usage:
    python scripts/build_styles.py

This script:
1. Loads design tokens from styles/tokens.json
2. Generates SCSS variables file
3. Compiles SCSS to CSS (if sass is available)
4. Outputs CSS and hash file for cache busting
"""
import json
import hashlib
import subprocess
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STYLES_DIR = BASE_DIR / 'styles'
OUTPUT_DIR = BASE_DIR / 'static' / 'exports'


def load_tokens() -> dict:
    """Load design tokens from JSON file."""
    tokens_path = STYLES_DIR / 'tokens.json'
    if not tokens_path.exists():
        raise FileNotFoundError(f"tokens.json not found at {tokens_path}")

    with open(tokens_path) as f:
        return json.load(f)


def generate_scss_variables(tokens: dict) -> str:
    """Convert tokens to SCSS variables."""
    lines = ['// Auto-generated from tokens.json - DO NOT EDIT', '']

    for category, values in tokens.items():
        lines.append(f'// {category.upper()}')
        for name, value in values.items():
            # Convert name to SCSS variable format
            scss_name = f"${category}-{name}".replace('_', '-')
            lines.append(f'{scss_name}: {value};')
        lines.append('')

    return '\n'.join(lines)


def generate_css_variables(tokens: dict) -> str:
    """Convert tokens to CSS custom properties."""
    lines = [':root {']

    for category, values in tokens.items():
        lines.append(f'  /* {category.upper()} */')
        for name, value in values.items():
            # Convert name to CSS custom property format
            css_name = f"--{category}-{name}".replace('_', '-')
            lines.append(f'  {css_name}: {value};')
        lines.append('')

    lines.append('}')
    return '\n'.join(lines)


def compile_scss() -> str:
    """Compile SCSS using sass CLI if available."""
    scss_path = STYLES_DIR / 'report-print.scss'

    if not scss_path.exists():
        print(f"Warning: {scss_path} not found, skipping SCSS compilation")
        return None

    # Check if sass is available
    if not shutil.which('sass'):
        print("Warning: sass not found in PATH, skipping SCSS compilation")
        return None

    try:
        result = subprocess.run(
            ['sass', '--style=compressed', str(scss_path)],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"SCSS compilation error: {e.stderr}")
        raise


def compute_hash(content: str) -> str:
    """Compute SHA256 hash of content (first 12 chars)."""
    return hashlib.sha256(content.encode()).hexdigest()[:12]


def main():
    print("Building styles...")

    # 1. Load tokens
    tokens = load_tokens()
    print(f"  Loaded {sum(len(v) for v in tokens.values())} tokens")

    # 2. Generate SCSS variables
    scss_variables = generate_scss_variables(tokens)
    variables_path = STYLES_DIR / '_variables.scss'
    variables_path.write_text(scss_variables)
    print(f"  Generated {variables_path}")

    # 3. Generate CSS variables (fallback if SCSS not available)
    css_variables = generate_css_variables(tokens)

    # 4. Try SCSS compilation or use CSS variables as fallback
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    compiled_css = compile_scss()
    if compiled_css:
        css_content = compiled_css
        print("  Compiled SCSS to CSS")
    else:
        # Fallback: just output CSS variables
        css_content = css_variables
        print("  Using CSS variables fallback (no SCSS compilation)")

    # 5. Output CSS and hash
    css_path = OUTPUT_DIR / 'report-print.css'
    css_path.write_text(css_content)

    css_hash = compute_hash(css_content)
    hash_path = OUTPUT_DIR / 'report-print.css.hash'
    hash_path.write_text(css_hash)

    print(f"  Output: {css_path}")
    print(f"  Hash: {css_hash}")
    print("Done!")


if __name__ == '__main__':
    main()
