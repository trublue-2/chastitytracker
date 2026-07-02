import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // isLocked wird im DashboardLayout server-seitig gerendert.
    // Caching würde nach Lock/Unlock-Aktionen veraltete Zustände zeigen — daher deaktiviert.
    staleTimes: { dynamic: 0 },
  },
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["@simplewebauthn/server"],
  env: {
    BUILD_DATE: process.env.BUILD_DATE || "",
  },
  images: {
    remotePatterns: [],
  },
  async rewrites() {
    return [
      {
        // Apple requires this exact path for Associated Domains / Passkeys
        source: "/.well-known/apple-app-site-association",
        destination: "/api/apple-app-site-association",
      },
    ];
  },

  async headers() {
    return [
      {
        // Alle HTML-Seiten: kein Caching. `private` verbietet SHARED-Caches (vorgeschaltete
        // Reverse-Proxys/CDNs) das Speichern explizit — nicht nur dem Browser. Verhindert, dass
        // ein fehlkonfigurierter Cache die Seite eines Users an einen anderen ausliefert.
        // (Die spezifischeren Asset-Regeln unten überschreiben Cache-Control für /_next/static etc.)
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; worker-src 'self';" },
          // SW-Signatur: unterscheidet Next.js-Responses von Traefik-eigenen Fehlerseiten
          { key: "x-kg-app", value: "1" },
        ],
      },
      {
        // Authentifizierte, user-spezifische Flächen: erzwingt bei jedem konformen (Shared-)Cache
        // eine Trennung pro User (Cookie) UND pro Antwort-Typ (HTML vs. RSC-Navigations-Payload,
        // die über DIESELBE URL laufen). Ohne Vary würde ein nur nach Pfad keyender Cache die
        // Antworten zweier User als dasselbe Objekt behandeln → Cross-User-Leak. Bewusst NICHT auf
        // /(.*), damit das Caching der statischen Assets unten unberührt bleibt.
        // INVARIANTE: JEDER top-level Pfad, der pro User/Rolle unterschiedlichen Inhalt rendert,
        // MUSS hier gelistet sein (dashboard/admin = App, api = Datenendpunkte, oauth = rollen-
        // abhängige Consent-Seite /oauth/authorize). Neue solche Routen hier ergänzen.
        source: "/:scope(dashboard|admin|api|oauth)/:path*",
        headers: [
          { key: "Vary", value: "Cookie, RSC, Next-Router-Prefetch, Next-Router-State-Tree, Next-Url" },
        ],
      },
      {
        // Statische Assets (_next/static) dürfen gecacht werden
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Hochgeladene Fotos ebenfalls cachen
        source: "/uploads/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Service Worker darf nicht langfristig gecacht werden
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        // Offline-Fallback-Seite
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
