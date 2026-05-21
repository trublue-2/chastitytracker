# TestFlight Distribution — ChastityTracker iOS

Dieses Dokument enthält alle wichtigen Informationen und Schritte für den Build und die Auslieferung der nativen iOS-App über TestFlight.

---

## Apple Developer Account

| Feld | Wert |
|---|---|
| Team Name | Jonas Fahrni |
| Team ID | `C4RN29TT3H` |
| Bundle ID | `ch.chastitytracker.app` |
| App Name | ChastityTracker |
| Distribution | TestFlight (intern) — **kein App Store** (Adult Content) |

---

## APNs (Push Notifications)

| Feld | Wert |
|---|---|
| Key Name | ChastityTracker Push |
| Key ID | `37U6695ZJN` |
| Key-Datei | `AuthKey_37U6695ZJN.p8` |
| Team ID | `C4RN29TT3H` |
| Endpoint Prod | `api.push.apple.com` |
| Endpoint Dev | `api.sandbox.push.apple.com` |

**Server-ENV (pro Instanz, gesetzt durch Portal):**
```
APNS_KEY_PATH=/app/data/apns.p8
APNS_KEY_ID=37U6695ZJN
APNS_TEAM_ID=C4RN29TT3H
APNS_BUNDLE_ID=ch.chastitytracker.app
APNS_SANDBOX=false   # false = production (TestFlight/App Store), true = Xcode Dev
```

Die `.p8`-Datei liegt auf dem Server unter `~/instances/<subdomain>/data/apns.p8`
und wird vom Portal bei jeder neuen Instanz automatisch kopiert.

---

## Capacitor-Konfiguration

**Datei:** `capacitor.config.ts`

```typescript
appId: "ch.chastitytracker.app"
appName: "ChastityTracker"
webDir: "www"                    // Shell-App (www/index.html)
server.allowNavigation: [
  "*.trublue.ch",
  "*.chastitytracker.ch",
  "*.chastity-tracker.com"
]
```

**Shell-App (`www/index.html`):**
- Liest `ct_instance_url` aus `localStorage`
- Zeigt URL-Eingabe beim ersten Start
- Validiert gegen Whitelist der erlaubten Domains
- Leitet danach auf die Instanz-URL weiter → Capacitor Bridge bleibt aktiv

---

## iOS-Konfiguration

### Entitlements (`App.entitlements`)
```xml
aps-environment = production          <!-- "production" für TestFlight/AppStore, "development" für Xcode Dev -->
webcredentials:*.trublue.ch           <!-- Passkeys / WebAuthn -->
webcredentials:*.chastitytracker.ch
webcredentials:*.chastity-tracker.com
```

> **Wichtig für lokale Entwicklung (Xcode Dev Build):**
> Wildcards funktionieren NICHT im Simulator / unsigned Builds.
> In Xcode → Signing & Capabilities die explizite Domain eintragen:
> `webcredentials:trublue.chastitytracker.ch` (oder die eigene Test-Domain)
> → In TestFlight / App Store funktionieren Wildcards normal.

### Info.plist — Privacy-Strings (Pflicht, sonst Crash)
```xml
NSCameraUsageDescription         — Kamerazugriff für Fotos
NSPhotoLibraryUsageDescription   — Fotobibliothek lesen
NSPhotoLibraryAddUsageDescription — Fotobibliothek schreiben
NSMicrophoneUsageDescription      — Mikrofon (für Video)
```

### AppDelegate.swift — APNs Callbacks
```swift
// Beide Methoden MÜSSEN vorhanden sein, sonst timeout beim Push-Toggle:
func application(_ application: UIApplication,
  didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(
    name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication,
  didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(
    name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

---

## Apple App Site Association (AASA)

Jede Tracker-Instanz liefert automatisch die AASA-Datei aus:

- **Endpoint:** `/.well-known/apple-app-site-association`
  (rewrite in `next.config.ts` → `/api/apple-app-site-association`)
- **Inhalt:** `webcredentials.apps: ["C4RN29TT3H.ch.chastitytracker.app"]`
- **Zweck:** Passkeys / WebAuthn in der nativen App

---

## Build-Prozess (neues Release)

### 1. Code synchronisieren
```bash
cd ~/KG-project-2/chastitytracker
npx cap sync ios
```

### 2. Xcode öffnen
```bash
npx cap open ios
# oder direkt: open ios/App/App.xcworkspace
```

### 3. Target konfigurieren
- Oben links: **"Any iOS Device (arm64)"** wählen (nicht Simulator, nicht USB-Gerät)
- Signing: **Automatically manage signing** aktiv, Team = Jonas Fahrni

### 4. Archive erstellen
- Menü: **Product → Archive**
- Dauert ca. 2–5 Minuten

### 5. Upload zu App Store Connect
- Im Organizer: **Distribute App**
- → **App Store Connect**
- → **Upload**
- Alle Optionen auf Default lassen
- **Upload** klicken → ca. 2–5 Minuten

### 6. TestFlight (App Store Connect)
- URL: https://appstoreconnect.apple.com
- Build erscheint unter **TestFlight** nach ca. 5–15 Minuten
- Evtl. **"Missing Compliance"** → auswählen: *None of the algorithms mentioned*
- Status wird **"Ready to Submit"** → Tester erhalten Update automatisch

---

## Build-Nummer erhöhen

Xcode erhöht die Build-Nummer normalerweise automatisch.
Falls nicht: **TARGETS → App → Build Settings → Current Project Version** manuell hochzählen.

Jeder Upload muss eine höhere Build-Nummer haben als der vorherige.

---

## Encryption Compliance (bei jedem Upload)

Bei "Missing Compliance" im TestFlight:
1. App Store Connect → TestFlight → Build auswählen
2. **"Provide Export Compliance Information"**
3. → **"No"** (die App verwendet keine eigenen Encryption-Algorithmen)
4. → *None of the algorithms mentioned above*

Um diesen Dialog zu vermeiden, kann in `Info.plist` eingetragen werden:
```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

---

## Bekannte Probleme & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Push-Toggle bleibt grau / Timeout | `AppDelegate.swift` fehlen die APNs-Callbacks | Siehe AppDelegate.swift-Abschnitt oben |
| Push kommt nicht an | `APNS_SANDBOX` falsch gesetzt | Xcode Dev → `true`, TestFlight/Prod → `false` |
| Passkey-Fehler Code 1004 | Wildcard Associated Domains funktionieren nur in TestFlight, nicht im Xcode Dev Build | Explizite Domain in Signing & Capabilities eintragen für lokale Tests |
| Kamera-Crash (sofort beim Tap) | `NSCameraUsageDescription` fehlt in Info.plist | Eingetragen, siehe Info.plist-Abschnitt |
| PWA-Installationsbanner sichtbar | `localStorage` funktioniert über verschiedene Origins nicht | Check via `window.Capacitor?.isNativePlatform?.()` — eingebaut in `InstallBanner.tsx` |
| App-Icon fehlt in TestFlight | Wurde initial nicht konfiguriert | App-Icon in `Assets.xcassets/AppIcon.appiconset` hinterlegen |

---

## Dateipfade (wichtig)

```
ios/App/App/App.entitlements          — Berechtigungen (APNs, Associated Domains)
ios/App/App/Info.plist                — Privacy-Strings, Bundle-Config
ios/App/App/AppDelegate.swift         — APNs-Callbacks (NotificationCenter)
ios/App/App/Assets.xcassets/          — App-Icon, Launch-Screen
www/index.html                        — Capacitor Shell-App
capacitor.config.ts                   — Bundle ID, allowNavigation, Plugins
```

---

## TestFlight-Tester verwalten

- App Store Connect → TestFlight → Tester & Gruppen
- Interne Tester: Apple-ID muss im Developer-Account sein (max. 100)
- Externe Tester: Benötigt Beta-Review von Apple (~1 Tag) — wegen Adult Content voraussichtlich abgelehnt
- **Empfehlung:** Nur interne Tester verwenden
