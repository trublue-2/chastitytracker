import { describe, it, expect } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { PASSWORD_CHANGE_VIA_I18N_KEYS, passwordChangeViaLabel } from "./constants";

/**
 * Wächter über die Beschriftung der Passwortwechsel-Wege im Strafbuch. Ein fehlender Schlüssel fiele
 * weder dem Compiler noch dem Build auf, sondern erst auf der Seite — als roher Schlüsselname, genau
 * wie vorher der rohe `via`-Wert `reset_token` dort stand.
 */
describe("Passwortwechsel-Wege", () => {
  it("jeder Weg hat eine Beschriftung in beiden Sprachen", () => {
    for (const [lang, messages] of [["de", de], ["en", en]] as const) {
      const namespace = messages.admin as Record<string, string>;
      const fehlt = Object.values(PASSWORD_CHANGE_VIA_I18N_KEYS).filter((k) => !namespace[k]);
      expect(fehlt, `\nFehlende Schlüssel in messages/${lang}.json (Namespace "admin"):\n  ${fehlt.join("\n  ")}\n`).toEqual([]);
    }
  });

  it("ein unbekannter Wert bleibt roh stehen — auch ein Prototyp-Name", () => {
    const t = (k: string) => `[${k}]`;
    expect(passwordChangeViaLabel("reset_token", t)).toBe("[strafbuchAdminPasswortViaResetToken]");
    expect(passwordChangeViaLabel("legacy", t)).toBe("legacy");
    expect(passwordChangeViaLabel("toString", t)).toBe("toString");
  });
});
