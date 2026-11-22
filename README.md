# lūtera / varispeed v0.3.2 — Tauri edition

A small, local-first audio utility. **Not Electron. Not Python.** The UI runs in Tauri 2 / Windows WebView2, the native layer is Rust, and FFmpeg + FFprobe are included in a built release as sidecars.

## Core experience

- Import batches of music in supported formats (or drag them onto the app).
- Shift audio **exactly** in cents by conventional resampling, changing pitch **and** playback speed together.
- A/B playback in the listening room with two independently decoded waveforms and accurate reported durations.
- Switch A and B at corresponding **normalized positions** in the song. The player tracks each file's elapsed time independently. This is an alignment convenience, not sample-perfect phase-locked switching.
- **Processed B**: preview our exact-cent conversion before export.
- **Reference file B**: choose any other real audio export (e.g. your FL Studio version) and compare that file directly, including source-file and decoded playback durations. The application deliberately **does not infer cents from whole-file duration**; encoder padding and trimming can make that estimate misleading. It shows source-file length in the waveform caption and decoded playback length alongside the timeline.
- Pitch presets: ±10 cents, ±13 cents, zero, or enter decimal values. Apply to selected track or the whole queue.
- Filename template `{stem} [{cents}]` plus `{artist}`, `{title}`, `{album}`, `{track}`; editable per-track export names; invalid Windows filename characters replaced; collisions receive `(2)`, `(3)`, etc.; source files are never overwritten.
- Batch FLAC (lossless), WAV 24-bit, MP3 320 kbps, M4A AAC 256 kbps export. Text metadata is copied when supported by the destination; embedded artwork is **not guaranteed to carry over**.
- Updated lūtera visual direction (November 21, detailed in **[DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md)**): ivory, cream, champagne and faint amber **atmosphere**, with chrome/silver and graphite **materials**; no copper and no blue-centered branding. Doorway threshold and a provisional 7-point gothic rosette motif; reduced motion support; no remote data dependency.

## How to build on Windows 11

**The ZIP is a source project, not a precompiled Windows executable.** Running the desktop app after compiling does **not** require Node.js or Rust installed, but compiling it locally does.

One-time build requirements:

1. [Node.js LTS](https://nodejs.org/), if not already available.
2. [Rust](https://rustup.rs/) with the `x86_64-pc-windows-msvc` toolchain (includes `cargo`).
3. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): choose the **Desktop development with C++** workload and Windows SDK.
4. **WebView2** (usually already installed on current Windows 11) — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
5. Internet connection on first build to download dependencies and FFmpeg from gyan.dev.

Extract this ZIP. Double-click **`BUILD_WINDOWS.bat`**. It checks for Node and Rust, downloads and renames FFmpeg sidecars, tests the JavaScript helpers, builds a Windows NSIS installer, and also stages a portable folder.

- Installer: `src-tauri/target/release/bundle/nsis/` (run the generated setup EXE).
- Portable: `release-portable/` (run `lutera-varispeed.exe` **with `ffmpeg.exe` and `ffprobe.exe` in the same folder**). Windows WebView2 must be installed.
- For development: `RUN_DEV_WINDOWS.bat`.

### Preferred: build with GitHub Actions

Follow **[GITHUB_SETUP.md](GITHUB_SETUP.md)** to create a private repository, then double-click **`PUSH_TO_GITHUB.bat`** (Git required) to push the source once. Every push to `main` runs tests and compiles the Windows installer and portable package; pushing a version tag creates a GitHub pre-release automatically. Downloads live in Actions artifacts or Releases. No Rust/C++ installation on your PC is necessary. **A Windows GitHub Actions build has not yet been run or verified.**

## Listening room: A/B instructions

1. Add your original file; select it in the collection.
2. Enter `+10` or `−13` (in **exact cents**) for an automated version. Choose **Processed B**.
3. Press Play. Switch A / B using buttons or keyboard A and B. Playback jumps to the same **percentage of the song**, accounting for different lengths. Click either waveform to seek at a specific percentage.
4. Read `0:00.000 / 0:00.000` above each waveform and the **B − A** duration difference below the player.
5. To compare an existing FL Studio WAV against its original, choose **Reference file B**, then **Choose reference WAV / MP3**. The B waveform and B duration now reflect the imported real reference, not an approximation or synthetic render.
6. Export via the naming and format controls. The **Export collection** button exports all tracks with their individual shifts. The chosen reference is for listening only; it is not what gets exported.

Preview files are explicitly scoped to the app cache (`$APPCACHE/wave-previews/`) so the WebView can play locally decoded WAV audio without exposing arbitrary folders. The preview generation decodes the entire song to temporary WAV files. Large albums take disk space and some seconds to prepare. The cache is cleared when the application starts. The A/B switch is position-aligned rather than gapless; momentary switching latency can depend on the Windows audio backend.

## Audio engine and calibration

For a requested pitch value `c` in cents:

`speed = 2^(c/1200)`

`predicted duration = original duration / speed`

The backend uses FFmpeg `asetrate=round(sourceSampleRate * speed),aresample=sourceSampleRate:filter_size=64`, then encodes the output. Since `asetrate` is an integer number of Hz, the precise effective value is reported in the preview. The same filter is used for preview **and** export.

Ground truth from two supplied FL Studio export pairs:

- `wipe ur tears.wav` / `wipe ur tears d13.wav`: approximately −13 cents and 0.992519× speed.
- `kys.mp3` / `untitled - kys.wav`: **+10.00 cents** and 1.005792941× speed; waveform correlation exceeds 99% when the MP3 is resampled by the exact +10 cents, allowing for an approximately 11 ms starting offset. The two whole-file durations differ partly because the MP3 and FL Studio export have different leading/trailing padding; don't infer pitch solely from this ratio.

**These user-supplied recordings are not included in the project ZIP.**

## Security and licensing

Only the native Rust backend can launch the two named FFmpeg sidecars. Export filenames are sanitized and exports go to the source folder or a folder you choose. No network calls are made by the app at normal runtime. The build script downloads a third-party FFmpeg distribution; see **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** before publicly redistributing compiled builds. FFmpeg is a separately licensed work.

## Testing and status

Run `npm test` to validate cent ratios, duration math, name templates, and filename safety. The UI source can be inspected without compiling, but the audio backend and final Windows Tauri binary **have not been compiled or manually tested on Windows in this authoring environment**. Report a Windows build error with the full message and `rustc -V`, `node -v` if needed.

## v0.3.2 monitoring refinements

- Optional **Pan cue** sends A to the left ear and B to the right ear, using the Web Audio stereo panner. It only affects listening; exported files remain untouched. Designed for headphones.
- A/B switching now performs a short gain-ramped handoff (35 ms) when Web Audio is available, minimizing switch clicks.
- Waveforms use cached canvas images and animation-frame playheads rather than reconstructing bars at each audio event.
- A single version identifier stays in the package metadata; repeated on-screen version marks and explanatory copy have been removed.
- All visible em dashes are removed; the interface uses short labels and reduced motion support.

The native Windows UI and headphone panning behavior must still be validated on Windows.
