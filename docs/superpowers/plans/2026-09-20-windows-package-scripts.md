# Windows Package Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-command PowerShell and BAT entry points that validate, package, and optionally launch the Qt UI Copilot Windows executable.

**Architecture:** Keep all build implementation in the existing Node packaging scripts. The root PowerShell script acts as a safe orchestrator with prerequisite checks, output-path validation, test/typecheck gates, temporary environment setup, and artifact verification; the BAT file is a thin argument-forwarding wrapper.

**Tech Stack:** PowerShell 5+, Windows batch, pnpm, Electron, .NET portable launcher

**Spec:** `docs/superpowers/specs/2026-09-20-windows-package-scripts-design.md`

## Global Constraints

- Default output is `dist/qt-ui-copilot-win32-x64` under the repository root.
- The script must never allow the portable packager to recursively delete a drive root, the repository root, or an ancestor of the repository.
- Do not automatically install dependencies or access the network.
- Tests run by default; `-SkipTests` skips tests only, never type checking.
- Restore the caller's `PORTABLE_OUTPUT` environment value even after failure.

---

### Task 1: Create the PowerShell orchestrator

**Files:**
- Create: `package-windows.ps1`

**Interfaces:**
- Consumes: `-OutputDirectory`, `-SkipTests`, `-Launch`, and `-OpenFolder`.
- Produces: `<output>/qt-ui-copilot.exe`, `<output>/runtime/electron.exe`, and a nonzero exit code on failure.

- [ ] **Step 1: Add parameters and repository discovery**

Start the script with comment-based help, `[CmdletBinding()]`, the four approved parameters, strict mode, and `$ErrorActionPreference = 'Stop'`. Resolve `$repoRoot` from `$PSScriptRoot` and resolve relative output paths against it.

- [ ] **Step 2: Add safe output validation**

Use `[System.IO.Path]::GetFullPath()` and reject:

```powershell
$outputPath -eq $pathRoot
$outputPath -eq $repoRoot
$repoRoot.StartsWith($outputPath.TrimEnd('\\') + '\\', [System.StringComparison]::OrdinalIgnoreCase)
```

Also reject an existing output directory containing `.git` or `pnpm-workspace.yaml`.

- [ ] **Step 3: Add prerequisite checks**

Check `node`, `pnpm`, and `dotnet` with `Get-Command`. Check `$repoRoot/node_modules` with `Test-Path`. Throw actionable messages naming the missing command or recommending `pnpm install`.

- [ ] **Step 4: Add checked command execution**

Create an `Invoke-BuildStep` helper that prints the stage, executes a script block, and throws when `$LASTEXITCODE` is nonzero. Execute:

```powershell
pnpm --filter '@qt-ui-copilot/desktop' test
pnpm --filter '@qt-ui-copilot/desktop' typecheck
pnpm --filter '@qt-ui-copilot/desktop' package:portable
```

Skip only the first command when `-SkipTests` is set.

- [ ] **Step 5: Protect environment state and verify artifacts**

Save whether `Env:PORTABLE_OUTPUT` existed and its prior value. Set it to the resolved output only inside `try`, restore or remove it in `finally`, then verify both expected executables with `Test-Path`.

- [ ] **Step 6: Add successful post-actions**

Print the full EXE path. Run `Start-Process -FilePath $exePath` for `-Launch`; run `Start-Process explorer.exe -ArgumentList $outputPath` for `-OpenFolder`.

---

### Task 2: Create the BAT wrapper

**Files:**
- Create: `package-windows.bat`

**Interfaces:**
- Consumes: arbitrary command-line arguments in `%*`.
- Produces: the PowerShell script's exit code.

- [ ] **Step 1: Add the wrapper**

Use this structure:

```bat
@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-windows.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Packaging failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
```

- [ ] **Step 2: Verify argument forwarding and error propagation**

Run the BAT with an unsafe output path and confirm it returns nonzero without invoking the packager:

```powershell
cmd /c package-windows.bat -OutputDirectory E:\workspace\AI
if ($LASTEXITCODE -eq 0) { throw 'Unsafe path was accepted' }
```

---

### Task 3: Execute the real package workflow

**Files:**
- Package output: `dist/qt-ui-copilot-win32-x64/`

**Interfaces:**
- Consumes: the scripts from Tasks 1 and 2.
- Produces: a verified and runnable portable Windows application.

- [ ] **Step 1: Run the PowerShell script from outside the repository**

Run:

```powershell
Push-Location $env:TEMP
try { & 'E:\workspace\AI\package-windows.ps1' -SkipTests } finally { Pop-Location }
```

Expected: type checking and packaging succeed independently of the current directory.

- [ ] **Step 2: Verify default artifacts**

Run:

```powershell
Test-Path E:\workspace\AI\dist\qt-ui-copilot-win32-x64\qt-ui-copilot.exe
Test-Path E:\workspace\AI\dist\qt-ui-copilot-win32-x64\runtime\electron.exe
```

Expected: both values are `True`.

- [ ] **Step 3: Run the BAT happy path with a custom output**

Run:

```powershell
cmd /c package-windows.bat -SkipTests -OutputDirectory dist\qt-ui-copilot-bat-check
```

Expected: exit code `0` and `dist/qt-ui-copilot-bat-check/qt-ui-copilot.exe` exists.

- [ ] **Step 4: Launch the default artifact**

Run:

```powershell
& .\package-windows.ps1 -SkipTests -Launch
```

Expected: the `Qt UI Copilot` window starts and remains responsive.
