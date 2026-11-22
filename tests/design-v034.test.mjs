import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve('.');
const read = path => readFileSync(join(root, path), 'utf8');

test('brand layout uses one centered lūtera wordmark, persistent actions and uncropped door', () => {
  const html = read('index.html');
  const css = read('src/refinement.css');
  const updater = read('src/updater.js');
  assert.doesNotMatch(html, /class="topline"|AS WITHIN|MADE BY|A LŪTERA INSTRUMENT/);
  assert.match(html, /class="footer-wordmark">lūtera</);
  assert.match(html, /src\/refinement\.css/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /height:\s*calc\(100dvh/);
  assert.match(css, /\.door-frame\s*\{[^}]*bottom:\s*4px/);
  assert.match(updater, /querySelector\('\.hero'\)/);
  assert.match(html, /class="empty-mark"><svg/);
});

test('reference mode prefers matched timing and labels duration fallback', () => {
  assert.match(read('index.html'), /id="reference-analysis"/);
  assert.match(read('src/app.js'), /bestReferenceEstimate\(/);
  assert.match(read('src-tauri/src/lib.rs'), /async fn timing_envelope/);
  assert.match(read('src-tauri/src/lib.rs'), /reference_signal_a/);
  assert.match(read('src/reference-analysis.js'), /timingCorrelation/);
});

test('version 0.3.5 is consistent and no source text uses em dashes', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.3.5');
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, '0.3.5');
  assert.match(read('src-tauri/Cargo.toml'), /version = "0\.3\.5"/);
  const skip = new Set(['node_modules','dist','.git','target']);
  function scan(dir) {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const file = join(dir,entry);
      if (statSync(file).isDirectory()) scan(file);
      else if (!/\.(png|ico|exe|zip)$/.test(file)) {
        assert.ok(!readFileSync(file,'utf8').includes(String.fromCharCode(0x2014)), `em dash in ${file}`);
      }
    }
  }
  scan(root);
});
