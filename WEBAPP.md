# Webes GUI — futtatás és tesztelés

A `webapp.py` egy FastAPI szerver, ami a `eov_core.py` mag-kódot használja
(PROJ pipeline + BME rácsok). A felület a böngészőben fut (`static/index.html`).

## Funkciók

- **Kézi bevitel** — egyetlen pont WGS84/ETRS89 → EOV vagy EOV → WGS84,
  opcionális magassággal, „⇄ Irány csere" gombbal.
- **Intelligens fájl import**
  - elválasztó **automatikus felismerése** (vessző, pontosvessző, tab, szóköz),
  - az **első 5 sor mintája** alapján oszloponként beállítható a szerep
    (φ/λ vagy Y/X, magasság, azonosító/megtartás, kihagyás) — a szerepeket
    a program előre meg is tippeli,
  - fejléc-sor és **tizedesvessző** (47,5) kapcsoló,
  - tömeges átszámítás, eredménytábla, hibás sorok jelzése, **CSV letöltés**.

## Indítás

```bash
pip install -r requirements.txt
uvicorn webapp:app --reload --host 127.0.0.1 --port 8000
```

Majd nyisd meg a böngészőben: **http://127.0.0.1:8000**

> Távoli/konténeres környezetben (pl. Claude Code web) a `127.0.0.1` a konténeren
> belül érhető el. Ha a saját géped böngészőjéből akarod nézni, futtasd helyben,
> vagy portot kell továbbítani (`ssh -L 8000:127.0.0.1:8000 ...`), illetve
> `--host 0.0.0.0`-val indítani és a konténer portját kipublikálni.

## Tesztelés — kézi bevitel

1. „Kézi bevitel" fül, irány: **WGS84/ETRS89 → EOV**.
2. φ = `47.503933139`, λ = `19.047447408`, h = `150.0` → **Átszámítás**.
   Várt: **Y ≈ 650000.000, X ≈ 240000.000, H ≈ 106.311** (BME referenciapont).
3. „⇄ Irány csere", írd be `650000`, `240000`, `106.3111` →
   vissza ≈ `47.503933139`, `19.047447408`, `150.000`.

## Tesztelés — fájl import

Hozz létre egy próbafájlt (pontosvessző + magyar tizedesvessző + fejléc):

```csv
id;lat;lon;h
P1;47,503933139;19,047447408;150,0
P2;47,5;19,0;120,0
P3;47,6;19,1;200
```

1. „Fájl import" fül → válaszd ki a fájlt (vagy illeszd be a szöveget) →
   **Beolvasás / elemzés**.
2. Ellenőrizd: a felismert elválasztó **pontosvessző**, 4 oszlop. Pipáld be az
   **Első sor fejléc** és a **Tizedesvessző** kapcsolót, ha kell (a header
   alapján a program általában jól tippel).
3. Az `id` oszlop legyen **azonosító**, a `lat`/`lon`/`h` a megfelelő koordináta.
4. **Tömeges átszámítás** → az első sorra `Y≈650000, X≈240000, H≈106.311`.
   **CSV letöltése** gombbal mentheted az eredményt.

## API-szintű teszt (böngésző nélkül)

```bash
curl -s -X POST http://127.0.0.1:8000/api/transform \
  -H 'Content-Type: application/json' \
  -d '{"direction":"wgs2eov","a":47.503933139,"b":19.047447408,"c":150.0}'
# -> {"Y":649999.99...,"X":240000.00...,"H":106.311...}
```

Vagy a szerver indítása nélkül, a beépített tesztklienssel:

```bash
python - <<'PY'
from fastapi.testclient import TestClient
from webapp import app
c = TestClient(app)
print(c.post("/api/transform",
      json={"direction":"wgs2eov","a":47.503933139,"b":19.047447408,"c":150.0}).json())
PY
```
