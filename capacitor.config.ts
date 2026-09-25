import type { CapacitorConfig } from "@capacitor/cli";

const devUrl = process.env.CAP_DEV_URL;

const config: CapacitorConfig = {
  appId: "ch.chastitytracker.app",
  appName: "ChastityTracker",
  webDir: "www",
  server: {
    // Allow the WebView to navigate to any of the three base domains.
    // After the user enters their instance URL in the shell, the WebView
    // follows the redirect and the Capacitor bridge remains active.
    allowNavigation: [
      "*.trublue.ch",
      "*.chastitytracker.ch",
      "*.chastity-tracker.com",
    ],
    androidScheme: "https",
    // NUR für lokale Entwickler-Läufe: `CAP_DEV_URL=http://<mac-ip>:3000 npx cap sync ios` lässt die
    // App direkt den Dev-Server laden (statt der Hülle, die nur https + die drei Basis-Domains
    // annimmt). Vor jedem Archive für TestFlight OHNE die Variable neu synchronisieren — sonst lädt
    // die ausgelieferte App einen Rechner, den es beim Nutzer nicht gibt. Vergessen bricht das
    // Release ab (Build-Schritt „Keine Dev-URL im Release" im Xcode-Projekt). `cleartext` gilt nur
    // für Android; auf iOS erlaubt `NSAllowsLocalNetworking` (Info.plist) das http im LAN.
    ...(devUrl ? { url: devUrl, cleartext: true } : {}),
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Badge: {
      // Das Plugin würde den zuletzt gesetzten Zähler beim Kaltstart von sich aus wiederherstellen
      // (`restore()`, Default `persist: true`). Genau das wollen wir nicht: die Zahl gehört dem
      // SERVER-Stand des angemeldeten Nutzers, und die App setzt sie beim Start ohnehin selbst
      // (AppBadgeSync). Mit `persist` bliebe nach einem Logout die Zahl des vorigen Nutzers stehen
      // und überlebte sogar Neustarts.
      persist: false,
    },
  },
};

export default config;
