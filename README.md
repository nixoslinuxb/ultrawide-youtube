# UltraWide YouTube — 16:9 → 3440×1440

[![CI](https://github.com/nixoslinuxb/ultrawide-youtube/actions/workflows/ci.yml/badge.svg)](https://github.com/nixoslinuxb/ultrawide-youtube/actions/workflows/ci.yml)

A Firefox extension that fits **16:9** YouTube videos to a **3440×1440** (or 21:9) display.
It removes the black bars on the left and right of the video **without cropping the picture**.

## Features

- **Remove side bars** (default): only when black side bars actually exist, the video is
  stretched horizontally to fill the gap. If the video already fits the screen, it does
  **nothing at all**.
- **Automatic in fullscreen**: the video covers the whole screen.
- **Three display modes**
  - **Remove side bars**: no cropping; horizontal stretch only when needed. (default)
  - **Crop & fill**: keeps the aspect ratio, crops the overflowing top/bottom.
  - **Stretch**: always stretches the picture to the frame; the aspect ratio may distort.
- **Target ratio**: Screen (automatic), 21:9, **3440×1440 (2.39:1)**, 24:10, 32:9 or 2.39:1.
  (In "Remove side bars" mode the target is the area/screen itself, so the ratio setting is ignored.)
- **Theater mode** support: the player box is grown up to the target ratio.
- **Horizontal expansion**: a narrow (pillarboxed) player is widened to the full area width in theater mode.
- **Normal window** support (optional, off by default).
- **Keyboard shortcut**: `Alt + Shift + U` to toggle on/off.
- Settings apply instantly; no page reload needed.
- Disabled on Shorts pages.

## Installation (temporary / development)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file in this project.
4. Open a video on YouTube and go fullscreen (`F`). The black side bars disappear.

> Temporary add-ons are removed when Firefox closes. For permanent use, see
> "Packaging and signing" below, or install the published AMO build.

## Usage

Click the extension icon in the toolbar to:

- turn ultrawide mode on or off,
- choose the display mode (remove side bars / crop / stretch),
- set the target ratio,
- configure theater mode and normal-window behavior.

**Where does it apply?**

| Context | Default |
| --- | --- |
| Fullscreen | Always |
| Theater mode | On (can be disabled) |
| Normal window | Off (can be enabled) |

## Offline behavior

The extension itself is **fully offline**: it makes no network requests and uses no external
server, analytics, or telemetry. Everything happens inside the browser, on the YouTube page's
DOM and CSS. Its logic therefore works without an internet connection.

Playing a video, however, requires YouTube itself to be online; the video stream cannot be
loaded while offline. Since the extension only changes the size of the picture box, it never
blocks or breaks anything when offline.

## Packaging and signing

```sh
sh build.sh
```

This produces `dist/ultrawide-youtube-1.4.0.xpi`.

## Publishing to addons.mozilla.org (AMO)

The add-on's AMO ID is `ultrawide-youtube@nixoslinuxb.github.io`.

- Developer hub: https://addons.mozilla.org/developers/addon/ultrawide-youtube-3440x1440/
- Version 1.4.0 has been submitted and is **awaiting Mozilla review** (`nominated`). Once
  approved, the add-on is publicly listed on AMO.

### 1. Get API credentials

On the [AMO developer API keys](https://addons.mozilla.org/developers/addon/api/key/) page,
generate a **JWT issuer** (API key) and a **JWT secret** (API secret).

### 2. Add them to the GitHub repository

Repository → **Settings → Secrets and variables → Actions** and define two secrets:

| Name | Value |
| --- | --- |
| `AMO_JWT_ISSUER` | API key (JWT issuer) |
| `AMO_JWT_SECRET` | API secret (JWT secret) |

### 3. Submit

GitHub → **Actions → Publish to AMO → Run workflow** and pick the channel:

- **listed** (default): the add-on is **publicly listed** on addons.mozilla.org and published
  after Mozilla's review. It is submitted without waiting for the review (`--approval-timeout 0`).
- **unlisted**: signed only for self-distribution; not publicly listed on AMO.

For every new release, bump `version` in `manifest.json` first (AMO rejects duplicate versions).
The workflow also runs automatically when a GitHub release is published (`release: published`).

To sign locally:

```sh
npm run sign
# or
npx web-ext sign --config web-ext-config.cjs --channel unlisted \
  --api-key=... --api-secret=...
```

> Listing text, screenshots, and the privacy policy are edited in the AMO developer hub;
> the API only submits the version.

Live testing during development:

```sh
npx web-ext run
```

## How it works

The YouTube player (`#movie_player`) continuously computes the size of the video element.
The extension:

1. Computes a **frame** from the target ratio (the screen in fullscreen, the player area in
   theater/normal mode, growing the player if necessary).
2. Writes the frame dimensions as CSS variables into a `<style>` element.
3. Tags the video element and its direct container with `data-uw-video` / `data-uw-container`
   and applies those dimensions with `!important` rules, plus
   `object-fit: cover` (crop) or `fill` (stretch).
4. In theater/normal mode it walks upward from the player and tags wrappers with
   `data-uw-frame`; both height (`--uw-player-h`) and width (`--uw-player-w`) are pinned to
   the target.

`object-fit: cover` makes a 16:9 picture fill the target frame **without distorting** it,
cropping from the top/bottom. `fill` stretches instead.

### How "Remove side bars" decides

The extension compares the video's real ratio (`videoWidth / videoHeight`) with the ratio of
the area the player occupies:

- If the video is not **landscape** (`< 1.5`), or the area is **not wider** than the video
  (no side bars; the video already fits) → **nothing is done**.
- If the area is clearly wider than the video (black side bars exist) → the frame becomes the
  whole area and the picture is stretched horizontally with `object-fit: fill`.

There is **no cropping** in this mode; the mathematical equivalent of filling the gap is a
horizontal stretch (for 16:9 → ~2.39:1 the width grows by ~34%). If you want to keep the
aspect ratio, choose "Crop & fill".

### New DOM compatibility

The YouTube player DOM (wrapper names, classes, `padding-top` / `aspect-ratio` tricks) changes
often. The extension therefore does **not** rely on fixed selectors
(`#player-container`, `ytd-player`, etc.):

- It walks **dynamically** upward from the player; only single-child wrappers are pinned to the
  target height (containers with several children, which hold other content, are left alone).
- If the picture is still cropped after the chain grows, an ancestor that constrains the area is
  added via **feedback**; it converges within a few frames.
- Tags are refreshed on every apply; if YouTube replaces a wrapper, it is re-tagged automatically.
- Besides `ytd-watch-flexy`, the `ytd-watch-grid` layout is recognized; theater state is read
  from the `[theater]` attribute.
- The video element is found through a generic `video` lookup even if it lacks the
  `html5-main-video` class.

## Tests

There are jsdom-based unit/integration tests. Since jsdom has no real layout engine,
`getBoundingClientRect` is emulated with a small model so that tagging, feedback, and cleanup
logic is actually exercised.

```sh
npm install
npm test
```

Coverage: ultrawide theater fill, expansion + feedback (tagging the constraining ancestor),
horizontal expansion of a narrow player, fullscreen (including 3440×1440), "remove side bars"
(16:9 stretch on 3440×1440), doing nothing when the video matches or exceeds the screen ratio,
disabled on Shorts, no-op when the setting is off, and tag cleanup when leaving theater mode.

## Project structure

```
manifest.json        Extension manifest (Manifest V2, Firefox)
src/background.js    Shortcut + badge management
src/content.js       Sizing logic (main component)
popup/               Toolbar UI
icons/icon.svg       Icon
icons/icon-128.png   128×128 icon used for the AMO listing
amo-metadata.json    AMO listing metadata (name, summary, categories, license)
tests/               jsdom tests
build.sh             .xpi packager
web-ext-config.cjs   web-ext (AMO) configuration
.github/workflows/   CI, GitHub release and AMO submission automation
```

## Automated releases

Pushing a tag such as `v1.4.0` makes GitHub Actions run the tests, build the `.xpi` and upload
it to GitHub Releases:

```sh
git tag v1.4.0
git push origin v1.4.0
```

CI tests and packaging run on every push to `main` and on pull requests.

## License

[MIT](LICENSE) © 2026 nixoslinuxb

## For 3440×1440 monitors

- **In fullscreen**, the default "Remove side bars" mode fits a 16:9 video into the 3440×1440
  area **without cropping**: the side bars disappear and the picture stretches horizontally.
  No extra configuration is needed.
- If the video is already 3440×1440 (2.39:1) — cinematic content — nothing is changed.
- To preserve the aspect ratio, choose "Crop & fill": 16:9 content is cropped into the 2.39:1
  frame, hiding roughly 13% from the top/bottom.
- Quality (1080p/1440p/2160p) is chosen by YouTube; the extension only enlarges the picture box.
  If it does not upgrade automatically, pick 1440p/2160p manually from the quality menu.

## Notes and limitations

- Because all sizing uses a dynamic ancestor chain, expansion keeps working even if the YouTube
  UI changes. Fullscreen remains the most robust path; growing the player in theater/normal
  mode is experimental and can be turned off from the popup.
- Subtitles are positioned relative to the player, so they may stay at the edges in
  non-fullscreen letterbox situations.
- "Remove side bars" stretches the aspect ratio and does not engage for 4:3 or vertical videos
  (it only works on landscape videos that are narrower than the area).
