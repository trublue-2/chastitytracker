"use client";

import { useSyncExternalStore } from "react";
import { getConnectionStalled, getConnectionStalledServer, subscribeConnection } from "@/lib/connectionHealth";

/**
 * Ob die Verbindung gerade stockt — der EINE Lesezugang zu `connectionHealth`.
 *
 * Ohne ihn schreibt jeder Abnehmer denselben dreiarmigen `useSyncExternalStore`-Aufruf samt
 * Server-Schnappschuss ab; der zweite gab es sofort (Anzeigezeile und (+)-Blatt). Derselbe Schnitt
 * wie bei `useLiveHours`: der Zustand wohnt rahmenlos in `lib/`, weil ihn auch `apiClient` speist,
 * und React sieht ihn nur durch diesen Hook.
 */
export default function useConnectionStalled(): boolean {
  return useSyncExternalStore(subscribeConnection, getConnectionStalled, getConnectionStalledServer);
}
