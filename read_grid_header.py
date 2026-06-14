"""
read_grid_header.py  -  GeoTIFF rács-fejlec olvaso GDAL/rasterio nelkul.

Kiirja a hu_bme rácsok kiterjedeset, felbontasat, savjait. Hasznos, ha egy
masik nyelvben (pl. Android/Kotlin) ujra kell implementalni a rács-olvasast.
A pixel-ertekek (float32) kiolvasasahoz GDAL vagy rasterio ajanlott.
"""
import struct, os

_TAGS = {256: "ImageWidth", 257: "ImageLength", 258: "BitsPerSample",
         277: "SamplesPerPixel", 339: "SampleFormat",
         33550: "ModelPixelScale", 33922: "ModelTiepoint",
         34737: "GeoAsciiParams"}
_TYPE_SZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


def read_header(path):
    with open(path, "rb") as f:
        data = f.read()
    en = "<" if data[:2] == b"II" else ">"
    off = struct.unpack(en + "I", data[4:8])[0]
    n = struct.unpack(en + "H", data[off:off + 2])[0]
    out = {}
    for i in range(n):
        e = off + 2 + i * 12
        tag, typ, cnt = struct.unpack(en + "HHI", data[e:e + 8])
        if tag not in _TAGS:
            continue
        sz = _TYPE_SZ.get(typ, 1) * cnt
        voff = struct.unpack(en + "I", data[e + 8:e + 12])[0] if sz > 4 else e + 8
        raw = data[voff:voff + sz]
        if typ == 12:
            vals = struct.unpack(en + "%dd" % cnt, raw)
        elif typ in (3, 8):
            vals = struct.unpack(en + "%dH" % cnt, raw)
        elif typ in (4, 9):
            vals = struct.unpack(en + "%dI" % cnt, raw)
        elif typ == 2:
            vals = (raw.split(b"\0")[0].decode("latin1"),)
        else:
            vals = (raw,)
        out[_TAGS[tag]] = vals[0] if cnt == 1 else vals
    return out


def describe(path):
    m = read_header(path)
    w, h = m["ImageWidth"], m["ImageLength"]
    ps, tp = m["ModelPixelScale"], m["ModelTiepoint"]
    lon0, lat0, dlon, dlat = tp[3], tp[4], ps[0], ps[1]
    return {
        "file": os.path.basename(path), "width": w, "height": h,
        "bands": m.get("SamplesPerPixel"),
        "dlon": dlon, "dlat": dlat,
        "lon_min": lon0, "lon_max": lon0 + (w - 1) * dlon,
        "lat_max": lat0, "lat_min": lat0 - (h - 1) * dlat,
        "corner_topleft": (lon0, lat0),
    }


if __name__ == "__main__":
    gd = os.path.join(os.path.dirname(__file__), "grids")
    for fn in ("hu_bme_hd72corr.tif", "hu_bme_geoid2014.tif"):
        d = describe(os.path.join(gd, fn))
        print(f"\n=== {d['file']} ===")
        print(f"  meret    : {d['width']} x {d['height']} pont, {d['bands']} sav")
        print(f"  felbontas: dlon={d['dlon']:.9f}  dlat={d['dlat']:.9f} fok")
        print(f"  lon      : {d['lon_min']:.6f} .. {d['lon_max']:.6f}")
        print(f"  lat      : {d['lat_min']:.6f} .. {d['lat_max']:.6f}")
        print(f"  TL sarok : {d['corner_topleft']}")
