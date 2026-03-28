"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface UserListItem {
  id: string;
  username: string;
  isLocked: boolean;
}

type Sheet = "closed" | "picking";

export default function AdminFAB() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const [sheet, setSheet] = useState<Sheet>("closed");
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const userIdFromPath = pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? null;

  function close() {
    setSheet("closed");
  }

  async function fetchUserList(): Promise<UserListItem[]> {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return [];
    return res.json();
  }

  const handleOpen = useCallback(async () => {
    if (userIdFromPath) {
      router.push(`/admin/users/${userIdFromPath}/aktionen`);
      return;
    }
    setLoading(true);
    if (!userList) {
      const list = await fetchUserList();
      setUserList(list);
    }
    setLoading(false);
    setSheet("picking");
  }, [userIdFromPath, userList, router]);

  function handleSelectUser(userId: string) {
    close();
    router.push(`/admin/users/${userId}/aktionen`);
  }

  return (
    <>
      {/* Backdrop */}
      {sheet !== "closed" && (
        <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={close} />
      )}

      {/* Bottom Sheet */}
      {sheet !== "closed" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-surface rounded-t-2xl border-t border-border shadow-xl pb-safe">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground">
              {sheet === "picking" && t("selectUser")}
            </h2>
            <button onClick={close} className="text-foreground-faint hover:text-foreground-muted transition p-1">
              <X size={18} />
            </button>
          </div>

          {sheet === "picking" && (
            <div className="overflow-y-auto max-h-72 divide-y divide-border-subtle px-2 pb-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-foreground-faint" />
                </div>
              )}
              {!loading && userList?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u.id)}
                  className="w-full flex items-center justify-between px-3 py-3 hover:bg-surface-raised transition rounded-xl text-left"
                >
                  <span className="text-sm font-medium text-foreground">{u.username}</span>
                  <div className="flex items-center gap-2">
                    {u.isLocked && <span className="text-xs text-lock font-medium">{t("locked")}</span>}
                    <ChevronRight size={16} className="text-foreground-faint" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav Tab Button */}
      <button
        onClick={sheet === "closed" ? handleOpen : close}
        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full text-nav-inactive-text hover:text-foreground-muted"
        aria-label={sheet === "closed" ? t("aktionen") : tc("close")}
      >
        {loading && sheet === "closed"
          ? <Loader2 size={22} className="animate-spin" />
          : sheet !== "closed"
            ? <X size={22} strokeWidth={1.75} />
            : <Plus size={22} strokeWidth={1.75} />
        }
        <span className="text-[10px] font-medium">Neu</span>
      </button>
    </>
  );
}
