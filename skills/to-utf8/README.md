# to-utf8

Convert legacy text files such as GBK, GB18030, ANSI, Big5, and Latin-1 files to UTF-8 before AI-assisted editing. The script is pure Python 3 and works on Windows and Linux.

Windows PowerShell:

```powershell
$script = "C:\absolute\path\to\skills\to-utf8\scripts\to_utf8.py"
py $script --dry-run C:\absolute\path\to\file
py $script C:\absolute\path\to\file
py $script --recursive --backup C:\absolute\path\to\project
```

Linux/macOS:

```bash
SCRIPT="/absolute/path/to/skills/to-utf8/scripts/to_utf8.py"
python3 "$SCRIPT" --dry-run /absolute/path/to/file
python3 "$SCRIPT" /absolute/path/to/file
python3 "$SCRIPT" --recursive --backup /absolute/path/to/project
```

Prefer absolute paths for the script and target files. AI coding tools may run commands from changing working directories, and absolute paths avoid converting the wrong file or failing at runtime. Use `python3` if `python` is not Python 3. Use `--from-encoding gb18030`, `--from-encoding gbk`, or `--from-encoding cp936` when automatic detection needs help.

The script detects encoding, skips likely binary files, preserves text layout and line endings, writes UTF-8, and scans converted text for likely mojibake markers.
