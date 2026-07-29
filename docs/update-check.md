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
Deployments es gibt oder auf welcher Version sie laufen. Diese Zählung schließt genau diese Lücke,
ohne etwas über die Instanz oder ihre Nutzer preiszugeben.

## Was gesendet wird

| Feld | Inhalt |
|------|--------|
| `X-Instance-Version` | die laufende App-Version (z. B. `4.50.48`) |
| `X-Instance-Id` | die **ersten 16 Zeichen eines SHA-256 des eigenen `NEXTAUTH_SECRET`** — stabil pro Instanz, **nicht umkehrbar, nicht identifizierend** (dient nur zum Entdoppeln verschiedener Instanzen) |

Die Client-IP sieht der Collector wie bei jeder HTTP-Anfrage; er speichert sie **nicht im Klartext**,
sondern nur als tages-gesalzenen Hash (Missbrauchs-Korrelation). **Nicht** gesendet oder gespeichert
werden: Subdomain/Hostname, Nutzernamen, E-Mails oder irgendwelche Eintrags-/Nutzerdaten.

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
