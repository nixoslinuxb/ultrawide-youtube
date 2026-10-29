/*
 * jsdom tabanlı test koşum takımı (opsiyonel geliştirici testi).
 *
 *   npm i -D jsdom
 *   node tests/content.test.cjs
 *
 * jsdom gerçek yerleşim hesaplamaz; bu yüzden getBoundingClientRect'i basit
 * bir yerleşim modeliyle taklit ediyoruz. Model, eklentinin yazdığı
 * `data-uw-frame` etiketini ve `--uw-player-h` değişkenini "CSS uygulanmış"
 * kabul eder; böylece etiketleme ve geri besleme mantığı gerçekten sınanır.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');

function buildHtml(theater) {
  return `<!DOCTYPE html><html><head></head><body>
    <ytd-watch-flexy${theater ? ' theater' : ''}>
      <div id="columns"><div id="primary"><div id="primary-inner">
        <div id="player">
          <div id="player-container-outer"><div id="player-container-inner"><div id="player-container">
            <ytd-player><div id="container">
              <div id="movie_player" class="html5-video-player">
                <div class="html5-video-container">
                  <video class="html5-main-video"></video>
                </div>
                <div class="ytp-chrome-bottom"></div>
              </div>
            </div></ytd-player>
          </div></div></div>
          <div id="player-ads"></div>
        </div>
        <div id="below"></div>
      </div></div></div>
    </ytd-watch-flexy>
  </body></html>`;
}

function setup(opts) {
  const {
    url = 'https://www.youtube.com/watch?v=abc',
    theater = true,
    pageWidth = 2560,
    viewportWidth = 2560,
    viewportHeight = 1080,
    top = 60,
    containerHeight = 1016,
    playerFixedHeight = null,
    playerWidth = null,
    videoWidth = 1920,
    videoHeight = 1080,
    settings = {},
  } = opts || {};

  const dom = new JSDOM(buildHtml(theater), { url, runScripts: 'outside-only' });
  const win = dom.window;
  const doc = win.document;

  // --- Zamanlayıcılar: rAF'ı elle boşaltalım, interval'i kapat ---
  const rafQueue = [];
  win.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  win.cancelAnimationFrame = () => {};
  win.setInterval = () => 0;

  // --- Pencere boyutları ---
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: viewportWidth });
  Object.defineProperty(win, 'innerHeight', { configurable: true, value: viewportHeight });

  // --- storage mock ---
  const store = Object.assign(
    {
      enabled: true,
      mode: 'bars',
      ratio: 'screen',
      applyTheater: true,
      applyWindow: false,
    },
    settings,
  );
  const listeners = [];
  win.browser = {
    storage: {
      local: {
        get: async (defaults) => {
          if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
            const out = { ...defaults };
            for (const key of Object.keys(defaults)) {
              if (store[key] !== undefined) out[key] = store[key];
            }
            return out;
          }
          return { ...store };
        },
        set: async (patch) => {
          Object.assign(store, patch);
        },
      },
      onChanged: {
        addListener: (fn) => listeners.push(fn),
      },
    },
  };

  function update(patch) {
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      changes[key] = { oldValue: store[key], newValue: value };
    }
    Object.assign(store, patch);
    for (const fn of listeners) fn(changes, 'local');
  }

  // --- fullscreen ---
  let fsElement = null;
  Object.defineProperty(doc, 'fullscreenElement', { configurable: true, get: () => fsElement });
  const setFullscreen = (el) => {
    fsElement = el;
    doc.dispatchEvent(new win.Event('fullscreenchange'));
  };

  // --- yerleşim modeli ---
  const widthSelectors = [
    'ytd-watch-flexy',
    '#columns',
    '#primary',
    '#primary-inner',
    '#player',
    '#player-container-outer',
    '#player-container-inner',
    '#player-container',
    'ytd-player',
    '#container',
    '#movie_player',
    '.html5-video-container',
  ];
  for (const sel of widthSelectors) {
    for (const node of doc.querySelectorAll(sel)) {
      node.__w = pageWidth;
      node.__top = top;
    }
  }
  doc.querySelector('#below').__fixedH = 2000;
  if (playerFixedHeight != null) doc.querySelector('#player').__fixedH = playerFixedHeight;
  doc.querySelector('#movie_player').__fixedH = containerHeight;
  if (playerWidth != null) doc.querySelector('#movie_player').__w = playerWidth;

  const video = doc.querySelector('video');
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: videoWidth });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: videoHeight });

  function readVars() {
    const style = doc.getElementById('uw-yt-vars-style');
    const out = {};
    if (!style) return out;
    for (const m of style.textContent.matchAll(/(--[\w-]+):\s*([^;{}]+)/g)) {
      const raw = m[2].trim();
      const num = parseFloat(raw);
      out[m[1]] = Number.isNaN(num) ? raw : num;
    }
    return out;
  }

  function heightOf(node) {
    if (!node || node.nodeType !== 1) return 0;
    const expanded = doc.documentElement.classList.contains('uw-expand-player');
    if (expanded && node.hasAttribute('data-uw-frame')) {
      const forced = readVars()['--uw-player-h'];
      if (forced != null) return forced;
    }
    if (node.__fixedH != null) return node.__fixedH;
    let sum = 0;
    for (const child of node.children) sum += heightOf(child);
    return sum;
  }

  win.Element.prototype.getBoundingClientRect = function getRect() {
    const width = this.__w || 0;
    const height = heightOf(this);
    const topPx = this.__top || 0;
    return {
      x: 0,
      y: topPx,
      top: topPx,
      left: 0,
      width,
      height,
      right: width,
      bottom: topPx + height,
      toJSON() {},
    };
  };

  // --- betiği çalıştır ---
  win.eval(SRC);

  async function settle(rounds = 40) {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let cbs;
      let safety = 0;
      while ((cbs = rafQueue.splice(0, rafQueue.length)).length && safety++ < 200) {
        for (const cb of cbs) cb(16);
      }
    }
  }

  function tagged() {
    return Array.from(doc.querySelectorAll('[data-uw-frame]'));
  }

  return { win, doc, settle, update, setFullscreen, readVars, heightOf, tagged, video };
}

function near(actual, expected, tolerance = 1.5) {
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/* ------------------------------------------------------------------ */

test('ultra geniş sinema: video kabı doldurur, genişletme gerekmez', async () => {
  const env = setup({ pageWidth: 2560, viewportWidth: 2560, containerHeight: 1016, top: 60 });
  await env.settle();

  assert.ok(env.doc.documentElement.classList.contains('uw-active'), 'uw-active yok');
  assert.ok(env.video.hasAttribute('data-uw-video'), 'video etiketlenmedi');
  assert.strictEqual(env.tagged().length, 0, 'gereksiz frame etiketi var');

  const v = env.readVars();
  assert.ok(near(v['--uw-width'], 2560), `genişlik 2560 değil: ${v['--uw-width']}`);
  assert.ok(near(v['--uw-height'], 1016), `yükseklik 1016 değil: ${v['--uw-height']}`);
  assert.strictEqual(env.video.parentElement.hasAttribute('data-uw-container'), true);
});

test('genişletme + geri besleme: kısıtlayan ata etiketlenir', async () => {
  const env = setup({
    pageWidth: 2560,
    viewportWidth: 2560,
    containerHeight: 700,
    playerFixedHeight: 700,
    top: 60,
    settings: { mode: 'cover', ratio: '21:9' },
  });
  await env.settle();

  const player = env.doc.querySelector('#movie_player');
  const playerWrap = env.doc.querySelector('#player');
  const primaryInner = env.doc.querySelector('#primary-inner');

  assert.ok(player.hasAttribute('data-uw-frame'), '#movie_player etiketlenmedi');
  assert.ok(playerWrap.hasAttribute('data-uw-frame'), 'geri besleme #player etiketlemedi');
  assert.ok(!primaryInner.hasAttribute('data-uw-frame'), '#primary-inner yanlış etiketlendi');

  const v = env.readVars();
  assert.ok(near(v['--uw-player-h'], 1016), `oyuncu yüksekliği 1016 değil: ${v['--uw-player-h']}`);
  assert.ok(near(env.heightOf(player), 1016), 'player yüksekliği uygulanmadı');
  // frame 21:9 ve yükseklik 1016 -> genişlik ~2371
  assert.ok(near(v['--uw-width'], 2371, 2), `frame genişliği yanlış: ${v['--uw-width']}`);
});

test('tam ekran: ekranı doldurur, frame etiketi yok', async () => {
  const env = setup({
    pageWidth: 2560,
    viewportWidth: 2560,
    viewportHeight: 1080,
    containerHeight: 1080,
    top: 0,
  });
  const player = env.doc.querySelector('#movie_player');
  env.setFullscreen(player);
  await env.settle();

  assert.ok(env.video.hasAttribute('data-uw-video'), 'video etiketlenmedi');
  assert.strictEqual(env.tagged().length, 0, 'tam ekranda frame etiketi olmamalı');
  const v = env.readVars();
  assert.ok(near(v['--uw-width'], 2560), `genişlik yanlış: ${v['--uw-width']}`);
  assert.ok(near(v['--uw-height'], 1080), `yükseklik yanlış: ${v['--uw-height']}`);
});

test('Shorts sayfasında devre dışı', async () => {
  const env = setup({ url: 'https://www.youtube.com/shorts/xyz', pageWidth: 1000 });
  await env.settle();

  assert.ok(!env.doc.documentElement.classList.contains('uw-active'), 'Shorts aktif olmamalı');
  assert.ok(!env.video.hasAttribute('data-uw-video'), 'Shorts video etiketlenmemeli');
});

test('ayar kapalıyken hiçbir şey uygulanmaz', async () => {
  const env = setup({ settings: { enabled: false } });
  await env.settle();

  assert.ok(!env.doc.documentElement.classList.contains('uw-active'), 'kapalıyken aktif');
  assert.ok(!env.video.hasAttribute('data-uw-video'), 'kapalıyken video etiketli');
  assert.strictEqual(env.tagged().length, 0, 'kapalıyken frame etiketi var');
});

test('sinema modundan çıkınca etiketler temizlenir', async () => {
  const env = setup({
    pageWidth: 2560,
    viewportWidth: 2560,
    containerHeight: 700,
    playerFixedHeight: 700,
    top: 60,
    settings: { ratio: '21:9' },
  });
  await env.settle();
  assert.ok(env.tagged().length > 0, 'başlangıçta etiket yok');

  env.doc.querySelector('ytd-watch-flexy').removeAttribute('theater');
  env.doc.dispatchEvent(new env.win.Event('yt-navigate-finish'));
  await env.settle();

  assert.strictEqual(env.tagged().length, 0, 'etiketler temizlenmedi');
  assert.ok(!env.doc.documentElement.classList.contains('uw-active'), 'uw-active kaldı');
  assert.ok(!env.video.hasAttribute('data-uw-video'), 'video etiketi kaldı');
});

test('sinema: daraltılmış (pillarbox) oynatıcı yatay genişletilir', async () => {
  const env = setup({
    pageWidth: 3440,
    viewportWidth: 3440,
    viewportHeight: 1440,
    top: 60,
    containerHeight: 1376,
    playerWidth: 1920,
  });
  await env.settle();

  const v = env.readVars();
  assert.ok(near(v['--uw-player-w'], 3440), `oynatıcı genişliği 3440 değil: ${v['--uw-player-w']}`);
  assert.ok(near(v['--uw-player-h'], 1376), `oynatıcı yüksekliği 1376 değil: ${v['--uw-player-h']}`);
  assert.ok(near(v['--uw-width'], 3440), `frame genişliği 3440 değil: ${v['--uw-width']}`);
  assert.ok(near(v['--uw-height'], 1376), `frame yüksekliği 1376 değil: ${v['--uw-height']}`);

  assert.ok(
    env.doc.querySelector('#movie_player').hasAttribute('data-uw-frame'),
    'oynatıcı etiketlenmedi',
  );
  assert.ok(
    !env.doc.querySelector('#primary-inner').hasAttribute('data-uw-frame'),
    '#primary-inner yanlış etiketlendi',
  );
});

test('tam ekran 3440×1440: ekranı birebir doldurur', async () => {
  const env = setup({
    pageWidth: 3440,
    viewportWidth: 3440,
    viewportHeight: 1440,
    top: 0,
    containerHeight: 1440,
    settings: { mode: 'cover', ratio: '3440:1440' },
  });
  const player = env.doc.querySelector('#movie_player');
  env.setFullscreen(player);
  await env.settle();

  const v = env.readVars();
  assert.ok(near(v['--uw-width'], 3440), `genişlik 3440 değil: ${v['--uw-width']}`);
  assert.ok(near(v['--uw-height'], 1440), `yükseklik 1440 değil: ${v['--uw-height']}`);
  assert.strictEqual(env.tagged().length, 0, 'tam ekranda frame etiketi olmamalı');
});

/* ------------------------------------------------------------------ */

test('bars: tam ekran 3440×1440, 16:9 video yatay esnetilir (kırpma yok)', async () => {
  const env = setup({
    pageWidth: 3440,
    viewportWidth: 3440,
    viewportHeight: 1440,
    top: 0,
    containerHeight: 1440,
    videoWidth: 1920,
    videoHeight: 1080,
  });
  const player = env.doc.querySelector('#movie_player');
  env.setFullscreen(player);
  await env.settle();

  assert.ok(env.doc.documentElement.classList.contains('uw-active'), 'uw-active yok');
  assert.ok(env.video.hasAttribute('data-uw-video'), 'video etiketlenmedi');
  const v = env.readVars();
  assert.strictEqual(v['--uw-fit'], 'fill', `fit fill değil: ${v['--uw-fit']}`);
  assert.ok(near(v['--uw-width'], 3440), `genişlik 3440 değil: ${v['--uw-width']}`);
  assert.ok(near(v['--uw-height'], 1440), `yükseklik 1440 değil: ${v['--uw-height']}`);
});

test('bars: video ekranla aynı orandaysa hiç dokunmaz', async () => {
  const env = setup({
    pageWidth: 3440,
    viewportWidth: 3440,
    viewportHeight: 1440,
    top: 0,
    containerHeight: 1440,
    videoWidth: 3440,
    videoHeight: 1440,
  });
  const player = env.doc.querySelector('#movie_player');
  env.setFullscreen(player);
  await env.settle();

  assert.ok(!env.doc.documentElement.classList.contains('uw-active'), 'uw-active olmamalı');
  assert.ok(!env.video.hasAttribute('data-uw-video'), 'video etiketlenmemeli');
  assert.strictEqual(env.tagged().length, 0, 'frame etiketi olmamalı');
});

test('bars: video ekrandan daha genişse hiç dokunmaz', async () => {
  const env = setup({
    pageWidth: 3440,
    viewportWidth: 3440,
    viewportHeight: 1440,
    top: 0,
    containerHeight: 1440,
    videoWidth: 3000,
    videoHeight: 1000,
  });
  const player = env.doc.querySelector('#movie_player');
  env.setFullscreen(player);
  await env.settle();

  assert.ok(!env.doc.documentElement.classList.contains('uw-active'), 'uw-active olmamalı');
  assert.ok(!env.video.hasAttribute('data-uw-video'), 'video etiketlenmemeli');
});

/* ------------------------------------------------------------------ */

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} test geçti`);
  process.exit(failed ? 1 : 0);
})();
