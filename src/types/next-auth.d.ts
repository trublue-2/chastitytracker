import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      // Setzt der Session-Callback aus dem Token (`auth.ts`). Hier deklariert, weil das sonst
      // niemand SIEHT: Leser wie `ownTrackerHidden()` prüfen das Feld strukturell und würden
      // stillschweigend „nicht gesetzt" lesen, wenn der Callback es je nicht mehr mitgibt.
      controlsSubs?: boolean;
      timezone?: string;
      locale?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    roleCheckedAt?: number;
    controlsSubs?: boolean;
    timezone?: string;
    locale?: string;
  }
}
