/*
 * pdfa.js  -  PDF/A ellenőrzés (pdf-lib) + konverzió (Ghostscript-WASM) böngészőben.
 *
 * A validálás heurisztikus, de a PDF/A leglényegesebb, ellenőrizhető követelményeit
 * nézi: titkosítás, XMP pdfaid metaadat, OutputIntent (ICC), betűtípus-beágyazás,
 * JavaScript. (A hivatalos etalon a veraPDF, ami Java — statikus oldalon nem fut.)
 *
 * A konverzió a Ghostscript 9.56 WASM buildjével készül (PDF/A-2b, sRGB OutputIntent).
 */

const L = window.PDFLib;
const { PDFDocument, PDFName, PDFDict, decodePDFRawStream } = L;

// ---------------------------------------------------------------- validálás
function streamText(stream) {
  try { return new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode()); }
  catch (_) { try { return new TextDecoder("latin1").decode(stream.getContents()); } catch (e) { return ""; } }
}

function fontDescHasFile(ctx, fontDict) {
  if (!fontDict || !fontDict.get) return false;
  const fd = ctx.lookup(fontDict.get(PDFName.of("FontDescriptor")));
  if (!fd || !fd.get) return false;
  return !!(fd.get(PDFName.of("FontFile")) || fd.get(PDFName.of("FontFile2")) || fd.get(PDFName.of("FontFile3")));
}

function fontsNotEmbedded(ctx) {
  const bad = [];
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (String(obj.get(PDFName.of("Type")) || "") !== "/Font") continue;
    const subtype = String(obj.get(PDFName.of("Subtype")) || "");
    const base = String(obj.get(PDFName.of("BaseFont")) || "névtelen").replace(/^\//, "");
    if (subtype === "/Type3") continue;                        // glyph-programok, beágyazottak
    if (subtype === "/Type0") {
      let df = ctx.lookup(obj.get(PDFName.of("DescendantFonts")));
      if (df && df.asArray) df = ctx.lookup(df.asArray()[0]);
      if (!fontDescHasFile(ctx, df)) bad.push(base);
    } else if (!fontDescHasFile(ctx, obj)) {
      bad.push(base);
    }
  }
  return [...new Set(bad)];
}

function hasJavaScript(ctx, catalog) {
  try {
    const names = ctx.lookup(catalog.get(PDFName.of("Names")));
    if (names && names.get && names.get(PDFName.of("JavaScript"))) return true;
  } catch (_) {}
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) {
      if (String(obj.get(PDFName.of("S")) || "") === "/JavaScript") return true;
      if (obj.get(PDFName.of("JS"))) return true;
    }
  }
  return false;
}

export async function validatePdf(bytes) {
  let encrypted = false, doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message || "")) {
      encrypted = true;
      try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }); }
      catch (_) { return { ok: false, fatal: "Titkosított PDF, a tartalom nem elemezhető.", declares: null, issues: [] }; }
    } else {
      return { ok: false, fatal: "A PDF nem olvasható: " + (e.message || e), declares: null, issues: [] };
    }
  }
  const ctx = doc.context, catalog = doc.catalog;
  const issues = [];

  issues.push({ key: "Titkosítás", ok: !encrypted,
    detail: encrypted ? "A fájl titkosított — PDF/A-ban nem megengedett." : "Nincs titkosítás." });

  // XMP pdfaid
  let declares = null, xmp = "";
  const metaObj = ctx.lookup(catalog.get(PDFName.of("Metadata")));
  if (metaObj && metaObj.getContents) xmp = streamText(metaObj);
  const mPart = xmp.match(/pdfaid:part\s*[>=]\s*['"]?([1-4])/i) || xmp.match(/<pdfaid:part>\s*([1-4])/i);
  const mConf = xmp.match(/pdfaid:conformance\s*[>=]\s*['"]?([ABUabu])/i) || xmp.match(/<pdfaid:conformance>\s*([ABUabu])/i);
  if (mPart) declares = "PDF/A-" + mPart[1] + (mConf ? mConf[1].toLowerCase() : "");
  issues.push({ key: "PDF/A metaadat (XMP pdfaid)", ok: !!mPart,
    detail: mPart ? ("Deklarált szabvány: " + declares) : "Hiányzik az XMP pdfaid metaadat (nincs PDF/A deklaráció)." });

  // OutputIntent
  let oiOk = false;
  const oiArr = ctx.lookup(catalog.get(PDFName.of("OutputIntents")));
  if (oiArr && oiArr.asArray) {
    for (const el of oiArr.asArray()) {
      const d = ctx.lookup(el);
      if (d && d.get && String(d.get(PDFName.of("S")) || "").includes("GTS_PDFA") && d.get(PDFName.of("DestOutputProfile"))) oiOk = true;
    }
  }
  issues.push({ key: "OutputIntent (ICC kimeneti profil)", ok: oiOk,
    detail: oiOk ? "Van GTS_PDFA OutputIntent beágyazott ICC profillal." : "Hiányzik a PDF/A OutputIntent (ICC kimeneti profil)." });

  // betűtípusok
  let bad = [];
  try { bad = fontsNotEmbedded(ctx); } catch (_) {}
  issues.push({ key: "Betűtípusok beágyazása", ok: bad.length === 0,
    detail: bad.length ? ("Nem beágyazott betűtípus(ok): " + bad.slice(0, 8).join(", ") + (bad.length > 8 ? " …" : "")) : "Minden betűtípus beágyazott." });

  // JavaScript
  let js = false; try { js = hasJavaScript(ctx, catalog); } catch (_) {}
  issues.push({ key: "JavaScript", ok: !js,
    detail: js ? "A dokumentum JavaScriptet tartalmaz — PDF/A-ban tilos." : "Nincs JavaScript." });

  return { ok: issues.every(i => i.ok), declares, issues };
}

// ---------------------------------------------------------------- konverzió (Ghostscript-WASM)
let _gsFactory = null, _wasmModule = null, _icc = null, _def = null;

export async function ensureGs(onProgress) {
  if (_wasmModule) return;
  onProgress && onProgress("Ghostscript betöltése (~16 MB, csak első alkalommal)…");
  _gsFactory = (await import("./pdfa/gs.mjs")).default;
  const [wasmBuf, iccBuf, defBuf] = await Promise.all([
    fetch("./pdfa/gs.wasm").then(r => r.arrayBuffer()),
    fetch("./pdfa/srgb.icc").then(r => r.arrayBuffer()),
    fetch("./pdfa/PDFA_def.ps").then(r => r.arrayBuffer()),
  ]);
  _icc = new Uint8Array(iccBuf); _def = new Uint8Array(defBuf);
  _wasmModule = await WebAssembly.compile(wasmBuf);            // egyszer fordítjuk
  onProgress && onProgress("");
}

export async function convertToPdfA(bytes) {
  if (!_wasmModule) throw new Error("A Ghostscript nincs betöltve.");
  const log = [];
  const mod = await _gsFactory({
    noInitialRun: true,
    instantiateWasm: (imports, cb) => { WebAssembly.instantiate(_wasmModule, imports).then(inst => cb(inst)); return {}; },
    print: () => {}, printErr: (t) => log.push(t),
  });
  mod.FS.writeFile("/input.pdf", bytes);
  mod.FS.writeFile("/srgb.icc", _icc);
  mod.FS.writeFile("/PDFA_def.ps", _def);
  mod.callMain(["-dPDFA=2", "-dBATCH", "-dNOPAUSE", "-dNOSAFER", "-dNOOUTERSAVE",
    "-dPDFACompatibilityPolicy=1", "-sColorConversionStrategy=RGB", "-sDEVICE=pdfwrite",
    "-sOutputFile=/output.pdf", "/PDFA_def.ps", "/input.pdf"]);
  let out;
  try { out = mod.FS.readFile("/output.pdf"); } catch (_) {
    throw new Error("A konverzió nem készített kimenetet. " + log.slice(-3).join(" "));
  }
  return out.slice();                                          // Uint8Array másolat
}

// ---------------------------------------------------------------- ZIP (JSZip)
export async function zipFiles(files) {   // files: [{name, bytes}]
  const zip = new window.JSZip();
  for (const f of files) zip.file(f.name, f.bytes);
  return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
