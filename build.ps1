#!/usr/bin/env pwsh
# build.ps1 - Cross-platform build script.
# Run from repo root:  .\build.ps1          (Windows)
#                      pwsh ./build.ps1     (macOS / Linux)
#
# Flags:
#   -AppOnly       build only the app variants (skip installer)
#   -InstallerOnly build only the installer   (app binaries must already exist)
#
# All outputs land in app/build/bin/ :
#   Windows : cmdIDE-windows-amd64.exe        cmdIDE-plugins-windows-amd64.exe        cmdIDE-installer-windows.exe
#   macOS   : cmdIDE-darwin-arm64.zip         cmdIDE-plugins-darwin-arm64.zip         cmdIDE-installer-darwin
#   Linux   : cmdIDE-linux-amd64              cmdIDE-plugins-linux-amd64              cmdIDE-installer-linux

param(
    [switch]$AppOnly,
    [switch]$InstallerOnly
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step($msg) { Write-Host "  >> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  !! $msg" -ForegroundColor Red; exit 1 }

# Detect platform + arch
$goArch = (go env GOARCH).Trim()
if ($IsWindows) {
    $os           = 'windows'
    $appExt       = '.exe'
    $installerDir = 'windows'
    $installerSuffix = '-windows.exe'
} elseif ($IsMacOS) {
    $os           = 'darwin'
    $appExt       = '.zip'
    $installerDir = 'macos'
    $installerSuffix = '-darwin'
} else {
    $os           = 'linux'
    $appExt       = ''
    $installerDir = 'linux'
    $installerSuffix = '-linux'
}

$binDir      = Join-Path $root 'app' 'build' 'bin'
$baseName    = "cmdIDE-$os-$goArch$appExt"
$pluginsName = "cmdIDE-plugins-$os-$goArch$appExt"
$installerName = "cmdIDE-installer$installerSuffix"

New-Item -Force -ItemType Directory $binDir | Out-Null

# Copy the wails output into $binDir under $destName.
# On macOS wails produces a .app bundle which we zip; everywhere else it's a plain binary.
function StageAppBinary([string]$destName) {
    $wailsBin = Join-Path $binDir "cmdIDE$( if ($IsWindows) { '.exe' } else { '' } )"
    $wailsApp = Join-Path $binDir 'cmdIDE.app'
    $dest     = Join-Path $binDir $destName

    if ($IsMacOS -and (Test-Path $wailsApp)) {
        Compress-Archive -Path $wailsApp -DestinationPath $dest -Force
    } elseif (Test-Path $wailsBin) {
        if ($wailsBin -ne $dest) { Copy-Item -Force $wailsBin $dest }
    } else {
        Fail "Wails output not found in $binDir"
    }
}

# ------------------------------------------------------------------
# 1a. Build base app
# ------------------------------------------------------------------
if (-not $InstallerOnly) {
    Step "Building base app ($os/$goArch)..."
    Push-Location (Join-Path $root 'app')
    wails build
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail 'Base app build failed.' }
    StageAppBinary $baseName
    Ok "Base app -> app/build/bin/$baseName"

# ------------------------------------------------------------------
# 1b. Build plugins app
# ------------------------------------------------------------------
    Step "Building plugins app ($os/$goArch)..."
    Push-Location (Join-Path $root 'app')
    $env:VITE_PLUGINS = 'true'
    wails build -tags plugins
    $code = $LASTEXITCODE
    $env:VITE_PLUGINS = ''
    Pop-Location
    if ($code -ne 0) { Fail 'Plugins app build failed.' }
    StageAppBinary $pluginsName
    Ok "Plugins app -> app/build/bin/$pluginsName"
}

if ($AppOnly) { Write-Host "`n  Done (app only).`n" -ForegroundColor Green; exit 0 }

# ------------------------------------------------------------------
# 2. Stage base binary into installer/assets (embedded installer variant)
# ------------------------------------------------------------------
Step 'Staging base binary into installer/assets...'

$assetsDir = Join-Path $root 'installer' 'assets'
New-Item -Force -ItemType Directory $assetsDir | Out-Null

$baseSrc = Join-Path $binDir $baseName
if (-not (Test-Path $baseSrc)) {
    Fail "Base binary not found at $baseSrc - build the app first."
}

# For macOS the staged asset is the zip; on other platforms it is the raw binary.
$assetDest = Join-Path $assetsDir "cmdIDE$( if ($IsWindows) { '.exe' } else { '' } )"
Copy-Item -Force $baseSrc $assetDest
Ok "Copied $baseName -> installer/assets/"

# ------------------------------------------------------------------
# 3. Build installer
# ------------------------------------------------------------------
Step "Building installer ($installerDir)..."
$installerRoot = Join-Path $root 'installer' $installerDir
Push-Location $installerRoot

if (-not (Test-Path 'go.sum')) {
    Write-Host '  (first run - fetching Go dependencies...)' -ForegroundColor DarkGray
    go mod tidy
    $code = $LASTEXITCODE
    if ($code -ne 0) { Pop-Location; Fail 'go mod tidy failed.' }
}

wails build
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail 'Installer build failed.' }

# Copy installer output into app/build/bin/
$installerWailsOut = Join-Path $installerRoot 'build' 'bin' "cmdIDE-installer$( if ($IsWindows) { '.exe' } else { '' } )"
if (-not (Test-Path $installerWailsOut)) {
    Fail "Installer binary not found at $installerWailsOut"
}
Copy-Item -Force $installerWailsOut (Join-Path $binDir $installerName)
Ok "Installer -> app/build/bin/$installerName"

# ------------------------------------------------------------------
Write-Host ''
Write-Host '  Build complete.' -ForegroundColor Green
Write-Host ''
Write-Host "    $baseName"      -ForegroundColor DarkGray
Write-Host "    $pluginsName"   -ForegroundColor DarkGray
Write-Host "    $installerName" -ForegroundColor DarkGray
Write-Host ''
