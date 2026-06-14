# A transzformáció matematikája

Ez a dokumentum teljes egészében leírja a WGS84/ETRS89 ⇄ EOV (+ Balti magasság)
átszámítás módszerét, hogy bármely nyelven (Python, JS, Kotlin/Java) újra
implementálható legyen. **Az autoritatív (mérvadó) megvalósítás a PROJ pipeline**
(lásd a végén); az itteni képletekkel készülő saját kódot a [VALIDATION.md](VALIDATION.md)
referenciapontjain kell ellenőrizni.

---

## 1. Rendszerek és ellipszoidok

| Rendszer | Ellipszoid | Megjegyzés |
|---|---|---|
| WGS84 / ETRS89 / ETRF2000 | GRS80 (≈WGS84) | a = 6378137, 1/f = 298.257222101 |
| HD72 (EOV alapja) | **GRS67 / IUGG67** | a = 6378160, 1/f = 298.247167427 |
| EOMA 1980 | — (magassági rendszer) | Balti, Kronstadt-i alapszint |

GRS67-re: `e² = 2f − f² = 0.00669460533` (`e = √e²`).

A vízszintes datum (HD72 ↔ ETRF2000) és a magasság (ellipszoidi ↔ Balti) közti
eltérés **nem konstans** — pont-függő, ezért **javítórácsokkal** kezeljük.

---

## 2. A teljes lánc és a lépések sorrendje

`WGS84/ETRS89 (lon, lat, h_ell)  →  EOV (Y, X, H_Balti)`:

1. **Magasság (geoidrács):** `H = h − N(lon, lat)`, ahol `N` a geoid-unduláció,
   bilineárisan interpolálva a `hu_bme_geoid2014.tif` rácsból. — *Ezt a lépést a
   vízszintes rács előtt kell elvégezni, mert a geoidrács az ETRF2000 földrajzi
   koordinátákra van indexelve.*
2. **Vízszintes datum (datumrács):** `(lon, lat)_HD72 = (lon, lat)_ETRF2000 + Δ`,
   ahol `Δ = (Δlon, Δlat)` bilineárisan a `hu_bme_hd72corr.tif` rácsból
   (ETRF2000 → HD72 irányban; a rács fordított irányát kell alkalmazni, lásd 4.).
3. **Vetület (somerc):** a HD72 földrajzi koordinátából EOV síkkoordináta a
   GRS67-en értelmezett ferde Mercator vetülettel (lásd 3.).

A magasság a 2.–3. lépés alatt változatlanul áthalad (a vízszintes rács és a
vetület nem érinti).

Az **inverz** (EOV → WGS84) ugyanez fordított sorrendben és irányban.

> ⚠️ **A magasságra ne** a PROJ „hivatalos" `EPSG:4979→10660` műveletét használd:
> az egy ~1 m-es Helmert-kerülőúton megy a HD72 datumon át, ami tízméteres
> hibát visz a magasságba. A geoidrácsot közvetlenül az ETRS89/ETRF2000
> pozícióban kell kiértékelni (ahogy itt).

---

## 3. EOV vetület (Ferde tengelyű, szögtartó henger — „somerc")

Kettős vetítés: **GRS67 ellipszoid → Gauss-gömb → ferde Mercator henger**
(Rosenmund-/svájci típus, EPSG metódus 9815). Ugyanaz, amit a PROJ `+proj=somerc`
megvalósít.

### Paraméterek (EPSG:23700)

| Jel | Érték | Leírás |
|---|---|---|
| φ₀ | 47.1443937222222° (47°08′39.81740″) | vetületi kezdőpont szélesség |
| λ₀ | 19.0485717777778° (19°02′54.85840″ K) | vetületi kezdőpont hosszúság |
| k₀ | 0.99993 | léptéktényező |
| FE (x₀) | 650000 m | hamis Keleti (Y) érték |
| FN (y₀) | 200000 m | hamis Északi (X) érték |
| ellipszoid | GRS67 | a = 6378160, e² = 0.00669460533 |

> EOV-konvenció: **Y = Keleti**, **X = Északi** (fordítva a megszokotthoz képest).

### Állandók (egyszer kiszámolva)

```
R  = a·√(1−e²) / (1 − e²·sin²φ₀)
α  = √( 1 + (e²/(1−e²))·cos⁴φ₀ )
b₀ = asin( sin φ₀ / α )
K  = ln(tan(π/4 + b₀/2))
     − α·ln(tan(π/4 + φ₀/2))
     + α·(e/2)·ln( (1 + e·sin φ₀)/(1 − e·sin φ₀) )
```

### Forward: (φ, λ) → (Y, X)

```
S  = α·ln(tan(π/4 + φ/2))
     − α·(e/2)·ln( (1 + e·sin φ)/(1 − e·sin φ) )
     + K
b  = 2·( atan(exp(S)) − π/4 )            # Gauss-gömbi szélesség
l  = α·(λ − λ₀)                          # Gauss-gömbi hosszúság (rad)

# elforgatás a ferde henger tengelyébe:
b̄  = asin( cos b₀·sin b − sin b₀·cos b·cos l )
l̄  = atan2( sin l ,  sin b₀·tan b + cos b₀·cos l )   # NB: tan b → cos b·sin b₀ + ...

Y  = FE + k₀·R·l̄
X  = FN + k₀·R·ln(tan(π/4 + b̄/2))
```

### Inverz: (Y, X) → (φ, λ)

```
ȳ  = (Y − FE) / (k₀·R)
x̄  = (X − FN) / (k₀·R)

b̄  = 2·( atan(exp(x̄)) − π/4 )
l̄  = ȳ

# vissza-forgatás a normál Gauss-gömbre:
b  = asin( cos b₀·sin b̄ + sin b₀·cos b̄·cos l̄ )
l  = atan2( sin l̄ ,  cos b₀·cos l̄ − sin b₀·tan b̄ )

λ  = λ₀ + l/α

# φ az izometrikus szélességből, iterációval:
ψ  = ( ln(tan(π/4 + b/2)) − K ) / α
φ  := 2·atan(exp(ψ)) − π/2                       # kezdőérték
ismételd (3–5×):
   φ := 2·atan( exp(ψ)·( (1+e·sinφ)/(1−e·sinφ) )^(e/2) ) − π/2
```

> Az `α`-val és `K`-val az EOV-specifikus „redukált" gömbi közvetítés valósul meg.
> Ha a saját kódod a [VALIDATION.md] referenciapontját mm-en belül visszaadja,
> a vetület-implementáció helyes.

---

## 4. Vízszintes datum-rács — `hu_bme_hd72corr.tif`

GeoTIFF, **2 sáv** (float32): a földrajzi koordináta eltolásai.
Geometria (a `read_grid_header.py` adja):

| | érték |
|---|---|
| méret | 251 × 121 pont |
| felbontás | 0.0277778° (= 1/36° = 100″) lon és lat |
| lon | 16.111111° … 23.055556° |
| lat | 45.555556° … 48.888889° |
| bal-felső sarok | (16.111111°, 48.888889°) |

A rács a **HD72 → ETRF2000** korrekciót tárolja. Mi az **ETRF2000 → HD72**
irányt akarjuk, ezért az eltolást **fordított előjellel** (illetve iterációval)
alkalmazzuk — a PROJ ezt a `+inv +proj=hgridshift` lépéssel teszi.

**Bilineáris interpoláció** (egy sávra, a másik ugyanígy):
```
col = (lon − lon_min) / dlon ;  row = (lat_max − lat) / dlat   # sor föntről lefelé
i = floor(col), j = floor(row) ; fx = col−i, fy = row−j
v = v[j,i]·(1−fx)(1−fy) + v[j,i+1]·fx(1−fy)
  + v[j+1,i]·(1−fx)fy   + v[j+1,i+1]·fx·fy
```
A két sáv jellemzően **Δlat** és **Δlon** (NTv2-stílus). A pontos sáv-sorrendet és
mértékegységet (fok vagy ívmásodperc) a referenciaponton kell ellenőrizni; a PROJ
hgridshift konvenciója a mérvadó.

---

## 5. Magassági (geoid) rács — `hu_bme_geoid2014.tif`

GeoTIFF, **1 sáv** (float32): a geoid-unduláció `N` (méter).

| | érték |
|---|---|
| méret | 268 × 186 pont |
| felbontás | dlon = 0.026°, dlat = 0.018° |
| lon | 16.100° … 23.042° |
| lat | 45.560° … 48.890° |
| bal-felső sarok | (16.100°, 48.890°) |

`N`-t a 4. pontbeli bilineáris képlettel olvassuk ki az (lon, lat) ETRF2000
pozícióban, majd:
```
H_Balti     = h_ellipszoidi − N        # forward (WGS → EOMA)
h_ellipszoidi = H_Balti     + N        # inverz  (EOMA → WGS)
```
Magyarországon `N ≈ +43 … +46 m` (a geoid az ellipszoid felett).

---

## 6. Az autoritatív megvalósítás — PROJ pipeline

A teljes, mérvadó leírás egyetlen PROJ-string (ezt használja az `eov_core.py`):

```
+proj=pipeline
  +step +proj=vgridshift +grids=hu_bme_geoid2014.tif
  +step +inv +proj=hgridshift +grids=hu_bme_hd72corr.tif
  +step +proj=somerc +lat_0=47.1443937222222 +lon_0=19.0485717777778
        +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +units=m
```

- **Forward** (a pipeline-on előre): WGS84/ETRS89 (lon, lat, h) → EOV (Y, X, H).
- **Inverz**: EOV (Y, X, H) → WGS84/ETRS89 (lon, lat, h).
- Bemenet/kimenet a pyproj-ban `always_xy` nélkül: a somerc kimenete (E=Y, N=X).
  Az `eov_core.py` ezt becsomagolja (lásd ott a sorrendet).

A rácsok a `grids/` mappában vannak; offline működik. Letöltési forrás és licenc:
[grids/SOURCE.md](grids/SOURCE.md).

---

## 7. Újraimplementálási checklista

1. GRS67 állandók (a, e²) és a somerc állandók (R, α, b₀, K).
2. somerc forward + inverz (3. pont), iterációs φ-megoldással.
3. GeoTIFF rácsok olvasása (251×121×2 és 268×186×1 float32) + bilineáris interp.
4. Lépés-sorrend és előjelek a 2. pont szerint (geoid előbb, datum fordítva).
5. **Validálás** a [VALIDATION.md] 3 pontján — vízszintes < pár mm, magasság < 1 mm.
