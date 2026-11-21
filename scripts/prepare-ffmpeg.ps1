# Prepare x64 Windows FFmpeg sidecars for Tauri 2. No Python required.
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binaryDir = Join-Path $project 'src-tauri\binaries'
New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
$triple = 'x86_64-pc-windows-msvc'
$destFF = Join-Path $binaryDir "ffmpeg-$triple.exe"
$destProbe = Join-Path $binaryDir "ffprobe-$triple.exe"
if ((Test-Path $destFF) -and (Test-Path $destProbe)) { Write-Host 'FFmpeg sidecars already prepared.'; exit 0 }
$work = Join-Path $env:TEMP 'lutera-varispeed-tauri-ffmpeg'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$zip = Join-Path $work 'ffmpeg-release-essentials.zip'
$extract = Join-Path $work 'extracted'
Write-Host 'Downloading official-distributor FFmpeg Windows build (gyan.dev)...'
Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
foreach ($name in @('ffmpeg', 'ffprobe')) {
  $file = Get-ChildItem $extract -Recurse -File -Filter "$name.exe" | Select-Object -First 1
  if (-not $file) { throw "Archive missing $name.exe" }
  Copy-Item $file.FullName (Join-Path $binaryDir "$name-$triple.exe") -Force
}
$licenseFiles = Get-ChildItem $extract -File -Recurse | Where-Object { $_.Name -match '^(LICENSE|COPYING)(\.txt)?$' }
foreach ($file in $licenseFiles | Select-Object -First 2) {
  Copy-Item $file.FullName (Join-Path $binaryDir "FFMPEG_$($file.Name)") -Force
}
Write-Host 'FFmpeg/FFprobe prepared for the Tauri sidecar bundle.'
