import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { WORLDS } from "@/lib/theme";
import { listFiles, readStripped } from "@/test/sourceScan";
import { themeToken } from "@/test/themeCss";

/**
 * Native Parität: iOS (`ios/`) und Android (`android/`) sind zwei dünne Hüllen um dieselbe
 * Web-App. Was in einer nativ gebaut wird, muss die andere auch können — sonst merkt es erst ein
 * Nutzer der anderen Plattform. Dieser Test liest beide Projekte und scheitert, sobald sie
 * auseinanderlaufen. Er ist die Stelle, an der man beim Bauen einer nativen Funktion hängen
 * bleiben SOLL; die Regel dazu steht in CLAUDE.md („Native Parität").
 *
 * Geprüft wird, was Code ohne Gerät beweisen kann: Plugins, Berechtigungen, die Farbwelten und
 * Texte des Sperrbildschirms, die Session-Cookies des Passwort-Auswegs und dass die Plattform-
 * Namen nur an einer Stelle stehen. Verhalten (Biometrie, Push-Zustellung) prüft er nicht.
 */

const read = (p: string) => readFileSync(p, "utf8");
const SWIFT = read("ios/App/App/AppDelegate.swift");
const ANDROID_SRC = "android/app/src/main/java/ch/chastitytracker/app";
const JAVA_PALETTE = read(`${ANDROID_SRC}/LockPalette.java`);
const JAVA_ACTIVITY = read(`${ANDROID_SRC}/MainActivity.java`);
const STRINGS_XML = read("android/app/src/main/res/values/strings.xml");
const MANIFEST = read("android/app/src/main/AndroidManifest.xml");
const APP_GRADLE = read("android/app/build.gradle");
const IOS_PLUGINS = read("ios/App/CapApp-SPM/Package.swift");
const ANDROID_PLUGINS = read("android/capacitor.settings.gradle");
const PBXPROJ = read("ios/App/App.xcodeproj/project.pbxproj");
const INFO_PLIST = read("ios/App/App/Info.plist");

// ---------------------------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------------------------

describe("Capacitor-Plugins", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  /** Laufzeit-Plugins = alles aus dem Capacitor-Umfeld ausser Kern und Plattform-Paketen. */
  const plugins = Object.keys(pkg.dependencies).filter(
    (d) => /^@(capacitor|capacitor-community|capawesome)\//.test(d) && d !== "@capacitor/core",
  );

  it("es gibt welche (sonst prüfte der Test nichts)", () => {
    expect(plugins.length).toBeGreaterThan(0);
  });

  it.each(plugins)("%s ist in iOS UND Android eingebunden (`npx cap sync`)", (name) => {
    expect(IOS_PLUGINS, `iOS kennt ${name} nicht — npx cap sync ios`)
      .toContain(`node_modules/${name}"`);
    expect(ANDROID_PLUGINS, `Android kennt ${name} nicht — npx cap sync android`)
      .toContain(`node_modules/${name}/android'`);
  });
});

// ---------------------------------------------------------------------------------------------
// Berechtigungen
// ---------------------------------------------------------------------------------------------

/**
 * Berechtigungen in BEIDE Richtungen: jede iOS-Berechtigung braucht ein Android-Gegenstück oder
 * eine Begründung, warum Android keine braucht — und jede Android-Berechtigung der App umgekehrt.
 * Eine neue Berechtigung auf einer Seite ohne Eintrag hier lässt den Test scheitern.
 */
type Counterpart = { file: string; needle: string } | { none: string };
const PLUGIN_MANIFEST = (pkg: string) => `node_modules/${pkg}/android/src/main/AndroidManifest.xml`;
const IOS_TO_ANDROID: Record<string, Counterpart> = {
  NSCameraUsageDescription: { file: "android/app/src/main/AndroidManifest.xml", needle: "android.permission.CAMERA" },
  NSPhotoLibraryUsageDescription: { none: "Die Dateiauswahl der WebView läuft über das System (Storage Access Framework), ohne Berechtigung." },
  NSPhotoLibraryAddUsageDescription: { none: "Ab Android 10 braucht eine App für eigene Medien keine Speicher-Berechtigung." },
  NSMicrophoneUsageDescription: { none: "Videoaufnahmen laufen über die Kamera-App des Systems, nicht in der WebView." },
  NSLocalNetworkUsageDescription: { none: "Nur die Dev-Variante lädt aus dem LAN; dafür genügen INTERNET und cleartext aus CAP_DEV_URL." },
  NSBluetoothAlwaysUsageDescription: { file: PLUGIN_MANIFEST("@capacitor-community/bluetooth-le"), needle: "android.permission.BLUETOOTH_CONNECT" },
  NSFaceIDUsageDescription: { file: "android/app/build.gradle", needle: "androidx.biometric:biometric" },
};
const ANDROID_TO_IOS: Record<string, Counterpart> = {
  "android.permission.INTERNET": { none: "Auf iOS ohne Berechtigung." },
  "android.permission.CAMERA": { file: "ios/App/App/Info.plist", needle: "NSCameraUsageDescription" },
  "android.permission.POST_NOTIFICATIONS": { none: "iOS fragt zur Laufzeit über PushNotifications.requestPermissions, ohne Info.plist-Eintrag." },
};

const hasCounterpart = (e: [string, Counterpart]): e is [string, { file: string; needle: string }] => "file" in e[1];

describe("Berechtigungen", () => {
  const iosKeys = [...INFO_PLIST.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]);
  const androidPerms = [...MANIFEST.matchAll(/<uses-permission\s+android:name="([\w.]+)"/g)].map((m) => m[1]);

  it.each([
    ["iOS", iosKeys, IOS_TO_ANDROID],
    ["Android", androidPerms, ANDROID_TO_IOS],
  ] as const)("jede %s-Berechtigung steht in der Abbildung, und keine Zeile ist verwaist", (_p, actual, map) => {
    expect(actual.filter((k) => !(k in map)), "neue Berechtigung: Gegenstück in nativeParity.test.ts eintragen").toEqual([]);
    expect(Object.keys(map).filter((k) => !actual.includes(k))).toEqual([]);
  });

  it.each([...Object.entries(IOS_TO_ANDROID), ...Object.entries(ANDROID_TO_IOS)].filter(hasCounterpart))(
    "%s → Gegenstück vorhanden", (_k, { file, needle }) => {
      expect(read(file)).toContain(needle);
    });
});

// ---------------------------------------------------------------------------------------------
// Sperrbildschirm
// ---------------------------------------------------------------------------------------------

/** Die acht Töne des Sperrbildschirms und die CSS-Variable, aus der jeder stammt. */
const PALETTE_TOKENS = [
  ["background", "--background"],
  ["surface", "--surface"],
  ["border", "--border"],
  ["foreground", "--foreground"],
  ["muted", "--foreground-muted"],
  ["faint", "--foreground-faint"],
  ["accent", "--btn-primary-bg"],
  ["onAccent", "--btn-primary-text"],
] as const;

type Palette = { colors: string[]; closed: boolean };

function cssPalette(world: string): string[] {
  return PALETTE_TOKENS.map(([, v]) => {
    const value = themeToken(world, v);
    expect(value, `${v} fehlt in [data-theme="${world}"]`).toMatch(/^#[0-9a-f]{6}$/i);
    return value!.slice(1).toLowerCase();
  });
}

/** Zerlegt `switch`-Fälle in (Welt → Rumpf); `default` gilt als `sub-open`. */
function cases(src: string, caseRe: RegExp): Map<string, string> {
  const out = new Map<string, string>();
  const hits = [...src.matchAll(caseRe)];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : src.length;
    out.set(m[1] ?? "sub-open", src.slice(m.index, end));
  });
  return out;
}

function swiftPalettes(): Map<string, Palette> {
  const body = SWIFT.slice(SWIFT.indexOf("static func current()"), SWIFT.indexOf("private class LockScreenView"));
  const result = new Map<string, Palette>();
  for (const [world, chunk] of cases(body, /(?:case "([\w-]+)":|default:)/g)) {
    result.set(world, {
      colors: PALETTE_TOKENS.map(([field]) => {
        const m = chunk.match(new RegExp(`${field}:\\s*UIColor\\(hex: 0x([0-9a-f]{6})\\)`, "i"));
        expect(m, `Swift-Palette ${world}: ${field} nicht lesbar`).not.toBeNull();
        return m![1].toLowerCase();
      }),
      closed: /closed:\s*true/.test(chunk),
    });
  }
  return result;
}

function javaPalettes(): Map<string, Palette> {
  const body = JAVA_PALETTE.slice(JAVA_PALETTE.indexOf("static LockPalette current("));
  const result = new Map<string, Palette>();
  for (const [world, chunk] of cases(body, /(?:case "([\w-]+)":|default:)/g)) {
    const args = chunk.slice(chunk.indexOf("new LockPalette(") + "new LockPalette(".length, chunk.indexOf(");"));
    const parts = args.split(",").map((a) => a.trim());
    expect(parts.length, `Java-Palette ${world}: erwartet 8 Farben + closed`).toBe(PALETTE_TOKENS.length + 1);
    result.set(world, {
      colors: parts.slice(0, -1).map((h) => h.replace(/^0x/i, "").toLowerCase()),
      closed: parts.at(-1) === "true",
    });
  }
  return result;
}

describe("Sperrbildschirm", () => {
  const swift = swiftPalettes();
  const java = javaPalettes();

  it("beide Plattformen kennen genau die Welten der App", () => {
    expect([...swift.keys()].sort()).toEqual([...WORLDS].sort());
    expect([...java.keys()].sort()).toEqual([...WORLDS].sort());
  });

  it.each([...WORLDS])("%s: iOS und Android zeichnen die Töne aus globals.css", (world) => {
    const css = cssPalette(world);
    expect(swift.get(world)?.colors, `AppDelegate.swift weicht für ${world} von globals.css ab`).toEqual(css);
    expect(java.get(world)?.colors, `LockPalette.java weicht für ${world} von globals.css ab`).toEqual(css);
    expect(java.get(world)?.closed, `offenes/geschlossenes Schloss für ${world} unterscheidet sich`).toBe(swift.get(world)?.closed);
  });

  it("beide lesen die Welt unter demselben Preferences-Schlüssel", () => {
    expect(SWIFT).toContain('"CapacitorStorage.world"');
    expect(JAVA_PALETTE).toMatch(/getSharedPreferences\("CapacitorStorage"[\s\S]*getString\("world"/);
  });

  it("dieselben Texte", () => {
    const androidTexts = ["lock_title", "lock_subtitle", "lock_unlock", "lock_password", "lock_prompt_title"].map((k) => {
      const m = STRINGS_XML.match(new RegExp(`<string name="${k}">([^<]+)</string>`));
      expect(m, `strings.xml: ${k} fehlt`).not.toBeNull();
      return m![1];
    });
    for (const text of androidTexts) expect(SWIFT, `iOS zeigt „${text}“ nicht`).toContain(`"${text}"`);
  });

  it("Android füllt die Lücke hinter den Systemleisten mit dem Grund der Vorgabewelt", () => {
    const m = read("android/app/src/main/res/values/colors.xml").match(/<color name="window_background">#([0-9a-f]{6})<\/color>/i);
    expect(m?.[1].toLowerCase(), "colors.xml window_background ≠ globals.css sub-open --background").toBe(cssPalette("sub-open")[0]);
  });

  it("der Passwort-Ausweg löscht dieselben Session-Cookies", () => {
    const names = (src: string) => [...src.matchAll(/"((?:__Secure-)?(?:next-auth|authjs)\.session-token)"/g)].map((m) => m[1]).sort();
    expect(names(JAVA_ACTIVITY)).toEqual(names(SWIFT));
    expect(names(SWIFT).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Dev-Variante und Release-Wächter
// ---------------------------------------------------------------------------------------------

describe("Dev-Variante", () => {
  it("beide Debug-Builds liegen als „CT Dev“ neben der ausgelieferten App", () => {
    expect(PBXPROJ).toContain("ch.chastitytracker.app.dev");
    expect(APP_GRADLE).toMatch(/applicationIdSuffix "\.dev"/);
    expect(APP_GRADLE).toContain('appLabel: "CT Dev"');
  });

  it("beide Release-Builds verweigern eine Dev-URL", () => {
    // Die Wächter selbst, nicht ihre Beschriftung: Bedingung auf server.url UND Abbruch.
    expect(PBXPROJ).toMatch(/Release[^\n]*plutil -extract server\.url[\s\S]{0,400}exit 1/);
    expect(APP_GRADLE).toMatch(/server\?\.url\)\s*\{\s*throw new GradleException/);
    expect(APP_GRADLE).toMatch(/preReleaseBuild[^\n]*dependsOn 'checkReleaseReady'/);
  });

  it("Android wendet das Firebase-Plugin an, sobald google-services.json da ist (sonst kein Push)", () => {
    expect(APP_GRADLE).toMatch(/def hasGoogleServices = file\('google-services\.json'\)\.exists\(\)[\s\S]*if \(hasGoogleServices\) \{\s*apply plugin: 'com\.google\.gms\.google-services'/);
    expect(read("android/build.gradle")).toMatch(/classpath 'com\.google\.gms:google-services:/);
  });
});

// ---------------------------------------------------------------------------------------------
// Plattform-Namen
// ---------------------------------------------------------------------------------------------

/** Wo ein Plattform-Literal stehen DARF — mit Grund. Alles andere geht über `nativePlatforms.ts`. */
const PLATFORM_LITERAL_ALLOWED: Record<string, string> = {
  "src/lib/nativePlatforms.ts": "die Liste selbst",
  "src/app/components/InstallBanner.tsx": "Browser-Erkennung des PWA-Banners (User-Agent), keine native Plattform",
};

describe("Plattform-Namen", () => {
  it('"ios"/"android" als Literal steht nur in nativePlatforms.ts', () => {
    const offenders = listFiles("src", (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => !(f in PLATFORM_LITERAL_ALLOWED))
      .filter((f) => /["'](ios|android)["']/.test(readStripped(f)));
    expect(offenders, "Plattform-Weiche ausserhalb von nativePlatforms.ts — von dort ableiten, damit keine Plattform vergessen wird")
      .toEqual([]);
  });
});
