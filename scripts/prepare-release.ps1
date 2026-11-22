$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ([string]::IsNullOrWhiteSpace($env:TAURI_UPDATER_PUBKEY)) { throw 'Missing Actions variable TAURI_UPDATER_PUBKEY. See RELEASES.md.' }
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) { throw 'Missing Actions secret TAURI_SIGNING_PRIVATE_KEY. See RELEASES.md.' }
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) { throw 'Missing Actions secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD. See RELEASES.md.' }
$config = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$package = Get-Content 'package.json' -Raw | ConvertFrom-Json
$cargo = Get-Content 'src-tauri/Cargo.toml' -Raw
$version = [string]$config.version
$cargoVersion = [regex]::Match($cargo, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
if ($env:GITHUB_REF_NAME -ne "v$version") { throw "Tag must match v$version" }
if ($package.version -ne $version -or $cargoVersion -ne $version) { throw 'Version mismatch between package.json, Cargo.toml, and tauri.conf.json.' }
$overlay = @{
  bundle = @{ createUpdaterArtifacts = $true }
  plugins = @{
    updater = @{
      pubkey = $env:TAURI_UPDATER_PUBKEY.Trim()
      endpoints = @('https://github.com/xaniess/varispeed/releases/latest/download/latest.json')
      windows = @{ installMode = 'passive' }
    }
  }
}
$overlay | ConvertTo-Json -Depth 10 | Set-Content 'src-tauri/tauri.release.conf.json' -Encoding UTF8
Write-Host "Prepared updater configuration for $version (public key only)."
