<#
.SYNOPSIS
Builds the Qt UI Copilot Squirrel.Windows installer.

.DESCRIPTION
Runs the desktop verification gates, invokes the existing Electron Forge
Squirrel maker, and collects the installer and update artifacts in one folder.

.PARAMETER OutputDirectory
Destination for Setup.exe, RELEASES, and NuGet update packages. Relative paths
are resolved from the repository root. Defaults to dist/installer.

.PARAMETER SkipTests
Skips desktop tests. Type checking still runs.

.PARAMETER OpenFolder
Opens the installer output directory after a successful build.

.EXAMPLE
.\make-windows-installer.ps1

.EXAMPLE
.\make-windows-installer.ps1 -SkipTests -OutputDirectory dist\installer-local -OpenFolder
#>
[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputDirectory = 'dist\installer',

    [Parameter()]
    [switch]$SkipTests,

    [Parameter()]
    [switch]$OpenFolder
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-InstallerStep {
    param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][scriptblock]$Action)
    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}

function Assert-InstallerCommand {
    param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string]$Hint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command '$Name' was not found. $Hint" }
}

try {
    $repoRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { throw 'OutputDirectory cannot be empty.' }
    $candidate = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $repoRoot $OutputDirectory }
    $outputPath = [System.IO.Path]::GetFullPath($candidate).TrimEnd('\', '/')
    $pathRoot = [System.IO.Path]::GetPathRoot($outputPath)
    $comparison = [System.StringComparison]::OrdinalIgnoreCase
    $outputPrefix = $outputPath + [System.IO.Path]::DirectorySeparatorChar

    if (-not $pathRoot -or $outputPath.Equals($pathRoot.TrimEnd('\', '/'), $comparison)) { throw "Unsafe OutputDirectory '$outputPath': a drive root cannot be used." }
    if ($outputPath.Equals($repoRoot, $comparison) -or $repoRoot.StartsWith($outputPrefix, $comparison)) { throw "Unsafe OutputDirectory '$outputPath': the repository or its ancestor cannot be used." }
    if (Test-Path -LiteralPath $outputPath -PathType Leaf) { throw "OutputDirectory '$outputPath' is an existing file." }
    if (Test-Path -LiteralPath $outputPath -PathType Container) {
        if ((Test-Path -LiteralPath (Join-Path $outputPath '.git')) -or (Test-Path -LiteralPath (Join-Path $outputPath 'pnpm-workspace.yaml'))) {
            throw "Unsafe OutputDirectory '$outputPath': it contains repository markers."
        }
    }

    Assert-InstallerCommand 'node' 'Install Node.js and add it to PATH.'
    Assert-InstallerCommand 'pnpm' 'Install pnpm and add it to PATH.'
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules') -PathType Container)) { throw "Dependencies are missing. Run 'pnpm install' from '$repoRoot'." }

    Push-Location -LiteralPath $repoRoot
    try {
        if (-not $SkipTests) { Invoke-InstallerStep 'Running desktop tests' { pnpm --filter '@qt-ui-copilot/desktop' test } }
        else { Write-Host 'Skipping desktop tests (-SkipTests).' -ForegroundColor Yellow }
        Invoke-InstallerStep 'Running desktop type check' { pnpm --filter '@qt-ui-copilot/desktop' typecheck }
        $portableStage = Join-Path $repoRoot 'apps\desktop\out\installer-portable-win32-x64'
        $squirrelStage = Join-Path $repoRoot 'apps\desktop\out\squirrel-installer'
        $portableOutputExisted = Test-Path -LiteralPath 'Env:PORTABLE_OUTPUT'
        $previousPortableOutput = if ($portableOutputExisted) { (Get-Item -LiteralPath 'Env:PORTABLE_OUTPUT').Value } else { $null }
        try {
            $env:PORTABLE_OUTPUT = $portableStage
            Invoke-InstallerStep 'Building verified portable staging application' { pnpm --filter '@qt-ui-copilot/desktop' package:portable }
        }
        finally {
            if ($portableOutputExisted) { $env:PORTABLE_OUTPUT = $previousPortableOutput }
            else { Remove-Item -LiteralPath 'Env:PORTABLE_OUTPUT' -ErrorAction SilentlyContinue }
        }
        Invoke-InstallerStep 'Building Squirrel.Windows installer' { node 'apps/desktop/scripts/build-squirrel-installer.mjs' $portableStage $squirrelStage }
    }
    finally { Pop-Location }

    $makeRoot = Join-Path $repoRoot 'apps\desktop\out\squirrel-installer'
    $setup = Get-ChildItem -LiteralPath $makeRoot -File -Filter 'Qt-UI-Copilot-Setup.exe' | Select-Object -First 1
    if (-not $setup) { throw "Squirrel.Windows completed but Qt-UI-Copilot-Setup.exe was not found under '$makeRoot'." }

    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Recurse -Force }
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    $artifacts = Get-ChildItem -LiteralPath $setup.DirectoryName -File | Where-Object { $_.Name -eq 'RELEASES' -or $_.Extension -eq '.nupkg' -or $_.Name -eq 'Qt-UI-Copilot-Setup.exe' }
    foreach ($artifact in $artifacts) { Copy-Item -LiteralPath $artifact.FullName -Destination (Join-Path $outputPath $artifact.Name) -Force }

    $finalSetup = Join-Path $outputPath 'Qt-UI-Copilot-Setup.exe'
    if (-not (Test-Path -LiteralPath $finalSetup -PathType Leaf)) { throw "Installer collection failed: '$finalSetup' is missing." }
    $hash = (Get-FileHash -LiteralPath $finalSetup -Algorithm SHA256).Hash
    Set-Content -LiteralPath (Join-Path $outputPath 'SHA256SUMS.txt') -Value "$hash  Qt-UI-Copilot-Setup.exe" -Encoding utf8

    Write-Host ""
    Write-Host 'Windows installer completed successfully.' -ForegroundColor Green
    Write-Host "Installer: $finalSetup"
    Write-Host "SHA256:    $hash"
    if (-not ($env:WINDOWS_CERTIFICATE_FILE -and $env:WINDOWS_CERTIFICATE_PASSWORD)) {
        Write-Warning 'This installer is unsigned and may trigger Windows SmartScreen on another device.'
    }
    if ($OpenFolder) { Start-Process -FilePath 'explorer.exe' -ArgumentList @($outputPath) }
}
catch {
    [Console]::Error.WriteLine("Windows installer build failed: $($_.Exception.Message)")
    exit 1
}
