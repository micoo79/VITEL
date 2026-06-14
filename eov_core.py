"""
eov_core.py  -  WGS84/ETRS89 <-> EOV (HD72) + Balti (EOMA 1980) magassag
=========================================================================

Onallo, GUI- es fuggosegmentes (a pyproj-on kivul) mag-modul a centimeter-
pontos magyar koordinata-transzformaciohoz. A hivatalos BME javitoracsokat
hasznalja egy sajat PROJ pipeline-ban.

Rendszerek
----------
  WGS84 / ETRS89 : EPSG:4326  - lat, lon [fok], h = ellipszoidi magassag [m]
  EOV (HD72)     : EPSG:23700 - Y=Kelet, X=Eszak [m]
  EOMA 1980      : Balti magassagi rendszer (H) [m]

Rácsok (a ./grids mappaban, GeoTIFF):
  hu_bme_hd72corr.tif   - vizszintes datum-korrekcio (HD72 <-> ETRF2000)
  hu_bme_geoid2014.tif  - geoid-undulacio N (ellipszoidi <-> Balti magassag)

Pontossag: a hivatalos Lechner EHT2014 jegyzokonyvhoz kepest ~2-3 mm
vizszintes, <1 mm magassag (lasd VALIDATION.md).

A reszletes matematika: MATH.md. A pipeline lelke az alabbi PROJ-string.
"""

import os
import pyproj
from pyproj import Transformer
from pyproj.enums import TransformDirection

# --- Rácsok elerheteve tetele (lokalis mappa felvetele a PROJ utvonalra) ----
_HERE = os.path.dirname(os.path.abspath(__file__))
_GRID_DIR = os.path.join(_HERE, "grids")
if os.path.isdir(_GRID_DIR):
    pyproj.datadir.append_data_dir(_GRID_DIR)

# --- EOV (EPSG:23700) vetulet: ferde tengelyu szogtarto henger (somerc) -----
#  Kettos vetites: GRS67 ellipszoid -> Gauss-gomb -> somerc sik.
EOV_PROJ = ("+proj=somerc "
            "+lat_0=47.1443937222222 +lon_0=19.0485717777778 "
            "+k_0=0.99993 +x_0=650000 +y_0=200000 "
            "+ellps=GRS67 +units=m")

# --- A teljes 3D pipeline: WGS84/ETRS89 (lon,lat,h) -> EOV (Y,X,H) ----------
#  1) vgridshift geoid2014 : H = h - N         (ellipszoidi -> Balti magassag)
#  2) +inv hgridshift hd72corr : ETRF2000 -> HD72 foldrajzi (vizszintes)
#  3) somerc : HD72 foldrajzi -> EOV sikkoordinata
PIPELINE_3D = (
    "+proj=pipeline "
    "+step +proj=vgridshift +grids=hu_bme_geoid2014.tif "
    "+step +inv +proj=hgridshift +grids=hu_bme_hd72corr.tif "
    "+step " + EOV_PROJ
)

_t = Transformer.from_pipeline(PIPELINE_3D)


def wgs_to_eov(lat, lon, h=None):
    """WGS84/ETRS89 (fok, h_ell m) -> EOV (Y_Kelet, X_Eszak m[, H_Balti m]).

    h nelkul -> (Y, X);  h-val -> (Y, X, H).
    """
    y, x, H = _t.transform(lon, lat, 0.0 if h is None else h,
                           direction=TransformDirection.FORWARD)
    return (y, x) if h is None else (y, x, H)


def eov_to_wgs(y_east, x_north, H=None):
    """EOV (Y_Kelet, X_Eszak m, H_Balti m) -> WGS84/ETRS89 (lat, lon fok[, h_ell m]).

    H nelkul -> (lat, lon);  H-val -> (lat, lon, h).
    """
    lon, lat, h = _t.transform(y_east, x_north, 0.0 if H is None else H,
                               direction=TransformDirection.INVERSE)
    return (lat, lon) if H is None else (lat, lon, h)


if __name__ == "__main__":
    # Validalt referenciapont (BME doc): EOV 650000,240000 = ETRS89 lat/lon
    print("WGS->EOV:", wgs_to_eov(47.503933139, 19.047447408, 150.0))
    print("EOV->WGS:", eov_to_wgs(650000, 240000, 106.3111))
