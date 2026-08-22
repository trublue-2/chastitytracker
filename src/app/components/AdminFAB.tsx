"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import NewEntrySheet, { type NewEntryCategoryRow } from "./NewEntrySheet";

interface UserListItem {
  id: string;
  username: string;
  isLocked: boolean;
}

interface Props {
  isGlobalAdmin: boolean;
}

export default function AdminFAB({ isGlobalAdmin }: Props) {
  const t = useTranslations("adminNav");
  const tAdmin = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Zustand des betrachteten Subs für sein „Neu erfassen"-Sheet. Bewusst bei JEDEM Öffnen frisch
  // geholt statt gecacht: zwischen zwei Klicks kann sich der Verschluss-Zustand geändert haben, und
  // ein veraltetes `isLocked` würde die falsche Zeile ausgrauen (Verschluss statt Öffnen).
  // Nicht-nullable: `handleOpen` setzt ihn auf jedem Pfad — auch im catch — bevor `open` wahr wird.
  const [subState, setSubState] = useState<{ isLocked: boolean; categoryRows: NewEntryCategoryRow[]; weightTracking: boolean }>(
    { isLocked: false, categoryRows: [], weightTracking: false },
  );

  const userIdFromPath = pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? null;

  const handleOpen = useCallback(async () => {
    setLoading(true);
    // In der Sub-Ansicht führt der (+) direkt zur Erfassungs-Auswahl — dieselbe wie der Sub sie
    // sieht, nur auf seine Aktionen-Formulare gerichtet. Vorher landete man auf der Aktionen-Seite
    // und musste die Auswahl dort ein zweites Mal treffen.
    //
    // `try/finally`: ein abgelehnter fetch (offline, DNS) darf den Spinner nicht ewig drehen
    // lassen. Das Sheet geht in JEDEM Fall auf — die Auswahl selbst funktioniert auch ohne die
    // Zustandsdaten, sie ist dann nur nicht vorgefiltert (`isLocked: false`, keine Kategorien).
    try {
      if (userIdFromPath) {
        const res = await fetch(`/api/admin/users/${userIdFromPath}`);
        const data = res.ok ? await res.json() : null;
        setSubState({ isLocked: !!data?.isLocked, categoryRows: data?.categoryRows ?? [], weightTracking: !!data?.weightTracking });
      } else if (!userList) {
        const res = await fetch("/api/admin/users");
        setUserList(res.ok ? await res.json() : []);
      }
    } catch {
      // Netzfehler: mit dem Vorgabe-Zustand weitermachen statt hängen zu bleiben.
      if (userIdFromPath) setSubState({ isLocked: false, categoryRows: [], weightTracking: false });
      else setUserList([]);
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }, [userIdFromPath, userList]);

  // Without a user context the FAB opens a create picker fetching ALL users
  // (instance-level affordance). Keyholders only get the FAB on a user-detail
  // path, where it opens that sub's „Neu erfassen"-Auswahl directly.
  // NOTE: keep this AFTER all hooks — an early return above a hook changes the
  // hook count between renders (landing ↔ detail) and crashes React.
  if (!isGlobalAdmin && !userIdFromPath) return null;

  return (
    <>
      {userIdFromPath ? (
        <NewEntrySheet
          open={open}
          onClose={() => setOpen(false)}
          isLocked={subState.isLocked}
          categoryRows={subState.categoryRows}
          weight={subState.weightTracking}
          adminUserId={userIdFromPath}
        />
      ) : (
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
      )}

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
