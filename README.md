# varispeed

A small local-first audio tool by lūtera. Built with Tauri 2, Rust, Windows WebView2, and bundled FFmpeg.

## Features

- Exact-cent resampling that changes pitch, speed, and duration together.
- Dual waveforms with independent timing readouts, synchronized relative seeking, A/B crossfade, and an optional headphone pan cue.
- Reference mode for comparing another audio export and estimating its resampling pitch shift from aligned audio timing. The estimate shows a confidence indicator and declines to guess when the recordings do not match well. It is not a spectral pitch measurement and assumes pitch and speed remain coupled.
- Batch imports, individually adjustable cents, editable output names, filename templates, safe naming, and FLAC/WAV/MP3/M4A export. Originals are left untouched.
- A persistent collection and import rail, restrained lūtera styling, and signed in-app updates from GitHub Releases.

## Releases and installation

Official stable Windows installers live at [GitHub Releases](https://github.com/xaniess/varispeed/releases). Install an NSIS setup executable for signed in-app updates. The portable CI bundle is intended for development testing and is not automatically updated. Windows SmartScreen can still warn because Tauri updater signatures are different from Windows publisher certificates.

The application keeps audio files local. The signed updater requests only the public release feed and downloads an update only when you approve.

See [RELEASES.md](RELEASES.md) for how version tags trigger a signed release.

## Development

Use Node.js LTS, Rust with the Windows MSVC toolchain, and Microsoft C++ Build Tools to compile locally. Alternatively, commit code to a branch and let GitHub Actions compile the Windows installer.

```powershell
npm install
npm test
npm run tauri dev
```

The Rust backend launches only the two bundled FFmpeg sidecars for local audio processing. The preview cache is cleared on application startup. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for FFmpeg licensing details.

## Reference pitch estimation

Reference mode decodes both files to 100 samples per second of log-RMS amplitude envelope using FFmpeg. The estimator searches candidate resampling speed factors and timing offsets, then refines the best matched alignment and reports the corresponding cents value. It does not rely on total file duration, which may include MP3 padding or extra WAV silence.

The estimate is appropriate for two versions of the same recording if pitch and speed changed together. It is not a full key detector, does not identify the pitch of unrelated tracks, and cannot independently identify effects that separate pitch from speed. Low-confidence matches show an unavailable message rather than a number.

Calibration against four privately provided FL Studio original/export pairs recovered +10.0 cents three times and -13.0 cents once. Those recordings are not included in this repository.

## Product design

Follow [lutera_product_guidelines.md](lutera_product_guidelines.md) for the shared design system, supplemented by [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) for this app. The shared guidelines also live in ChatGPT Library at `/lutera_product_guidelines.md`.

## v0.3.4

See [CHANGELOG.md](CHANGELOG.md) for the changes from v0.3.3.
