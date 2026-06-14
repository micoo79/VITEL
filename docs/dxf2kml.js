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

// AutoCAD \U+XXXX unicode escape + alapveto MTEXT formazas eltavolitasa
function decodeDxfText(s) {
  return (s || "").replace(/\\U\+([0-9A-Fa-f]{4})/g,
    (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function cleanMText(s) {
  return decodeDxfText((s || "")
    .replace(/\\P/g, " ").replace(/\\~/g, " ")
    .replace(/\{\\[^;]*;/g, "").replace(/[{}]/g, "")
    .replace(/\\[A-Za-z][^\\;]*;?/g, "")).trim();
}

// --- Szinek: ACI (AutoCAD Color Index) + true color -> [r,g,b] -------------
const ACI_BASIC = {
  1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255],
  5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255], 8: [128, 128, 128], 9: [192, 192, 192],
};
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function aciToRgb(i) {
  if (ACI_BASIC[i]) return ACI_BASIC[i];
  if (i >= 250 && i <= 255) { const g = Math.round(51 + (i - 250) * (255 - 51) / 5); return [g, g, g]; }
  if (i >= 10 && i <= 249) {
    const j = i - 10, hue = (Math.floor(j / 10) * (360 / 24)) % 360, row = j % 10;
    const val = [1.0, 0.8, 0.65, 0.5, 0.35][Math.floor(row / 2)] ?? 0.5;
    const sat = (row % 2) ? 0.55 : 1.0;
    return hsvToRgb(hue, sat, val);
  }
  return [255, 255, 255];
}
const intToRgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

// Egy entitas szinforrasai (explicit aci/true color + reteg)
function colorOf(data) {
  const lay = firstOf(data, 8);
  const aciRaw = firstOf(data, 62);
  const tcRaw = firstOf(data, 420);
  return {
    layer: lay ? lay.trim() : null,
    aci: aciRaw === null ? null : parseInt(aciRaw, 10),
    rgb: tcRaw === null ? null : intToRgb(parseInt(tcRaw, 10)),
  };
}
// A LAYER tabla beolvasasa: retegnev -> ACI szin
function parseLayers(pairs) {
  const layers = {};
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].trim() === "LAYER") {
      let name = null, aci = null;
      for (let j = i + 1; j < pairs.length && pairs[j][0] !== 0; j++) {
        if (pairs[j][0] === 2) name = pairs[j][1].trim();
        else if (pairs[j][0] === 62) aci = parseInt(pairs[j][1], 10);
      }
      if (name) layers[name] = aci;
    }
  }
  return layers;
}
// Az entitas tenyleges szine [r,g,b], a BYLAYER/BYBLOCK feloldasaval
function resolveColor(ent, layers) {
  if (ent.rgb) return ent.rgb;
  let aci = ent.aci;
  if (aci === null || aci === 0 || aci === 256) {           // BYLAYER / BYBLOCK
    const la = layers[ent.layer];
    aci = (la !== undefined && la !== null && la > 0) ? la : 7;
  }
  if (aci <= 0 || aci === 256) aci = 7;
  return aciToRgb(Math.abs(aci));
}

// --- Blokkok -> egyseges entitaslista (POLYLINE+VERTEX osszefuzve) ---------
export function parseDxf(text) {
  const pairs = parsePairs(text);
  const layers = parseLayers(pairs);
  const blocks = entityBlocks(pairs);
  const ents = []; const skippedTypes = {};
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const T = b.type;
    if (T === "SEQEND" || T === "VERTEX") continue; // POLYLINE kezeli oket
    if (!SUPPORTED.has(T)) { skippedTypes[T] = (skippedTypes[T] || 0) + 1; continue; }
    const col = colorOf(b.data);

    if (T === "POINT") ents.push({ type: "POINT", x: numOf(b.data, 10), y: numOf(b.data, 20), ...col });
    else if (T === "LINE") ents.push({ type: "LINE", verts: [[numOf(b.data, 10), numOf(b.data, 20)], [numOf(b.data, 11), numOf(b.data, 21)]], ...col });
    else if (T === "LWPOLYLINE") ents.push({ type: "POLYLINE", verts: lwVertices(b.data), closed: (numOf(b.data, 70, 0) & 1) === 1, ...col });
    else if (T === "TEXT") ents.push({ type: "TEXT", x: numOf(b.data, 10), y: numOf(b.data, 20), text: decodeDxfText((firstOf(b.data, 1) || "").trim()), ...col });
    else if (T === "MTEXT") ents.push({ type: "TEXT", x: numOf(b.data, 10), y: numOf(b.data, 20), text: cleanMText(b.data.filter(p => p[0] === 3).map(p => p[1]).join("") + (firstOf(b.data, 1) || "")), ...col });
    else if (T === "CIRCLE") ents.push({ type: "POLYLINE", verts: arc(numOf(b.data, 10), numOf(b.data, 20), numOf(b.data, 40), 0, 360, 72), closed: true, ...col });
    else if (T === "ARC") ents.push({ type: "POLYLINE", verts: arc(numOf(b.data, 10), numOf(b.data, 20), numOf(b.data, 40), numOf(b.data, 50), numOf(b.data, 51), 48), closed: false, ...col });
    else if (T === "POLYLINE") {
      const verts = []; let j = i + 1;
      for (; j < blocks.length && blocks[j].type === "VERTEX"; j++) verts.push([numOf(blocks[j].data, 10), numOf(blocks[j].data, 20)]);
      ents.push({ type: "POLYLINE", verts, closed: (numOf(b.data, 70, 0) & 1) === 1, ...col });
      i = j - 1; if (blocks[j] && blocks[j].type === "SEQEND") i = j;
    }
  }
  return { ents, skippedTypes, layers };
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
const hex2 = n => n.toString(16).padStart(2, "0");
const toHex = (rgb) => `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
// KML szin: aabbggrr (alfa, kek, zold, piros)
const kmlColor = (rgb, a = "ff") => `${a}${hex2(rgb[2])}${hex2(rgb[1])}${hex2(rgb[0])}`;

// --- KML + terkep-elonezet (GeoJSON) eloallitas ---------------------------
// Visszaad: { kml, features, stats }  -  a features a terkep-elonezethez kell.
export function toKml(parsed, eov, { points = true, labels = true, swapXY = false, name = "VITEL export" } = {}) {
  const stats = { points: 0, lines: 0, labels: 0, skippedRange: 0, skippedTypes: parsed.skippedTypes };
  const layers = parsed.layers || {};
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
    const rgb = resolveColor(e, layers);
    if (e.type === "POINT") {
      if (!points) continue;
      const c = toLL(e.x, e.y);
      if (!c) { stats.skippedRange++; continue; }
      features.push({ kind: "Point", coords: c, name: null, rgb });
      stats.points++;
    } else if (e.type === "TEXT") {
      if (!labels) continue;
      const c = toLL(e.x, e.y);
      if (!c || !e.text) { if (!c) stats.skippedRange++; continue; }
      features.push({ kind: "Point", coords: c, name: e.text, label: true, rgb });
      stats.labels++;
    } else if (e.type === "POLYLINE" || e.type === "LINE") {
      const coords = []; let bad = false;
      for (const [x, y] of e.verts) { const c = toLL(x, y); if (!c) { bad = true; break; } coords.push(c); }
      if (bad || coords.length < 2) { stats.skippedRange++; continue; }
      if (e.closed) {
        const ring = coords.slice();
        const a = ring[0], b = ring[ring.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) ring.push(a);
        features.push({ kind: "Polygon", coords: ring, name: null, rgb });
      } else {
        features.push({ kind: "LineString", coords, name: null, rgb });
      }
      stats.lines++;
    }
  }

  // Szinenkenti KML-stilusok (styleUrl-lel hivatkozva)
  const styleIds = new Map();
  for (const f of features) {
    const key = toHex(f.rgb).slice(1);
    if (!styleIds.has(key)) styleIds.set(key, `c${key}`);
  }
  const styles = [...styleIds.entries()].map(([key, id]) => {
    const rgb = [parseInt(key.slice(0, 2), 16), parseInt(key.slice(2, 4), 16), parseInt(key.slice(4, 6), 16)];
    return `<Style id="${id}">` +
      `<LineStyle><color>${kmlColor(rgb)}</color><width>2</width></LineStyle>` +
      `<PolyStyle><color>${kmlColor(rgb, "55")}</color></PolyStyle>` +
      `<IconStyle><color>${kmlColor(rgb)}</color><scale>0.8</scale>` +
      `<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>` +
      `<LabelStyle><color>${kmlColor(rgb)}</color></LabelStyle></Style>`;
  });

  const fc = (ll) => `${ll[0].toFixed(8)},${ll[1].toFixed(8)},0`;
  const placemarks = features.map((f) => {
    const url = `<styleUrl>#${styleIds.get(toHex(f.rgb).slice(1))}</styleUrl>`;
    if (f.kind === "Point") {
      const nm = f.name ? `<name>${xmlEsc(f.name)}</name>` : "";
      return `<Placemark>${nm}${url}<Point><coordinates>${fc(f.coords)}</coordinates></Point></Placemark>`;
    }
    if (f.kind === "Polygon") {
      return `<Placemark>${url}<Polygon><outerBoundaryIs><LinearRing><coordinates>${f.coords.map(fc).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    }
    return `<Placemark>${url}<LineString><coordinates>${f.coords.map(fc).join(" ")}</coordinates></LineString></Placemark>`;
  });

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(name)}</name>
${styles.join("\n")}
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
      properties: {
        ...(f.name ? { name: f.name } : {}),
        ...(f.label ? { label: true } : {}),
        color: toHex(f.rgb || [255, 255, 255]),
      },
      geometry: {
        type: f.kind,
        coordinates: f.kind === "Point" ? f.coords
          : f.kind === "Polygon" ? [f.coords]
          : f.coords,
      },
    })),
  };
}
