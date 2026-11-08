// Capacitor Preferences — ein get/set für alle Keys (set(null) = remove).
//
// Der Import ist DYNAMISCH und der Aufruf gekapselt, weil dieses Modul aus Code läuft, der es auf
// drei Plattformen tut: im Server-Rendering (kein `window`), im reinen Browser (kein Bridge-Objekt)
// und in der nativen Hülle (dort funktioniert es). Nur der letzte Fall soll etwas tun, die beiden
// anderen sollen still nichts tun — deshalb `catch` ohne Meldung statt einer Plattform-Abfrage.
//
// Auf iOS landen die Werte in `UserDefaults.standard` unter `CapacitorStorage.<key>` — dort liest
// sie nativer Code, den kein Compiler dieses Projekts sieht. Wer einen Key umbenennt, bricht eine
// Verbindung, die kein Test findet; der Key gehört deshalb an seiner Setz-Stelle dokumentiert.

export async function prefGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value ?? null;
  } catch {
    return null;
  }
}

export async function prefSet(key: string, value: string | null): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (value === null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch {
    /* ignore — der Aufrufer funktioniert weiter, nur ohne Persistenz */
  }
}
