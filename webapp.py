"""
webapp.py  -  Webes GUI a WGS84/ETRS89 <-> EOV (+ Balti magassag) transzformaciohoz.

FastAPI backend, ami a meglevo `eov_core.py` mag-kodot hasznalja (PROJ pipeline,
BME javitoracsok). A bongeszo-oldali feluletet a ./static/index.html adja.

Futtatas:
    pip install -r requirements.txt
    uvicorn webapp:app --reload --host 127.0.0.1 --port 8000
majd nyisd meg:  http://127.0.0.1:8000

Vegpontok
---------
  POST /api/transform : egyetlen pont oda-vissza (kezi bevitel)
  POST /api/preview   : szoveg elemzese -> elvalaszto + elso 5 sor mintaja
  POST /api/import    : tablazat tomeges atszamitasa az oszlop-hozzarendeles szerint
"""
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from eov_core import wgs_to_eov, eov_to_wgs
from gui_io import detect_delimiter, parse_rows, parse_float, DELIM_NAMES

_HERE = os.path.dirname(os.path.abspath(__file__))
_STATIC = os.path.join(_HERE, "static")

app = FastAPI(title="VITEL - EOV <-> WGS84 transzformacio")


# ---------------------------------------------------------------------------
#  1) Egyetlen pont (kezi bevitel)
# ---------------------------------------------------------------------------
class PointReq(BaseModel):
    direction: str            # "wgs2eov" | "eov2wgs"
    a: float                  # wgs2eov: lat ;  eov2wgs: Y (Kelet)
    b: float                  # wgs2eov: lon ;  eov2wgs: X (Eszak)
    c: Optional[float] = None # opcionalis magassag (h vagy H)


@app.post("/api/transform")
def transform_point(req: PointReq):
    if req.direction == "wgs2eov":
        res = wgs_to_eov(req.a, req.b, req.c)
        out = {"Y": res[0], "X": res[1]}
        if req.c is not None:
            out["H"] = res[2]
    elif req.direction == "eov2wgs":
        res = eov_to_wgs(req.a, req.b, req.c)
        out = {"lat": res[0], "lon": res[1]}
        if req.c is not None:
            out["h"] = res[2]
    else:
        raise HTTPException(400, "Ismeretlen irany (direction).")
    return out


# ---------------------------------------------------------------------------
#  2) Fajl-elonezet: elvalaszto-felismeres + elso sorok mintaja
# ---------------------------------------------------------------------------
class PreviewReq(BaseModel):
    text: str


@app.post("/api/preview")
def preview(req: PreviewReq):
    delim = detect_delimiter(req.text)
    rows = parse_rows(req.text, delim)
    ncols = max((len(r) for r in rows), default=0)
    return {
        "delimiter": delim,
        "delimiter_name": DELIM_NAMES.get(delim, delim),
        "ncols": ncols,
        "nrows": len(rows),
        "sample": rows[:5],
    }


# ---------------------------------------------------------------------------
#  3) Tomeges import az oszlop-hozzarendeles alapjan
# ---------------------------------------------------------------------------
class ImportReq(BaseModel):
    text: str
    delimiter: str
    direction: str                 # "wgs2eov" | "eov2wgs"
    col_a: int                     # az 1. koordinata oszlop-indexe (lat / Y)
    col_b: int                     # a 2. koordinata oszlop-indexe (lon / X)
    col_c: Optional[int] = None    # magassag oszlop (h / H), opcionalis
    id_cols: List[int] = []        # tovabbvitt (passthrough) oszlopok
    has_header: bool = False
    decimal_comma: bool = False


@app.post("/api/import")
def import_table(req: ImportReq):
    rows = parse_rows(req.text, req.delimiter)
    if not rows:
        raise HTTPException(400, "A bemenet ures.")

    header = rows[0] if req.has_header else None
    data = rows[1:] if req.has_header else rows

    # kimeneti oszlopnevek
    if req.direction == "wgs2eov":
        coord_cols = ["Y", "X"] + (["H"] if req.col_c is not None else [])
    else:
        coord_cols = ["lat", "lon"] + (["h"] if req.col_c is not None else [])

    id_names = []
    for idx in req.id_cols:
        name = header[idx] if header and idx < len(header) else f"oszlop_{idx + 1}"
        id_names.append(name)
    columns = id_names + coord_cols

    out_rows, errors = [], []
    for n, r in enumerate(data, start=1):
        def cell(i):
            return r[i] if 0 <= i < len(r) else ""

        a = parse_float(cell(req.col_a), req.decimal_comma)
        b = parse_float(cell(req.col_b), req.decimal_comma)
        c = parse_float(cell(req.col_c), req.decimal_comma) if req.col_c is not None else None

        passthrough = [cell(i) for i in req.id_cols]

        if a is None or b is None or (req.col_c is not None and c is None):
            errors.append({"row": n, "reason": "nem szam a koordinata-oszlopban", "raw": r})
            out_rows.append(passthrough + ["" for _ in coord_cols])
            continue

        try:
            if req.direction == "wgs2eov":
                res = wgs_to_eov(a, b, c)
            else:
                res = eov_to_wgs(a, b, c)
        except Exception as exc:  # noqa: BLE001 - barmilyen PROJ hiba soronkent
            errors.append({"row": n, "reason": str(exc), "raw": r})
            out_rows.append(passthrough + ["" for _ in coord_cols])
            continue

        vals = [round(v, 3) if abs(v) >= 1 else round(v, 9) for v in res]
        out_rows.append(passthrough + vals)

    return {
        "columns": columns,
        "rows": out_rows,
        "n_total": len(data),
        "n_ok": len(data) - len(errors),
        "n_err": len(errors),
        "errors": errors[:50],
    }


# ---------------------------------------------------------------------------
#  Statikus feluleti fajlok
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(os.path.join(_STATIC, "index.html"))


app.mount("/static", StaticFiles(directory=_STATIC), name="static")
