#!/usr/bin/env python3
"""Detect legacy text encodings and convert files to UTF-8."""

from __future__ import annotations

import argparse
import fnmatch
import locale
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
}

BINARY_EXTENSIONS = {
    ".7z",
    ".avi",
    ".bmp",
    ".class",
    ".dll",
    ".doc",
    ".docx",
    ".exe",
    ".gif",
    ".gz",
    ".ico",
    ".jar",
    ".jpg",
    ".jpeg",
    ".mov",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".pyc",
    ".rar",
    ".so",
    ".tar",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}

DEFAULT_INCLUDES = [
    "*.bat",
    "*.c",
    "*.cc",
    "*.cfg",
    "*.conf",
    "*.cpp",
    "*.cs",
    "*.css",
    "*.csv",
    "*.go",
    "*.h",
    "*.hpp",
    "*.html",
    "*.ini",
    "*.java",
    "*.js",
    "*.json",
    "*.jsx",
    "*.kt",
    "*.log",
    "*.lua",
    "*.md",
    "*.php",
    "*.properties",
    "*.py",
    "*.rc",
    "*.rs",
    "*.sh",
    "*.sql",
    "*.svg",
    "*.toml",
    "*.ts",
    "*.tsx",
    "*.txt",
    "*.vue",
    "*.xml",
    "*.yaml",
    "*.yml",
]

MOJIBAKE_MARKERS = [
    "\ufffd",
    "\u951f\u65a4\u62f7",
    "\u70eb\u70eb\u70eb",
    "\u5c6f\u5c6f\u5c6f",
    "\u00c3",
    "\u00c2",
    "\u00e2\u20ac",
    "\u00e4\u00b8",
    "\u00e5\u00a5",
    "\u00e6",
]


@dataclass
class Detection:
    encoding: str
    text: str
    bom: bytes = b""


@dataclass
class Result:
    path: Path
    status: str
    encoding: str | None = None
    warning: str | None = None


def is_binary_bytes(data: bytes) -> bool:
    if b"\x00" in data:
        return True
    if not data:
        return False
    sample = data[:4096]
    control = sum(1 for byte in sample if byte < 32 and byte not in b"\t\r\n\f\b")
    return control / len(sample) > 0.30


def score_text(text: str) -> int:
    score = 0
    score += text.count("\ufffd") * 100
    score += sum(text.count(marker) * 60 for marker in MOJIBAKE_MARKERS if marker != "\ufffd")
    score += sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff") * -2
    score += sum(1 for ch in text if ch in "\r\n\t") * -1
    score += sum(1 for ch in text if ord(ch) < 32 and ch not in "\r\n\t\f\b") * 20
    return score


def candidate_encodings() -> list[str]:
    preferred = locale.getpreferredencoding(False)
    encodings = [
        "utf-8",
        "gb18030",
        "gbk",
        "big5",
        "cp950",
        "cp1252",
        "latin-1",
    ]
    if preferred and preferred.lower() not in {item.lower() for item in encodings}:
        encodings.insert(1, preferred)
    if sys.platform.startswith("win") and "mbcs" not in {item.lower() for item in encodings}:
        encodings.insert(1, "mbcs")
    return encodings


def detect_text(data: bytes, forced_encoding: str | None = None) -> Detection:
    if data.startswith(b"\xef\xbb\xbf"):
        return Detection("utf-8-sig", data.decode("utf-8-sig"), b"\xef\xbb\xbf")
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        text = data.decode("utf-16")
        return Detection("utf-16", text)

    if forced_encoding:
        return Detection(forced_encoding, data.decode(forced_encoding, errors="strict"))

    successes: list[tuple[int, str, str]] = []
    for encoding in candidate_encodings():
        try:
            text = data.decode(encoding, errors="strict")
        except (LookupError, UnicodeDecodeError):
            continue
        successes.append((score_text(text), encoding, text))

    if not successes:
        raise UnicodeDecodeError("unknown", data, 0, min(len(data), 1), "no candidate encoding matched")

    successes.sort(key=lambda item: item[0])
    _, encoding, text = successes[0]
    return Detection(encoding, text)


def has_mojibake(text: str) -> str | None:
    hits = [marker for marker in MOJIBAKE_MARKERS if marker in text]
    if hits:
        return "possible mojibake markers: " + ", ".join(hits[:5])
    return None


def should_include(path: Path, includes: list[str]) -> bool:
    if not includes:
        includes = DEFAULT_INCLUDES
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in includes)


def iter_files(targets: list[Path], recursive: bool, includes: list[str], all_files: bool) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        if target.is_file():
            files.append(target)
            continue
        if not target.is_dir():
            files.append(target)
            continue

        iterator = target.rglob("*") if recursive else target.glob("*")
        for path in iterator:
            if path.is_dir():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.suffix.lower() in BINARY_EXTENSIONS:
                continue
            if all_files or should_include(path, includes):
                files.append(path)
    return sorted(set(files))


def convert_file(path: Path, dry_run: bool, backup: bool, forced_encoding: str | None) -> Result:
    if not path.exists():
        return Result(path, "missing")
    if not path.is_file():
        return Result(path, "not-file")

    data = path.read_bytes()
    if is_binary_bytes(data):
        return Result(path, "skip-binary")

    try:
        detection = detect_text(data, forced_encoding)
    except (LookupError, UnicodeDecodeError) as exc:
        return Result(path, "decode-failed", warning=str(exc))

    warning = has_mojibake(detection.text)
    utf8_bytes = detection.bom + detection.text.encode("utf-8")
    already_utf8 = detection.encoding in {"utf-8", "utf-8-sig"} and data == utf8_bytes
    if already_utf8:
        return Result(path, "utf8-ok", detection.encoding, warning)

    if dry_run:
        return Result(path, "needs-convert", detection.encoding, warning)

    if backup:
        backup_path = path.with_name(path.name + ".bak")
        counter = 1
        while backup_path.exists():
            backup_path = path.with_name(f"{path.name}.bak{counter}")
            counter += 1
        shutil.copy2(path, backup_path)

    path.write_bytes(utf8_bytes)

    try:
        after = path.read_bytes().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        return Result(path, "verify-failed", detection.encoding, str(exc))

    verify_warning = has_mojibake(after)
    return Result(path, "converted", detection.encoding, verify_warning)


def print_result(result: Result) -> None:
    pieces = [result.status, str(result.path)]
    if result.encoding:
        pieces.append(f"from={result.encoding}")
    if result.warning:
        pieces.append(f"warning={result.warning}")
    safe_print(" | ".join(pieces))


def safe_print(text: str = "") -> None:
    encoding = sys.stdout.encoding or "utf-8"
    data = text.encode(encoding, errors="backslashreplace").decode(encoding, errors="replace")
    print(data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert legacy text files to UTF-8.")
    parser.add_argument("paths", nargs="+", type=Path, help="Files or directories to scan.")
    parser.add_argument("-r", "--recursive", action="store_true", help="Recurse into directories.")
    parser.add_argument("--dry-run", action="store_true", help="Detect and report without writing files.")
    parser.add_argument("--backup", action="store_true", help="Create .bak files before writing.")
    parser.add_argument(
        "--from-encoding",
        help="Force the source encoding, for example gb18030, gbk, cp936, big5, cp950, cp1252, or latin-1.",
    )
    parser.add_argument("--all-files", action="store_true", help="Try every non-binary file instead of text-like globs.")
    parser.add_argument("--include", action="append", default=[], help="File glob to include, repeatable.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = iter_files(args.paths, args.recursive, args.include, args.all_files)
    if not files:
        print("No files matched.")
        return 0

    counts: Counter[str] = Counter()
    encodings: Counter[str] = Counter()
    had_failure = False

    for path in files:
        result = convert_file(path, args.dry_run, args.backup, args.from_encoding)
        counts[result.status] += 1
        if result.encoding:
            encodings[result.encoding] += 1
        if result.status in {"decode-failed", "verify-failed", "missing", "not-file"}:
            had_failure = True
        print_result(result)

    safe_print()
    safe_print("Summary:")
    for status, count in sorted(counts.items()):
        safe_print(f"  {status}: {count}")
    if encodings:
        safe_print("Encodings:")
        for encoding, count in sorted(encodings.items()):
            safe_print(f"  {encoding}: {count}")

    return 1 if had_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
