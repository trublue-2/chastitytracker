import { prefSet } from "@/lib/capacitorPrefs";
import { isNativePlatform } from "@/lib/nativePush";
import type { World } from "@/lib/theme";

/**
 * Der Schlüssel, unter dem die Welt liegt — als Konstante, obwohl er nur EINEN Leser in TypeScript
 * hat. Genau umgekehrt zur ersten Eingebung: `NATIVE_PUSH_TOKEN` in `nativePush.ts` ist benannt und
 * wird nur von TypeScript gelesen, während dieser hier die Sprachgrenze überquert. Der eine, den
 * ein `grep` von der Swift-Seite oder aus `TESTFLIGHT.md` finden muss, darf nicht als nacktes
 * Literal in einem Funktionsaufruf stehen.
 *
 * Nativ heisst er `CapacitorStorage.world` — Capacitor stellt seinen Gruppennamen davor.
 */
export const WORLD_PREF_KEY = "world";

/**
 * Die zuletzt gültige Farbwelt für den NATIVEN Sperrbildschirm hinterlegen.
 *
 * Der Sperrbildschirm der iOS-Hülle (`ios/App/App/AppDelegate.swift`, `LockScreenView`) liegt vor
 * der WebView. **Diese Datei steht NICHT im Repo** — `/ios/` ist per `.gitignore` ausgenommen, das
 * Xcode-Projekt erzeugt `npx cap add ios` lokal. Wer den Schlüsselnamen unten ändert, bricht also
 * eine Verbindung, die hier weder ein Compiler noch ein Test sieht. Der Sperrbildschirm er zeichnet, bevor überhaupt eine Seite geladen ist, und hat weder Sitzung noch
 * Netz. Er kann die Welt also nicht ERFRAGEN — sie muss beim letzten Mal hinterlegt worden sein.
 * Auf iOS liest er den Wert als `UserDefaults.standard.string(forKey: "CapacitorStorage.world")`.
 *
 * **Der Wert ist damit ein Gedächtnis, keine Auskunft.** Öffnet die Keyholderin den Verschluss,
 * während die App geschlossen ist, zeigt der Sperrbildschirm beim nächsten Start noch Grün — bis
 * das Dashboard einmal geladen hat und diese Zeile den neuen Stand schreibt. Das ist hinnehmbar,
 * weil der Bildschirm nur Sekunden steht und die App dahinter sofort das Richtige zeigt; eine
 * Auskunft wäre nur mit einem Netz-Zugriff VOR der Anmeldung zu haben, und der ginge nicht.
 *
 * **Nur nativ.** Die Schranke ist nicht Sparsamkeit, sondern Korrektheit: `@capacitor/preferences`
 * bringt eine Web-Fassung mit, die auf `window.localStorage` schreibt. Ohne `isNativePlatform()`
 * legte diese Zeile die Farbwelt in jedem Browser als `CapacitorStorage.world` ab — also genau
 * dorthin, wo v6 sie WEGGENOMMEN hat, weil sie zwischen Handy und Rechner auseinanderlief (#88).
 * Ein Schlüssel, den niemand liest, wäre dabei nicht das Problem; das Problem wäre, dass wir das
 * Theme wieder in einen Gerätespeicher schreiben, nachdem wir es dort ausgebaut haben.
 *
 * (`isNativePlatform` liegt in `nativePush.ts` und hat dort nichts verloren — es ist der dritte
 * Abnehmer nach `swMessages.ts` und diesem. Der Umzug in ein eigenes Modul gehört nicht in diesen
 * Zweig, ist aber fällig.)
 *
 * Kein `await` beim Aufrufer: schlägt das Schreiben fehl, behält der Sperrbildschirm seine
 * Vorgabe-Farben. Das ist die einzige Folge.
 */
export function rememberWorld(world: World): void {
  void (async () => {
    if (await isNativePlatform()) await prefSet(WORLD_PREF_KEY, world);
  })();
}
