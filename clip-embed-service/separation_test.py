"""
Trennschärfe-Test: Können die Bild-Embeddings die Geräte auseinanderhalten?
Erwartet eine Ordnerstruktur:  <root>/<geraet-name>/*.{jpg,jpeg,png,webp}

Ausgabe: Cosine-Ähnlichkeit zwischen den Geräte-Zentroiden + Nearest-Centroid-Trefferquote.
Faustregel: Zentroid-Ähnlichkeit zweier verschiedener Geräte < ~0.9 und Trefferquote ~100%
=> CLIP trennt sie sauber, Embedding-Ansatz lohnt. Sonst stärkeres Modell (CLIP_MODEL) testen.

Aufruf:  CLIP_MODEL=clip-ViT-L-14 ./venv/bin/python separation_test.py photos
"""
import sys, os, glob
import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer

model_name = os.environ.get("CLIP_MODEL", "clip-ViT-B-32")
root = sys.argv[1] if len(sys.argv) > 1 else "photos"

m = SentenceTransformer(model_name)

devices = {}
for d in sorted(os.listdir(root)):
    p = os.path.join(root, d)
    if not os.path.isdir(p):
        continue
    files = []
    for ext in ("jpg", "jpeg", "png", "webp", "JPG", "PNG"):
        files += glob.glob(os.path.join(p, f"*.{ext}"))
    if files:
        devices[d] = sorted(set(files))

if len(devices) < 2:
    print(f"Brauche >=2 Geräte-Unterordner in '{root}'. Gefunden: {list(devices)}")
    sys.exit(1)

embs = {d: m.encode([Image.open(f).convert("RGB") for f in files],
                    normalize_embeddings=True, convert_to_numpy=True)
        for d, files in devices.items()}
cents = {d: v.mean(axis=0) / (np.linalg.norm(v.mean(axis=0)) + 1e-9) for d, v in embs.items()}

names = list(devices.keys())
print(f"\nModell: {model_name}")
print("Geräte:", {d: len(f) for d, f in devices.items()})
print("\nCosine-Ähnlichkeit zwischen Geräte-Zentroiden (1.0 = identisch, niedriger = besser trennbar):")
print("        " + " ".join(f"{n[:9]:>9}" for n in names))
for a in names:
    print(f"{a[:7]:>7}  " + " ".join(f"{float(cents[a] @ cents[b]):9.3f}" for b in names))

# Nearest-Centroid-Trefferquote (jedes Bild gegen alle Zentroiden)
correct, total, errors = 0, 0, []
for d, V in embs.items():
    for v in V:
        sims = {dd: float(v @ cents[dd]) for dd in names}
        pred = max(sims, key=sims.get)
        total += 1
        if pred == d:
            correct += 1
        else:
            errors.append((d, pred, round(sims[pred], 3), round(sims[d], 3)))
print(f"\nNearest-Centroid-Trefferquote: {correct}/{total} = {100*correct/total:.0f}%")
if errors:
    print("Fehler (soll -> erkannt | sim_erkannt | sim_soll):")
    for e in errors:
        print("  ", e)
else:
    print("Keine Verwechslungen ✓")
