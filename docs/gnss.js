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
  const points = [];
  if (hdr >= 0) {
    for (let i = hdr + 1; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.trim()) continue;
      if (ln.startsWith("Last Compilation")) break;
      if (ln.indexOf(",") < 0) continue;
      const a = ln.split(",");
      if (a.length < 58) continue;                       // nem ervenyes adatsor
      points.push(SATLAB_COLUMNS.map(([, idx]) => (a[idx] ?? "").trim()));
    }
  }

  return {
    manufacturer: G("Gyártó:") || "Ismeretlen",
    title: firstLine,
    meta,
    columns: SATLAB_COLUMNS.map(([label]) => label),
    points,
  };
}

// Belepesi pont: gyarto felismerese + parse.
export function parseReport(text) {
  const man = (detectManufacturer(text) || "").toLowerCase();
  if (man.includes("satlab")) return { ok: true, ...parseSatlab(text) };
  return { ok: false, error: "Ismeretlen vagy nem támogatott gyártó. Jelenleg: Satlab." };
}
