# Lokale Bildverifikation (Alternative zur Anthropic-API)

Die App wertet Fotos an drei Stellen mit einem Vision-Modell aus:

- **Kontroll-Code lesen + matchen** (`verifyKontrolleCodeDetailed`, oft handschriftlich)
- **Siegelnummer lesen** (`detectSealNumber`, 5–8-stellig)
- **Geräte-Erkennung** (`detectDevice`, Foto gegen Referenzbilder)

Standardmäßig läuft das über die **Anthropic-API**. Alternativ kann ein **lokales Modell**
verwendet werden — z.B. aus Datenschutzgründen (intime Fotos verlassen die eigene
Infrastruktur nicht) oder um Anthropic-Policy-Blocks zu vermeiden.

Umgeschaltet wird per Env-Variable `VERIFY_PROVIDER` — **kein Code-Deploy nötig**.

## Architektur

```
[Tracker-Container am Server]  --HTTP über Tailscale (E2E-verschlüsselt)-->  [Mac Studio: Ollama]
   VERIFY_PROVIDER=local                                                       qwen2.5-vl:7b
   LOCAL_VISION_BASE_URL=http://<mac>:11434/v1
```

Der Provider-Code liegt in `src/lib/vision/`:
`index.ts` (Dispatch), `anthropic.ts`, `local.ts` (OpenAI-kompatibel), `types.ts`.
Die drei Funktionen rufen `visionComplete()` auf — der Provider ist dahinter austauschbar.

> **Wichtig:** Im lokalen Modus gibt es **keinen automatischen Anthropic-Fallback**.
> Ist der Mac aus/nicht erreichbar, meldet der Tracker „nicht verifiziert" (manuelle
> Prüfung) — es werden keine Fotos ungewollt an Anthropic geschickt.

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
