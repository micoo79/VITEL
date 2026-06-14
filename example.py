"""
Minimal hasznalati pelda az eov_core modulra.
Futtatas:  python example.py
"""
from eov_core import wgs_to_eov, eov_to_wgs

print("=== WGS84/ETRS89 -> EOV ===")
# BME referenciapont, h = 150 m ellipszoidi magassaggal
Y, X, H = wgs_to_eov(47.503933139, 19.047447408, 150.0)
print(f"  lat=47.503933139 lon=19.047447408 h=150.0")
print(f"  -> EOV Y={Y:.3f}  X={X:.3f}  H_Balti={H:.3f}")

print("\n=== EOV -> WGS84/ETRS89 ===")
lat, lon, h = eov_to_wgs(650000, 240000, 106.3111)
print(f"  Y=650000 X=240000 H=106.3111")
print(f"  -> lat={lat:.9f}  lon={lon:.9f}  h={h:.3f}")

print("\n=== Csak vizszintes (magassag nelkul) ===")
print("  WGS->EOV:", wgs_to_eov(47.5, 19.0))
print("  EOV->WGS:", eov_to_wgs(650000, 240000))

print("\n=== Lechner EHT2014 validacios pont (3) ===")
lat, lon, h = eov_to_wgs(666982.220, 287377.290, 3236.000)
print(f"  EOV(666982.220, 287377.290, 3236.0) ->")
print(f"  lat={lat:.9f} lon={lon:.9f} h={h:.3f}")
print(f"  hivatalos:  47.929831201  19.274693328  3279.548")
