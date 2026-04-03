"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import Spinner from "./Spinner";

interface UserListItem {
  id: string;
  username: string;
  isLocked: boolean;
}

export default function AdminFAB() {
  const t = useTranslations("adminNav");
  const tAdmin = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const userIdFromPath = pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? null;

  const handleOpen = useCallback(async () => {
    if (userIdFromPath) {
      router.push(`/admin/users/${userIdFromPath}/aktionen`);
      return;
    }
    setLoading(true);
    if (!userList) {
      const res = await fetch("/api/admin/users");
      const list = res.ok ? await res.json() : [];
      setUserList(list);
    }
    setLoading(false);
    setOpen(true);
  }, [userIdFromPath, userList, router]);

  return (
    <>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("selectUser")}>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {userList?.map((u) => (
              <button
                key={u.id}
                onClick={() => { setOpen(false); router.push(`/admin/users/${u.id}/aktionen`); }}
                className="w-full flex items-center justify-between px-3 py-3 hover:bg-surface-raised transition rounded-xl text-left"
              >
                <span className="text-sm font-medium text-foreground">{u.username}</span>
                <div className="flex items-center gap-2">
                  {u.isLocked && <span className="text-xs text-lock font-medium">{tAdmin("locked")}</span>}
                  <ChevronRight size={16} className="text-foreground-faint" />
                </div>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors h-full text-nav-inactive-text hover:text-nav-inactive-hover"
        aria-label={open ? t("new") : t("selectUser")}
      >
        {loading
          ? <Spinner size="sm" />
          : open
            ? <X size={22} strokeWidth={1.75} />
            : <Plus size={22} strokeWidth={1.75} />
        }
        <span className="text-[10px] font-medium">{t("new")}</span>
      </button>
    </>
  );
}
