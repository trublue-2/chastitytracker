# Benachrichtigungen

## Zweck

Der Versand — Mail und Push. Getrennt vom Posteingang: **die Posteingangs-Zeile hängt nicht am
Versand**. Wer alle Kanäle abschaltet, bekommt weiterhin jede Meldung, nur eben still.

## Stellschrauben

Zwei Schalter je Ereignis-Art (`mail`, `push`), Vorgabe beide an. Die Zeile selbst **ist** der
Schalter — die Ereignis-Art ist ihr Schlüssel, kein einstellbarer Wert.

Neun Ereignis-Arten: Verschluss · Öffnung (immer) · Öffnung (verboten) · Orgasmus · Kontrolle
(freiwillig) · Kontrolle (angefordert) · Trage-Beginn · Trage-Ende · Nachweis verspätet.

## Zwei Push-Wege

- **Web-Push** über den Browser — Zustelladresse plus zwei Schlüssel je Abonnement.
- **Nativer Push** für die App — ein Gerätetoken je Plattform.

Beide sind reine Adressen, keine Einstellungen: der Sub entscheidet über die neun Schalter, nicht
darüber, welcher Kanal technisch benutzt wird.

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

`notify.ts`, `notificationPrefs.ts`, `mail.ts`, `emailI18n.ts`, `push.ts`, `nativePush.ts`,
`swMessages.ts`, `taskProofNotify.ts`, `entryNotify.ts`.

## Tests

`notify.test.ts`, `notificationPrefs.test.ts`, `mail.test.ts`, `emailI18n.test.ts`,
`entryNotify.test.ts`, `taskProofNotify.test.ts`, `inspectionEscalationNotify.test.ts`,
`swMessages.test.ts`.
