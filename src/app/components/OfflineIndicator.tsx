"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WifiOff, CloudUpload, Loader2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { getQueueCount } from "@/lib/idb";
import useConnectionStalled from "@/app/hooks/useConnectionStalled";
import PoorConnectionNote from "@/app/components/PoorConnectionNote";

/** Ob der Browser überhaupt eine Netzwerk-Schnittstelle sieht — als externer Store statt als
 *  Effekt-plus-Zustand. `false` ist zuverlässig, `true` sagt nichts über den Durchsatz; genau
 *  deshalb steht `useConnectionStalled` daneben. */
function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const getOnline = () => navigator.onLine;
/** Serverseitig gibt es kein Netz-Urteil; „online" hält das erste Client-Bild deckungsgleich. */
const getOnlineServer = () => true;

/** Die Zustände in ihrer RANGFOLGE — die Reihenfolge der Schlüssel ist die Entscheidung. */
const NOTICES: Record<"offline" | "syncing" | "pending", { icon: LucideIcon; warn: boolean; spin?: boolean }> = {
  offline: { icon: WifiOff, warn: true },
  syncing: { icon: Loader2, warn: false, spin: true },
  pending: { icon: CloudUpload, warn: false },
};

/**
 * Die Zustandszeile über dem Dashboard: kein Netz, stockende Leitung, oder Einträge, die warten.
 *
 * **Vier Zustände, nicht zwei.** Lange kannte diese Zeile nur „online" und „offline", und beides
 * entschied `navigator.onLine`. Der steht bei einem Balken Empfang auf `true` — also blieb die
 * Zeile genau in dem Fall stumm, in dem der Nutzer eine Erklärung gebraucht hätte: die App tat
 * nichts, und nichts sagte ihm warum (gemeldet 28.08.2026). „Verbindung stockt" ist deshalb keine
 * Verfeinerung von „offline", sondern der Zustand, der in der Praxis überwiegt.
 */
export default function OfflineIndicator({ isSyncing }: { isSyncing?: boolean }) {
  const t = useTranslations("offline");
  const isOnline = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  const stalled = useConnectionStalled();
  const [pendingCount, setPendingCount] = useState(0);

  // Poll queue count periodically
  useEffect(() => {
    function updateCount() {
      getQueueCount().then(setPendingCount).catch(() => {});
    }
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Die Rangfolge steht EINMAL da. Vorher entschied sie dreimal parallel — in der Null-Rückgabe, im
  // Farbton und in der JSX-Kaskade —, und eine neue Stufe musste an allen dreien richtig einsortiert
  // werden.
  if (!isOnline) return <Notice kind="offline" text={t("youAreOffline")} />;
  // Die stockende Leitung hat ihr eigenes Bauteil, weil das (+)-Blatt denselben Satz zeigt.
  if (stalled) return <PoorConnectionNote />;
  if (isSyncing) return <Notice kind="syncing" text={t("syncing")} />;
  if (pendingCount > 0) return <Notice kind="pending" text={t("pendingEntries", { count: pendingCount })} />;
  return null;
}

function Notice({ kind, text }: { kind: keyof typeof NOTICES; text: string }) {
  const { icon: Icon, warn, spin } = NOTICES[kind];
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        warn
          ? "bg-warn-bg border border-warn-border text-warn-text"
          : "bg-lock-bg border border-lock-border text-lock-text"
      }`}
      role="status"
      aria-live="polite"
    >
      <Icon size={16} className={`flex-shrink-0 ${spin ? "animate-spin" : ""}`} aria-hidden />
      <span>{text}</span>
    </div>
  );
}
