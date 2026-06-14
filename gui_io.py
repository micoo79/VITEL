"""
gui_io.py  -  Intelligens fajl-beolvasas segedfuggvenyek a GUI-hoz.

Tartalom:
  * detect_delimiter : az elvalaszto karakter automatikus felismerese
                       (vesszo, pontosvesszo, tab, szokoz)
  * parse_rows       : a nyers szoveg sorokra/oszlopokra bontasa
  * parse_float      : szam beolvasasa (opcionalis tizedesvesszo-kezelessel)

Fuggosegmentes (csak Python stdlib), igy onmagaban is tesztelheto:
    python gui_io.py
"""
import re

# A felismerni kivant elvalasztok, preferencia-sorrendben. A szokoz a
# legbizonytalanabb, ezert utolso.
_CANDIDATES = [";", ",", "\t", " "]


def _split_line(line, delim):
    """Egy sor szetbontasa a megadott elvalasztoval.

    Szokoz eseten tetszoleges hosszu whitespace-futamokra bontunk (igy az
    igazitott, tobb-szokozos tablazatok is mukodnek).
    """
    if delim == " ":
        return re.split(r"\s+", line.strip())
    return line.split(delim)


def detect_delimiter(text, sample_lines=20):
    """Az elvalaszto karakter automatikus felismerese.

    A nem-ures sorok elejet (max `sample_lines`) megvizsgalja minden
    jelolt elvalasztoval. Azt valasztja, amelyik konzisztensen (minden
    vizsgalt sorban azonos darabszamu) >1 oszlopot ad; tobb jo jelolt eseten
    a tobb oszlopot ado nyer, dontetlennel a preferencia-sorrend (`;`, `,`,
    tab, szokoz). Ha egyik sem konzisztens, alapertelmezesben vesszo.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()][:sample_lines]
    if not lines:
        return ","

    best = None  # (oszlopszam, -prioritas_index, delim)
    for prio, delim in enumerate(_CANDIDATES):
        counts = [len(_split_line(ln, delim)) for ln in lines]
        if min(counts) > 1 and len(set(counts)) == 1:
            cand = (counts[0], -prio, delim)
            if best is None or cand > best:
                best = cand
    return best[2] if best else ","


def parse_rows(text, delim):
    """A teljes szoveg sorokra es oszlopokra bontasa (ures sorok kihagyva).

    Visszaad: list[list[str]] - a cellak korbevagva (strip).
    """
    rows = []
    for ln in text.splitlines():
        if not ln.strip():
            continue
        rows.append([c.strip() for c in _split_line(ln, delim)])
    return rows


def parse_float(value, decimal_comma=False):
    """Szam beolvasasa szovegbol. Hibanal None.

    decimal_comma=True eseten a tizedesvesszot pontra csereli (magyar
    szamformatum), illetve az ezres-elvalaszto szokozt eltavolitja.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if decimal_comma:
        s = s.replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# Baratsagos nevek a UI/uzenetek szamara
DELIM_NAMES = {",": "vesszo", ";": "pontosvesszo", "\t": "tab", " ": "szokoz"}


if __name__ == "__main__":
    samples = {
        "vesszo":      "id,lat,lon\n1,47.5,19.0\n2,47.6,19.1",
        "pontosvesszo": "id;lat;lon\n1;47,5;19,0\n2;47,6;19,1",
        "tab":         "id\tlat\tlon\n1\t47.5\t19.0",
        "szokoz":      "1  47.5  19.0\n2  47.6  19.1",
    }
    print("=== Elvalaszto-felismeres teszt ===")
    for expected, txt in samples.items():
        d = detect_delimiter(txt)
        ok = "OK" if DELIM_NAMES[d] == expected else "HIBA"
        print(f"  [{ok}] vart={expected:12s} felismert={DELIM_NAMES[d]}")
        for r in parse_rows(txt, d):
            print("        ", r)
    print("\n=== parse_float teszt ===")
    print("  '47,5' decimal_comma=True ->", parse_float("47,5", True))
    print("  '1 234,5' decimal_comma=True ->", parse_float("1 234,5", True))
    print("  'abc' ->", parse_float("abc"))
