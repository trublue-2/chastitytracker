# Update-Check & anonyme Deployment-Zählung (Census)

Die App prüft, ob eine neuere Version verfügbar ist, indem sie serverseitig das öffentliche
`changelog.json` lädt (angezeigt als Update-Hinweis in der Kopfzeile). Standardmäßig läuft diese
Anfrage über den Projekt-Collector `https://update.chastitytracker.ch/api/changelog`, der dieselbe
Changelog-Liste zurückgibt **und** die Anfrage anonym mitzählt.

## Welcher Changelog gilt

Gelesen wird der Changelog am Git-Tag **`release`**, nicht der von `main`. `release` wandert nur,
wenn ein Image als `:latest` freigegeben wird (`promote.yml`) — der Update-Hinweis kündigt damit
nie eine Version an, für die es noch kein Image gibt. Konsequenz: Instanzen auf den internen
Kanälen `:portal` und `:feature` laufen dem Release voraus und sehen deshalb keinen Hinweis (beide
Anzeigen filtern strikt auf höhere Versionen). Nach einem Promote dauert es bis zu eine Stunde, bis
der Hinweis erscheint — Caches: 5 min GitHub-CDN, 1 h im Collector, 1 h pro Instanz.

Der Sinn: Self-gehostete Instanzen laufen bewusst privat — der Betreuer sieht sonst nicht, wie viele
Deployments es gibt, auf welcher Version sie laufen, ob sie überhaupt benutzt werden und welche
Funktionen dort zum Einsatz kommen. Diese Zählung schließt genau diese Lücke. Seit 6.4.4 (Issue #15)
gehören dazu auch Zählwerte zur Nutzung — exakt, aber ohne Namen, Adressen oder Inhalte.

## Was gesendet wird

| Feld | Inhalt |
|------|--------|
| `X-Instance-Version` | die laufende App-Version (z. B. `4.50.48`) |
| `X-Instance-Id` | die **ersten 16 Zeichen eines SHA-256 des eigenen `NEXTAUTH_SECRET`** — stabil pro Instanz, nicht direkt umkehrbar (dient nur zum Entdoppeln verschiedener Instanzen). Sie geht ausschliesslich an den Collector und das Feedback-Postfach, **nie** in eine öffentliche URL: bei einem schwachen Secret liesse sie sich offline durchprobieren |
| `X-Instance-Stats` | kompaktes JSON, siehe unten (seit 6.4.4) |

Inhalt von `X-Instance-Stats` (`src/lib/upstream/census.ts`, Feld `v` = Schema-Version):

| Feld | Inhalt |
|------|--------|
| `publicId` | die **öffentliche Instanz-Kennung**: 16 zufällige Hex-Zeichen, beim ersten Bedarf erzeugt und in der Datenbank gespeichert (`AppMeta.censusPublicId`), ohne Bezug zum Secret. Sie steht unter Einstellungen → App und im vorausgefüllten GitHub-Issue und verbindet ein Issue mit seiner Census-Zeile |
| `portal` | läuft die Instanz über das Portal oder selbst gehostet |
| `image` | Herkunft des Images: `official` (gebaut vom Workflow in `trublue-2/chastitytracker`), `fork` samt Repo-Name (gebaut vom Workflow eines anderen GitHub-Repos — der Name ist dort ohnehin öffentlich), oder `custom` (selbst gebaut / aus dem Quellcode gestartet). Dazu der Commit, wenn bekannt. Ein Hinweis, kein Nachweis |
| `arch` | Prozessor-Architektur (`x64`, `arm64`) |
| `users`, `wearers`, `active7d`, `lockedNow`, `keyholders` | Anzahl Konten; davon mit mindestens einem Eintrag; mit neuem Eintrag in den letzten 7 Tagen; gerade verschlossen; als Keyholder zugeordnet |
| `wearHours` | gesammelte KG-Tragestunden aller Konten (gerundet) |
| `locales` | Konten je Sprache |
| `features` | gekoppelte Boxen je Art, Foto-Prüfung (`off` / `local` / `external`), MCP, Bildersafe, Telegram (je an/aus), Konten mit Gewichtstracking |

Die Client-IP sieht der Collector wie bei jeder HTTP-Anfrage; er speichert sie **nicht im Klartext**,
sondern nur als tages-gesalzenen Hash (Missbrauchs-Korrelation). **Nicht** gesendet oder gespeichert
werden: Subdomain/Hostname, Nutzernamen, E-Mails, Einträge, Fotos oder Texte. Auf einer kleinen
Instanz lassen sich die Zählwerte über die Zeit wiedererkennen — wer das nicht will, schaltet den
Census ab (unten).

Das In-App-Feedback schickt seit 6.4.4 die Census-ID und die Image-Herkunft an das Feedback-Postfach,
damit sich eine Rückmeldung der Nutzung ihrer Instanz zuordnen lässt. Das vorausgefüllte
GitHub-Formular (`.github/ISSUE_TEMPLATE/report.yml`) trägt stattdessen die öffentliche Kennung und die
Herkunft, beides Felder, die man leeren kann. Ist der Census abgeschaltet, fehlen beide Kennungen.

Die Anfrage feuert höchstens **einmal pro Stunde pro Instanz** (serverseitiger Cache) und nur, wenn
die App tatsächlich benutzt wird. Ist die Quelle nicht erreichbar, wird der Fehlversuch fünf Minuten
gemerkt — ein Ausfall führt also zu höchstens einem Versuch pro fünf Minuten, nicht zu einem pro
Seitenaufruf. Gezählt wird dabei nichts: eine fehlgeschlagene Anfrage erreicht den Collector nicht.

## Abschalten (Opt-out)

Der Census ist standardmäßig **an**. Zwei Wege, ihn abzuschalten — der Update-Check funktioniert
weiter:

```bash
# 1. Census aus, Update-Check direkt vom Release-Tag auf GitHub laden:
DISABLE_UPDATE_CENSUS=true

# 2. Oder eine beliebige eigene Changelog-Quelle setzen (dann werden nie Census-Header gesendet):
UPSTREAM_CHANGELOG_URL=https://raw.githubusercontent.com/trublue-2/chastitytracker/refs/tags/release/src/data/changelog.json
```

Wer stattdessen `…/refs/heads/main/…` setzt, bekommt Hinweise auf noch nicht freigegebene
Versionen — sinnvoll nur, wenn man ohnehin selbst aus `main` baut.

Fällt der Collector aus, liest die App den Release-Tag direkt auf GitHub — der Update-Hinweis bricht nie.
Ist auch das nicht erreichbar, merkt sich die Instanz den Fehlversuch für fünf Minuten, statt bei
jedem Seitenaufruf erneut in zwei Timeouts zu laufen.
