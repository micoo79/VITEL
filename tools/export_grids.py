"""
export_grids.py  -  A GeoTIFF rácsok kitomese a bongeszos (statikus) apphoz.

A ket BME rácsot (Deflate+float-predictor tomoritett GeoTIFF) nyers, little-endian
float32 binarissa konvertalja, hogy a bongeszo egyszeruen `fetch`-csel betoltse
(geotiff.js dekoder nelkul). A geometriat egy grids.json irja le.

Kimenet (a docs/grids/ ala):
  geoid.f32  : 186 x 268 float32 (sor-folytonos, felulrol lefele) - N geoid-undulacio
  hd72.f32   : 2 x 121 x 251 float32 - band0=Dlat["], band1=Dlon["]  (HD72->ETRF2000)
  grids.json : meretek, geotranszformacio, nodata, offsetek

Futtatas:
    pip install tifffile imagecodecs numpy
    python tools/export_grids.py
"""
import json
import os

import numpy as np
import tifffile

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
_SRC = os.path.join(_ROOT, "grids")
_OUT = os.path.join(_ROOT, "docs", "grids")


def main():
    os.makedirs(_OUT, exist_ok=True)

    geoid = tifffile.imread(os.path.join(_SRC, "hu_bme_geoid2014.tif")).astype("<f4")
    hd72 = tifffile.imread(os.path.join(_SRC, "hu_bme_hd72corr.tif")).astype("<f4")

    # geoid: (rows, cols)   hd72: (band, rows, cols)
    assert geoid.ndim == 2 and hd72.ndim == 3 and hd72.shape[0] == 2

    geoid.tofile(os.path.join(_OUT, "geoid.f32"))
    # band0 (Dlat) majd band1 (Dlon) egymas utan
    hd72.reshape(-1).tofile(os.path.join(_OUT, "hd72.f32"))

    meta = {
        "geoid": {
            "file": "geoid.f32", "rows": int(geoid.shape[0]), "cols": int(geoid.shape[1]),
            "lon0": 16.1, "lat0": 48.89, "dlon": 0.026, "dlat": 0.018,
            "nodata": -1000.0,  # a tenyleges fill -32768; ez ala minden nodata
            "_desc": "N geoid-undulacio [m], sor 0 = legfelso (lat0)",
        },
        "hd72": {
            "file": "hd72.f32", "bands": 2,
            "rows": int(hd72.shape[1]), "cols": int(hd72.shape[2]),
            "lon0": 16.1111111111111, "lat0": 48.8888888888889,
            "dlon": 1.0 / 36.0, "dlat": 1.0 / 36.0,
            "band0": "Dlat_arcsec", "band1": "Dlon_arcsec",
            "_desc": "HD72->ETRF2000 eltolas ivmasodpercben; ETRF->HD72 = -ertek",
        },
    }
    with open(os.path.join(_OUT, "grids.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    print("Kiirva ->", _OUT)
    for k, v in meta.items():
        print(f"  {k:6s}: {v['rows']}x{v['cols']}"
              + (f" x{v['bands']}" if 'bands' in v else "")
              + f"  ({v['file']})")


if __name__ == "__main__":
    main()
