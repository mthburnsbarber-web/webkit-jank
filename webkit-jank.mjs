#!/usr/bin/env node
// webkit-jank: scroll a page top to bottom in headless WebKit (Safari's engine) at a steady speed and report every
// frame interval: median, 95th percentile, worst frame, frames over 34 ms and over 50 ms, and optionally samples that
// came out (almost) black. Chromium is available for comparison. Built to catch scroll effects that are smooth in
// Chrome and stutter in Safari.
import { webkit, chromium } from 'playwright';

const HELP = `usage: webkit-jank <url...> [--engine webkit|chromium] [--px 24] [--viewport 1440x900] [--blank]
                   [--max-hitches <n>] [--json]

  --engine        webkit (default) or chromium
  --px            pixels scrolled per frame (default 24, a steady trackpad swipe)
  --viewport      CSS viewport, rendered at 2x (default 1440x900)
  --blank         a second scroll pass that samples 8 screenshots and counts near-black ones
                  (screenshots stall WebKit, so this pass never affects the timings)
  --max-hitches   exit 1 when any URL has more than this many frames over 50 ms (default: never fail)
  --json          one JSON object per URL

WEBKIT_PATH overrides the WebKit executable (for a Playwright install whose bundled build is missing).`;

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 2); }
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const valued = new Set(['--engine', '--px', '--viewport', '--max-hitches']);
const urls = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const engine = opt('--engine', 'webkit'), px = +opt('--px', 24), [W, H] = opt('--viewport', '1440x900').split('x').map(Number);
const maxHitches = args.includes('--max-hitches') ? +opt('--max-hitches') : Infinity;

const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'webkit' && process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
let failed = 0;
for (const url of urls) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  let r;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500); // let fonts, images and intro animations settle
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const scroll = () => page.evaluate(({ total, px }) => new Promise((done) => {
      const iv = []; let last = performance.now(), y = 0;
      const step = (now) => { iv.push(now - last); last = now; y += px; scrollTo(0, y); if (y < total) requestAnimationFrame(step); else done(iv.slice(1)); };
      requestAnimationFrame(step);
    }), { total, px });
    const iv = await scroll(); // the timing pass: nothing else touches the page while it runs
    // Screenshots stall WebKit's rendering by themselves, so black frames are sampled on a second pass whose timings are
    // thrown away.
    const lum = [];
    if (args.includes('--blank')) {
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
      const again = scroll();
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(400);
        const png = await page.screenshot({ type: 'png' }).catch(() => null);
        if (png) lum.push(await page.evaluate(async (b64) => {
          const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
          const c = new OffscreenCanvas(64, 40), g = c.getContext('2d'); g.drawImage(bm, 0, 0, 64, 40);
          const d = g.getImageData(0, 0, 64, 40).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 14) dark++;
          return dark / (d.length / 4);
        }, png.toString('base64')).catch(() => null));
      }
      await again;
    }
    const s = [...iv].sort((a, b) => a - b), q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
    r = { url, engine, scrolled: total, frames: iv.length, p50: q(0.5), p95: q(0.95), worst: +Math.max(...iv).toFixed(1), over34: iv.filter((x) => x > 34).length, over50: iv.filter((x) => x > 50).length,
      ...(lum.length ? { blankSamples: lum.filter((l) => l !== null && l > 0.9).length, samples: lum.length } : {}), errors: errors.slice(0, 3) };
  } catch (e) { r = { url, engine, error: String(e.message || e).split('\n')[0] }; }
  await ctx.close();
  if (!r.error && r.over50 > maxHitches) failed++;
  if (args.includes('--json')) { console.log(JSON.stringify(r)); continue; }
  if (r.error) { console.log(`${url}\n  error: ${r.error}`); continue; }
  console.log(`${url}  [${engine} ${W}x${H}@2x, ${px} px/frame]\n  ${r.frames} frames over ${r.scrolled} px · median ${r.p50} ms · p95 ${r.p95} ms · worst ${r.worst} ms · over 34 ms: ${r.over34} · over 50 ms: ${r.over50}${r.samples ? ` · black samples: ${r.blankSamples}/${r.samples}` : ''}${r.errors.length ? `\n  page errors: ${r.errors.join(' | ')}` : ''}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
