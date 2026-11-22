$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Public key is a repository variable. Private key is a GitHub Actions secret.
# Nothing sensitive is written to disk. This writes only the non-secret public
# key and update URL into a temporary Tauri configuration overlay.
if ([string]::IsNullOrWhiteSpace($env:TAURI_UPDATER_PUBKEY)) {
    throw 'Missing Actions variable TAURI_UPDATER_PUBKEY. See RELEASES.md.'
}
if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
    throw 'Missing Actions secret TAURI_SIGNING_PRIVATE_KEY. See RELEASES.md.'
}
$conf = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
$cargo = Get-Content 'src-tauri/Cargo.toml' -Raw
$version = [string]$conf.version
if ($env:GITHUB_REF_NAME -ne "v$version") {
    throw "Release tag '$env:GITHUB_REF_NAME' must equal v$version."
}
if ($pkg.version -ne $version) {
    throw "package.json version $($pkg.version) disagrees with Tauri version $version."
}
$cargoVersion = [regex]::Match($cargo, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
if ($cargoVersion -ne $version) {
    throw "Cargo.toml version $cargoVersion does not match the Tauri version $version."
}
$updateConfig = @{
    bundle = @{ createUpdaterArtifacts = $true }
    plugins = @{
        updater = @{
            pubkey = $env:TAURI_UPDATER_PUBKEY.Trim()
            endpoints = @('https://github.com/xaniess/varispeed/releases/latest/download/latest.json')
            windows = @{ installMode = 'passive' }
        }
    }
}
$updateConfig | ConvertTo-Json -Depth 10 | Set-Content -Path 'src-tauri/tauri.release.conf.json' -Encoding UTF8
Write-Host "Prepared signed updater configuration for Varispeed $version (public key only)."
