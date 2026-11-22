import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('updater is user-confirmed and only downloads signed release updates', () => {
  const js = read('src/updater.js');
  assert.match(js, /await check\(/);
  assert.match(js, /await update\.downloadAndInstall/);
  assert.match(js, /installButton\.addEventListener\('click'/);
  assert.doesNotMatch(js, /setInterval\([^)]*install/);
});

test('release updates are signed and stable, ordinary builds are not releases', () => {
  const release = read('.github/workflows/release.yml');
  const ci = read('.github/workflows/windows.yml');
  assert.match(release, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(release, /uploadUpdaterJson: true/);
  assert.match(release, /updaterJsonPreferNsis: true/);
  assert.match(release, /prerelease: false/);
  assert.match(release, /tags:/);
  assert.doesNotMatch(ci, /github-release:/);
});

test('private keys are not committed and release builds require explicit key setup', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const script = read('scripts/prepare-release.ps1');
  assert.equal(conf.bundle.createUpdaterArtifacts, undefined);
  assert.match(script, /TAURI_UPDATER_PUBKEY/);
  assert.match(script, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(script, /releases\/latest\/download\/latest\.json/);
  assert.match(read('src-tauri/src/lib.rs'), /option_env!\("TAURI_UPDATER_PUBKEY"\)/);
});
