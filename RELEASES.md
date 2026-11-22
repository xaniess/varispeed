# Signed Varispeed releases

Normal commits and PRs stay as disposable Actions builds. Only a tag such as v0.3.3 creates a stable GitHub Release containing the Windows installer, its updater signature and latest.json update feed.

## One-time repository owner setup

Tauri requires a signing key pair for updater packages. Do NOT commit the private key, put it in a PR, or paste it in chat. The public key is safe to share.

1. On your own trusted computer with Node.js and the Varispeed repository, run the Tauri signer:

   npm install
   npm run tauri signer generate -- -w "$HOME\.tauri\varispeed.key"

   Use a strong passphrase. Store a safe backup of the private key and passphrase. Losing the private key prevents existing installations from trusting subsequent updates without manual reinstall.

2. GitHub Settings > Secrets and variables > Actions:

   * Secret TAURI_SIGNING_PRIVATE_KEY: the complete contents of varispeed.key
   * Secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD: your passphrase
   * Variable TAURI_UPDATER_PUBKEY: complete contents of varispeed.key.pub

3. Merge code and check CI. Update version in package.json, Cargo.toml and tauri.conf.json to the same value. Tag the release commit, e.g. git tag v0.3.3 followed by git push origin v0.3.3.

4. Verify that the GitHub Release includes the NSIS installer, signature and latest.json. Check the release feed at https://github.com/xaniess/varispeed/releases/latest/download/latest.json, then test installation and updating on Windows.

The first signed NSIS installer requires a one-time manual install. Subsequent stable updates can be installed inside Varispeed. Portable development ZIPs are not automatically updated. Checking for updates contacts GitHub only; no audio files or metadata are transmitted.

Tauri updater signatures are not Windows Authenticode certificates, so Windows SmartScreen may still warn. When changing the GitHub username, verify that the update URL redirects correctly and update it before release.
