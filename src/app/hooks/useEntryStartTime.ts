"use client";

import { useState, type ChangeEvent } from "react";
import { toDatetimeLocal } from "@/lib/utils";

/**
 * Die Zeit-Eingabe eines Verschluss-/Öffnen-Formulars samt der Frage, ob der Träger sie angefasst hat
 * (`entryStart.ts`). Unangetastet heisst „jetzt": das Formular schickt dann `startIsNow`, und der Server
 * datiert mit seiner eigenen Uhr, auf die Sekunde. Beim Bearbeiten eines bestehenden Eintrags gibt es
 * kein „jetzt" — dort ist die Zeit der gespeicherte Wert.
 */
export function useEntryStartTime(initialStart: string | undefined, nowDefault: string, tz: string) {
  const [startTime, setStartTime] = useState(toDatetimeLocal(initialStart, tz) || nowDefault);
  const [touched, setTouched] = useState(false);
  return {
    startTime,
    /** Für `<DateTimePicker onChange>`. */
    onStartChange: (e: ChangeEvent<HTMLInputElement>) => { setStartTime(e.target.value); setTouched(true); },
    startIsNow: !initialStart && !touched,
  };
}
