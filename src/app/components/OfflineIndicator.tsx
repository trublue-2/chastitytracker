"use client";

import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { getQueueCount } from "@/lib/idb";

/**
 * OfflineIndicator — shows a small banner when offline or when
 * there are pending mutations in the offline queue.
 *
 * Renders at the top of the dashboard content area.
 */
export default function OfflineIndicator({ isSyncing }: { isSyncing?: boolean }) {
  const t = useTranslations("offline");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Poll queue count periodically
  useEffect(() => {
    function updateCount() {
      getQueueCount().then(setPendingCount).catch(() => {});
    }
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Nothing to show if online and no pending items
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        !isOnline
          ? "bg-warn-bg border border-warn-border text-warn-text"
          : "bg-lock-bg border border-lock-border text-lock-text"
      }`}
      role="status"
      aria-live="polite"
    >
      {!isOnline ? (
        <>
          <WifiOff size={16} className="flex-shrink-0" />
          <span>{t("youAreOffline")}</span>
        </>
      ) : isSyncing ? (
        <>
          <Loader2 size={16} className="flex-shrink-0 animate-spin" />
          <span>{t("syncing")}</span>
        </>
      ) : (
        <>
          <CloudUpload size={16} className="flex-shrink-0" />
          <span>{t("pendingEntries", { count: pendingCount })}</span>
        </>
      )}
    </div>
  );
}
