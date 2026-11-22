import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';

// Updates are available in signed release installers. No audio or filenames
// are transmitted. The updater contacts only the public GitHub Releases endpoint.
const UPDATE_URL = 'https://github.com/xaniess/varispeed/releases';
const nav = document.querySelector('.hero');

if (nav) {
  const section = document.createElement('section');
  section.className = 'update-control';
  section.innerHTML = `
    <button class="update-trigger" type="button" aria-expanded="false" aria-controls="update-panel">
      <svg class="update-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8m0-5v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16m0 5v-5h-5" /></svg><span>Updates</span><span class="update-indicator" aria-hidden="true"></span>
    </button>
    <div class="update-panel" id="update-panel" hidden>
      <div class="update-heading"><strong>Software updates</strong><button type="button" class="update-close" aria-label="Close updates">×</button></div>
      <div class="update-meta">Installed <strong id="update-installed">...</strong><span id="update-available" hidden></span></div>
      <p class="update-status" id="update-status" role="status" aria-live="polite">Checking for updates...</p>
      <div class="update-notes" id="update-notes" hidden></div>
      <div class="update-progress" id="update-progress" hidden><div id="update-progress-fill"></div></div>
      <div class="update-actions">
        <button class="update-check" type="button">Check again</button>
        <button class="update-install" type="button" hidden>Download &amp; install</button>
      </div>
      <a class="update-releases" href="${UPDATE_URL}" target="_blank" rel="noopener noreferrer">Release history</a>
    </div>`;
  nav.append(section);

  const $ = (selector) => section.querySelector(selector);
  const trigger = $('.update-trigger');
  const panel = $('.update-panel');
  const indicator = $('.update-indicator');
  const closeButton = $('.update-close');
  const status = $('.update-status');
  const installed = $('#update-installed');
  const available = $('#update-available');
  const notes = $('#update-notes');
  const progress = $('#update-progress');
  const progressFill = $('#update-progress-fill');
  const checkButton = $('.update-check');
  const installButton = $('.update-install');
  let candidate = null;
  let busy = false;

  function setOpen(open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }
  function setStatus(message) { status.textContent = message; }
  function setBusy(value) {
    busy = value;
    checkButton.disabled = value;
    installButton.disabled = value;
  }
  function clearCandidate() {
    if (candidate) void candidate.close().catch(() => {});
    candidate = null;
    available.hidden = true;
    notes.hidden = true;
    notes.textContent = '';
    installButton.hidden = true;
    progress.hidden = true;
    progressFill.style.width = '0%';
    indicator.classList.remove('has-update');
  }
  async function checkForUpdate({ open = false } = {}) {
    if (busy) return;
    if (open) setOpen(true);
    setBusy(true);
    clearCandidate();
    setStatus('Checking GitHub Releases...');
    try {
      const result = await check({ timeout: 12000 });
      if (!result) {
        setStatus('You are up to date.');
      } else {
        candidate = result;
        available.hidden = false;
        available.textContent = `New ${result.version}`;
        setStatus('An update is available.');
        notes.textContent = String(result.body || 'A newer version of Varispeed is available.').slice(0, 2000);
        notes.hidden = false;
        installButton.hidden = false;
        indicator.classList.add('has-update');
      }
    } catch (error) {
      // Dev and unsigned Actions builds do not register the updater plugin.
      const message = String(error);
      const unsigned = /plugin updater not found|command .* not found|unknown plugin|not allowed/i.test(message);
      setStatus(unsigned ? 'Update checks are available in official signed installer builds.' : 'Could not check for updates. Check your connection and try again.');
      console.warn('Updater check:', error);
    } finally {
      setBusy(false);
    }
  }
  async function installUpdate() {
    if (busy || !candidate) return;
    setBusy(true);
    const update = candidate;
    candidate = null;
    let downloaded = 0;
    let total = 0;
    progress.hidden = false;
    progressFill.style.width = '0%';
    installButton.textContent = 'Installing...';
    setStatus('Downloading signed update...');
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = Number(event.data.contentLength) || 0;
          downloaded = 0;
        } else if (event.event === 'Progress') {
          downloaded += Number(event.data.chunkLength) || 0;
          if (total) progressFill.style.width = `${Math.min(100, Math.round((downloaded / total) * 100))}%`;
          setStatus(total ? `Downloading ${Math.min(100, Math.round((downloaded / total) * 100))}%...` : 'Downloading update...');
        } else if (event.event === 'Finished') {
          progressFill.style.width = '100%';
          setStatus('Download verified. Launching installer...');
        }
      });
      setStatus('Installing update. Varispeed will close on Windows.');
    } catch (error) {
      candidate = update;
      setStatus(`Update failed: ${String(error)}`);
      installButton.textContent = 'Retry install';
      console.error('Updater installation:', error);
    } finally {
      setBusy(false);
    }
  }

  trigger.addEventListener('click', () => {
    if (!panel.hidden) return setOpen(false);
    setOpen(true);
  });
  closeButton.addEventListener('click', () => setOpen(false));
  checkButton.addEventListener('click', () => void checkForUpdate({ open: true }));
  installButton.addEventListener('click', () => void installUpdate());
  document.addEventListener('pointerdown', (event) => {
    if (!section.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  window.addEventListener('beforeunload', () => { if (candidate) void candidate.close().catch(() => {}); });
  void getVersion().then((version) => { installed.textContent = `v${version}`; }).catch(() => { installed.textContent = 'Development'; });
  // A single lightweight request at startup; installation always requires a click.
  void checkForUpdate();
}
