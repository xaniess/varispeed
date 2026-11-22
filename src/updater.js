import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';

// The only network request is the public GitHub release feed. Audio stays local.
const nav = document.querySelector('.topline');
if (nav) {
  const section = document.createElement('section');
  section.className = 'update-control';
  section.innerHTML = '<button class="update-toggle" type="button" aria-expanded="false">Updates <span class="update-dot" aria-hidden="true"></span></button>' +
    '<div class="update-panel" hidden><div class="update-heading"><strong>Software updates</strong><button class="update-close" aria-label="Close">×</button></div>' +
    '<p class="update-meta">Installed <b class="update-current">...</b><b class="update-new" hidden></b></p><p class="update-status" role="status" aria-live="polite">Checking...</p>' +
    '<p class="update-notes" hidden></p><div class="update-progress" hidden><div></div></div>' +
    '<div class="update-actions"><button class="update-check">Check again</button><button class="update-install" hidden>Download &amp; install</button></div>' +
    '<a href="https://github.com/xaniess/varispeed/releases" target="_blank" rel="noopener noreferrer">Release history</a></div>';
  nav.append(section);
  const $ = selector => section.querySelector(selector);
  const toggle = $('.update-toggle'), panel = $('.update-panel'), status = $('.update-status');
  const notes = $('.update-notes'), install = $('.update-install'), checkButton = $('.update-check');
  const latest = $('.update-new'), bar = $('.update-progress'), progress = $('.update-progress > div');
  let candidate = null, busy = false;
  function setOpen(open) { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); }
  function setBusy(working) { busy = working; checkButton.disabled = working; install.disabled = working; }
  async function refresh(open = false) {
    if (busy) return;
    if (open) setOpen(true);
    setBusy(true); status.textContent = 'Checking GitHub Releases...';
    if (candidate) { await candidate.close().catch(() => {}); candidate = null; }
    notes.hidden = true; install.hidden = true; latest.hidden = true; bar.hidden = true;
    $('.update-dot').classList.remove('available');
    try {
      candidate = await check({ timeout: 12000 });
      if (!candidate) status.textContent = 'You are up to date.';
      else {
        latest.textContent = 'Available v' + candidate.version;
        latest.hidden = false;
        notes.textContent = String(candidate.body || 'A new Varispeed version is ready.').slice(0, 1600);
        notes.hidden = false; install.hidden = false;
        $('.update-dot').classList.add('available');
        status.textContent = 'New version available.';
      }
    } catch (e) {
      status.textContent = /plugin updater not found|command .* not found|unknown plugin|not allowed/i.test(String(e))
        ? 'Update checks require an official signed installer build.'
        : 'Unable to check for updates. Try again when online.';
      console.warn('Update check:', e);
    } finally { setBusy(false); }
  }
  async function download() {
    if (busy || !candidate) return;
    setBusy(true); bar.hidden = false; progress.style.width = '0%';
    let received = 0, total = 0;
    try {
      await candidate.downloadAndInstall(event => {
        if (event.event === 'Started') { total = Number(event.data.contentLength) || 0; received = 0; }
        if (event.event === 'Progress') {
          received += Number(event.data.chunkLength) || 0;
          const pct = total ? Math.min(100, Math.round(received * 100 / total)) : 0;
          if (total) progress.style.width = pct + '%';
          status.textContent = total ? 'Downloading ' + pct + '%...' : 'Downloading update...';
        }
        if (event.event === 'Finished') { progress.style.width = '100%'; status.textContent = 'Download verified. Launching installer...'; }
      });
      status.textContent = 'Installer launched. Varispeed will close on Windows.';
    } catch (e) {
      status.textContent = 'Update failed: ' + String(e);
      console.error('Update installer:', e);
    } finally { setBusy(false); }
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  $('.update-close').addEventListener('click', () => setOpen(false));
  checkButton.addEventListener('click', () => void refresh(true));
  install.addEventListener('click', () => void download());
  document.addEventListener('pointerdown', event => { if (!section.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  void getVersion().then(version => { $('.update-current').textContent = 'v' + version; }).catch(() => { $('.update-current').textContent = 'development'; });
  void refresh();
}
