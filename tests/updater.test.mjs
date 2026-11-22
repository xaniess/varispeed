import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('updates are initiated by the user', () => {
  const js = read('src/updater.js');
  assert.match(js, /await check\(/);
  assert.match(js, /await candidate\.downloadAndInstall/);
  assert.match(js, /install\.addEventListener\('click'/);
});
test('stable releases are tag-triggered and signed', () => {
  const yaml = read('.github/workflows/release.yml');
  assert.match(yaml, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(yaml, /uploadUpdaterJson: true/);
  assert.match(yaml, /prerelease: false/);
  assert.doesNotMatch(read('.github/workflows/windows.yml'), /github-release:/);
});
test('release requires public key at build time', () => {
  assert.match(read('scripts/prepare-release.ps1'), /TAURI_UPDATER_PUBKEY/);
  assert.match(read('src-tauri/src/lib.rs'), /option_env!\("TAURI_UPDATER_PUBKEY"\)/);
});
