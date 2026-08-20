# Konto, Zugang & Darstellung

## Zweck

Wer sich anmelden darf, wer wen steuern darf, und wie die App für den Einzelnen aussieht.

## Die vier Selbst-Felder

`timezone`, `locale`, `startPage`, `hideOwnTracker` — die einzigen Felder, die der Sub an seinem
eigenen Konto ändern darf. Das ist keine Konvention, sondern **compilerseitig erzwungen**: es gibt
eine Whitelist, gegen die die Selbst-Änderungs-Route typisiert ist. Ein Versuch, darüber ein
Admin-Feld zu schreiben, kompiliert nicht.

Das Register ist an dieselbe Whitelist gebunden — die Spalte „Schreibt" kann für diese Felder nicht
still veralten.

**`timezone` ist mehr als Darstellung**: sie bestimmt, wann Reinigungsfenster und Schlaf-Fenster
greifen und wann der Kalendertag des Reinigungskontingents umschlägt. Siehe die offene Frage in
[90-kollisionen.md](90-kollisionen.md).

## Rolle und Beziehung

`role` (`user` / `admin`) entscheidet über die Admin-Oberfläche und den MCP-Zugang. Sie hat **zwei
Schreibwege**: die Tracker-Route und — am Tracker vorbei — das Portal per direktem SQL. Fehlt beim
Container-Start ein Admin, stellt ihn das Startskript wieder her.

Die **Zuordnung** Keyholder ↔ Sub ist die eigentliche Berechtigung: ohne Zeile sieht ein Admin diesen
Sub nicht. Sie ist die Grundlage jeder Keyholder-Sicht — Dashboard, Posteingang, Direktiven —, und
ein Admin-Konto ohne Zuordnung bekommt überall leere Listen, nicht etwa alle Subs.

## Anmelden

Passwort (bcrypt) oder Passkey. Dazu ein Rücksetz-Token mit einer Stunde Gültigkeit und ein
Portal-Login per Einmal-Token, dessen Kennung nach der Einlösung festgehalten wird — der
Wiedereinspielungs-Schutz.

Die Anmeldung ist zusätzlich IP-basiert begrenzt (10 Versuche / 15 Minuten). Die Client-IP wird dabei
vom **Ende** der Weiterleitungskette gelesen; der erste Eintrag wäre fälschbar und machte die Grenze
wirkungslos.

## Passwort ändern: bewusst ohne altes Passwort

Weder beim Sub, noch beim Admin für einen Sub, noch beim Admin für sich selbst. Die Sitzung ist
bereits der Authentifizierungsnachweis; eine zweite Abfrage ist für diese App bewusst nicht gewollt.
Einzige Ausnahme ist der Token-Weg, der ja gerade keine Sitzung hat.

Die Kehrseite ist protokolliert statt verhindert: wird das Passwort eines **Admin**-Kontos geändert,
während eine Sperrzeit läuft, entsteht ein Vergehen — mit dem Weg dahinter (`reset_token` ist der
interessante Fall). Es verhindert nichts, es macht sichtbar.

## Fremdanwendungen

OAuth mit PKCE für den MCP-Zugang: Client, Einmal-Code, Zugriffs- und Erneuerungstoken. Die Token
selbst werden **nie** gespeichert, nur ihre Hashes.

## Wirkt auf

Zugang, Sichtbarkeit, Sprache aller Anschreiben — und über `timezone` auf Reinigung und
Auto-Kontrollen.

## Code

`auth.ts`, `authGuards.ts`, `userSelfField.ts`, `keyholder.ts`, `proxy.ts`, `webauthn.ts`,
`oauth.ts`, `rate-limit.ts`, `login-attempts.ts`, `passwordAudit.ts`.

## Tests

`passwordAudit.test.ts`, `ownTracker.test.ts`, `keyholder.test.ts`, `seedMirror.test.ts`.
