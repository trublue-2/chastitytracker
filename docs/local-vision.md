# Lokale Bildverifikation (Alternative zur Anthropic-API)

Die App wertet Fotos an mehreren Stellen aus:

- **Kontroll-Code lesen + matchen** (`verifyKontrolleCodeDetailed`, oft handschriftlich) — VLM
- **Siegelnummer lesen** (`detectSealNumber`, 5–8-stellig) — lokales OCR (Tesseract), VLM-Fallback
- **Geräte-Erkennung beim Verschluss** (`detectDevice` / `detectDeviceByEmbedding`) — CLIP-Embedding
  bevorzugt (schnell), VLM-Fallback
- **Kontroll-Geräte-Check** (`checkDeviceInPhoto`) — ist das verschlossene Gerät im Kontroll-Foto? — VLM

Standardmäßig läuft das VLM über die **Anthropic-API**. Alternativ kann ein **lokales Modell**
verwendet werden — z.B. aus Datenschutzgründen (intime Fotos verlassen die eigene
Infrastruktur nicht) oder um Anthropic-Policy-Blocks zu vermeiden.

Umgeschaltet wird per Env-Variable `VERIFY_PROVIDER` — **kein Code-Deploy nötig**. Die schnelle
Embedding-Geräte-Erkennung ist separat über `EMBED_BASE_URL` zuschaltbar (siehe TEIL C).

## Architektur

Eine **lokale KI-Box** (Mac, Apple Silicon/Metal) bedient beide Tracker-Instanzen über Tailscale.
Zwei unabhängige Dienste:

```
                                     ┌─ Ollama  (Port 11434)  qwen2.5-vl  → VLM: Code/Siegel/Geräte-Check
[Tracker-Container]  ──Tailscale──→  │
   VERIFY_PROVIDER=local             └─ CLIP    (Port 11435)  clip-ViT-L-14 → Embeddings: Geräte-Erkennung
   LOCAL_VISION_BASE_URL=…:11434/v1
   EMBED_BASE_URL=…:11435
```

Beide sind optional und voneinander unabhängig: nur Ollama → VLM für alles; zusätzlich CLIP →
schnelle Geräte-Erkennung; keiner von beiden → Anthropic (sofern `ANTHROPIC_API_KEY` gesetzt).

Der Provider-Code liegt in `src/lib/vision/`:
`index.ts` (Dispatch), `anthropic.ts`, `local.ts` (OpenAI-kompatibel), `types.ts`.
Die drei Funktionen rufen `visionComplete()` auf — der Provider ist dahinter austauschbar.

> **Wichtig:** Im lokalen Modus gibt es **keinen automatischen Anthropic-Fallback**.
> Ist der Mac aus/nicht erreichbar, meldet der Tracker „nicht verifiziert" (manuelle
> Prüfung) — es werden keine Fotos ungewollt an Anthropic geschickt.
>
> **Kein Fehler bei Ausfall:** Jeder Pfad fängt einen nicht erreichbaren Dienst ab und liefert
> „nichts erkannt", nie eine Ablehnung oder einen Abbruch. Konkret: Geräte-Vorschlag → kein
> Vorschlag (manuelle Wahl); Embedding aus → VLM-Fallback → sonst kein Vorschlag; Kontroll-
> Geräte-Check läuft non-blocking nach dem Speichern (die Prüfung wird **immer** erstellt);
> Code-Verifikation bleibt schlicht „nicht verifiziert" (Admin kann manuell prüfen) — eine
> Kontrolle wird bei Netzwerkfehler **nie fälschlich abgelehnt**.

---

## TEIL A — Einrichtung am Mac (Mac Studio M1, einmalig ~15 Min)

Ollama läuft als unauffälliger Menüleisten-Dienst und entlädt das Modell nach 5 Min
Inaktivität automatisch aus dem RAM.

1. **Ollama installieren:** <https://ollama.com> → macOS-Download (.dmg) → in „Programme"
   ziehen → starten. (Alternativ: `brew install --cask ollama`.)
2. **Modell laden** (Terminal):
   ```bash
   ollama pull qwen2.5-vl:7b
   # kurz testen:
   ollama run qwen2.5-vl:7b   # etwas fragen, dann /bye
   ```
3. **Im Netzwerk erreichbar machen** (sonst nur localhost):
   - Ollama-App → Einstellungen → „Allow connections from the network" aktivieren, **oder**
   - Terminal:
     ```bash
     launchctl setenv OLLAMA_HOST "0.0.0.0"
     # danach Ollama beenden und neu starten
     ```
4. **Tailscale installieren:** App Store → „Tailscale" → öffnen → mit Account anmelden
   (gleicher Account wie am Server). Der Mac bekommt einen festen Namen, z.B.
   `mac-studio.<tailnet>.ts.net`.
5. **Ruhezustand verhindern:** Systemeinstellungen → Energie → „Automatisches Ruhezustand
   verhindern" aktivieren (Display darf schlafen). Sonst antwortet der Dienst nur, wenn der
   Mac wach ist.

**Sicherheit:** Keinen Port am Router freigeben — Ollama hat keine Authentifizierung und
darf nie offen im Internet stehen. Erreichbar ist es nur über Tailscale; optional per
Tailscale-ACL nur den Server-Host auf Port 11434 zulassen.

## TEIL B — Einrichtung am Server

1. **Tailscale** installieren, gleicher Account → der Mac ist als `<mac-name>` erreichbar.
2. **Env-Variablen** pro Tracker-Instanz (`.env`):
   ```bash
   VERIFY_PROVIDER=local
   LOCAL_VISION_BASE_URL=http://<mac-tailscale-name>:11434/v1
   LOCAL_VISION_MODEL=qwen2.5-vl:7b
   ```

### Alle Env-Variablen

| Variable | Default | Zweck |
|----------|---------|-------|
| `VERIFY_PROVIDER` | `anthropic` | `anthropic` oder `local` |
| `LOCAL_VISION_BASE_URL` | – | OpenAI-kompatible Basis-URL (z.B. `http://mac:11434/v1`) |
| `LOCAL_VISION_MODEL` | `qwen2.5-vl:7b` | Standard-Modell für alle drei Tasks |
| `LOCAL_VISION_MODEL_CODE` | – | Override nur Code-Verifikation |
| `LOCAL_VISION_MODEL_SEAL` | – | Override nur Siegel-Erkennung |
| `LOCAL_VISION_MODEL_DEVICE` | – | Override nur Geräte-Erkennung |
| `LOCAL_VISION_TIMEOUT_MS` | `120000` | Timeout pro Anfrage |
| `LOCAL_VISION_API_KEY` | `local` | Bearer-Token (Ollama ignoriert ihn) |
| `EMBED_BASE_URL` | – | CLIP-Embedding-Dienst (z.B. `http://mac:11435`); aktiviert die schnelle Geräte-Erkennung |
| `EMBED_MODEL` | `clip-ViT-L-14` | CLIP-Modell (muss zum laufenden Dienst passen) |
| `EMBED_TIMEOUT_MS` | `30000` | Timeout pro Embedding-Anfrage |
| `EMBED_MIN_MARGIN` | `0.01` | Mindest-Abstand bestes↔zweitbestes Gerät, sonst kein Vorschlag |

`VERIFY_PROVIDER`/`LOCAL_VISION_*` und `EMBED_*` sind unabhängig. Für die schnelle Geräte-
Erkennung genügt `EMBED_BASE_URL` (+ kuratierte Referenzfotos je Gerät, im Dashboard pflegbar).

---

## TEIL C — CLIP-Embedding-Dienst (schnelle Geräte-Erkennung)

Statt das VLM bei jeder Erkennung alle Referenzfotos durchrechnen zu lassen (~Sekunden/Bild),
wird jedes Foto **einmal** zu einem CLIP-Vektor; ein neues Foto wird per Cosine-Ähnlichkeit dem
nächstgelegenen Gerät zugeordnet (**Millisekunden**). Validiert: 100 % Trefferquote an echten
Geräten mit `clip-ViT-L-14`.

Der Dienst liegt im Repo unter [`clip-embed-service/`](../clip-embed-service/) und läuft auf
derselben Mac-Box wie Ollama.

1. **Einrichten** (am Mac):
   ```bash
   cd clip-embed-service
   python3 -m venv venv
   ./venv/bin/pip install -r requirements.txt
   CLIP_MODEL=clip-ViT-L-14 ./venv/bin/uvicorn app:app --host 0.0.0.0 --port 11435
   curl http://localhost:11435/health     # {"ok":true,"model":"clip-ViT-L-14"}
   ```
2. **Dauerhaft laufen lassen** (launchd): `ch.example.clip-embed.plist` nach
   `~/Library/LaunchAgents/` kopieren, Pfade anpassen, `launchctl load …`. (`RunAtLoad` +
   `KeepAlive` = Auto-Start + Neustart bei Absturz, überlebt Reboot.)
3. **Tailscale**: derselbe Account wie Server/Ollama — der Mac ist als `<mac-name>:11435`
   erreichbar. Keinen Router-Port öffnen.
4. **Tracker anbinden** (`.env` pro Instanz):
   ```bash
   EMBED_BASE_URL=http://<mac-tailscale-name>:11435
   EMBED_MODEL=clip-ViT-L-14
   ```
5. **Referenzfotos pflegen**: im Dashboard je Gerät klare Beispielfotos hinterlegen (oder aus
   vergangenen Verschluss-Fotos importieren). Embeddings werden beim ersten Einsatz berechnet und
   in `DeviceReferenceImage.embedding` gecacht. Ohne Referenzen → kein Embedding-Vorschlag (VLM-
   Fallback greift).

**Neue Geräte vorab prüfen** (optional, empfohlen vor dem Verlassen auf Embeddings): Fotos je
Gerät unter `clip-embed-service/photos/<geraet>/` ablegen und die Trennschärfe messen:
```bash
CLIP_MODEL=clip-ViT-L-14 ./venv/bin/python separation_test.py photos
```
Trefferquote ~100 % und Zentroid-Ähnlichkeiten < ~0.9 → die Geräte sind sauber trennbar. Sonst
stärkeres Modell testen (z.B. `clip-ViT-L-14` statt `clip-ViT-B-32`).

---

## Qualität prüfen (Benchmark) — vor dem Produktiv-Umschalten

Vergleicht lokales Modell vs. Anthropic auf denselben Bildern.

1. Testbilder liegen in `data/uploads/`.
2. Manifest anlegen: `scripts/bench-vision.manifest.example.json` → nach
   `scripts/bench-vision.manifest.json` kopieren, echte Dateinamen + Soll-Werte eintragen.
3. Mit beiden Providern verfügbar laufen lassen (`ANTHROPIC_API_KEY` + `LOCAL_VISION_BASE_URL`
   in `.env.local`):
   ```bash
   npx tsx scripts/bench-vision.ts
   ```
4. Ausgabe zeigt pro Bild: `detected(match/latenz)` für anthropic & local + Übereinstimmung.

Reicht `qwen2.5-vl:7b` bei Handschrift nicht, auf ein größeres Modell wechseln (nur Env):
```bash
ollama pull qwen2.5-vl:32b   # am Mac
LOCAL_VISION_MODEL=qwen2.5-vl:32b
```

## Modellwahl

- **`qwen2.5-vl:7b`** (Default) — stark bei Ziffern/Handschrift, läuft flüssig auf M1 Max 32 GB.
- **`qwen2.5-vl:32b`** — näher an Anthropic, ~22 GB (4-bit), auf 32 GB knapp aber machbar.
