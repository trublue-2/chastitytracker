# Capacitor Integration Plan – Chastity Tracker

## Projekt

- **Website:** https://www.chastitytracker.ch
- **GitHub:** https://github.com/trublue-2/chastitytracker
- **Stack:** Next.js, PWA, Self-hosted
- **Sprachen:** Deutsch & Englisch

## Ziel

Die bestehende PWA soll mit Capacitor als native iOS- und Android-App verpackt werden.
Die Web-Entwicklung soll parallel weiterlaufen – ein Codebase für PWA + iOS + Android.

### Hauptmotivation

Die PWA-Push-Notifications (insb. auf iOS) sind unzuverlässig:

- Verzögerte oder fehlende Zustellung
- Kein Badge-Count
- Kein Silent Push / Background Updates
- iOS killt PWA-Prozesse aggressiv

→ Native Push Notifications (APNs für iOS, FCM für Android) über Capacitor lösen das.

## Distributionsstrategie

**Kein App Store Release** – wegen Adult-Content-Risiko (BDSM/D/s-Kontext).

Stattdessen:

- **iOS:** TestFlight (öffentlicher Link, bis 10'000 Tester, Beta-Review ist lockerer)
- **Android:** Direkte APK/AAB-Distribution über die Website

## Scope

### Phase 1: Capacitor Setup

- [ ] Capacitor zum bestehenden Next.js-Projekt hinzufügen
- [ ] `capacitor.config.ts` konfigurieren
- [ ] iOS- und Android-Projekte generieren (`npx cap add ios`, `npx cap add android`)
- [ ] Build-Workflow einrichten: `next build` → `npx cap sync`
- [ ] Verifizieren, dass die App in iOS-Simulator und Android-Emulator läuft

### Phase 2: Native Push Notifications

- [ ] Capacitor Push Notifications Plugin installieren (`@capacitor/push-notifications`)
- [ ] iOS: APNs-Konfiguration vorbereiten (Capability in Xcode, Key im Apple Developer Portal)
- [ ] Android: Firebase Cloud Messaging (FCM) einrichten
- [ ] Bestehende Web-Push-Logik um native Push erweitern (Conditional: Web Push vs. Native Push)
- [ ] Badge-Count implementieren (iOS)
- [ ] Silent Push für Background-Updates evaluieren

### Phase 3: Weitere native Features (optional)

- [ ] Kamera-Plugin für Foto-Verifizierung (`@capacitor/camera`) – evtl. bessere UX als Web-API
- [ ] Haptic Feedback bei Aktionen (`@capacitor/haptics`)
- [ ] Biometrische Authentifizierung (Face ID / Touch ID) als Option
- [ ] App Icon & Splash Screen konfigurieren

### Phase 4: Build-Automatisierung

- [ ] Fastlane einrichten für iOS (automatisches Signing, Build, TestFlight-Upload)
- [ ] Fastlane-Lane `fastlane beta` → Build + Upload + Tester benachrichtigen
- [ ] Android: Gradle-basierter APK-Build automatisieren
- [ ] Dokumentation für den 90-Tage-TestFlight-Refresh-Cycle

## Wichtige Hinweise

- **Parallele Entwicklung:** Der Web-Code bleibt die Single Source of Truth. Capacitor wrappst nur den Build-Output. Kein separater nativer Code nötig, ausser für Plugins.
- **Plattform-Detection:** `Capacitor.isNativePlatform()` nutzen, um zwischen Web und Native zu unterscheiden (z.B. für Push-Logik).
- **Apple Developer Account:** Wird benötigt (99 USD/Jahr). Certificates und Provisioning Profiles muss der Entwickler manuell im Apple Developer Portal erstellen.
- **TestFlight Beta-Review:** Deutlich lockerer als App Store Review. Die App zeigt keine expliziten Inhalte, daher geringes Ablehnungsrisiko.

## Erste Schritte für Claude Code

1. Repository klonen und Projektstruktur analysieren
2. Prüfen, welche Next.js-Version und welcher Build-Output verwendet wird (Static Export nötig für Capacitor)
3. Capacitor Dependencies installieren
4. Config erstellen und iOS/Android Projekte generieren
5. Ersten Test-Build im Simulator laufen lassen
