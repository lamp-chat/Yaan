from __future__ import annotations

import argparse
import re
from pathlib import Path


def iter_target_files(root: Path) -> list[Path]:
    # Avoid rewriting dependencies, IDE metadata, caches, and built assets.
    ex_dirs = {
        ".git",
        ".venv",
        ".idea",
        "__pycache__",
        "exportToHTML",
        "node_modules",
        "dist",
        "build",
    }
    ex_files = {"users.db"}
    ex_prefixes = {"secrets"}
    ex_suffixes = {".db", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"}

    exts = {".py", ".html", ".js", ".jsx", ".css", ".md", ".txt"}

    out: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if any(part in ex_dirs for part in rel.parts):
            continue
        if rel.parts and rel.parts[0] in ex_prefixes:
            continue
        # Skip compiled frontend bundles under static/spa/assets (kept as build output).
        if len(rel.parts) >= 3 and rel.parts[0] == "static" and rel.parts[1] == "spa" and rel.parts[2] == "assets":
            continue
        if p.name in ex_files:
            continue
        if p.suffix.lower() in ex_suffixes:
            continue
        if p.suffix.lower() not in exts:
            continue
        out.append(p)
    return out


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bulk rename the app brand across source files.")
    p.add_argument("--from", dest="old", default="yaan", help="Old brand string (default: yaan)")
    p.add_argument("--to", dest="new", default="yaan", help="New brand string (default: yaan)")
    p.add_argument(
        "--mode",
        choices=("literal", "token"),
        default="token",
        help=(
            "Replacement mode. "
            "'literal' does a raw substring replace. "
            "'token' replaces brand tokens (won't change e.g. 'Petrosyan')."
        ),
    )
    p.add_argument("--dry-run", action="store_true", help="Report changes without writing files.")
    return p.parse_args()


def replace_brand(text: str, old: str, new: str, *, mode: str) -> str:
    if not old or old == new:
        return text

    if mode == "literal":
        return text.replace(old, new)

    # "token" mode: replace `old` when it appears as a standalone token (surrounded by
    # non-letters/digits) OR as a camelCase/PascalCase prefix (e.g. oldSplashFade).
    #
    # This avoids changing words like "Petrosyan" where `old` is embedded in a larger word.
    esc = re.escape(old)

    # Standalone-like occurrences: start or non-alnum, then old, then end or non-alnum.
    # Note: underscore is treated as non-alnum so strings like "old_theme" will be updated.
    rx_token = re.compile(rf"(?<![A-Za-z0-9]){esc}(?![A-Za-z0-9])")
    out = rx_token.sub(new, text)

    # camelCase prefix occurrences: boundary before old, then old, then uppercase letter.
    rx_camel_prefix = re.compile(rf"(?<![A-Za-z0-9]){esc}(?=[A-Z])")
    out = rx_camel_prefix.sub(new, out)

    return out


def main() -> int:
    args = _parse_args()
    root = Path(__file__).resolve().parents[1]

    files = iter_target_files(root)
    changed = 0
    skipped = 0
    for p in files:
        data = p.read_bytes()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            skipped += 1
            continue

        new_text = replace_brand(text, args.old, args.new, mode=args.mode)

        if new_text != text:
            if not args.dry_run:
                p.write_bytes(new_text.encode("utf-8"))
            changed += 1

    suffix = " (dry-run)" if args.dry_run else ""
    print(f"rename_brand: changed={changed} skipped={skipped} total={len(files)}{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
