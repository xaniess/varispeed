$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Need($command, $help) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command not found. $help" }
}
Need 'node' 'Install Node.js LTS: https://nodejs.org/'
Need 'npm' 'Install Node.js LTS: https://nodejs.org/'
Need 'rustc' 'Install Rust (MSVC toolchain): https://rustup.rs/'
Need 'cargo' 'Install Rust (MSVC toolchain): https://rustup.rs/'
$info = (& rustc -vV | Out-String)
if ($info -notmatch 'host:\s*x86_64-pc-windows-msvc') {
  throw 'This script targets x64 Windows with the Rust MSVC toolchain. See https://v2.tauri.app/start/prerequisites/'
}
Write-Host '[1/5] Preparing FFmpeg sidecars'
& (Join-Path $PSScriptRoot 'prepare-ffmpeg.ps1')
Write-Host '[2/5] Installing JavaScript dependencies'
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {throw 'npm install failed.'}
Write-Host '[3/5] Running unit tests'
npm test
if ($LASTEXITCODE -ne 0) {throw 'Unit tests failed.'}
Write-Host '[4/5] Building native Tauri installer (this can require Visual Studio C++ Build Tools)'
npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) {throw 'Tauri build failed. Check Visual Studio C++ Build Tools and WebView2 prerequisites.'}
Write-Host '[5/5] Creating portable folder'
$portable = Join-Path (Get-Location) 'release-portable'
New-Item -ItemType Directory -Force -Path $portable | Out-Null
$exe = Join-Path (Get-Location) 'src-tauri\target\release\lutera_varispeed.exe'
if (!(Test-Path $exe)) { throw 'Tauri build succeeded but the compiled app could not be located.' }
Copy-Item $exe (Join-Path $portable 'lutera-varispeed.exe') -Force
Copy-Item 'src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe' (Join-Path $portable 'ffmpeg.exe') -Force
Copy-Item 'src-tauri\binaries\ffprobe-x86_64-pc-windows-msvc.exe' (Join-Path $portable 'ffprobe.exe') -Force
Get-ChildItem 'src-tauri\binaries\FFMPEG_*' -ErrorAction SilentlyContinue | Copy-Item -Destination $portable -Force
Write-Host ''
Write-Host 'SUCCESS. Installer: src-tauri\target\release\bundle\nsis\'
Write-Host 'Portable build (keep all EXEs together): release-portable\'
