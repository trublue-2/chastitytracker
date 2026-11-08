# Android-App — Build und Auslieferung

Gegenstück zu `TESTFLIGHT.md`. Die Android-App ist wie die iOS-App eine dünne Capacitor-Hülle:
`www/index.html` fragt nach der Instanz-Adresse, danach lädt die WebView die Instanz, und das
Design kommt vom Server. Nativ sind nur Sperrbildschirm, Push, Berechtigungen und die Plugins.

Dass beide Apps dasselbe können, prüft `src/lib/nativeParity.test.ts`; die Regel dazu steht in
`CLAUDE.md` („Native Parität").

| Feld | Wert |
|---|---|
| Paket (Release) | `ch.chastitytracker.app` |
| Paket (Debug) | `ch.chastitytracker.app.dev`, Name „CT Dev", liegt neben der Release-App |
| Mindestversion | Android 7.0 (API 24) |
| Ziel-SDK | 36 |
| Vertrieb | signierte APK, **kein Play Store** (Adult Content) |

---

## Werkzeuge (einmalig)

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
sdkmanager --sdk_root=$HOME/Library/Android/sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties   # gitignoriert
```

Für jeden Gradle-Aufruf: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21`. Android Studio ist nicht
nötig. `adb` aus `$HOME/Library/Android/sdk/platform-tools` nehmen, nicht das von Homebrew: zwei
verschiedene `adb` beenden sich gegenseitig den Server.

---

## Firebase (Push)

Android-Push läuft über FCM HTTP v1. Das braucht ein Firebase-Projekt (kostenlos):

1. <https://console.firebase.google.com> → Projekt anlegen (Analytics nicht nötig).
2. Android-App hinzufügen, Paketname `ch.chastitytracker.app` → `google-services.json`
   herunterladen → nach `android/app/google-services.json`. Die Datei ist gitignoriert (öffentliches
   Repo); ohne sie bricht der Release-Build ab (`checkReleaseReady`). Ein Debug-Build ohne sie
   baut mit Warnung, stürzt aber beim Einschalten der Mitteilungen ab.
3. Projekteinstellungen → Dienstkonten → „Neuen privaten Schlüssel generieren" → Service-Account-
   JSON. **Das ist ein Geheimnis** — nie ins Repo, nie in einen Chat.

Server-Seite, je Instanz:

```
FCM_SERVICE_ACCOUNT_PATH=/app/data/fcm.json
```

Das Portal kopiert die Datei bei NEUEN Instanzen wie die APNs-`.p8` (Portal-ENV
`FCM_SERVICE_ACCOUNT_PATH` = Pfad auf dem Portal-Host). Bestehende Instanzen brauchen sie einmal von
Hand: Datei nach `~/instances/<instanz>/data/fcm.json` (Modus 600), Zeile in die Instanz-`.env`,
Container neu erstellen. **Achtung:** die Portal-`.env` endet ohne Zeilenumbruch — ein `>>` klebt
die neue Zeile an den letzten Wert. Vorher `printf '\n'` anhängen oder mit einem Editor arbeiten.

Ohne FCM-Schlüssel nimmt eine Instanz keine Android-Registrierung an (Fehler `nativePlatformUnsupported`
in der App, `isDeliverablePlatform()` in `src/lib/push.ts`). Gelöscht wird ein Android-Token nur, wenn
FCM ihn als `UNREGISTERED` meldet — ein falscher Service-Account kostet also keine Anmeldungen.

---

## Signatur (einmalig)

```bash
keytool -genkeypair -v -keystore ~/ct-release.jks -alias ct -keyalg RSA -keysize 4096 -validity 36500
```

`android/keystore.properties` (gitignoriert):

```
storeFile=/Users/<du>/ct-release.jks
storePassword=…
keyAlias=ct
keyPassword=…
```

**Den Keystore doppelt sichern.** Jedes Update muss mit DEMSELBEN Schlüssel signiert sein. Geht er
verloren, verweigert Android jedes Update; die Nutzer müssten die App löschen und neu installieren.

Fingerabdruck für Passkeys (`assetlinks.json`):

```bash
keytool -list -v -keystore ~/ct-release.jks -alias ct | grep SHA256
```

Der Wert kommt als `ANDROID_CERT_SHA256` ins Portal (für die Basis-Domains) und in die Instanzen.
Er ist öffentlich (steht in jeder APK).

---

## Passkeys

Die Instanzen melden Passkeys mit der **Basis-Domain** als RP-ID. Android prüft die App-Zuordnung
unter `https://<basis-domain>/.well-known/assetlinks.json`. Diesen Pfad leitet Traefik wie die
`apple-app-site-association` aufs Portal (Route im Portal-Repo). Self-Hoster, deren RP-ID die
eigene Instanz ist, bekommen dieselbe Route vom Tracker.

---

## Release bauen

1. `npx cap sync android` **ohne** `CAP_DEV_URL` — sonst lädt die App einen Rechner im LAN; der
   Release-Build bricht dann ab.
2. `versionCode` in `android/app/build.gradle` hochzählen (ganze Zahl, nie wiederverwenden),
   `versionName` bei Bedarf. Beides ist unabhängig von der Web-Version, wie bei iOS.
3. Bauen:

   ```bash
   cd android && ./gradlew assembleRelease
   # → app/build/outputs/apk/release/app-release.apk
   ```

4. Auf ein Gerät per USB (USB-Debugging an):

   ```bash
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

Web-Änderungen in `www/` und Änderungen unter `android/` durchlaufen `/simplify` + `/code-review`,
aber keinen Web-Versions-Bump.

---

## Verteilen

Die APK liegt zum Download auf der Marketing-Website (`/app`, EN `/en/app`). Die Datei selbst
liefert das Portal aus: Traefik leitet `/download/` der Marketing-Domain aufs Portal
(`/download/android`, Angaben unter `/download/android/meta`). Das Portal zählt jeden Download
(Datum, Version, Gerätetyp; keine IP, kein Cookie) und zeigt ihn unter `/admin/apps`.

Veröffentlichen, nach dem Hochzählen von `versionCode`:

```bash
ANDROID_PUBLISH_TARGET=<user>@<host>:<portal>/data/android scripts/publish-android.sh
```

In den Tracker-Einstellungen erscheint im Android-Browser die Zeile „Android-App" (nur auf
Portal-Instanzen, `AndroidAppRow`). Ihr Link trägt die öffentliche Census-Kennung der Instanz
(`?i=`); das Portal ordnet den Download damit der Instanz zu.

**Wer die App nutzt:** Die App meldet sich bei ihrer Instanz (`NativeAppReporter` →
`/api/native/app-seen`, höchstens stündlich) mit Plattform, Version, Build und einer zufälligen
Installations-ID (`ct_install_id` in den Preferences). Daraus wird je Nutzer und Gerät eine Zeile
`NativeAppClient`. Das Portal liest sie beim Aktivitäts-Sync aus den Instanz-DBs; der Census
meldet nur Anzahlen je Plattform und Version.

Self-Hoster bekommen keine native App: die Hülle nimmt nur die drei Basis-Domains an, und Push
braucht die privaten Schlüssel des Projekts. Für sie bleibt die PWA mit Web-Push.

---

## Entwickeln

```bash
CAP_DEV_URL=http://<mac-ip>:3000 npx cap sync android    # Emulator: http://10.0.2.2:3000
DEV_ALLOWED_ORIGINS=<mac-ip> npm run dev
cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Die Debug-App heisst „CT Dev" und liegt neben der Release-App. Danach wieder
`npx cap sync android` ohne `CAP_DEV_URL`.

Emulator: `sdkmanager "emulator" "system-images;android-36;google_apis;arm64-v8a"`, AVD mit
`avdmanager create avd`, Start mit `emulator -avd <name> -gpu host`. Für den Sperrbildschirm
braucht das Gerät eine Sperre: `adb shell locksettings set-pin 1234`.

### Verhalten, das Android eigen ist

- Kamera und Dateiauswahl schicken die App kurz in den Hintergrund. Das sperrt NICHT (`MainActivity`
  merkt sich gestartete Activities-for-Result); auf iOS laufen diese Dialoge im Prozess.
- Der Zurück-Knopf bedient bei gesperrtem Bildschirm nicht die WebView dahinter.
- WebViews unter Chromium 140 zeichnen nicht unter die Systemleisten; Capacitor rückt die Seite
  dann ein, und die Lücke trägt den dunklen Fenstergrund aus `styles.xml`.
