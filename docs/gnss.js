/*
 * gnss.js  -  Nyers GNSS meresi jegyzokonyv -> strukturalt adat a jegyzokonyvhoz.
 *
 * Jelenleg tamogatott gyarto: SATLAB (a fajlban "Gyarto:Satlab" alapjan felismerve).
 * A "Tarolt pontok:" szekciobol csak a kert oszlopokat adja vissza (K/E felcserelve),
 * a tobbi fejlec-informaciot (altalanos, vetulet, transzformacio, bazis, vevo)
 * strukturaltan kigyujtve.
 */

// A pont-tablazat oszlopai: [fejlec, a nyers CSV-sor 0-alapu indexe].
// A K es E fel van cserelve (K, majd E), a kert sorrend szerint.
export const SATLAB_COLUMNS = [
  ["Név", 0],
  ["K", 2], ["É", 1], ["M", 3],
  ["Helyi Sz", 4], ["Helyi H", 5], ["Helyi M", 6],
  ["Baseline Vector dN", 19], ["Baseline Vector dE", 20], ["Baseline Vector dZ", 21],
  ["Jelmag.", 22], ["AntH Pos", 23], ["Ant.M", 24],
  ["Bázis É", 25], ["Bázis K", 26], ["Bázis M", 27],
  ["HRMS", 46], ["VRMS", 47], ["Állapot", 48], ["KezdHelyi idő", 49],
  ["Holdak", 56], ["PDOP", 57],
];

// Egy "Cimke:ertek" mezo kiolvasasa. Az ertek tab, sortores vagy 2+ szokoz elott zarul
// (a Satlab fejlecben a mezok tabbal vagy tobb szokozzel vannak elvalasztva/igazitva).
function grab(text, label) {
  const i = text.indexOf(label);
  if (i < 0) return null;
  let rest = text.slice(i + label.length);
  const nl = rest.search(/[\r\n]/);
  if (nl >= 0) rest = rest.slice(0, nl);          // csak az adott sor
  const m = rest.match(/^[ \t]*(.*?)[ \t]*(?:\t|\s{2,}|$)/);
  const v = m ? m[1].trim() : "";
  return v === "" ? null : v;
}

export function detectManufacturer(text) {
  const g = grab(text, "Gyártó:");
  return g || null;
}

// { title, rows:[[cimke, ertek], ...] } szekciok, csak a nem-ures ertekekkel.
function section(title, pairs) {
  const rows = pairs.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return rows.length ? { title, rows } : null;
}

export function parseSatlab(text) {
  const G = (l) => grab(text, l);

  // cim: az elso nem-ures sor
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim()) || "").trim();

  // a=..., f=... az Ellipszoid sorbol
  const ell = text.match(/Ellipszoid:([^\t\n\r]*?)\s*(?:\t|\s{2,})a=([\d.]+)\s*(?:\t|\s{2,})f=([\d.]+)/);

  const meta = [
    section("Általános adatok", [
      ["Jelentés", firstLine],
      ["Szoftver verzió", G("Szoftver verzió:")],
      ["Dátum", G("Dátum:")],
      ["Koordináta-rendszer", G("Koord. rendszer:")],
      ["Helyi ellipszoid", G("Helyi ellipsz.:")],
      ["Vetület", G("Vetület:")],
      ["Magasság rendszere", G("Magasság rendszere:")],
      ["Félteke", G("Félteke:")],
      ["Gyártó", G("Gyártó:")],
    ]),
    section("Vetületi paraméterek", [
      ["Ellipszoid", ell ? ell[1].trim() : null],
      ["a", ell ? ell[2] : null],
      ["f", ell ? ell[3] : null],
      ["Középmeridián", G("Central Meridan:")],
      ["Kezdő szélesség", G("Central Latitude:")],
      ["Méretarány", G("M.arány:")],
      ["False North (m)", G("False North(m):")],
      ["False East (m)", G("False East(m):")],
    ]),
    section("Transzformációs paraméterek", [
      ["X eltolás (m)", G("X Translation(m):")],
      ["Y eltolás (m)", G("Y Translation(m):")],
      ["Z eltolás (m)", G("Z Translation(m):")],
      ["X forgatás", G("X Roatation(m):")],
      ["Y forgatás", G("Y Roatation(m):")],
      ["Z forgatás", G("Z Roatation(m):")],
      ["Méretarány", G("Scale:")],
    ]),
    section("Bázisállomás", [
      ["Mountpoint", G("Mountpoint:")],
      ["Bázis helyi Sz", G("Bázis helyi Sz:")],
      ["Bázis helyi H", G("Bázis helyi H:")],
      ["Bázis helyi M", G("Bázis helyi M:")],
      ["BázisSz", G("BázisSz:")],
      ["BázisH", G("BázisH:")],
      ["Bázis M (fáziscentrum)", G("Bázis M (fáziscentr):")],
    ]),
    section("Vevő és antenna", [
      ["Eszköz típusa", G("Eszköz típusa:")],
      ["Eszköz ID", G("Eszköz ID:")],
      ["Vevő firmware", G("Vevő firmware:")],
      ["Antenna", G("Antenna:")],
      ["Leírás", G("Leírás:")],
      ["Sugár (m)", G("Sugár:")],
      ["L1 fázisközéppont", G("L1 fázis külpont:")],
      ["L2 fázisközéppont", G("L2 fázis külpont:")],
      ["SHMP külpont", G("SHMP külpont:")],
    ]),
  ].filter(Boolean);

  // "Tárolt pontok:" -> fejlecsor -> adatsorok
  const lines = text.split(/\r?\n/);
  let hdr = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Baseline Vector dN") && /(^|\s)Név(\s|$)/.test(lines[i])) { hdr = i; break; }
  }
  const points = [], pointsRaw = [];
  if (hdr >= 0) {
    for (let i = hdr + 1; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.trim()) continue;
      if (ln.startsWith("Last Compilation")) break;
      if (ln.indexOf(",") < 0) continue;
      const a = ln.split(",");
      if (a.length < 58) continue;                       // nem ervenyes adatsor
      points.push(SATLAB_COLUMNS.map(([, idx]) => (a[idx] ?? "").trim()));
      pointsRaw.push(a);
    }
  }

  const cols = SATLAB_COLUMNS.map(([label]) => label);
  const P = {}; cols.forEach((c, i) => (P[c] = i));
  return {
    manufacturer: G("Gyártó:") || "Satlab",
    title: firstLine,
    meta,
    columns: cols,
    points,
    descriptions: pointsRaw.map((r) => (r[53] ?? "").trim()),   // Leírás oszlop (SATLAB)
    times: pointsRaw.map((r) => parseTs(r[49])),                 // KezdHelyi idő -> ms
    ctrl: {
      nevIdx: P["Név"], kIdx: P["K"], eIdx: P["É"], mIdx: P["M"],
      szIdx: P["Helyi Sz"], hIdx: P["Helyi H"], mmIdx: P["Helyi M"],
      timeIdx: P["KezdHelyi idő"],
      randomize: [P["HRMS"], P["VRMS"], P["PDOP"]],
      baseline: { dNIdx: P["Baseline Vector dN"], dEIdx: P["Baseline Vector dE"], dZIdx: P["Baseline Vector dZ"] },
      durationMs: 2000,
      formatTime: fmtTs,
      dmsLat: (d) => toDMS(d, true),
      dmsLon: (d) => toDMS(d, false),
    },
  };
}

// ===========================================================================
//  ELLENŐRZÉSI JEGYZŐKÖNYV  —  ellenőrző pontok generálása + összehasonlítás
// ===========================================================================

// Meghatározott részletpontok száma -> ellenőrzendő részletpontok száma.
//   1–10        : legalább 1 db
//   11–100      : 10%, de legalább 2 db
//   101–1 000   : 5%,  de legalább 10 db
//   1 001–10 000: 3%,  de legalább 50 db
//   10 000 fölött: 1%, de legalább 300 db
export function requiredCheckCount(n) {
  if (n <= 0) return 0;
  if (n <= 10) return 1;
  if (n <= 100) return Math.max(Math.ceil(n * 0.10), 2);
  if (n <= 1000) return Math.max(Math.ceil(n * 0.05), 10);
  if (n <= 10000) return Math.max(Math.ceil(n * 0.03), 50);
  return Math.max(Math.ceil(n * 0.01), 300);
}

// A nyers SATLAB adatsor fix indexei (a "Tárolt pontok" fejléc szerint)
const IX = { nev: 0, E: 1, K: 2, M: 3, dN: 19, dE: 20, dZ: 21, hrms: 46, vrms: 47, kezd: 49, veg: 50, pdop: 57 };

function parseTs(s) {
  const m = String(s).trim().match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) + Math.round(parseFloat(m[6]) * 1000);
}
function fmtTs(ms) {
  const d = new Date(ms), p = (x, n = 2) => String(x).padStart(n, "0");
  const sec = (d.getUTCSeconds() + d.getUTCMilliseconds() / 1000).toFixed(1).padStart(4, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${sec}`;
}
// tizedes fok -> "DD:MM:SS.sssss" + féltekejel (a SATLAB formátum szerint)
function toDMS(deg, isLat) {
  const hemi = isLat ? (deg < 0 ? "S" : "N") : (deg < 0 ? "W" : "E");
  let a = Math.abs(deg), d = Math.floor(a), mf = (a - d) * 60, mi = Math.floor(mf);
  let ss = Math.round((mf - mi) * 60 * 1e5) / 1e5;
  if (ss >= 60) { ss -= 60; mi += 1; }
  if (mi >= 60) { mi -= 60; d += 1; }
  return `${d}:${String(mi).padStart(2, "0")}:${ss.toFixed(5).padStart(8, "0")}${hemi}`;
}

const _sign = () => (Math.random() < 0.5 ? -1 : 1);
const _offXY = () => _sign() * Math.round(Math.random() * 90) / 1000;        // ±0..0.090 m (mm)
const _offZ = () => _sign() * (20 + Math.round(Math.random() * 30)) / 1000;   // ±0.020..0.050 m (mm)
const _rng = (min, max) => min + Math.random() * (max - min);

// geodéziai (WGS84) lat/lon/h -> ECEF X/Y/Z (m)
function lla2ecef(latDeg, lonDeg, h) {
  const a = 6378137, e2 = 0.00669437999014;
  const phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180, s = Math.sin(phi);
  const Nr = a / Math.sqrt(1 - e2 * s * s);
  return {
    x: (Nr + h) * Math.cos(phi) * Math.cos(lam),
    y: (Nr + h) * Math.cos(phi) * Math.sin(lam),
    z: (Nr * (1 - e2) + h) * s,
  };
}

// tizedes fok -> "DD°MM′SS.ssss″" + féltekejel (a FORGEO/Emlid formátum szerint)
function toDMSSym(deg, isLat) {
  const hemi = isLat ? (deg < 0 ? "S" : "N") : (deg < 0 ? "W" : "E");
  let a = Math.abs(deg), d = Math.floor(a), mf = (a - d) * 60, mi = Math.floor(mf);
  let ss = Math.round((mf - mi) * 60 * 1e4) / 1e4;
  if (ss >= 60) { ss -= 60; mi += 1; }
  if (mi >= 60) { mi -= 60; d += 1; }
  return `${d}°${String(mi).padStart(2, "0")}′${ss.toFixed(4).padStart(7, "0")}″${hemi}`;
}
// FORGEO idő: "DD-MM-YYYY" + "HH:MM:SS" -> ms
function parseForgeoTs(dateStr, timeStr) {
  const dm = String(dateStr).match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  const tm = String(timeStr).match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!dm || !tm) return null;
  return Date.UTC(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]);
}
function formatForgeoTime(ms) {
  const d = new Date(ms), p = (x) => String(x).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
// az eredeti cella tizedesjegy-számát megtartva formáz (pl. "1.100" -> 3 tizedes)
function decimalsOf(s) { const m = String(s).match(/[.,](\d+)/); return m ? m[1].length : 3; }
function fixLike(num, sample) { return num.toFixed(decimalsOf(sample)); }

/**
 * Ellenőrző mérés szimulálása.
 *   - a mért pontszám alapján kiválasztja a vizsgálandó darabszámot (táblázat),
 *   - random pontokat választ, visszafelé (utolsótól) haladva "újraméri" őket,
 *   - K/É ±0–9 cm, M ±2–5 cm (mm) random eltolás,
 *   - a rögzítési időket az eredeti időközökből, az utolsó pont után generálja,
 *   - Helyi Sz/H/M = VITEL (eov.eovToWgs) a módosított K,É,M-ből,
 *   - dY/dX/dZ összehasonlítás + E = 5·√t tűrés (t = GNSS bázisvonal km).
 * @param parsed  a parseSatlab kimenete
 * @param eov     betöltött EOV motor (eov.eovToWgs)
 */
export function buildControl(parsed, eov, selection) {
  const C = parsed.points, N = C.length, s = parsed.ctrl, T = parsed.times || [];
  const required = requiredCheckCount(N);

  let sel;
  if (Array.isArray(selection) && selection.length) {   // kézi kiválasztás
    sel = [...new Set(selection.filter((i) => i >= 0 && i < N))].sort((a, b) => a - b);
  } else {                                              // random kiválasztás
    const m = Math.min(required, N);
    const idx = [...Array(N).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    sel = idx.slice(0, m).sort((a, b) => a - b);
  }
  const rev = [...sel].reverse();                       // utolsótól visszafelé

  // a randomizálandó minőségi oszlopok min–max tartománya
  const mm = {};
  for (const ci of s.randomize) { const a = C.map((r) => parseFloat(r[ci])).filter(Number.isFinite); mm[ci] = [Math.min(...a), Math.max(...a)]; }

  const dur = s.durationMs || 2000;
  const controlRows = [], comparison = [];
  let cursor = (T[N - 1] || 0) + dur;                   // az utolsó mért pont után

  for (let k = 0; k < rev.length; k++) {
    const oi = rev[k];
    const travel = k === 0 ? ((T[N - 1] || 0) - (T[oi] || 0)) : ((T[rev[k - 1]] || 0) - (T[oi] || 0));
    cursor += Math.max(0, travel || 0);
    const cStart = cursor;
    cursor += dur;

    const orig = C[oi];
    const K0 = parseFloat(orig[s.kIdx]), E0 = parseFloat(orig[s.eIdx]), M0 = parseFloat(orig[s.mIdx]);
    const oK = _offXY(), oE = _offXY(), oM = _offZ();     // eltolások (m)
    const Kc = K0 + oK, Ec = E0 + oE, Mc = M0 + oM;
    const w = eov.eovToWgs(Kc, Ec, Mc);                  // módosított pont -> WGS (VITEL)

    const row = orig.slice();                            // a többi adat az eredetiből
    row[s.nevIdx] = `${1001 + k}_${orig[s.nevIdx]}_ell`;
    row[s.kIdx] = fixLike(Kc, orig[s.kIdx]);
    row[s.eIdx] = fixLike(Ec, orig[s.eIdx]);
    row[s.mIdx] = fixLike(Mc, orig[s.mIdx]);
    if (s.szIdx != null) row[s.szIdx] = s.dmsLat(w.lat);
    if (s.hIdx != null) row[s.hIdx] = s.dmsLon(w.lon);
    if (s.mmIdx != null) row[s.mmIdx] = fixLike(w.h, orig[s.mmIdx]);
    if (s.timeIdx != null) row[s.timeIdx] = s.formatTime(cStart);

    // baseline vektor újraszámolása (ha a formátum tartalmazza)
    if (s.baseline) {
      const w0 = eov.eovToWgs(K0, E0, M0);
      const e0 = lla2ecef(w0.lat, w0.lon, w0.h), ec = lla2ecef(w.lat, w.lon, w.h);
      const b = s.baseline;
      row[b.dNIdx] = fixLike(parseFloat(orig[b.dNIdx]) + (ec.x - e0.x), orig[b.dNIdx]);
      row[b.dEIdx] = fixLike(parseFloat(orig[b.dEIdx]) + (ec.y - e0.y), orig[b.dEIdx]);
      row[b.dZIdx] = fixLike(parseFloat(orig[b.dZIdx]) + (ec.z - e0.z), orig[b.dZIdx]);
    }
    // minőségi mutatók a mért pontok min–max tartományában randomizálva
    for (const ci of s.randomize) row[ci] = fixLike(_rng(mm[ci][0], mm[ci][1]), orig[ci]);

    controlRows.push(row);
    comparison.push({ orig: orig[s.nevIdx], ell: row[s.nevIdx], dY: oK * 100, dX: oE * 100, dZ: oM * 100 });
  }

  return { measured: N, required, checked: sel.length, selectedIndices: sel, columns: parsed.columns, controlRows, comparison };
}

// ===========================================================================
//  FORGEO MÉRTÉK / Emlid Reach  (.xls -> soronkénti tömb)
// ===========================================================================
const _cell = (v) => (v == null ? "" : String(v)).trim();

export function parseForgeo(rowsIn) {
  const R = (rowsIn || []).map((r) => (r || []).map(_cell));
  const grabX = (label) => {
    for (const r of R) for (const c of r) if (c.startsWith(label + ":")) return c.slice(label.length + 1).trim();
    return null;
  };
  const title = grabX("Projektnév") || (R[0] && R[0][0]) || "GNSS jegyzőkönyv";
  const firmware = grabX("Firmware Name");

  const meta = [
    section("Általános adatok", [
      ["Projektnév", grabX("Projektnév")], ["Dátum", grabX("Date")],
      ["Koordináta-rendszer", grabX("Coordinate system")],
      ["Geoid fájl", grabX("Geoid file")], ["Grid fájl", grabX("Grid file")],
    ]),
    section("Vevő és antenna", [
      ["Vevő típusa", grabX("Receiver Type")], ["Sorozatszám", grabX("Receiver serial number")],
      ["Antenna típusa", grabX("Antenna type")], ["L1 külpont", grabX("L1 offset")],
      ["L2 külpont", grabX("L2 offset")], ["Firmware", firmware],
    ]),
  ];

  // bázisállomás
  const bi = R.findIndex((r) => r[0] === "GNSS base station");
  if (bi >= 0) {
    let h = bi + 1; while (h < R.length && R[h][0] !== "Nr") h++;
    const d = R[h + 1] || [];
    const bsec = section("Bázisállomás", [
      ["Nr", d[0]], ["Dátum", d[1]], ["Idő", d[2]], ["B", d[3]], ["L", d[4]],
      ["H", d[5]], ["X", d[6]], ["Y", d[7]], ["Z", d[8]],
    ]);
    if (bsec) meta.push(bsec);
  }

  // mérések
  const mi = R.findIndex((r) => r[0] === "GNSS measurements");
  let mh = mi + 1; while (mh < R.length && R[mh][0] !== "Nr") mh++;
  // nyers oszlop-indexek: Nr0 Date1 Time2 GMT3 Mode4 B5 L6 H7 X8 Y9 Z10 x11 y12 h13 E14 Sat15 PDOP16 mp17 mh18 H.ant19
  const MAP = [0, 12, 11, 13, 5, 6, 7, 1, 2, 4, 15, 16, 17, 18, 19];   // y=Kelet(K), x=Észak(É), h=EOV mag.
  const columns = ["Nr", "K", "É", "M", "B", "L", "H", "Dátum", "Idő", "Mód", "Sat", "PDOP", "mp", "mh", "H.ant"];
  const points = [], times = [], descriptions = [];
  for (let i = mh + 1; i < R.length; i++) {
    const r = R[i];
    if (!r[0] || !/^\d/.test(r[0])) break;               // az adatsorok végéig
    points.push(MAP.map((ri) => r[ri] ?? ""));
    times.push(parseForgeoTs(r[1], r[2]));
    descriptions.push(r[2] || "");                        // idő (a modálban megkülönböztetéshez)
  }

  const P = {}; columns.forEach((c, i) => (P[c] = i));
  return {
    manufacturer: firmware && /forgeo/i.test(firmware) ? "FORGEO MÉRTÉK" : "Emlid Reach",
    title, meta, columns, points, descriptions, times,
    ctrl: {
      nevIdx: P["Nr"], kIdx: P["K"], eIdx: P["É"], mIdx: P["M"],
      szIdx: P["B"], hIdx: P["L"], mmIdx: P["H"], timeIdx: P["Idő"],
      randomize: [P["PDOP"], P["mp"], P["mh"]],
      baseline: null, durationMs: 2000,
      formatTime: formatForgeoTime,
      dmsLat: (d) => toDMSSym(d, true),
      dmsLon: (d) => toDMSSym(d, false),
    },
  };
}

// Belepesi pont: formatum-felismeres + parse.
//   text (string)  -> SATLAB (Gyártó:Satlab)
//   rows (tömb)    -> FORGEO/Emlid xls
export function parseReport(input) {
  if (typeof input === "string") {
    const man = (detectManufacturer(input) || "").toLowerCase();
    if (man.includes("satlab")) return { ok: true, ...parseSatlab(input) };
    return { ok: false, error: "Ismeretlen szöveges jegyzőkönyv (Satlab várható)." };
  }
  if (Array.isArray(input)) {
    const flat = input.flat().map(String).join(" ");
    if (/GNSS MEASUREMENT REPORT|FORGEO|Emlid/i.test(flat)) return { ok: true, ...parseForgeo(input) };
    return { ok: false, error: "Ismeretlen táblázatos jegyzőkönyv (FORGEO/Emlid várható)." };
  }
  return { ok: false, error: "Ismeretlen fájltípus." };
}
