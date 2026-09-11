# Benachrichtigungen

## Zweck

Der Versand — Mail, Push und Telegram. Getrennt vom Posteingang: **die Posteingangs-Zeile hängt
nicht am Versand**. Wer alle Kanäle abschaltet, bekommt weiterhin jede Meldung, nur eben still.

## Stellschrauben

**Eine Stufe je Kanal, am Konto des EMPFÄNGERS** (`User.notifyMail` / `notifyPush` /
`notifyTelegram`): `all` liefert alles, `important` nur Wichtiges und Fristen, `off` nichts. Vorgabe
ist `all`.

Wie dringend eine Meldung ist, sagt nicht der Nutzer, sondern die Meldung selbst — eine vollständige
Tabelle über alle Meldungstexte (`messageCategories.ts`). Drei Stufen: `deadline` (Pflicht mit Frist,
samt ihrer Änderung), `important` (Urteile, Vergehen, Handlungsbedarf), `info` (Alltag).

**Fristen kommen immer an:** erreicht keiner der eingeschalteten Kanäle den Empfänger, geht eine
`deadline`-Meldung an jeden erreichbaren (`deliveryChannels.ts`).

Die Stufe gilt auch für Meldungen ÜBER einen Träger an seine Keyholder — jeder entscheidet für sich.
Ein Raster am Sub, das die Meldungen an seine Keyholder steuerte, gab es bis v6.2.2; es ist entfallen.
Einziger verbliebener Einzel-Schalter: die Wiege-Erinnerung (`NotificationPreference`,
`WEIGHT_REMINDER`).

## Zwei Push-Wege

- **Web-Push** über den Browser — Zustelladresse plus zwei Schlüssel je Abonnement.
- **Nativer Push** für die App — ein Gerätetoken je Plattform.

Beide sind reine Adressen, keine Einstellungen: der Nutzer entscheidet über die Stufe seines
Push-Kanals, nicht darüber, welcher Weg technisch benutzt wird.

Auf iOS in der App-Hülle und in Privatfenstern fehlt der Service-Worker vollständig. Jeder Zugriff
darauf läuft deshalb über eine gemeinsame Schutzschicht — ein ungeschützter Zugriff wirft dort und
verschluckt die Aktion drumherum.

## Sprache folgt dem Konto

Anschreiben werden in der Sprache des Empfänger-Kontos verfasst — auch die Mails, die das Portal
verschickt, lesen sie von dort. Nicht in der Sprache dessen, der die Aktion ausgelöst hat.

## Zustellung terminierter Direktiven

Terminierte Kontrollen, Sperrzeiten, Orgasmus-Direktiven und Aufgaben verschickt der Minuten-Poller,
nicht der Klick. Deshalb trägt jede dieser Zeilen den Anordnenden mit: sonst müsste die Meldung im
Posteingang ihren Absender raten.

## Wirkt auf

Nur auf den Versand. **Keine** Mechanik hängt an einer Benachrichtigung — eine nicht zugestellte
Mahnung stoppt die Eskalation nicht, der Stempel wird gesetzt, egal ob die Meldung ankommt.

## Code

`notify.ts`, `deliveryChannels.ts`, `notificationPrefs.ts`, `mail.ts`, `emailI18n.ts`, `push.ts`, `nativePush.ts`,
`swMessages.ts`, `taskProofNotify.ts`, `entryNotify.ts`.

## Tests

`notify.test.ts`, `notificationPrefs.test.ts`, `mail.test.ts`, `emailI18n.test.ts`,
`entryNotify.test.ts`, `taskProofNotify.test.ts`, `inspectionEscalationNotify.test.ts`,
`swMessages.test.ts`.
