# Releasing Varispeed with signed in-app updates

This is the proposed **stable release** process for Windows x64. A regular push or PR
still creates a disposable CI build under Actions; a version-tagged commit produces
a GitHub Release containing the NSIS installer, signature and `latest.json` update feed.

## One-time signing setup (owner only)

The Tauri updater **requires** an Ed25519 signing key pair. It cannot be disabled
and must not be confused with optional Windows Authenticode signing. Do not paste
or commit your private key anywhere, including issues, PRs, chat or source files.

1. On your own trusted computer with Node.js and the project checked out, run:

   ```powershell
   npm install
   npm run tauri signer generate -- -w "$HOME\.tauri\varispeed.key"
   ```

   Choose a long, unique passphrase and keep an offline backup of the private key
   and its passphrase. Losing the private key prevents existing installations from
   trusting later updates without a manual reinstall.

2. In the repository's **Settings > Secrets and variables > Actions**, create:

   - Secret **`TAURI_SIGNING_PRIVATE_KEY`**: the **contents** of the private key file
     (`varispeed.key`), not the path. Do not add it to the repository.
   - Secret **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**: the passphrase chosen above.
   - Variable **`TAURI_UPDATER_PUBKEY`**: the **contents** of the `varispeed.key.pub`
     file. A public key is safe to share.

3. Merge and validate the installer PR and workflow before tagging anything.
   Check that the Windows build succeeds, and that the version in Cargo.toml,
   package.json and src-tauri/tauri.conf.json agrees.

4. Publish a stable version by pushing a matching version tag, for example:

   ```powershell
   git tag v0.3.4
   git push origin v0.3.4
   ```

   Do this **only when the three version files say `0.3.4`**, with the intended
   release commit checked out. Tags are not automatically created for ordinary
   merges, so accidental developer builds won't be published as updates.

5. On the **Releases** page, verify the installer, its `.sig` signature and
   `latest.json` exist. Also verify `releases/latest/download/latest.json` is reachable.
   Only then test the installer and in-app update on Windows.

## User experience

- A **signed, installed** release checks GitHub Releases at startup and via
  **Updates** in the hero. It never downloads or installs without a click.
- When a newer stable version exists, it displays release notes, a progress bar,
  and a **Download & install** action. On Windows, the app closes during install.
- Audio files, track names and metadata are processed locally and never uploaded
  to check for updates. Only the public update feed is requested.
- An unsigned local/CI build does not have updater credentials and tells users
  update checks are available in official signed installer builds.
- Portable CI ZIPs remain manual. For automatic updates, install the first signed
  NSIS release one time.
- Windows SmartScreen may still warn because the Windows executable is not
  Authenticode code signed. Tauri updater signatures authenticate updates but do
  **not** replace a Windows publisher certificate.

## Safety and release policy

Only stable releases should update installations. `releases/latest` excludes
pre-releases and drafts. Test builds stay under Actions; release automation uses
`tauri-apps/tauri-action` and the project's signing credentials to generate
updater artifacts and the `latest.json` manifest.

For now, the update URL references `xaniess/varispeed`. When you change your
GitHub account name, check the updater endpoint and the release asset redirects
before the next app release.
