import type { CapacitorConfig } from "@capacitor/cli";

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
