# Publikus webapp — GitHub Pages

A `docs/` mappa egy **teljesen statikus** webappot tartalmaz, ami **szerver nélkül**,
kizárólag a böngészőben végzi a transzformációt (a PROJ-logika JavaScriptben újra
van implementálva, a rácsok kompakt bináris formában betöltődnek). Így publikálható
GitHub Pages-en, és elérhető lesz innen:

**https://micoo79.github.io/VITEL/**

## Mit tud

- **Kézi bevitel** WGS84/ETRS89 ⇄ EOV oda-vissza, opcionális magassággal.
- **Intelligens fájl import**: elválasztó (vessző/pontosvessző/tab/szóköz)
  automatikus felismerése, az első 5 sor mintája alapján oszloponkénti
  szerep-beállítás, fejléc- és tizedesvessző-kapcsoló, eredménytábla, CSV letöltés.
- Pontosság: a hivatalos PROJ pipeline-hoz mérve **< 0,01 mm** (lásd lent).

## Bekapcsolás (egyszeri, a GitHub felületén)

A repo tulajdonosaként két út közül választhatsz.

### A) Gyors — Deploy from a branch
1. **Settings → Pages**
2. *Source*: **Deploy from a branch**
3. *Branch*: `main`, mappa: **`/docs`** → **Save**
4. ~1 perc múlva él: **https://micoo79.github.io/VITEL/**

> Ha még nem a `main`-en van a `docs/`, előbb mergeld oda ezt az ágat. Ha azonnal
> tesztelnél, a *Branch* legördülőben akár a `claude/stoic-hamilton-pyeegi` ág is
> kiválasztható a `/docs` mappával.

### B) Automatikus — GitHub Actions (ajánlott hosszú távra)
1. **Settings → Pages → Source: GitHub Actions**
2. A repóban lévő `.github/workflows/pages.yml` minden `main`-re tolt
   `docs/**` változásnál automatikusan telepít. Kézzel is indítható:
   **Actions → „Deploy GitHub Pages" → Run workflow**.

## Tesztelés a weben

A publikálás után nyisd meg: **https://micoo79.github.io/VITEL/**

1. **Kézi:** irány „WGS84/ETRS89 → EOV", φ=`47.503933139`, λ=`19.047447408`,
   h=`150.0` → **Y≈650000.000, X≈240000.000, H≈106.311**. „⇄ Irány csere",
   `650000`,`240000`,`106.3111` → vissza az eredeti lat/lon/150.000.
2. **Fájl import:** illeszd be (a textarea-ba) ezt, majd „Beolvasás / elemzés":
   ```
   id;lat;lon;h
   P1;47,503933139;19,047447408;150,0
   P2;47,5;19,0;120,0
   ```
   A felismert elválasztó *pontosvessző*; pipáld a „Első sor fejléc" és
   „Tizedesvessző" kapcsolót; az `id` legyen *azonosító*. **Tömeges átszámítás**
   → első sor `Y≈650000, X≈240000, H≈106.311`; majd **CSV letöltése**.

## Helyi előnézet (publikálás előtt)

```bash
cd docs
python -m http.server 8000
# -> http://127.0.0.1:8000
```

## A rácsok és a pontosság ellenőrzése (fejlesztői)

A böngészős motor (`docs/eov.js`) a hivatalos PROJ pipeline-nal validálva van:

```bash
pip install pyproj tifffile imagecodecs numpy   # egyszeri
python tools/export_grids.py                    # docs/grids/*.f32 újragenerálása

# referenciapontok a PROJ-ból:
python - <<'PY'
import os,json,random,math,pyproj
from pyproj import Transformer
from pyproj.enums import TransformDirection
pyproj.datadir.append_data_dir(os.path.abspath("grids"))
t=Transformer.from_pipeline("+proj=pipeline "
 "+step +proj=vgridshift +grids=hu_bme_geoid2014.tif "
 "+step +inv +proj=hgridshift +grids=hu_bme_hd72corr.tif "
 "+step +proj=somerc +lat_0=47.1443937222222 +lon_0=19.0485717777778 "
 "+k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +units=m")
random.seed(7);pts=[]
while len(pts)<3000:
    la=random.uniform(45.9,48.5);lo=random.uniform(16.3,22.8);h=random.uniform(0,900)
    Y,X,H=t.transform(lo,la,h,direction=TransformDirection.FORWARD)
    if math.isfinite(Y) and math.isfinite(H) and 400000<Y<950000 and 30000<X<400000:
        pts.append(dict(lat=la,lon=lo,h=h,Y=Y,X=X,H=H))
json.dump(pts,open("/tmp/ref.json","w"));print("ref:",len(pts))
PY

node tools/validate_js.mjs    # -> max eltérés < 0.01 mm
```
