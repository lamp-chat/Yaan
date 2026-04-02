from __future__ import annotations

import argparse
from pathlib import Path


def iter_target_files(root: Path) -> list[Path]:
    ex_dirs = {".git", ".venv", "__pycache__", "exportToHTML"}
    ex_files = {"users.db"}
    ex_prefixes = {"secrets"}
    ex_suffixes = {".db", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"}

    exts = {".py", ".html", ".js", ".css", ".md", ".txt"}

    out: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if rel.parts and rel.parts[0] in ex_dirs:
            continue
        if rel.parts and rel.parts[0] in ex_prefixes:
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
    p.add_argument("--from", dest="old", default="yan", help="Old brand string (default: yan)")
    p.add_argument("--to", dest="new", default="yan", help="New brand string (default: yan)")
    return p.parse_args()


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

        new_text = text.replace(args.old, args.new)

        if new_text != text:
            p.write_bytes(new_text.encode("utf-8"))
            changed += 1

    print(f"rename_brand: changed={changed} skipped={skipped} total={len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
