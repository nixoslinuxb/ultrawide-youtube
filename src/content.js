/* UltraWide YouTube — içerik betiği.
 *
 * Ne yapar?
 *   YouTube'un 16:9 video kutusunu, hedef orana (varsayılan: ekran, ör. 21:9)
 *   sığan bir çerçeveye oturtur ve videoyu bu çerçeveye doldurur.
 *
 *   - "cover" (Kırp & doldur): oran korunur, taşan kısımlar kırpılır.
 *   - "fill"  (Uzat)         : görüntü çerçeveye esnetilir, oran bozulur.
 *
 * Nerede uygulanır?
 *   - Tam ekran her zaman (ana kullanım: ultra geniş monitörde siyah bantları yok etmek).
 *   - Sinema (theater) modu: ayarla açılabilir; oyuncu kutusu hedef orana kadar büyütülür.
 *   - Normal pencere: ayarla açılabilir (varsayılan kapalı).
 *
 * Neden sabit seçici yok?
 *   YouTube oynatıcı DOM'unu (sarmalayıcı zinciri, sınıf adları) sık değiştirir.
 *   Bu yüzden boyutlandırma, oynatıcıdan yukarı doğru yürünen *dinamik* ata
 *   zinciri üzerinden yapılır: tek çocuklu sarmalayıcılar `data-uw-frame` ile
 *   etiketlenir. Yetmezse, alanı kısıtlayan bir üst ata geri beslemeyle
 *   etiketlenir. Böylece `#player-container`, `ytd-player` gibi isimler
 *   değişse bile genişletme çalışmaya devam eder.
 *
 * Tüm boyutlar JS ile hesaplanır ve CSS değişkenleri üzerinden !important
 * kurallarla uygulanır; YouTube'un inline stilleri böylece ezilir.
 */

(() => {
  'use strict';

  if (window.__ultrawideYouTubeLoaded) return;
  window.__ultrawideYouTubeLoaded = true;

  const RATIOS = {
    screen: null,
    '21:9': 21 / 9,
    '24:10': 24 / 10,
    '32:9': 32 / 9,
    '3440:1440': 3440 / 1440,
    '2.39:1': 2.39,
  };

  const DEFAULTS = {
    enabled: true,
    // 'bars'  = yalnızca yan siyah bantları yok et (esnet, kırpma yok)
    // 'cover' = kırp & doldur
    // 'fill'  = uzat
    mode: 'bars',
    ratio: 'screen',
    applyTheater: true,
    applyWindow: false,
  };

  const BASE_STYLE_ID = 'uw-yt-base-style';
  const VARS_STYLE_ID = 'uw-yt-vars-style';

  const FRAME_ATTR = 'data-uw-frame';
  const VIDEO_ATTR = 'data-uw-video';
  const CONTAINER_ATTR = 'data-uw-container';

  const BASE_CSS = `
    /* Video kutusunu hedef çerçeveye oturt. */
    html.uw-active [${VIDEO_ATTR}] {
      left: var(--uw-left, 0px) !important;
      top: var(--uw-top, 0px) !important;
      width: var(--uw-width, 100%) !important;
      height: var(--uw-height, 100%) !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: var(--uw-fit, cover) !important;
      object-position: center center !important;
    }

    /* Videonun doğrudan kabı oynatıcıyı doldursun. */
    html.uw-active [${CONTAINER_ATTR}] {
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      height: 100% !important;
    }

    /* Genişletme: oynatıcı ve sarmalayıcı zinciri hedef genişlik/yüksekliğe
       sabitlenir. aspect-ratio / padding hileleri devre dışı bırakılır. */
    html.uw-expand-player [${FRAME_ATTR}] {
      box-sizing: border-box !important;
      width: var(--uw-player-w, 100%) !important;
      min-width: var(--uw-player-w, 100%) !important;
      max-width: var(--uw-player-w, 100%) !important;
      height: var(--uw-player-h) !important;
      min-height: var(--uw-player-h) !important;
      max-height: var(--uw-player-h) !important;
      aspect-ratio: auto !important;
      transition: none !important;
    }
  `;

  let settings = { ...DEFAULTS };
  let baseStyle = null;
  let varsStyle = null;
  let rafId = 0;
  let lastVars = '';
  let lastSignature = '';

  // Etiketlenen düğümler (temizlik için tutulur).
  const frameTagged = new Set();
  let framePlayer = null;
  let taggedVideo = null;
  let taggedContainer = null;

  /* ------------------------------------------------------------------ */
  /* Yardımcılar                                                         */
  /* ------------------------------------------------------------------ */

  const round = (n) => Math.round(n * 100) / 100;

  function ensureStyles() {
    const head = document.head || document.documentElement;
    if (!head) return;

    if (!baseStyle || !baseStyle.isConnected) {
      baseStyle = document.getElementById(BASE_STYLE_ID) || document.createElement('style');
      baseStyle.id = BASE_STYLE_ID;
      baseStyle.textContent = BASE_CSS;
      head.appendChild(baseStyle);
    }
    if (!varsStyle || !varsStyle.isConnected) {
      varsStyle = document.getElementById(VARS_STYLE_ID) || document.createElement('style');
      varsStyle.id = VARS_STYLE_ID;
      head.appendChild(varsStyle);
    }
  }

  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function getVideo(player) {
    if (!player) return null;
    // Sınıf adları değişebilir; önce bilinenleri, sonra genel videoyu dene.
    return (
      player.querySelector('video.html5-main-video') ||
      player.querySelector('video.video-stream') ||
      player.querySelector('video')
    );
  }

  function isShorts() {
    return location.pathname.startsWith('/shorts');
  }

  // Asıl sayfa düzeni kökü. Yeni düzenlerde etiket adı değişebilir.
  function getLayoutRoot() {
    return document.querySelector('ytd-watch-flexy, ytd-watch-grid');
  }

  function inTheaterMode() {
    const root = getLayoutRoot();
    return !!root && root.hasAttribute('theater');
  }

  function setVars(cssText) {
    if (cssText === lastVars) return;
    lastVars = cssText;
    ensureStyles();
    if (varsStyle) varsStyle.textContent = cssText ? `:root{${cssText};}` : '';
  }

  /* ----------------------- Etiketleme -------------------------------- */

  function clearVideoTags() {
    if (taggedVideo) taggedVideo.removeAttribute(VIDEO_ATTR);
    if (taggedContainer) taggedContainer.removeAttribute(CONTAINER_ATTR);
    taggedVideo = null;
    taggedContainer = null;
  }

  function tagVideo(video, player) {
    const parent = video.parentElement && video.parentElement !== player ? video.parentElement : null;
    if (taggedVideo === video && taggedContainer === parent) return;
    clearVideoTags();
    video.setAttribute(VIDEO_ATTR, '');
    if (parent) parent.setAttribute(CONTAINER_ATTR, '');
    taggedVideo = video;
    taggedContainer = parent;
  }

  function clearFrameTags() {
    for (const node of frameTagged) {
      if (node && node.removeAttribute) node.removeAttribute(FRAME_ATTR);
    }
    frameTagged.clear();
    framePlayer = null;
  }

  function meaningfulChildCount(el) {
    let count = 0;
    for (const child of el.children) {
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'LINK') continue;
      count++;
    }
    return count;
  }

  // Oynatıcıdan yukarı yürüyerek yalnızca-tek-çocuklu sarmalayıcıları etiketle.
  // Çok çocuklu bir kaba (ör. alt içerik barındıran #primary-inner) dokunmayız.
  function tagFrameChain(player) {
    const stop = getLayoutRoot();
    const collected = [player];
    let el = player;

    while (true) {
      const parent = el.parentElement;
      if (!parent) break;
      if (parent === stop || parent === document.body || parent === document.documentElement) break;
      if (meaningfulChildCount(parent) !== 1) break;
      collected.push(parent);
      el = parent;
    }

    // Artık oynatıcının atası olmayan / kopmuş etiketleri temizle.
    for (const node of Array.from(frameTagged)) {
      const stillAncestor = node.isConnected && (node === player || node.contains(player));
      if (!stillAncestor) {
        node.removeAttribute(FRAME_ATTR);
        frameTagged.delete(node);
      }
    }

    for (const node of collected) {
      if (!frameTagged.has(node)) {
        node.setAttribute(FRAME_ATTR, '');
        frameTagged.add(node);
      }
    }
  }

  // Geri besleme: zincir büyüdüğü halde alanı kısıtlayan bir üst ata varsa
  // (sabit yükseklik + taşma gizleme), onu da etiketle. Her çağrıda en fazla
  // bir ata eklenir; birkaç karede yakınsar.
  function growFrame(desiredHeight, desiredWidth) {
    if (!frameTagged.size) return;
    const stop = getLayoutRoot();

    let outermost = null;
    for (const node of frameTagged) {
      if (!node.isConnected) continue;
      if (!outermost || node.contains(outermost)) outermost = node;
    }
    if (!outermost) return;

    let el = outermost.parentElement;
    while (el && el !== stop && el !== document.body && el !== document.documentElement) {
      if (el.hasAttribute(FRAME_ATTR)) {
        el = el.parentElement;
        continue;
      }
      const r = el.getBoundingClientRect();
      const tooShort = r.height < desiredHeight - 2;
      const tooNarrow = desiredWidth > 0 && r.width < desiredWidth - 2;
      if (tooShort || tooNarrow) {
        el.setAttribute(FRAME_ATTR, '');
        frameTagged.add(el);
        // Yeni etiket yerleşimi değiştirdi; bir sonraki karede yeniden ölç.
        schedule();
      }
      return;
    }
  }

  function deactivate() {
    document.documentElement.classList.remove('uw-active', 'uw-expand-player');
    if (taggedVideo || taggedContainer) clearVideoTags();
    if (frameTagged.size) clearFrameTags();
  }

  /* ------------------------------------------------------------------ */
  /* Ana uygulama                                                        */
  /* ------------------------------------------------------------------ */

  function apply() {
    rafId = 0;
    ensureStyles();

    const root = document.documentElement;

    if (!settings.enabled) {
      deactivate();
      setVars('');
      return;
    }

    const player = getPlayer();
    const video = getVideo(player);
    if (!player || !video || isShorts()) {
      deactivate();
      return;
    }

    const fullscreen = !!document.fullscreenElement;
    const theater = inTheaterMode();
    const windowMode = !fullscreen && !theater;
    const onWatchPage = location.pathname === '/watch' || location.pathname.startsWith('/embed/');

    const active =
      fullscreen ||
      (theater && settings.applyTheater) ||
      (windowMode && settings.applyWindow && onWatchPage);

    if (!active) {
      deactivate();
      return;
    }

    const rect = player.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) {
      deactivate();
      return;
    }

    tagVideo(video, player);

    const explicitRatio = Object.prototype.hasOwnProperty.call(RATIOS, settings.ratio)
      ? RATIOS[settings.ratio]
      : null;

    const topGap = Math.max(0, rect.top);
    const maxHeight = Math.max(160, window.innerHeight - topGap - 4);

    // Yatay kullanılabilir alan: sinema modunda tüm oynatıcı alanı (sayfa
    // genişliği). Böylece daraltılmış (pillarbox) oynatıcı da tam genişliğe açılır.
    let availableWidth = rect.width;
    if (!fullscreen && theater) {
      const docEl = document.documentElement;
      const docWidth = docEl.clientWidth || window.innerWidth || rect.width;
      const layout = getLayoutRoot();
      const layoutWidth = layout ? layout.getBoundingClientRect().width : 0;
      const candidate = layoutWidth > 0 ? Math.min(layoutWidth, docWidth) : docWidth;
      if (candidate > availableWidth) availableWidth = candidate;
    }

    const videoRatio =
      video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const mode = settings.mode;
    const EPS = 0.01;

    // Kullanılabilir alanın oranı: hedef kutunun (ekran/düzen) en-boy oranı.
    const areaHeight = fullscreen ? rect.height : maxHeight;
    const areaRatio = availableWidth / areaHeight;

    // frameRatio: video çerçevesinin oranı. null => oynatıcı kutusunu doldur.
    // expansionRatio: oynatıcı kutusunun hedef oranı (boyutlandırma için).
    let frameRatio = explicitRatio;
    let expansionRatio = explicitRatio;
    let fit = mode === 'fill' ? 'fill' : 'cover';

    if (mode === 'bars') {
      // Yalnızca manzara videosunda ve alan videodan belirgin şekilde daha
      // genişse (yani yan siyah bant oluşuyorsa) müdahale et.
      if (videoRatio < 1.5 || videoRatio >= areaRatio - EPS) {
        deactivate();
        return;
      }
      // Kırpma yok: çerçeveyi alanın tamamı yap, görüntüyü esnet.
      frameRatio = null;
      expansionRatio = fullscreen ? null : areaRatio;
      fit = 'fill';
    } else if (!fullscreen && explicitRatio === null && theater) {
      if (videoRatio >= 1.5 && areaRatio > videoRatio + 0.02) {
        expansionRatio = areaRatio;
        frameRatio = null; // alanı olduğu gibi doldur
      }
    }

    let expandPlayer = false;
    let playerWidth = 0;
    let playerHeight = 0;
    let frameWidth = rect.width;
    let frameHeight = rect.height;

    if (!fullscreen && expansionRatio) {
      const desiredWidth = availableWidth;
      const desiredHeight = Math.min(availableWidth / expansionRatio, maxHeight);
      const wasExpanded = root.classList.contains('uw-expand-player');
      const needWidth = desiredWidth > rect.width + 1;
      const needHeight = Math.abs(desiredHeight - rect.height) > 1;

      if (needWidth || needHeight || wasExpanded) {
        expandPlayer = true;
        playerWidth = desiredWidth;
        playerHeight = desiredHeight;
        frameWidth = desiredWidth;
        frameHeight = desiredHeight;
      }
    }

    // Hedef oran varsa çerçeveyi bu orana sabitle (gerekirse letterbox).
    let left = 0;
    let top = 0;
    let width = frameWidth;
    let height = frameHeight;

    if (frameRatio) {
      width = Math.min(frameWidth, frameHeight * frameRatio);
      height = width / frameRatio;
      left = (frameWidth - width) / 2;
      top = (frameHeight - height) / 2;
    }

    const vars =
      `--uw-left:${round(left)}px;` +
      `--uw-top:${round(top)}px;` +
      `--uw-width:${round(width)}px;` +
      `--uw-height:${round(height)}px;` +
      `--uw-fit:${fit}` +
      (expandPlayer
        ? `;--uw-player-h:${round(playerHeight)}px;--uw-player-w:${round(playerWidth)}px`
        : '');

    setVars(vars);

    root.classList.toggle('uw-expand-player', expandPlayer);
    root.classList.add('uw-active');

    if (expandPlayer) {
      if (framePlayer !== player) {
        clearFrameTags();
        framePlayer = player;
      }
      tagFrameChain(player);
      growFrame(playerHeight, playerWidth);
    } else if (frameTagged.size) {
      clearFrameTags();
    }
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(apply);
  }

  /* ------------------------------------------------------------------ */
  /* Ayar yükleme / senkronizasyon                                       */
  /* ------------------------------------------------------------------ */

  function normalize(changes) {
    for (const key of Object.keys(DEFAULTS)) {
      if (!changes[key]) continue;
      const next = changes[key].newValue;
      settings[key] = next === undefined ? DEFAULTS[key] : next;
    }
  }

  function loadSettings() {
    browser.storage.local
      .get(DEFAULTS)
      .then((stored) => {
        settings = { ...DEFAULTS, ...stored };
        schedule();
      })
      .catch(() => schedule());
  }

  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      normalize(changes);
      schedule();
    });
  } catch (err) {
    /* storage erişilemezse varsayılanlarla devam et */
  }

  /* ------------------------------------------------------------------ */
  /* Olaylar                                                             */
  /* ------------------------------------------------------------------ */

  document.addEventListener('fullscreenchange', schedule, true);
  document.addEventListener('webkitfullscreenchange', schedule, true);
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('yt-navigate-finish', schedule);
  document.addEventListener('yt-page-data-updated', schedule);

  // Theater özniteliği değiştiğinde yakala (etiket adı değişse de çalışır).
  try {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'theater') {
          schedule();
          return;
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['theater'],
    });
  } catch (err) {
    /* gözlemci kurulamazsa yoklama devrede */
  }

  // YouTube'un kendi yerleşim değişikliklerini (ve etiket kayıplarını) yakalamak
  // için hafif yoklama. Yalnızca imza değiştiğinde iş yapar.
  function tick() {
    const player = getPlayer();
    const video = getVideo(player);
    const r = player ? player.getBoundingClientRect() : null;

    const signature = [
      settings.enabled,
      settings.mode,
      settings.ratio,
      settings.applyTheater,
      settings.applyWindow,
      !!document.fullscreenElement,
      inTheaterMode(),
      location.pathname,
      video ? 1 : 0,
      frameTagged.size,
      r ? Math.round(r.width) : 0,
      r ? Math.round(r.height) : 0,
      r ? Math.round(r.top) : 0,
      window.innerWidth,
      window.innerHeight,
    ].join('|');

    if (signature !== lastSignature) {
      lastSignature = signature;
      schedule();
    }
  }

  setInterval(tick, 700);

  loadSettings();
  schedule();
})();
