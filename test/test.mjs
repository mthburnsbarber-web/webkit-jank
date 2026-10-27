// Runs the meter on a plain page and on one whose scroll handler blocks for 70 ms every eighth scroll.
import path from 'node:path'; import { execFile } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const cli = path.join(dir, '..', '..', 'webkit-jank.mjs');
const run = (page) => new Promise((ok) => execFile(process.execPath, [cli, pathToFileURL(path.join(dir, page)).href, '--json', '--viewport', '1000x700'], (err, out) => ok(JSON.parse(out.trim().split('\n').pop()))));
let fail = 0; const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };
const smooth = await run('smooth.html'), janky = await run('janky.html');
check(!smooth.error && smooth.frames > 100, `plain page scrolled in ${smooth.frames} frames (${smooth.error || 'no error'})`);
check(smooth.over50 === 0, `plain page: no frame over 50 ms (worst ${smooth.worst} ms)`);
check(janky.over50 >= 5, `blocking handler: ${janky.over50} frames over 50 ms (worst ${janky.worst} ms)`);
process.exit(fail ? 1 : 0);
