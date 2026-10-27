# webkit-jank

Measure scroll smoothness in Safari's engine, headless. It scrolls a page top to bottom at a steady speed in WebKit and
reports every frame: median, 95th percentile, worst frame, and how many frames took longer than 34 and 50 ms.

```
$ npx webkit-jank https://talktoais.com/ --blank

https://talktoais.com/  [webkit 1440x900@2x, 24 px/frame]
  196 frames over 4723 px · median 16 ms · p95 19 ms · worst 19 ms · over 34 ms: 0 · over 50 ms: 0 · black samples: 0/8
```

## Why

Scroll effects that are smooth in Chrome can stutter in Safari, and most developers test in Chrome. We rebuilt a set of
landing pages because of it: a WebGL scroll film that looked fine in Chrome measured 37 frames over 50 ms in WebKit
(worst 222 ms) and passed through a black frame. The same pages rebuilt as CSS scroll-driven scenes (transform and
opacity only) measured 0 frames over 50 ms. This is the tool we used, cleaned up.

Two things it handles that a quick script gets wrong:

- **Screenshots stall WebKit.** Taking screenshots while measuring made a smooth page read 17 frames over 50 ms (worst
  227 ms) instead of 0 (worst 19 ms). `--blank` therefore samples screenshots on a second scroll pass whose timings are
  thrown away.
- **Startup is not scrolling.** It waits 2.5 s after load so fonts, images and intro animations settle before timing.

## Usage

Needs Node 18 or newer and Playwright's WebKit (`npx playwright install webkit`).

```bash
npx webkit-jank https://example.com/ https://example.com/features
npx webkit-jank https://example.com/ --engine chromium      # the same run in Chromium, to compare
npx webkit-jank https://staging.example.com/ --max-hitches 2 # exit 1 above two frames over 50 ms
```

| Option | What it does |
| --- | --- |
| `--engine webkit\|chromium` | engine to measure (default webkit) |
| `--px <n>` | pixels per frame (default 24, a steady trackpad swipe) |
| `--viewport <w>x<h>` | CSS viewport, rendered at 2x (default 1440x900) |
| `--blank` | second pass with 8 screenshots; counts samples that are over 90% near-black |
| `--max-hitches <n>` | exit 1 when a URL has more than n frames over 50 ms |
| `--json` | one JSON object per URL |

`WEBKIT_PATH` points it at a specific WebKit build when your Playwright version's bundled one is missing.

## How it works

It scrolls with `scrollTo` from a `requestAnimationFrame` loop, a fixed number of pixels per frame, and records the
time between frames. A frame over 34 ms means at least one frame was dropped at 60 Hz; over 50 ms is a stutter people
notice.

## Limits

- Headless WebKit is Safari's engine, not Safari itself. Real devices still deserve a look.
- It measures main-thread frame cadence during programmatic scrolling. Jank that only exists in the compositor during a
  real touch or trackpad scroll may not show.
- Treat it as a regression check: compare before and after, the same machine, the same options.

## Tests

```bash
npm test
```

A plain tall page (no frame over 50 ms) and the same page with a scroll handler that blocks for 70 ms every eighth
scroll (at least five frames over 50 ms).

## License

MIT. Made by [Black Label Tec](https://blacklabeltec.com).
