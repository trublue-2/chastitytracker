"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ArrowLeftRight, Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "@/app/components/Sheet";
import TimerDisplay from "@/app/components/TimerDisplay";

interface UserEntry {
  id: string;
  username: string;
  isLocked: boolean;
}

interface Props {
  userId: string;
  username: string;
  currentStatus: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null; // ISO string
  users: UserEntry[];
}

export default function UserContextBar({ userId, username, currentStatus, since, users }: Props) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();
  const isLocked = currentStatus === "VERSCHLUSS";

  function handleUserSelect(id: string) {
    setSheetOpen(false);
    try { localStorage.setItem("lastSelectedUserId", id); } catch {}
    router.push(`/admin/users/${id}`);
  }

  return (
    <>
      {/* Context bar */}
      <div className="sticky top-14 z-20 bg-surface border-b border-border px-4 h-[52px] flex items-center gap-3">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-foreground-faint hover:text-foreground-muted transition-colors text-sm flex-shrink-0 min-h-12 min-w-12 justify-center sm:justify-start sm:min-w-0"
        >
          <ChevronLeft size={18} strokeWidth={2} />
          <span className="hidden sm:inline">{t("allUsers")}</span>
        </Link>

        <div className="w-px h-4 bg-border flex-shrink-0" />

        {/* User + status */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="font-bold text-foreground text-sm truncate">{username}</span>
          <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${isLocked ? "text-lock" : "text-foreground-faint"}`}>
            {isLocked
              ? <><Lock size={11} strokeWidth={2} />{since && <TimerDisplay targetDate={since} mode="countup" format="short" className="font-mono tabular-nums" />}</>
              : currentStatus
                ? <><LockOpen size={11} strokeWidth={2} /> {t("opened")}</>
                : <span className="text-foreground-faint">–</span>
            }
          </span>
        </div>

        {/* Switch button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground bg-surface-raised border border-border px-2.5 py-1.5 rounded-xl transition-colors flex-shrink-0"
        >
          <ArrowLeftRight size={12} strokeWidth={2} />
          <span className="hidden sm:inline">{t("switchUser")}</span>
          <span className="sm:hidden">{t("switchShort")}</span>
        </button>
      </div>

      {/* User switch sheet */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("switchUser")}>
        <p className="text-xs text-foreground-faint mb-3">{t("switchUserDesc")}</p>
        <div className="divide-y divide-border-subtle">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handleUserSelect(u.id)}
              className={`w-full flex items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-raised rounded-xl ${
                u.id === userId ? "bg-surface-raised" : ""
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                u.isLocked ? "bg-lock-bg text-lock" : "bg-surface-raised text-foreground-muted"
              }`}>
                {u.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${u.id === userId ? "text-foreground" : "text-foreground-muted"}`}>
                  {u.username}
                </p>
              </div>
              {u.isLocked
                ? <Lock size={14} strokeWidth={1.75} className="text-lock flex-shrink-0" />
                : <LockOpen size={14} strokeWidth={1.75} className="text-foreground-faint flex-shrink-0" />
              }
              {u.id === userId && (
                <span className="text-xs text-foreground-faint bg-surface border border-border px-2 py-0.5 rounded-full flex-shrink-0">{t("active")}</span>
              )}
            </button>
          ))}
        </div>
        <div className="pt-3 mt-3 border-t border-border-subtle">
          <button
            onClick={() => setSheetOpen(false)}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-foreground-muted hover:bg-surface-raised transition-colors"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </Sheet>
    </>
  );
}
