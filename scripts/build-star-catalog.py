#!/usr/bin/env python3
"""Z HYG + Stellarium buduje kompaktowy katalog gwiazd i linii gwiazdozbiorów."""

from __future__ import annotations

import csv
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "data"
HYG_GZ = Path("/tmp/stardata/hyg.csv.gz")
FAB = Path("/tmp/stardata/constellationship.fab")

# Gołe oko + zapas, żeby linie gwiazdozbiorów nie gubiły słabszych węzłów.
MAG_LIMIT = 6.2
# Nachylenie ekliptyki J2000 — planety żyją w XZ, Y = północ ekliptyki.
ECLIPTIC_OBLIQUITY = math.radians(23.439281)


def equatorial_to_scene(ra_hours: float, dec_deg: float) -> tuple[float, float, float]:
    # HYG trzyma RA w godzinach (0–24), deklinację w stopniach.
    ra = math.radians(ra_hours * 15.0)
    dec = math.radians(dec_deg)
    x_eq = math.cos(dec) * math.cos(ra)
    y_eq = math.cos(dec) * math.sin(ra)
    z_eq = math.sin(dec)
    cos_e = math.cos(ECLIPTIC_OBLIQUITY)
    sin_e = math.sin(ECLIPTIC_OBLIQUITY)
    x_ecl = x_eq
    y_ecl = y_eq * cos_e + z_eq * sin_e
    z_ecl = -y_eq * sin_e + z_eq * cos_e
    return (round(x_ecl, 5), round(z_ecl, 5), round(y_ecl, 5))


def parse_fab(path: Path) -> list[tuple[str, list[tuple[int, int]]]]:
    constellations = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        name = parts[0]
        count = int(parts[1])
        ids = [int(p) for p in parts[2:]]
        pairs = []
        for i in range(count):
            a, b = ids[i * 2], ids[i * 2 + 1]
            if a != b:
                pairs.append((a, b))
        if pairs:
            constellations.append((name, pairs))
    return constellations


def main() -> None:
    constellations = parse_fab(FAB)
    needed_hips = {hip for _, pairs in constellations for a, b in pairs for hip in (a, b)}

    by_hip: dict[int, dict] = {}
    with gzip.open(HYG_GZ, "rt", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            hip_raw = (row.get("hip") or "").strip()
            if not hip_raw:
                continue
            hip = int(float(hip_raw))
            mag = float(row["mag"])
            # Słońce ma mag −26,7 i jest obiektem sceny, nie tłem.
            if mag < -5:
                continue
            keep = mag <= MAG_LIMIT or hip in needed_hips
            if not keep:
                continue
            ci_raw = (row.get("ci") or "").strip()
            bv = float(ci_raw) if ci_raw else 0.5
            ra = float(row["ra"])  # godziny
            dec = float(row["dec"])
            x, y, z = equatorial_to_scene(ra, dec)
            by_hip[hip] = {
                "hip": hip,
                "x": x,
                "y": y,
                "z": z,
                "mag": round(mag, 2),
                "bv": round(max(-0.4, min(2.0, bv)), 2),
            }

    stars = sorted(by_hip.values(), key=lambda item: item["mag"])
    index_of = {star["hip"]: i for i, star in enumerate(stars)}

    lines = []
    missing = 0
    for _name, pairs in constellations:
        for a, b in pairs:
            ia, ib = index_of.get(a), index_of.get(b)
            if ia is None or ib is None:
                missing += 1
                continue
            lines.append([ia, ib])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    catalog = {
        "source": "HYG v4.4 (Hipparcos/Yale/Gliese, CC BY-SA 4.0) + Stellarium modern constellation lines",
        "magLimit": MAG_LIMIT,
        "count": len(stars),
        "x": [s["x"] for s in stars],
        "y": [s["y"] for s in stars],
        "z": [s["z"] for s in stars],
        "mag": [s["mag"] for s in stars],
        "bv": [s["bv"] for s in stars],
        "lines": lines,
    }
    out_path = OUT_DIR / "stars.json"
    out_path.write_text(json.dumps(catalog, separators=(",", ":")))
    size_kb = out_path.stat().st_size / 1024
    print(f"stars: {len(stars)}  lines: {len(lines)}  missing: {missing}  file: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
