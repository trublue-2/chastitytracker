# CLIP-Embedding-Dienst (schnelle Geräte-Erkennung)

Kleiner FastAPI-Dienst, der Bilder mit einem CLIP-Modell zu L2-normalisierten Vektoren
einbettet. Der Tracker ordnet ein neues Foto dann per Cosine-Ähnlichkeit dem nächstgelegenen
Gerät zu (Nächster-Nachbar gegen kuratierte Referenz-Embeddings) — **Millisekunden statt
sekundenlanger VLM-Inferenz**, und genauer.

Läuft nativ auf der lokalen KI-Box (Mac, Metal/MPS), **nicht** im Tracker-Container. Optional —
ohne ihn fällt der Tracker auf die VLM-Geräte-Erkennung zurück (siehe `docs/local-vision.md`).

## Einrichtung (Mac, einmalig)

```bash
cd clip-embed-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# starten (ViT-L-14 = beste Trennschärfe; lädt das Modell beim ersten Start herunter)
CLIP_MODEL=clip-ViT-L-14 ./venv/bin/uvicorn app:app --host 0.0.0.0 --port 11435
```

Testen:

```bash
curl http://localhost:11435/health      # {"ok":true,"model":"clip-ViT-L-14"}
```

## Dauerhaft laufen lassen (launchd)

```bash
cp ch.example.clip-embed.plist ~/Library/LaunchAgents/
# Pfade (CHANGE_ME) auf das echte Home anpassen, dann:
launchctl load ~/Library/LaunchAgents/ch.example.clip-embed.plist
```

`RunAtLoad` + `KeepAlive` = Auto-Start beim Login und Neustart bei Absturz.

## Neue Geräte vorab prüfen (optional)

Bevor man sich auf die Embeddings verlässt, kurz die Trennschärfe an echten Fotos messen:
Fotos je Gerät unter `photos/<geraet-name>/*.jpg` ablegen, dann

```bash
CLIP_MODEL=clip-ViT-L-14 ./venv/bin/python separation_test.py photos
```

Trefferquote ~100 % und Zentroid-Ähnlichkeiten < ~0.9 → CLIP trennt die Geräte sauber.

## Anbindung im Tracker

| Env (pro Instanz) | Beispiel |
|-------------------|----------|
| `EMBED_BASE_URL`  | `http://<mac-tailscale-name>:11435` |
| `EMBED_MODEL`     | `clip-ViT-L-14` |

Details + Fallback-Verhalten: [`docs/local-vision.md`](../docs/local-vision.md).
