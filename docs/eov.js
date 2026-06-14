/*
 * eov.js  -  WGS84/ETRS89 <-> EOV (HD72) + Balti (EOMA 1980) magassag
 * ====================================================================
 * Tiszta, fuggosegmentes JavaScript implementacio a bongeszohoz (statikus,
 * GitHub Pages-kompatibilis - nincs szukseg szerverre).
 *
 *   - somerc vetulet (GRS67) forward/inverz  -> MATH.md 3. pont
 *   - geoid-undulacio (vgridshift)           -> geoid.f32 rács
 *   - HD72<->ETRF2000 datum (hgridshift)     -> hd72.f32 rács (iteracioval)
 *
 * A logika 1:1-ben validalva a hivatalos PROJ pipeline ellen
 * (eltres < 0.01 mm, lasd tools/validate_js.mjs).
 *
 * Hasznalat (ES module):
 *   import { EOV } from './eov.js';
 *   const eov = await EOV.load('./grids/');
 *   eov.wgsToEov(lat, lon, h)  -> {Y, X, H}
 *   eov.eovToWgs(Y, X, H)      -> {lat, lon, h}
 *   (h / H elhagyhato -> csak vizszintes)
 */

const DEG = Math.PI / 180, RAD = 180 / Math.PI;

// ---- GRS67 ellipszoid + EOV (EPSG:23700) vetuleti parameterek --------------
const A = 6378160.0, F = 1 / 298.247167427;
const E2 = 2 * F - F * F, E = Math.sqrt(E2);
const LAT0 = 47.1443937222222 * DEG, LON0 = 19.0485717777778 * DEG;
const K0 = 0.99993, FE = 650000.0, FN = 200000.0;

// somerc allandok (egyszer kiszamolva)
const Rs = A * Math.sqrt(1 - E2) / (1 - E2 * Math.sin(LAT0) ** 2);
const ALPHA = Math.sqrt(1 + (E2 / (1 - E2)) * Math.cos(LAT0) ** 4);
const B0 = Math.asin(Math.sin(LAT0) / ALPHA);
const KC = Math.log(Math.tan(Math.PI / 4 + B0 / 2))
         - ALPHA * Math.log(Math.tan(Math.PI / 4 + LAT0 / 2))
         + ALPHA * (E / 2) * Math.log((1 + E * Math.sin(LAT0)) / (1 - E * Math.sin(LAT0)));

function somercForward(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const S = ALPHA * Math.log(Math.tan(Math.PI / 4 + lat / 2))
          - ALPHA * (E / 2) * Math.log((1 + E * Math.sin(lat)) / (1 - E * Math.sin(lat))) + KC;
  const b = 2 * (Math.atan(Math.exp(S)) - Math.PI / 4);
  const l = ALPHA * (lon - LON0);
  const bbar = Math.asin(Math.cos(B0) * Math.sin(b) - Math.sin(B0) * Math.cos(b) * Math.cos(l));
  const lbar = Math.atan2(Math.sin(l), Math.cos(B0) * Math.cos(l) + Math.sin(B0) * Math.tan(b));
  return {
    Y: FE + K0 * Rs * lbar,
    X: FN + K0 * Rs * Math.log(Math.tan(Math.PI / 4 + bbar / 2)),
  };
}

function somercInverse(Y, X) {
  const ybar = (Y - FE) / (K0 * Rs), xbar = (X - FN) / (K0 * Rs);
  const bbar = 2 * (Math.atan(Math.exp(xbar)) - Math.PI / 4), lbar = ybar;
  const b = Math.asin(Math.cos(B0) * Math.sin(bbar) + Math.sin(B0) * Math.cos(bbar) * Math.cos(lbar));
  const l = Math.atan2(Math.sin(lbar), Math.cos(B0) * Math.cos(lbar) - Math.sin(B0) * Math.tan(bbar));
  const lon = LON0 + l / ALPHA;
  const psi = (Math.log(Math.tan(Math.PI / 4 + b / 2)) - KC) / ALPHA;
  let lat = 2 * Math.atan(Math.exp(psi)) - Math.PI / 2;
  for (let k = 0; k < 6; k++) {
    lat = 2 * Math.atan(Math.exp(psi) * ((1 + E * Math.sin(lat)) / (1 - E * Math.sin(lat))) ** (E / 2)) - Math.PI / 2;
  }
  return { lat: lat * RAD, lon: lon * RAD };
}

// ---- Rács (bilineáris interpolacio float32 tombbol) ------------------------
class Grid {
  constructor(meta, data) { this.m = meta; this.d = data; }

  // egy "sav" mintavetele; band: 0 v. 1 (hd72), geoidnal 0
  sample(lon, lat, band = 0) {
    const m = this.m;
    const col = (lon - m.lon0) / m.dlon;
    const row = (m.lat0 - lat) / m.dlat;       // sor felulrol lefele
    const i = Math.floor(col), j = Math.floor(row);
    if (i < 0 || j < 0 || i >= m.cols - 1 || j >= m.rows - 1) return null;
    const fx = col - i, fy = row - j;
    const base = band * m.rows * m.cols;
    const idx = (r, c) => base + r * m.cols + c;
    const v00 = this.d[idx(j, i)],     v01 = this.d[idx(j, i + 1)];
    const v10 = this.d[idx(j + 1, i)], v11 = this.d[idx(j + 1, i + 1)];
    const nd = m.nodata ?? -1000;
    if (v00 < nd || v01 < nd || v10 < nd || v11 < nd) return null;
    return v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy)
         + v10 * (1 - fx) * fy + v11 * fx * fy;
  }
}

export class EOV {
  constructor(geoid, hd72) { this.geoid = geoid; this.hd72 = hd72; }

  static async load(base = './grids/') {
    const meta = await (await fetch(base + 'grids.json')).json();
    const fetchF32 = async (f) =>
      new Float32Array(await (await fetch(base + f)).arrayBuffer());
    const [gd, hd] = await Promise.all([
      fetchF32(meta.geoid.file), fetchF32(meta.hd72.file),
    ]);
    return new EOV(new Grid(meta.geoid, gd), new Grid(meta.hd72, hd));
  }

  // geoid-undulacio N (m) az ETRF2000 (lon,lat) pozicioban
  _N(lon, lat) { return this.geoid.sample(lon, lat, 0); }

  // ETRF2000 -> HD72 eltolas (fok); a rács HD72->ETRF2000-t tarol ivmasodpercben
  _shiftEtrfToHd72(lon, lat) {
    let hlon = lon, hlat = lat;                 // iteracio (inverz hgridshift)
    for (let k = 0; k < 6; k++) {
      const dLat = this.hd72.sample(hlon, hlat, 0);  // band0 = Dlat["]
      const dLon = this.hd72.sample(hlon, hlat, 1);  // band1 = Dlon["]
      if (dLat === null || dLon === null) return null;
      hlat = lat - dLat / 3600;
      hlon = lon - dLon / 3600;
    }
    return { lon: hlon, lat: hlat };
  }

  // HD72 -> ETRF2000 eltolas (fok), kozvetlen (forward hgridshift)
  _shiftHd72ToEtrf(hlon, hlat) {
    const dLat = this.hd72.sample(hlon, hlat, 0);
    const dLon = this.hd72.sample(hlon, hlat, 1);
    if (dLat === null || dLon === null) return null;
    return { lon: hlon + dLon / 3600, lat: hlat + dLat / 3600 };
  }

  /** WGS84/ETRS89 (lat, lon fok[, h ell. m]) -> EOV {Y, X[, H Balti]}. */
  wgsToEov(lat, lon, h = null) {
    const N = this._N(lon, lat);
    const hd = this._shiftEtrfToHd72(lon, lat);
    if (hd === null || (h !== null && N === null)) {
      throw new RangeError('A pont a rács lefedettsegen kivul esik.');
    }
    const { Y, X } = somercForward(hd.lat, hd.lon);
    return h === null ? { Y, X } : { Y, X, H: h - N };
  }

  /** EOV (Y, X m[, H Balti m]) -> WGS84/ETRS89 {lat, lon fok[, h ell. m]}. */
  eovToWgs(Y, X, H = null) {
    const { lat: hlat, lon: hlon } = somercInverse(Y, X);
    const etrf = this._shiftHd72ToEtrf(hlon, hlat);
    if (etrf === null) throw new RangeError('A pont a rács lefedettsegen kivul esik.');
    if (H === null) return { lat: etrf.lat, lon: etrf.lon };
    const N = this._N(etrf.lon, etrf.lat);
    if (N === null) throw new RangeError('A pont a rács lefedettsegen kivul esik.');
    return { lat: etrf.lat, lon: etrf.lon, h: H + N };
  }
}
