# Validáció — egyezés a hivatalos Lechner EHT2014-gyel

A módszert a **Lechner Tudásközpont EHT2014 V2.0** hivatalos transzformációs
jegyzőkönyvéhez mértük (EOV/EOMA → ETRS89/ETRF2000 jegyzőkönyv 3 pontjával).

## Bemenet (EOV/EOMA)

| Pont | Y [m] | X [m] | H [m] (Balti) |
|---|---|---|---|
| 3 | 666982.220 | 287377.290 | 3236.000 |
| 4 | 666980.000 | 287387.860 | 3236.000 |
| 5 | 666985.810 | 287389.080 | 3236.000 |

## Eredmény (ETRS89): hivatalos vs. ez a kód

| Pont | φ hivatalos | λ hivatalos | h hivatalos | Δφ | Δλ | Δh |
|---|---|---|---|---|---|---|
| 3 | 47.929831201 | 19.274693328 | 3279.548 | −2.4 mm | +1.2 mm | +0.7 mm |
| 4 | 47.929926319 | 19.274664031 | 3279.548 | −2.4 mm | +1.1 mm | +0.6 mm |
| 5 | 47.929937139 | 19.274741826 | 3279.548 | −2.4 mm | +1.1 mm | +0.6 mm |

**Vízszintes eltérés ~2,7 mm, magassági <1 mm.** Bőven cm-pontosság alatt. ✅

## Miért nem pontosan 0?

A két program **két különböző, de egyenértékű hivatalos cm-rácsot** használ:
- **ez a kód:** BME `hu_bme_*` rácsok (PROJ-data),
- **Lechner EHT2014:** saját `hu_sgo_*` rácsok.

A néhány mm a két realizáció közti különbség, nem hiba. Ha 0 eltérés kell a
Lechnerrel, a `hu_sgo_hd72corr.gsb` + `hu_sgo_vitel2014.tif` rácsokra kell váltani
a pipeline-ban.

## Másodlagos referenciapont (BME dokumentáció)

`EOV (650000, 240000)  ↔  ETRS89 (φ=47.503933139, λ=19.047447408)` — a kód ezt
**mm alatt** reprodukálja oda-vissza (lásd `example.py`).
