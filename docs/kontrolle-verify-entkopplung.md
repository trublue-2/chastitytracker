# Kontroll-Verifikation: Speichern entkoppeln & Doppel-Verifikation vermeiden

**Status:** offen / zur späteren Umsetzung
**Erstellt:** 2026-06-24
**Auslöser:** User-Feedback beim Testen der automatischen Code-Prüfung (lokale KI / Ollama, Siegel am KG).

---

## TL;DR

Beim Einreichen einer Kontrolle (PRUEFUNG) blockiert die HTTP-Antwort des Speicherns auf der
KI-Code-Verifikation. Bei langsamem lokalem Vision-Modell (Ollama) läuft der Request auf dem Handy in
einen **Timeout**, obwohl der Eintrag serverseitig längst gespeichert (und am Ende sogar bestätigt)
wurde. Zusätzlich wird **dasselbe Bild mehrfach** durch die KI gejagt (Live-Check + Save-Verify +
manueller Retry), was ein schwaches Modell zusätzlich überlastet.

**Kernidee:** Die serverseitige Code-Verifikation genauso **fire-and-forget** machen wie den bereits
entkoppelten Geräte-Check. Speichern antwortet sofort; `verifikationStatus` füllt sich asynchron nach.

---

## Beobachtete Symptome (vom User)

- Verifikation startet sofort nach Foto-Aufnahme.
- Das Speichern scheint auf das Verifikationsergebnis zu warten.
- Lokale KI war noch mit den ersten 2 Bildkontrollen beschäftigt → auf dem Handy **Timeout beim Speichern**.
- Erneuter Speicherversuch → gleiches Ergebnis (Timeout).
- **Aber:** Eintrag war serverseitig bereits gespeichert und wurde am Ende von der KI bestätigt.
- Code-Erkennung klappt nicht immer (Abbrüche durch Timeouts; Ollama zu schwach/langsam).

### Relevanter Log-Auszug

```
[verify] 05:38:02 route:start codeLen=6
[verify] 05:38:02 verify:vision_call
[verify] 05:38:57 verify:vision_call          ← gleicher File, ~55s später (neuer Request)
[verify] 05:39:56 verify:vision_call          ← und nochmal
[verify] 05:40:02 verify:exception AbortError "This operation was aborted"
[verify] 05:40:40 verify:result isMatch=true  ← einer hat es geschafft
[detect-device] 05:40:57 check:exception AbortError
[verify] 05:41:56 verify:exception AbortError
```

---

## Ursachenanalyse (Code-Stellen)

### 1. Speichern blockiert auf der Verifikation
`src/app/api/entries/route.ts` (POST):
- Der Eintrag wird zuerst in einer **Transaktion committed** (≈ Z. 55–171) → ab da durabel gespeichert.
- **Danach**, vor der HTTP-Antwort, läuft awaited:
  ```ts
  // ~Z. 381
  const status = await verifyKontrolleCode(imageUrl, kontrollCode, safeRotation);
  if (status) { await prisma.entry.update({ ... verifikationStatus: status }); }
  // ~Z. 395
  return NextResponse.json(entry, { status: 201 });
  ```
- Das `await` hängt die Antwort an die volle Vision-Dauer (~55 s bei schwachem Ollama).
- **Inkonsistenz:** Der **Geräte-Check** direkt darüber (≈ Z. 228) ist bewusst fire-and-forget
  (`(async () => { … })()`, „blockiert die Antwort NICHT") — die Code-Verifikation aber nicht.

### 2. Dasselbe Bild wird mehrfach verifiziert (3 Quellen)
- **Live-Check (Client):** `src/app/entries/PruefungFormCore.tsx` (useEffect ≈ Z. 93–123) feuert bei
  jeder Änderung von `code | imageUrl | rotation` ein `POST /api/verify-kontrolle` und **bricht den
  laufenden ab** (`controller.abort()`, ≈ Z. 119) → startet neu. Quelle der `AbortError`-Stürme.
- **Save-Verify (Server):** `POST /api/entries` ruft `verifyKontrolleCode` **nochmal** auf (Z. 381).
- **Manueller Retry:** weiterer `POST /api/entries` → weiterer Vision-Call.

→ Auf dem schwachen Ollama stauen sich die Calls **seriell** (je ~55 s).
Hinweis: `verifyKontrolleCodeDetailed` ruft das Modell **pro Request nur 1×** auf (kein interner Retry)
— die vielen `vision_call` kommen also wirklich von mehreren unabhängigen Requests.

### 3. Timeout-Struktur
- Server-Vision-Timeout: `LOCAL_VISION_TIMEOUT_MS`, Default **120 s** (`src/lib/vision/local.ts` ≈ Z. 38).
- Die `AbortError "This operation was aborted"` stammen v. a. vom **Client**, der den Live-Check
  abbricht (Effect-Cleanup) → der serverseitige Ollama-Fetch wird mitgerissen. ~55-s-Abstände passen
  dazu, nicht zum 120-s-Limit.
- **Kein `maxDuration`** auf den API-Routen → auf dem self-hosted Node-Server läuft der Request bis zum
  Vision-Timeout durch, auch wenn der Client schon aufgegeben hat → „Server fertig, Client Timeout".

### 4. Möglicher Folgebug (Hypothese, NICHT verifiziert)
Der Retry erzeugt vermutlich einen **zweiten PRUEFUNG-Eintrag** — keine Idempotenz. Die Anforderungs-
Verknüpfung (`entryId: null`-Filter, ≈ Z. 113) greift nur beim ersten; der zweite Eintrag bliebe „lose".
→ An echten Daten gegenprüfen.

---

## Geplante Maßnahmen (priorisiert)

### M1 — Save vom Verify entkoppeln (Kern-Fix) · hoch
`verifyKontrolleCode` in `POST /api/entries` genauso fire-and-forget ausführen wie den Geräte-Check.
- Eintrag wird committed → Route antwortet **sofort** (201) mit `verifikationStatus: null`.
- Verifikation läuft danach asynchron, setzt `verifikationStatus` per `entry.update` nach.
- Frontend zeigt das Ergebnis über den bestehenden Heartbeat/Reload bzw. den Live-Check-Badge.
- **Abnahme:** Speichern antwortet < 2 s auch bei langsamem/abwesendem Ollama; `verifikationStatus`
  erscheint verzögert; kein Handy-Timeout mehr.

### M2 — Doppel-Verifikation reduzieren · mittel
- Server-Verify **nur 1×** und entkoppelt (folgt aus M1).
- **Constraint:** Server-Verify bewusst „never trusted from client" (Anti-Cheat) — das Client-Live-
  Ergebnis darf den Server-Verify **nicht ersetzen**. Also: Live-Check bleibt reines UI-Feedback,
  der maßgebliche Status kommt weiterhin vom Server.
- **Abnahme:** pro eingereichter Kontrolle genau **ein** server-seitiger Vision-Call (plus optional
  Live-Checks, die UI-only sind).

### M3 — Live-Check entprellen · mittel
Den Client-Live-Check entprellen (debounce) und nicht bei jedem Tastendruck/Re-Render neu starten,
um den Abbruch-Sturm (`AbortError`) und unnötige Ollama-Last zu vermeiden.
- **Abnahme:** beim Tippen des Codes maximal 1 Live-Call nach kurzer Ruhephase, kein Sturm von
  `verify:vision_call` + `AbortError` auf demselben Bild.

### M4 — Retry-Idempotenz · mittel (abhängig von Befund #4)
Doppelte PRUEFUNG-Einträge beim Retry verhindern (z. B. Idempotenz-Key / „ein offener Code → ein
Eintrag"). Erst Befund #4 an Daten bestätigen.
- **Abnahme:** mehrfaches Absenden derselben Kontrolle erzeugt höchstens einen Eintrag.

### M5 — Ollama-Leistung · niedrig (Mitigation, nicht Ursache)
Stärkeres/schnelleres lokales Modell bzw. Hardware. Verbessert die Latenz, behebt aber nicht die
Kopplung — nachrangig zu M1.

---

## Risiken & Constraints

- **Anti-Cheat:** Der serverseitige Verify ist die Vertrauensquelle. M1/M2 dürfen nicht dazu führen,
  dass ein Client-Ergebnis ungeprüft als `verifikationStatus` übernommen wird.
- **Fire-and-forget auf Node-Server:** Async-Arbeit nach der Response muss zuverlässig durchlaufen
  (kein Serverless-Freeze hier, aber bei Container-Restart kann ein laufender Verify verloren gehen →
  Eintrag bleibt `verifikationStatus: null`, Keyholder kann manuell verifizieren — akzeptabel, wie
  schon im bestehenden Kommentar vermerkt).
- **Reihenfolge beibehalten:** Geräte-Check ist bereits entkoppelt; M1 macht Code-Verify konsistent dazu.

## Verifikation (nach Umsetzung)
1. Langsames/abwesendes Ollama simulieren → Speichern bleibt schnell, kein Timeout.
2. Genau ein server-seitiger Vision-Call pro Einreichung (Log: `route:start` / `verify:result`).
3. `verifikationStatus` erscheint asynchron in Sub- und Admin-Ansicht.
4. Mehrfaches Absenden → kein Duplikat (nach M4).
5. `/simplify` + tsc + Tests + Build grün.

## Verwandte Dateien
- `src/app/api/entries/route.ts` (POST — Save + Verify-Kopplung)
- `src/lib/verifyCode.ts` (`verifyKontrolleCode`, `verifyKontrolleCodeDetailed`)
- `src/app/entries/PruefungFormCore.tsx` (Client Live-Check)
- `src/app/api/verify-kontrolle/route.ts` (Live-Check-Route)
- `src/lib/vision/local.ts` (`LOCAL_VISION_TIMEOUT_MS`)
- `src/lib/detectDevice.ts` / Geräte-Check (Referenz für entkoppeltes Muster)
- [`docs/local-vision.md`](local-vision.md) (lokale Vision-Provider-Doku)
