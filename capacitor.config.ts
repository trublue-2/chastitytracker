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
  },
};

export default config;
