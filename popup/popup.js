/* UltraWide YouTube — popup mantığı.
 * Ayarlar doğrudan storage.local'e yazılır; içerik betiği
 * storage.onChanged ile anında tepki verir.
 */

'use strict';

const DEFAULTS = {
  enabled: true,
  mode: 'bars',
  ratio: 'screen',
  applyTheater: true,
  applyWindow: false,
};

const el = {
  enabled: document.getElementById('enabled'),
  ratio: document.getElementById('ratio'),
  applyTheater: document.getElementById('applyTheater'),
  applyWindow: document.getElementById('applyWindow'),
  panel: document.getElementById('panel'),
  status: document.getElementById('status'),
  modeHint: document.getElementById('modeHint'),
  segments: Array.from(document.querySelectorAll('.seg')),
};

let state = { ...DEFAULTS };

const HINTS = {
  bars: 'Yalnızca yan siyah bant varsa videoyu yatay esneterek doldurur; kırpma yapmaz, video zaten sığıyorsa hiç dokunmaz.',
  cover: 'Oran korunur; taşan üst/alt kısımlar kırpılarak çerçeve doldurulur.',
  fill: 'Görüntü çerçeveye esnetilir. Tam ekranı kaplar ama oran bozulur.',
};

function render() {
  el.enabled.checked = !!state.enabled;
  el.ratio.value = state.ratio;
  el.applyTheater.checked = !!state.applyTheater;
  el.applyWindow.checked = !!state.applyWindow;
  el.ratio.disabled = !state.enabled;
  el.panel.classList.toggle('disabled', !state.enabled);

  for (const btn of el.segments) {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  }

  el.modeHint.textContent = HINTS[state.mode] || HINTS.cover;
}

async function save(patch) {
  state = { ...state, ...patch };
  render();
  try {
    await browser.storage.local.set(patch);
  } catch (err) {
    /* yazma başarısız olursa arayüz yine de güncel kalsın */
  }
}

async function checkActiveTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = (tab && tab.url) || '';
    const isYouTube = /^https?:\/\/([^/]*\.)?youtube(-nocookie)?\.com\//.test(url);

    if (isYouTube) {
      el.status.textContent = 'Bu sekmede YouTube açık — değişiklikler anında uygulanır.';
      el.status.className = 'status ok';
    } else {
      el.status.textContent = 'Bu sekme YouTube değil. Bir video sayfası açın.';
      el.status.className = 'status warn';
    }
  } catch (err) {
    el.status.textContent = '';
    el.status.className = 'status';
  }
}

async function init() {
  try {
    const stored = await browser.storage.local.get(DEFAULTS);
    state = { ...DEFAULTS, ...stored };
  } catch (err) {
    state = { ...DEFAULTS };
  }
  render();
  checkActiveTab();
}

el.enabled.addEventListener('change', () => save({ enabled: el.enabled.checked }));
el.ratio.addEventListener('change', () => save({ ratio: el.ratio.value }));
el.applyTheater.addEventListener('change', () => save({ applyTheater: el.applyTheater.checked }));
el.applyWindow.addEventListener('change', () => save({ applyWindow: el.applyWindow.checked }));

for (const btn of el.segments) {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode !== state.mode) save({ mode: btn.dataset.mode });
  });
}

init();
