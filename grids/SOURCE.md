# Rácsfájlok eredete és licenc

Mindkét rács a hivatalos **PROJ-data** tárolóból származik, a **BME Általános- és
Felsőgeodézia Tanszék** fejlesztése.

| Fájl | Szerep | Sávok | Méret |
|---|---|---|---|
| `hu_bme_hd72corr.tif` | vízszintes datum-korrekció (HD72 ↔ ETRF2000) | 2 (Δlat, Δlon) | 251×121 |
| `hu_bme_geoid2014.tif` | geoid-unduláció N (ellipszoidi ↔ Balti magasság) | 1 (N, m) | 268×186 |

## Letöltés

```
https://cdn.proj.org/hu_bme_hd72corr.tif
https://cdn.proj.org/hu_bme_geoid2014.tif
```

Forrás / dokumentáció:
- <https://github.com/OSGeo/PROJ-data/tree/master/hu_bme>
- `hu_bme_README.txt` (a fenti mappában): forrás, formátum, licenc.

## Kapcsolódó EPSG transzformációk

- `hu_bme_hd72corr.tif` → EPSG:10668 (HD72 → ETRF2000)
- `hu_bme_geoid2014.tif` → EPSG:10666 / 10667 (ETRF2000 → EOMA 1980 height)

## Licenc

**Creative Commons BY (CC-BY)** — a BME / PROJ-data feltételei szerint.
Felhasználáskor a forrás (BME Geodézia Tsz.) megjelölése szükséges.

## Megjegyzés más nyelvű implementációhoz

A fájlok **GeoTIFF** float32 rácsok. GDAL/rasterio nélkül a fejléc (kiterjedés,
felbontás) a `../read_grid_header.py`-val olvasható; a pixelértékek kiolvasásához
GDAL, rasterio vagy saját GeoTIFF-strip olvasó kell (a rácsok tömörítetlenek).
