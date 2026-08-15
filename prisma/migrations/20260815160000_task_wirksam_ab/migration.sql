-- Aufgabe terminieren: bis `wirksamAb` bleibt sie für den Träger unsichtbar, und JEDE Frist ankert
-- an ihr statt an `createdAt`.
--
-- Beide Spalten nullbar, `null` = „sofort wirksam, wie bisher" — jede Bestandszeile behält damit ihr
-- Urteil unverändert. `benachrichtigtAt` ist das Spiegelbild: sofort = beim Anlegen gestempelt,
-- terminiert = null, bis der Poller zugestellt hat (dieselbe Konvention wie bei
-- `KontrollAnforderung` und `VerschlussAnforderung`).
ALTER TABLE "Task" ADD COLUMN "wirksamAb" DATETIME;
ALTER TABLE "Task" ADD COLUMN "benachrichtigtAt" DATETIME;

-- WER die Aufgabe gestellt hat. Gebraucht für die verspätete Zustellung: der Poller verschickt sie,
-- lange nachdem der Mensch den Knopf gedrückt hat, und müsste ihren Absender sonst raten.
ALTER TABLE "Task" ADD COLUMN "createdBy" TEXT;

-- Die Vorauswahl der Zustellung im Minuten-Tick. `benachrichtigtAt` steht vorn, weil es bei jeder
-- bereits ausgelieferten Zeile gesetzt ist: der IS-NULL-Bereich bleibt winzig, egal wie viele
-- terminierte Aufgaben es insgesamt gab. Mit `wirksamAb` vorn wäre die führende Spalte ein BEREICH
-- und die zweite nicht mehr zum Suchen verwendbar — derselbe Grund wie beim Index
-- `Task_resultNotifiedAt_holdUntil_idx`.
CREATE INDEX "Task_benachrichtigtAt_wirksamAb_idx" ON "Task"("benachrichtigtAt", "wirksamAb");
