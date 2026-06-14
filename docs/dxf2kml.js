/*
 * dxf2kml.js  -  DXF (EOV koordinatak) -> KML (WGS84) konverter a bongeszohoz.
 *
 * A DXF-et magyar geodeziai rendszerben (EOV) ertelmezi: minden ponton az EOV
 * sikkoordinatat az atadott EOV-motor `eovToWgs(Y, X)` fuggvenyevel szamolja at
 * WGS84 lon/lat-ra. Alapertelmezesben a DXF X = EOV Y (Kelet), DXF Y = EOV X
 * (Eszak); ez a `swapXY` opcioval felcserelheto.
 *
 * Tamogatott DXF-entitasok:  POINT, LINE, LWPOLYLINE, POLYLINE(+VERTEX),
 *                            TEXT, MTEXT, CIRCLE, ARC.
 * Minden mas (INSERT, SPLINE, HATCH, DIMENSION, 3DFACE, ...) -> kihagyva,
 * nem hibazik el. A lefedettsegen kivuli (rács) pontokat tartalmazo elemek
 * szinten kimaradnak.
 *
 * Opciok:
 *   points : POINT entitasok beemelese (Placemark Point)
 *   labels : TEXT / MTEXT feliratok beemelese (nevesitett Placemark Point)
 *   swapXY : DXF X/Y felcserelese
 */

const SUPPORTED = new Set(["POINT", "LINE", "LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT", "CIRCLE", "ARC"]);

// --- A DXF csoportkod-parok beolvasasa (ASCII DXF) -------------------------
function parsePairs(text) {
  const raw = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = parseInt(raw[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push([code, raw[i + 1]]);
  }
  return pairs;
}

// --- Az ENTITIES szekcio entitas-blokkokra bontasa -------------------------
function entityBlocks(pairs) {
  let start = -1, end = pairs.length;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === "SECTION" &&
        pairs[i + 1][0] === 2 && pairs[i + 1][1].trim() === "ENTITIES") { start = i + 2; break; }
  }
  if (start < 0) return [];
  for (let i = start; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === "ENDSEC") { end = i; break; }
  }
  const blocks = []; let cur = null;
  for (let i = start; i < end; i++) {
    const [code, val] = pairs[i];
    if (code === 0) { cur = { type: val.trim(), data: [] }; blocks.push(cur); }
    else if (cur) cur.data.push([code, val]);
  }
  return blocks;
}

const firstOf = (data, code) => { for (const [c, v] of data) if (c === code) return v; return null; };
const numOf = (data, code, def = null) => { const v = firstOf(data, code); return v === null ? def : parseFloat(v); };

function lwVertices(data) {
  const verts = []; let x = null;
  for (const [c, v] of data) {
    if (c === 10) x = parseFloat(v);
    else if (c === 20 && x !== null) { verts.push([x, parseFloat(v)]); x = null; }
  }
  return verts;
}

function cleanMText(s) {
  return (s || "")
    .replace(/\\P/g, " ").replace(/\\~/g, " ")
    .replace(/\{\\[^;]*;/g, "").replace(/[{}]/g, "")
    .replace(/\\[A-Za-z][^\\;]*;?/g, "").trim();
}

// --- Blokkok -> egyseges entitaslista (POLYLINE+VERTEX osszefuzve) ---------
export function parseDxf(text) {
  const blocks = entityBlocks(parsePairs(text));
  const ents = []; const skippedTypes = {};
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const T = b.type;
    if (T === "SEQEND" || T === "VERTEX") continue; // POLYLINE kezeli oket
    if (!SUPPORTED.has(T)) { skippedTypes[T] = (skippedTypes[T] || 0) + 1; continue; }

    if (T === "POINT") ents.push({ type: "POINT", x: numOf(b.data, 10), y: numOf(b.data, 20) });
    else if (T === "LINE") ents.push({ type: "LINE", verts: [[numOf(b.data, 10), numOf(b.data, 20)], [numOf(b.data, 11), numOf(b.data, 21)]] });
    else if (T === "LWPOLYLINE") ents.push({ type: "POLYLINE", verts: lwVertices(b.data), closed: (numOf(b.data, 70, 0) & 1) === 1 });
    else if (T === "TEXT") ents.push({ type: "TEXT", x: numOf(b.data, 10), y: numOf(b.data, 20), text: (firstOf(b.data, 1) || "").trim() });
    else if (T === "MTEXT") ents.push({ type: "TEXT", x: numOf(b.data, 10), y: numOf(b.data, 20), text: cleanMText(b.data.filter(p => p[0] === 3).map(p => p[1]).join("") + (firstOf(b.data, 1) || "")) });
    else if (T === "CIRCLE") ents.push({ type: "POLYLINE", verts: arc(numOf(b.data, 10), numOf(b.data, 20), numOf(b.data, 40), 0, 360, 72), closed: true });
    else if (T === "ARC") ents.push({ type: "POLYLINE", verts: arc(numOf(b.data, 10), numOf(b.data, 20), numOf(b.data, 40), numOf(b.data, 50), numOf(b.data, 51), 48), closed: false });
    else if (T === "POLYLINE") {
      const verts = []; let j = i + 1;
      for (; j < blocks.length && blocks[j].type === "VERTEX"; j++) verts.push([numOf(blocks[j].data, 10), numOf(blocks[j].data, 20)]);
      ents.push({ type: "POLYLINE", verts, closed: (numOf(b.data, 70, 0) & 1) === 1 });
      i = j - 1; if (blocks[j] && blocks[j].type === "SEQEND") i = j;
    }
  }
  return { ents, skippedTypes };
}

function arc(cx, cy, r, a0, a1, n) {
  if ([cx, cy, r].some(v => v === null || Number.isNaN(v))) return [];
  let span = a1 - a0; if (span <= 0) span += 360;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + span * k / n) * Math.PI / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

const xmlEsc = s => String(s).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// --- KML + terkep-elonezet (GeoJSON) eloallitas ---------------------------
// Visszaad: { kml, features, stats }  -  a features a terkep-elonezethez kell.
export function toKml(parsed, eov, { points = true, labels = true, swapXY = false, name = "VITEL export" } = {}) {
  const stats = { points: 0, lines: 0, labels: 0, skippedRange: 0, skippedTypes: parsed.skippedTypes };
  // EOV (sik) -> [lon, lat] szampar; null ha rács-szelen kivul
  const toLL = (x, y) => {
    if (x === null || y === null || Number.isNaN(x) || Number.isNaN(y)) return null;
    try {
      const r = swapXY ? eov.eovToWgs(y, x) : eov.eovToWgs(x, y);
      return [r.lon, r.lat];
    } catch (_) { return null; }
  };
  const features = [];

  for (const e of parsed.ents) {
    if (e.type === "POINT") {
      if (!points) continue;
      const c = toLL(e.x, e.y);
      if (!c) { stats.skippedRange++; continue; }
      features.push({ kind: "Point", coords: c, name: null });
      stats.points++;
    } else if (e.type === "TEXT") {
      if (!labels) continue;
      const c = toLL(e.x, e.y);
      if (!c || !e.text) { if (!c) stats.skippedRange++; continue; }
      features.push({ kind: "Point", coords: c, name: e.text });
      stats.labels++;
    } else if (e.type === "POLYLINE" || e.type === "LINE") {
      const coords = []; let bad = false;
      for (const [x, y] of e.verts) { const c = toLL(x, y); if (!c) { bad = true; break; } coords.push(c); }
      if (bad || coords.length < 2) { stats.skippedRange++; continue; }
      if (e.closed) {
        const ring = coords.slice();
        const a = ring[0], b = ring[ring.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a);
        features.push({ kind: "Polygon", coords: ring, name: null });
      } else {
        features.push({ kind: "LineString", coords, name: null });
      }
      stats.lines++;
    }
  }

  const fc = (ll) => `${ll[0].toFixed(8)},${ll[1].toFixed(8)},0`;
  const placemarks = features.map((f) => {
    if (f.kind === "Point") {
      const nm = f.name ? `<name>${xmlEsc(f.name)}</name>` : "";
      return `<Placemark>${nm}<Point><coordinates>${fc(f.coords)}</coordinates></Point></Placemark>`;
    }
    if (f.kind === "Polygon") {
      return `<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${f.coords.map(fc).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    }
    return `<Placemark><LineString><coordinates>${f.coords.map(fc).join(" ")}</coordinates></LineString></Placemark>`;
  });

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(name)}</name>
${placemarks.join("\n")}
</Document></kml>`;
  return { kml, features, stats };
}

// A features -> GeoJSON FeatureCollection a Leaflet elonezethez.
export function toGeoJSON(features) {
  return {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature",
      properties: f.name ? { name: f.name } : {},
      geometry: {
        type: f.kind,
        coordinates: f.kind === "Point" ? f.coords
          : f.kind === "Polygon" ? [f.coords]
          : f.coords,
      },
    })),
  };
}
