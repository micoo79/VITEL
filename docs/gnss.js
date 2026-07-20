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

  return {
    manufacturer: G("Gyártó:") || "Ismeretlen",
    title: firstLine,
    meta,
    columns: SATLAB_COLUMNS.map(([label]) => label),
    colIndex: Object.fromEntries(SATLAB_COLUMNS.map(([l, i]) => [l, i])),
    points,
    pointsRaw,
  };
}

// ===========================================================================
//  ELLENŐRZÉSI JEGYZŐKÖNYV  —  ellenőrző pontok generálása + összehasonlítás
// ===========================================================================

// Mért pontok darabszáma -> vizsgálandó (ellenőrzendő) pontok száma.
export function requiredCheckCount(n) {
  const T = [[50, 15], [100, 20], [200, 30], [320, 40], [500, 55], [800, 75],
             [1200, 115], [3200, 150], [8000, 225], [20000, 300], [100000, 450]];
  for (const [mx, r] of T) if (n <= mx) return r;
  return 750;
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
export function buildControl(parsed, eov) {
  const raw = parsed.pointsRaw, N = raw.length;
  const required = requiredCheckCount(N);
  const m = Math.min(required, N);

  const idx = [...Array(N).keys()];
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const sel = idx.slice(0, m).sort((a, b) => a - b);   // eredeti sorrend
  const rev = [...sel].reverse();                       // utolsótól visszafelé

  const T = raw.map(r => parseTs(r[IX.kezd]));
  const Vend = raw.map(r => parseTs(r[IX.veg]) ?? ((parseTs(r[IX.kezd]) ?? 0) + 2000));

  // HRMS/VRMS/PDOP min–max az összes mért pontból (ezen belül randomizálunk)
  const mm = (ix) => { const a = raw.map(r => parseFloat(r[ix])).filter(Number.isFinite); return [Math.min(...a), Math.max(...a)]; };
  const [hMin, hMax] = mm(IX.hrms), [vMin, vMax] = mm(IX.vrms), [pMin, pMax] = mm(IX.pdop);

  const P = {}; parsed.columns.forEach((c, i) => (P[c] = i));
  const controlRows = [], comparison = [];
  let cursor = Vend[N - 1];                              // az utolsó mért pont után

  for (let k = 0; k < rev.length; k++) {
    const oi = rev[k];
    const travel = k === 0 ? (T[N - 1] - T[oi]) : (T[rev[k - 1]] - T[oi]);
    cursor += Math.max(0, travel || 0);
    const cStart = cursor;
    cursor += Math.max(1000, (Vend[oi] - T[oi]) || 2000);

    const K0 = parseFloat(raw[oi][IX.K]), E0 = parseFloat(raw[oi][IX.E]), M0 = parseFloat(raw[oi][IX.M]);
    const oK = _offXY(), oE = _offXY(), oM = _offZ();     // eltolások (m)
    const Kc = K0 + oK, Ec = E0 + oE, Mc = M0 + oM;
    const w = eov.eovToWgs(Kc, Ec, Mc);                  // {lat, lon, h} — VITEL (módosított)
    const w0 = eov.eovToWgs(K0, E0, M0);                 // eredeti pozíció

    const name = `${1001 + k}_${raw[oi][IX.nev]}_ell`;
    const row = parsed.points[oi].slice();               // a többi adat az eredetiből
    row[P["Név"]] = name;
    row[P["K"]] = Kc.toFixed(4);
    row[P["É"]] = Ec.toFixed(4);
    row[P["M"]] = Mc.toFixed(4);
    row[P["Helyi Sz"]] = toDMS(w.lat, true);
    row[P["Helyi H"]] = toDMS(w.lon, false);
    row[P["Helyi M"]] = w.h.toFixed(4);
    row[P["KezdHelyi idő"]] = fmtTs(cStart);

    // Új baseline vektor: eredeti baseline + a pont ECEF-elmozdulása (bázis változatlan)
    const e0 = lla2ecef(w0.lat, w0.lon, w0.h), ec = lla2ecef(w.lat, w.lon, w.h);
    row[P["Baseline Vector dN"]] = (parseFloat(raw[oi][IX.dN]) + (ec.x - e0.x)).toFixed(4);
    row[P["Baseline Vector dE"]] = (parseFloat(raw[oi][IX.dE]) + (ec.y - e0.y)).toFixed(4);
    row[P["Baseline Vector dZ"]] = (parseFloat(raw[oi][IX.dZ]) + (ec.z - e0.z)).toFixed(4);
    // HRMS/VRMS/PDOP: a mért pontok min–max tartományában randomizálva
    row[P["HRMS"]] = _rng(hMin, hMax).toFixed(4);
    row[P["VRMS"]] = _rng(vMin, vMax).toFixed(4);
    row[P["PDOP"]] = _rng(pMin, pMax).toFixed(3);
    controlRows.push(row);

    const dY = oK * 100, dX = oE * 100, dZ = oM * 100;   // cm (Y=Kelet, X=Észak, Z=magasság)
    comparison.push({ orig: raw[oi][IX.nev], ell: name, dY, dX, dZ });
  }

  return { measured: N, required, checked: m, columns: parsed.columns, controlRows, comparison };
}

// Belepesi pont: gyarto felismerese + parse.
export function parseReport(text) {
  const man = (detectManufacturer(text) || "").toLowerCase();
  if (man.includes("satlab")) return { ok: true, ...parseSatlab(text) };
  return { ok: false, error: "Ismeretlen vagy nem támogatott gyártó. Jelenleg: Satlab." };
}
