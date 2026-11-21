# Third-party components and distribution notices

lūtera / varispeed is a Tauri application that relies on two bundled command-line programs, **FFmpeg** and **FFprobe**, to decode and process audio.

At build time, `scripts/prepare-ffmpeg.ps1` downloads an FFmpeg Windows essentials archive from https://www.gyan.dev/ffmpeg/builds/. Those executables are third-party works and are subject to their own LGPL/GPL and other applicable licensing terms, which can vary with build configuration. They are *not* authored or relicensed by this project.

Before distributing an installer publicly, inspect `ffmpeg -buildconf` and the downloaded archive's license documentation, include all required copyright notices, and satisfy any corresponding-source and offer requirements for the actual binary distributed. Upstream FFmpeg legal and source documentation is available at https://ffmpeg.org/legal.html and https://ffmpeg.org/download.html. Repackaging a GPL-enabled binary may trigger GPL compliance obligations.

The GitHub build produces **unsigned pre-release** binaries. Windows SmartScreen may warn about unfamiliar applications; verify the project's code and downloaded files before executing.

Other frontend, Rust and Tauri dependencies retain their respective original licenses.
