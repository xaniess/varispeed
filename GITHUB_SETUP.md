# GitHub development workflow

The repository is [xaniess/varispeed](https://github.com/xaniess/varispeed). The source of truth is `main`.

1. Work on a feature branch and open a pull request. GitHub Actions runs the Node tests and compiles a Windows NSIS installer.
2. Merge after the Windows CI build succeeds. Development artifacts remain in Actions.
3. Update `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` to the matching release version.
4. Push a matching version tag from the merged `main` commit. The release workflow signs the installer with GitHub Actions secrets and publishes the installer, signature, and updater feed under Releases.
5. Verify the release assets and test the in-app updater on Windows. See [RELEASES.md](RELEASES.md).

Do not commit private signing keys, user recordings, or generated audio previews.
