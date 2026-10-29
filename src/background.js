/* UltraWide YouTube — arka plan betiği.
 * - Klavye kısayolunu (Alt+Shift+U) global aç/kapat anahtarına bağlar.
 * - Araç çubuğu rozetini güncel duruma göre boyar.
 * Ayarlar storage.local üzerinde tutulur; içerik betikleri değişikliği
 * kendiliğinden algılar, bu yüzden sekmelere mesaj göndermeye gerek yoktur.
 */

'use strict';

const DEFAULTS = {
  enabled: true,
  mode: 'bars',
  ratio: 'screen',
  applyTheater: true,
  applyWindow: false,
};

async function ensureDefaults() {
  const stored = await browser.storage.local.get(DEFAULTS);
  // Eski sürümlerden gelen kullanıcıları yeni varsayılan moda bir kez taşı.
  if (!stored.barsMigrated) {
    stored.mode = 'bars';
    stored.barsMigrated = true;
  }
  await browser.storage.local.set(stored);
}

async function refreshBadge() {
  try {
    const { enabled = true } = await browser.storage.local.get({ enabled: true });
    await browser.browserAction.setBadgeBackgroundColor({ color: enabled ? '#8a2be2' : '#5b6172' });
    await browser.browserAction.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  } catch (err) {
    // Rozet desteklenmiyorsa sessizce geç.
  }
}

browser.runtime.onInstalled.addListener(() => {
  ensureDefaults().then(refreshBadge);
});

browser.runtime.onStartup.addListener(() => {
  ensureDefaults().then(refreshBadge);
});

browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-ultrawide') return;
  const { enabled = true } = await browser.storage.local.get({ enabled: true });
  await browser.storage.local.set({ enabled: !enabled });
  await refreshBadge();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) refreshBadge();
});

refreshBadge();
