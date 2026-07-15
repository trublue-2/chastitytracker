# Update-Check & anonyme Deployment-Zählung (Census)

Die App prüft, ob eine neuere Version verfügbar ist, indem sie serverseitig das öffentliche
`changelog.json` lädt (angezeigt als Update-Hinweis in der Kopfzeile). Standardmäßig läuft diese
Anfrage über den Projekt-Collector `https://update.chastitytracker.ch/api/changelog`, der dieselbe
Changelog-Liste zurückgibt **und** die Anfrage anonym mitzählt.

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
die App tatsächlich benutzt wird.

## Abschalten (Opt-out)

Der Census ist standardmäßig **an**. Zwei Wege, ihn abzuschalten — der Update-Check funktioniert
weiter:

```bash
# 1. Census aus, Update-Check direkt von GitHub laden:
DISABLE_UPDATE_CENSUS=true

# 2. Oder eine beliebige eigene Changelog-Quelle setzen (dann werden nie Census-Header gesendet):
UPSTREAM_CHANGELOG_URL=https://raw.githubusercontent.com/trublue-2/chastitytracker/main/src/data/changelog.json
```

Fällt der Collector aus, greift die App automatisch auf GitHub zurück — der Update-Hinweis bricht nie.
