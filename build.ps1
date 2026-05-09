#!/usr/bin/env pwsh
# build.ps1  -  builds the app then the installer in one shot.
# Run from the repo root:  .\build.ps1
#
# Flags:
#   -AppOnly       build only the main app
#   -InstallerOnly build only the installer (app binary must already exist)
#
# Output:
#   app\build\bin\cmdIDE.exe
#   installer\build\bin\cmdIDE-installer.exe

param(
    [switch]$AppOnly,
    [switch]$InstallerOnly
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step($msg) { Write-Host "  >> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  !! $msg" -ForegroundColor Red; exit 1 }

# --------------------------------------------------------------------------
# 1. Build app
# --------------------------------------------------------------------------
if (-not $InstallerOnly) {
    Step "Building app..."
    Push-Location "$root\app"
    wails build
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail "App build failed." }
    Ok "App built  ->  app\build\bin\cmdIDE.exe"
}

if ($AppOnly) { Write-Host "`n  Done (app only).`n" -ForegroundColor Green; exit 0 }

# --------------------------------------------------------------------------
# 2. Stage app binary into installer/assets
# --------------------------------------------------------------------------
Step "Staging app binary into installer/assets..."

$src = Join-Path $root "app\build\bin\cmdIDE.exe"
$dst = Join-Path $root "installer\assets\cmdIDE.exe"

if (-not (Test-Path $src)) {
    Fail "App binary not found at $src - build the app first (run without -InstallerOnly)."
}

New-Item -Force -ItemType Directory (Join-Path $root "installer\assets") | Out-Null
Copy-Item -Force $src $dst
Ok "Copied cmdIDE.exe -> installer\assets\"

# --------------------------------------------------------------------------
# 3. Build installer
# --------------------------------------------------------------------------
Step "Building installer..."
Push-Location "$root\installer"

if (-not (Test-Path "go.sum")) {
    Write-Host "  (first run - fetching Go dependencies...)" -ForegroundColor DarkGray
    go mod tidy
    $code = $LASTEXITCODE
    if ($code -ne 0) { Pop-Location; Fail "go mod tidy failed." }
}

wails build
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "Installer build failed." }
Ok "Installer built  ->  installer\build\bin\cmdIDE-installer.exe"

# --------------------------------------------------------------------------
Write-Host ""
Write-Host "  Build complete." -ForegroundColor Green
Write-Host ""
Write-Host "    App:       app\build\bin\cmdIDE.exe" -ForegroundColor DarkGray
Write-Host "    Installer: installer\build\bin\cmdIDE-installer.exe" -ForegroundColor DarkGray
Write-Host ""
