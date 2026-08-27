import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expectImportFree } from "@/test/importFree";
import { NOTICE_VERSION } from "./notice";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

/**
 * Der Umstellungs-Hinweis hat einen stummen Fehlermodus, und zwar den denkbar unauffälligsten.
 *
 * Es gibt genau EINEN Textblock (`notice.*`). Wer den nächsten Hinweis schreibt, überschreibt ihn.
 * Bleibt `NOTICE_VERSION` dabei stehen, haben alle Bestandsnutzer den neuen Text bereits
 * quittiert — und sehen ihn nie. Nichts schlägt an: kein Compiler, kein Test, keine Meldung, und
 * auch keine Beschwerde, denn man vermisst nicht, was man nie gesehen hat.
 *
 * Deshalb der Fingerabdruck. Ändert sich der Text, ist dieser Test rot, bis jemand BEIDES anfasst:
 * die Version und den erwarteten Abdruck. Das ist die einzige Prüfung, die den echten Fehler
 * fängt — und dieselbe Bauart, mit der `appName.test.ts` und `changelogVersion.test.ts` ihre
 * Kopplungen halten.
 */
const NOTICE_FINGERPRINT = "9022d82553efc93d";

function fingerprint(block: Record<string, string>): string {
  const canonical = Object.keys(block).sort().map((k) => `${k}=${block[k]}`).join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

describe("Umstellungs-Hinweis", () => {
  it("Text und NOTICE_VERSION wandern zusammen", () => {
    const actual = fingerprint({ ...de.notice, ...Object.fromEntries(Object.entries(en.notice).map(([k, v]) => [`en:${k}`, v])) });
    expect(actual, [
      "Der Text unter `notice.*` hat sich geändert.",
      "",
      "Dann MUSS `NOTICE_VERSION` in src/lib/notice.ts mitwandern — sonst haben alle",
      "Bestandsnutzer den neuen Hinweis schon quittiert und bekommen ihn nie zu sehen.",
      "",
      `Danach hier den Abdruck auf "${fingerprint({ ...de.notice, ...Object.fromEntries(Object.entries(en.notice).map(([k, v]) => [`en:${k}`, v])) })}" setzen.`,
    ].join("\n")).toBe(NOTICE_FINGERPRINT);
  });

  it("NOTICE_VERSION nennt eine Version, die es im Changelog wirklich gibt", () => {
    // Fängt Tippfehler und eine Version, die nie ausgeliefert wurde.
    const versions = (JSON.parse(readFileSync("src/data/changelog.json", "utf8")) as { version: string }[])
      .map((e) => e.version);
    expect(versions, `NOTICE_VERSION ${NOTICE_VERSION} steht in keinem Changelog-Eintrag`)
      .toContain(NOTICE_VERSION);
  });

  it("beide Sprachen führen dieselben Schlüssel", () => {
    expect(Object.keys(de.notice).sort()).toEqual(Object.keys(en.notice).sort());
  });

  /** Das Modul sagt von sich, es sei importfrei — hier wird es geprüft statt geglaubt. Ein Import
   *  zöge beim nächsten Mal Server-Code in die Client-Komponente, die `NOTICE_VERSION` liest. */
  it("notice.ts bleibt importfrei", () => {
    expectImportFree("src/lib/notice.ts");
  });
});
