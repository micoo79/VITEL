# Vitel_code — WGS84 ⇄ EOV (+ Balti magasság) cm-pontos transzformáció

Önálló, átadható tudásanyag a **centiméter-pontos magyar koordináta-transzformációhoz**
(WGS84/ETRS89 ⇄ EOV/HD72 + EOMA 1980 Balti magasság). A cél, hogy ebből egy
**webapp** és egy **Android app** is felépíthető legyen — ezért tartalmaz teljes
matematikai leírást, tiszta mag-kódot és a szükséges rácsfájlokat.

> A csomag **nem** tartalmaz GUI-t vagy tömeges (CSV) feldolgozást — szándékosan
> csak a számítási metódus van benne.

---

## Mit csinál

| Rendszer | EPSG | Koordináták |
|---|---|---|
| WGS84 / ETRS89 | 4326 | φ (lat), λ (lon) fok; h = ellipszoidi magasság (m) |
| EOV (HD72) | 23700 | Y = Kelet, X = Észak (m) |
| EOMA 1980 (Balti) | — | H = magasság (m) |

Oda-vissza, vízszintesen és magasságban is. Pontosság a hivatalos **Lechner
EHT2014** jegyzőkönyvhöz mérve: **~2–3 mm vízszintes, <1 mm magasság**
(lásd [VALIDATION.md](VALIDATION.md)).

---

## A módszer dióhéjban

A transzformáció **hivatalos javítórácsokra** épül (nem egy egyszerű 7-paraméteres
Helmert, ami csak ~0,1–0,3 m), egy PROJ pipeline-ban összefűzve az EOV vetülettel:

```
WGS84/ETRS89 (lon, lat, h_ellipszoidi)
   │
   ├─ 1. vgridshift  hu_bme_geoid2014.tif   →  H_Balti = h − N   (geoid-unduláció)
   ├─ 2. hgridshift  hu_bme_hd72corr.tif    →  ETRF2000 → HD72 (vízszintes datum-korrekció)
   └─ 3. somerc      (GRS67, k0=0.99993)     →  EOV Y, X
   ▼
EOV (Y, X, H_Balti)
```

A teljes képletszintű leírás: **[MATH.md](MATH.md)**.

---

## Fájlok

```
Vitel_code/
├── README.md              ← ez a fájl
├── MATH.md                ← a teljes matematika (vetület + rácsok + interpoláció)
├── VALIDATION.md          ← egyezés a hivatalos Lechner EHT2014-gyel
├── eov_core.py            ← a TISZTA mag-kód (Python, csak pyproj kell)
├── example.py             ← minimál használati példa
├── read_grid_header.py    ← GeoTIFF rács-fejléc olvasó GDAL nélkül (segédeszköz)
├── requirements.txt
└── grids/
    ├── hu_bme_hd72corr.tif   ← vízszintes datum-korrekció rács
    ├── hu_bme_geoid2014.tif  ← geoid (Balti magasság) rács
    └── SOURCE.md             ← a rácsok eredete, licenc, letöltés
```

---

## Gyors indulás (Python)

```bash
pip install pyproj          # PROJ 9.5.1+ (a wheel hozza)
python example.py
```

```python
from eov_core import wgs_to_eov, eov_to_wgs

# WGS84 -> EOV (magassággal)
Y, X, H = wgs_to_eov(47.503933139, 19.047447408, 150.0)
# -> 650000.000, 240000.000, 106.311

# EOV -> WGS84
lat, lon, h = eov_to_wgs(650000, 240000, 106.3111)
# -> 47.503933139, 19.047447408, 150.000
```

---

## Két továbbfejlesztési irány

### A) Webapp / szerver — *ajánlott: használd a PROJ-ot*
A `eov_core.py` szinte változatlanul beépíthető egy Python backendbe
(FastAPI/Flask). A rácsok a `grids/` mappából offline működnek. Egy REST
végpont lényege:

```python
# POST /transform  {dir, lat, lon, h}  ->  {Y, X, H}
from eov_core import wgs_to_eov, eov_to_wgs
```

> **Két kész GUI van a csomagban:**
> - **Publikus, statikus webapp** (`docs/`) — *szerver nélkül*, teljesen a böngészőben
>   fut (a PROJ-logika JS-ben újraimplementálva, < 0,01 mm-re a PROJ-hoz). GitHub
>   Pages-re publikálható: **https://micoo79.github.io/VITEL/** · lásd **[PAGES.md](PAGES.md)**.
> - **Szerveres webapp** (`webapp.py` FastAPI + `static/`) — a PROJ-ot használja
>   közvetlenül; helyi/önálló üzemre. Lásd **[WEBAPP.md](WEBAPP.md)**.
>
> Mindkettő tudja: kézi bevitel oda-vissza + intelligens fájl import
> (elválasztó-felismerés, oszlop-beállítás az első 5 sor mintája alapján,
> tizedesvessző, CSV letöltés).

JavaScript/böngésző oldalon: a PROJ elérhető `proj4js`-ként, vagy a
számítás maradjon a szerveren (a rácsfájlok miatt ez egyszerűbb és pontos).

### B) Android — *két lehetőség*
1. **PROJ natívan** (NDK-val fordítva) vagy a teljes algoritmus
   **újraimplementálása** Kotlin/Java-ban a [MATH.md](MATH.md) alapján:
   - somerc (ferde Mercator) vetület képletei + GRS67 paraméterek,
   - bilineáris interpoláció a két GeoTIFF rácsban,
   - a `hu_bme_hd72corr.tif` (2 sáv: Δlat, Δlon) és `hu_bme_geoid2014.tif`
     (1 sáv: N) olvasása. A rács geometriáját a `read_grid_header.py` kiírja.
2. A rácsokat egyszer érdemes egyszerűbb bináris/ASCII formába konvertálni
   az appba ágyazáshoz (a GeoTIFF olvasáshoz egyébként GDAL/raszter-lib kell).

> **Fontos:** a magasságot **NE** a PROJ „hivatalos" 4979→10660 művelettel
> számold — az egy Helmert-kerülőúton megy a HD72-n át és elrontja a magasságot.
> A helyes út a geoidrács közvetlen alkalmazása az ETRS89/ETRF2000 pozícióban
> (ezt teszi az `eov_core.py`). Részletek a [MATH.md](MATH.md)-ben.

---

## Hivatkozások

- BME leírás: <https://geod.bme.hu/content/centiméter-pontos-eovbalti-átszámítás>
- BME repó (dokumentáció): <https://github.com/OSGeoLabBp/eov2etrs>
- A rácsok (PROJ-data): <https://github.com/OSGeo/PROJ-data/tree/master/hu_bme>
- EPSG: 23700 (EOV), 10660 (EOV + EOMA), 10668 (HD72→ETRF2000)
- PROJ: <https://proj.org> · Lechner EHT2014: <https://lechnerkozpont.hu>
