"""
Bild-Embedding-Service (CLIP/SigLIP) für die Geräte-Erkennung des Chastity-Trackers.
Nimmt base64-Bilder, gibt L2-normalisierte Vektoren zurück. Die Geräte-Zuordnung passiert
in der App per Cosine-Ähnlichkeit (Nächster-Nachbar gegen kuratierte Referenz-Embeddings).

Start:  ./venv/bin/uvicorn app:app --host 0.0.0.0 --port 11435
Env:    CLIP_MODEL (Default clip-ViT-B-32; clip-ViT-L-14 = mehr Trennschärfe, empfohlen)
"""
import os
import io
import base64
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("CLIP_MODEL", "clip-ViT-B-32")
print(f"[embed] lade Modell: {MODEL_NAME} …")
model = SentenceTransformer(MODEL_NAME)
print("[embed] bereit.")

app = FastAPI()


class EmbedReq(BaseModel):
    images: list[str]  # base64 (roh oder data:-URI)


def _decode(s: str) -> Image.Image:
    if s.strip().startswith("data:") and "," in s:
        s = s.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(s))).convert("RGB")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/embed")
def embed(req: EmbedReq):
    imgs = [_decode(s) for s in req.images]
    vecs = model.encode(imgs, normalize_embeddings=True, convert_to_numpy=True)
    return {"model": MODEL_NAME, "dim": int(vecs.shape[1]), "embeddings": [v.tolist() for v in vecs]}
