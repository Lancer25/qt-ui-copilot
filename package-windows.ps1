<#
.SYNOPSIS
Builds the Qt UI Copilot portable Windows executable.

.DESCRIPTION
Validates the local toolchain and output path, runs the desktop test and
type-check gates, invokes the existing portable packaging pipeline, and
verifies the generated launcher and Electron runtime.

.PARAMETER OutputDirectory
Destination directory for the portable application. Relative paths are
resolved from the repository root. Defaults to dist/qt-ui-copilot-win32-x64.

.PARAMETER SkipTests
Skips the desktop test suite. Type checking still runs.

.PARAMETER Launch
Starts the generated Qt UI Copilot executable after a successful build.

.PARAMETER OpenFolder
Opens the output directory in Windows Explorer after a successful build.

.EXAMPLE
.\package-windows.ps1

.EXAMPLE
.\package-windows.ps1 -SkipTests -OutputDirectory dist\local-build -Launch
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputDirectory = 'dist\qt-ui-copilot-win32-x64',

    [Parameter()]
    [switch]$SkipTests,

    [Parameter()]
    [switch]$Launch,

    [Parameter()]
    [switch]$OpenFolder
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-BuildStep {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan

    $global:LASTEXITCODE = 0
    & $Action
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode."
    }
}

function Assert-CommandAvailable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,

        [Parameter(Mandatory = $true)]
        [string]$InstallHint
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command '$CommandName' was not found. $InstallHint"
    }
}

try {
    if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        throw 'Unable to determine the repository root from the script location.'
    }

    $repoRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')

    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
        throw 'OutputDirectory cannot be empty.'
    }

    $outputCandidate = $OutputDirectory
    if (-not [System.IO.Path]::IsPathRooted($outputCandidate)) {
        $outputCandidate = Join-Path $repoRoot $outputCandidate
    }

    $outputFullPath = [System.IO.Path]::GetFullPath($outputCandidate)
    $pathRoot = [System.IO.Path]::GetPathRoot($outputFullPath)
    $comparison = [System.StringComparison]::OrdinalIgnoreCase

    if ([string]::IsNullOrWhiteSpace($pathRoot)) {
        throw "OutputDirectory '$OutputDirectory' does not resolve to a rooted path."
    }

    $normalizedPathRoot = [System.IO.Path]::GetFullPath($pathRoot).TrimEnd('\', '/')
    $outputPath = $outputFullPath.TrimEnd('\', '/')
    $outputPrefix = $outputPath + [System.IO.Path]::DirectorySeparatorChar

    if ($outputPath.Equals($normalizedPathRoot, $comparison)) {
        throw "Unsafe OutputDirectory '$outputPath': a drive root cannot be used."
    }

    if ($outputPath.Equals($repoRoot, $comparison)) {
        throw "Unsafe OutputDirectory '$outputPath': the repository root cannot be used."
    }

    if ($repoRoot.StartsWith($outputPrefix, $comparison)) {
        throw "Unsafe OutputDirectory '$outputPath': an ancestor of the repository cannot be used."
    }

    if (Test-Path -LiteralPath $outputPath -PathType Leaf) {
        throw "OutputDirectory '$outputPath' is an existing file, not a directory."
    }

    if (Test-Path -LiteralPath $outputPath -PathType Container) {
        $gitMarker = Join-Path $outputPath '.git'
        $workspaceMarker = Join-Path $outputPath 'pnpm-workspace.yaml'
        if ((Test-Path -LiteralPath $gitMarker) -or (Test-Path -LiteralPath $workspaceMarker)) {
            throw "Unsafe OutputDirectory '$outputPath': it contains repository markers (.git or pnpm-workspace.yaml)."
        }
    }

    $runningFromOutput = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try {
            $processPath = $_.Path
            $processPath -and [System.IO.Path]::GetFullPath($processPath).StartsWith($outputPrefix, $comparison)
        }
        catch {
            $false
        }
    })
    if ($runningFromOutput.Count -gt 0) {
        $processNames = ($runningFromOutput | ForEach-Object { "$($_.ProcessName) ($($_.Id))" }) -join ', '
        throw "OutputDirectory '$outputPath' is currently in use by $processNames. Close the packaged app or choose a different -OutputDirectory."
    }

    Assert-CommandAvailable -CommandName 'node' -InstallHint 'Install Node.js and ensure node.exe is on PATH.'
    Assert-CommandAvailable -CommandName 'pnpm' -InstallHint 'Install pnpm and ensure it is on PATH.'
    Assert-CommandAvailable -CommandName 'dotnet' -InstallHint 'Install the .NET SDK and ensure dotnet.exe is on PATH.'

    $nodeModulesPath = Join-Path $repoRoot 'node_modules'
    if (-not (Test-Path -LiteralPath $nodeModulesPath -PathType Container)) {
        throw "Dependencies are missing at '$nodeModulesPath'. Run 'pnpm install' from '$repoRoot' before packaging."
    }

    Push-Location -LiteralPath $repoRoot
    try {
        if (-not $SkipTests) {
            Invoke-BuildStep -Name 'Running desktop tests' -Action {
                pnpm --filter '@qt-ui-copilot/desktop' test
            }
        }
        else {
            Write-Host 'Skipping desktop tests (-SkipTests).' -ForegroundColor Yellow
        }

        Invoke-BuildStep -Name 'Running desktop type check' -Action {
            pnpm --filter '@qt-ui-copilot/desktop' typecheck
        }

        $portableOutputExisted = Test-Path -LiteralPath 'Env:PORTABLE_OUTPUT'
        $previousPortableOutput = if ($portableOutputExisted) {
            (Get-Item -LiteralPath 'Env:PORTABLE_OUTPUT').Value
        }
        else {
            $null
        }

        try {
            $env:PORTABLE_OUTPUT = $outputPath
            Invoke-BuildStep -Name 'Building portable Windows application' -Action {
                pnpm --filter '@qt-ui-copilot/desktop' package:portable
            }
        }
        finally {
            if ($portableOutputExisted) {
                $env:PORTABLE_OUTPUT = $previousPortableOutput
            }
            else {
                Remove-Item -LiteralPath 'Env:PORTABLE_OUTPUT' -ErrorAction SilentlyContinue
            }
        }
    }
    finally {
        Pop-Location
    }

    $exePath = Join-Path $outputPath 'qt-ui-copilot.exe'
    $electronPath = Join-Path $outputPath 'runtime\electron.exe'

    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        throw "Packaging completed but the launcher was not found at '$exePath'."
    }

    if (-not (Test-Path -LiteralPath $electronPath -PathType Leaf)) {
        throw "Packaging completed but the Electron runtime was not found at '$electronPath'."
    }

    Write-Host ""
    Write-Host 'Packaging completed successfully.' -ForegroundColor Green
    Write-Host "Executable: $exePath"

    if ($Launch) {
        Write-Host 'Launching Qt UI Copilot...'
        Start-Process -FilePath $exePath
    }

    if ($OpenFolder) {
        Write-Host "Opening output folder: $outputPath"
        Start-Process -FilePath 'explorer.exe' -ArgumentList @($outputPath)
    }
}
catch {
    [Console]::Error.WriteLine("Windows packaging failed: $($_.Exception.Message)")
    exit 1
}
