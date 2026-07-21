# Harmadik féltől származó komponensek (PDF/A ellenőrzés)

Ez a mappa a böngészőben futó PDF/A **konverzióhoz** használt komponenseket tartalmazza.

## Ghostscript (gs.js, gs.mjs, browser.js, gs.wasm)

- **Ghostscript 9.56.0**, WASM-ra fordítva (`@jspawn/ghostscript-wasm`).
- **Licenc: GNU AGPL-3.0** (Artifex Software, Inc.).
- ⚠️ **Fontos:** az AGPL erős copyleft licenc. Ha ezt a komponenst nyilvánosan
  szolgáltatod (mint itt, GitHub Pages-en), az AGPL feltételei vonatkoznak rá
  (a forrás elérhetővé tétele). Ez a repó nyilvános, így a forrás elérhető.
  Ha ez nem elfogadható a projektben, a konverziót helyette egy külön
  (nem a böngészőben futó) szolgáltatással kell megoldani, vagy el kell hagyni.

## sRGB ICC profil (srgb.icc)

- **sRGB-v2-nano.icc** a Compact-ICC-Profiles projektből
  (https://github.com/saucecontrol/Compact-ICC-Profiles).
- **Licenc: CC0 1.0 (public domain).**

## pdf-lib, JSZip (a ../vendor mappában)

- **pdf-lib** — MIT licenc (a PDF/A ellenőrzéshez / szerkezet-elemzéshez).
- **JSZip** — MIT / GPLv3 (a több fájl egyben letöltéséhez).
