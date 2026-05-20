# to-utf8

Convert legacy text files such as GBK, GB18030, ANSI, Big5, and Latin-1 files to UTF-8 before AI-assisted editing. The script is pure Python 3 and works on Windows and Linux.

Windows PowerShell:

```powershell
py .\scripts\to_utf8.py --dry-run path\to\file
py .\scripts\to_utf8.py path\to\file
py .\scripts\to_utf8.py --recursive --backup path\to\project
```

Linux/macOS:

```bash
python scripts/to_utf8.py --dry-run path/to/file
python scripts/to_utf8.py path/to/file
python scripts/to_utf8.py --recursive --backup path/to/project
```

Use `python3` if `python` is not Python 3. Use `--from-encoding gb18030`, `--from-encoding gbk`, or `--from-encoding cp936` when automatic detection needs help.

The script detects encoding, skips likely binary files, preserves text layout and line endings, writes UTF-8, and scans converted text for likely mojibake markers.
