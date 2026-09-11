import { describe, it, expect } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { NOTIFICATION_EVENT_TYPES, NOTIFICATION_EVENT_LABEL_KEYS, NOTIFICATION_EVENT_GROUPS } from "./constants";

/**
 * Wächter über die Benachrichtigungs-Matrix der Keyholderin (`NotificationToggles`).
 *
 * Die Schlüssel sind blosse Strings — ein fehlender fällt weder dem Compiler noch dem Build auf,
 * sondern erst beim Öffnen der Seite: als `MISSING_MESSAGE` im Log und roher Schlüsselname im UI.
 * Genau so kam `OFFENSE_STATEMENT` ohne Beschriftung und ohne Gruppentitel auf `main`.
 */
describe("Benachrichtigungs-Matrix", () => {
  it("jede Beschriftung und jeder Gruppentitel existiert in beiden Sprachen", () => {
    const keys = [
      ...Object.values(NOTIFICATION_EVENT_LABEL_KEYS),
      ...NOTIFICATION_EVENT_GROUPS.map((g) => g.titleKey),
    ];
    for (const [lang, messages] of [["de", de], ["en", en]] as const) {
      const namespace = messages.admin as Record<string, string>;
      const fehlt = keys.filter((k) => !namespace[k]);
      expect(fehlt, `\nFehlende Schlüssel in messages/${lang}.json (Namespace "admin"):\n  ${fehlt.join("\n  ")}\n`).toEqual([]);
    }
  });

  it("jeder Event-Typ steht in genau einer Gruppe", () => {
    // Ein Event ohne Gruppe hätte Schalter in der DB, aber keine Zeile in der Matrix; eines in zwei
    // Gruppen erschiene doppelt und teilte sich denselben React-Key.
    const grouped = NOTIFICATION_EVENT_GROUPS.flatMap((g) => g.events);
    expect([...grouped].sort()).toEqual([...NOTIFICATION_EVENT_TYPES].sort());
  });
});
