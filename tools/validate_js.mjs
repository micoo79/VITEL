/*
 * validate_js.mjs  -  A bongeszos eov.js osszevetese a PROJ referenciaval.
 *
 * A /tmp/ref.json-t a pyproj pipeline generalja (lat,lon,h -> Y,X,H). Ez a
 * szkript node alatt betolti a docs/eov.js modult (fetch-shimmel a lemezrol),
 * es ellenorzi mindket iranyt.
 *
 * Futtatas:
 *   python -c "..."   # /tmp/ref.json eloallitasa (lasd README/PAGES.md)
 *   node tools/validate_js.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(__dir, '..', 'docs');

// fetch-shim: a './grids/...' utvonalakat a docs/grids/ alol olvassa
globalThis.fetch = async (url) => {
  const rel = url.replace(/^\.\//, '');
  const p = path.join(DOCS, rel);
  const buf = await readFile(p);
  return {
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};

const { EOV } = await import(path.join(DOCS, 'eov.js'));
const eov = await EOV.load('./grids/');

const ref = JSON.parse(await readFile('/tmp/ref.json', 'utf8'));
const M = 111320;
let mf = 0, mi = 0, n = 0, skip = 0;
for (const p of ref) {
  try {
    const f = eov.wgsToEov(p.lat, p.lon, p.h);
    mf = Math.max(mf, Math.hypot(f.Y - p.Y, f.X - p.X), Math.abs(f.H - p.H));
    const r = eov.eovToWgs(p.Y, p.X, p.H);
    const eh = Math.hypot((r.lat - p.lat) * M, (r.lon - p.lon) * M * Math.cos(p.lat * Math.PI / 180));
    mi = Math.max(mi, eh, Math.abs(r.h - p.h));
    n++;
  } catch (e) { skip++; }
}
console.log(`pontok: ${n}  (kihagyott / rács-szelen: ${skip})`);
console.log(`WGS->EOV  max eltres a PROJ-tol = ${(mf * 1000).toFixed(5)} mm`);
console.log(`EOV->WGS  max eltres a PROJ-tol = ${(mi * 1000).toFixed(5)} mm`);
console.log((mf < 0.001 && mi < 0.001) ? 'OK (< 1 mm)' : 'FIGYELEM: nagyobb eltres');
