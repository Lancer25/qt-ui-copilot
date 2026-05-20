---
name: to-utf8
description: Use this skill whenever source files may be encoded as GBK, GB18030, ANSI, Big5, Latin-1, or another non-UTF-8 encoding and the user wants to convert one file or many files to UTF-8 on Windows or Linux without corrupting Chinese characters. This is especially important before editing legacy projects, Windows-created files, Linux-hosted legacy files, or files that display garbled Chinese after AI-assisted edits.
---

# To UTF-8

Use this skill before editing files that may not already be UTF-8, and use it when the user asks to fix garbled Chinese text, convert GBK/ANSI files, normalize encoding, or batch-convert project files to UTF-8.

The goal is simple: detect each file's current encoding, decode it safely, write the same text back as UTF-8, preserve line endings and layout, and report any likely mojibake so the user can inspect risky files. The bundled script is pure Python 3 and works on Windows and Linux without third-party packages.

## Workflow

1. Identify the target files.
   - For a single file, pass the file path directly.
   - For a directory or project, use recursive mode and include only text-like files.
   - Avoid binary files, lock files, build outputs, vendored dependencies, and generated assets unless the user explicitly asks.
2. Run a dry scan first.
   - Use `scripts/to_utf8.py --dry-run <path>` to detect encodings without writing.
   - Review files reported as `needs-convert`, `decode-failed`, or `mojibake`.
   - If the detected encoding is wrong or ambiguous, rerun with `--from-encoding <encoding>`.
3. Convert with the bundled script.
   - Use `scripts/to_utf8.py <path>` for a single file or directory.
   - Use `--recursive` for directories.
   - Use `--backup` when converting many files or important legacy files.
4. Verify after conversion.
   - Re-run the script with `--dry-run`.
   - Confirm files are now UTF-8 or UTF-8 with BOM only when the original file used a BOM.
   - Inspect any warnings for replacement characters or common mojibake markers.
5. Only edit the files after the conversion step succeeds.

## Commands

From the skill directory on Windows PowerShell:

```powershell
py .\scripts\to_utf8.py --dry-run path\to\file.cpp
py .\scripts\to_utf8.py path\to\file.cpp
py .\scripts\to_utf8.py --recursive --backup path\to\src
py .\scripts\to_utf8.py --recursive --include "*.cpp" --include "*.h" path\to\src
```

From the skill directory on Linux/macOS:

```bash
python scripts/to_utf8.py --dry-run path/to/file.cpp
python scripts/to_utf8.py path/to/file.cpp
python scripts/to_utf8.py --recursive --backup path/to/src
python scripts/to_utf8.py --recursive --include "*.cpp" --include "*.h" path/to/src
```

From another directory, call the script by absolute or relative path:

```bash
python skills/to-utf8/scripts/to_utf8.py --recursive --backup .
```

If `python` is not Python 3 on Linux, use `python3` instead:

```bash
python3 skills/to-utf8/scripts/to_utf8.py --recursive --backup .
```

If detection needs to be forced:

```bash
python3 skills/to-utf8/scripts/to_utf8.py --from-encoding gb18030 legacy.txt
py .\skills\to-utf8\scripts\to_utf8.py --from-encoding cp936 legacy.txt
```

## File Selection Guidance

Prefer explicit file lists or narrow include globs when working in a repository:

```bash
python skills/to-utf8/scripts/to_utf8.py --recursive --include "*.c" --include "*.cpp" --include "*.h" --include "*.txt" src
```

The script skips common binary extensions and common dependency/build directories by default, including `.git`, `node_modules`, `dist`, `build`, `.venv`, and `__pycache__`.

## Safety Rules

- Do not repair text by manual find-and-replace unless the user provides the intended original text.
- If detection is ambiguous, prefer `--dry-run` and report the candidate encoding instead of guessing silently.
- On Linux, Windows "ANSI" Chinese files usually decode as `gb18030`, `gbk`, or `cp936`; use `--from-encoding cp936` or `--from-encoding gb18030` when automatic detection is not enough.
- On Windows, the script tries the active ANSI code page through `mbcs` when Python supports it, plus portable encodings such as `gb18030`, `gbk`, `big5`, `cp1252`, and `latin-1`.
- If conversion creates mojibake warnings, pause before making further edits to those files.
- Preserve formatting by treating files as text only: decode bytes, keep the decoded string unchanged, and write UTF-8 bytes.
- Use backups for bulk conversions unless the repository is clean and the user is comfortable relying on Git.

## Reporting

After running the conversion, summarize:

- how many files were already UTF-8;
- how many files were converted and from which encodings;
- which files failed decoding;
- which files still contain likely mojibake markers.

When warnings remain, include the exact file paths and explain that the script found suspicious text patterns rather than proving corruption.
