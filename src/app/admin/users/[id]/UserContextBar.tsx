"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "@/app/components/Sheet";
import TimerDisplay from "@/app/components/TimerDisplay";
import LockPeriodRemaining from "@/app/components/LockPeriodRemaining";
import UserAvatar from "@/app/components/UserAvatar";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

interface UserEntry {
  id: string;
  username: string;
  /** `undefined` heisst „noch kein Eintrag" — nicht „offen". Siehe `UserAvatar`. */
  isLocked?: boolean;
}

interface Props {
  userId: string;
  username: string;
  currentStatus: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null; // ISO string
  /** Ende der laufenden befristeten Sperrzeit (ISO) — dann zeigt die Leiste die RESTZEIT (#10)
   *  statt der Zeit seit dem Verschluss. `null` = keine/unbefristete Sperrzeit → Zeit seit Verschluss. */
  lockEndsAt: string | null;
  users: UserEntry[];
  isGlobalAdmin: boolean;
}

export default function UserContextBar({ userId, username, currentStatus, since, lockEndsAt, users, isGlobalAdmin }: Props) {
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
      <div className="sticky z-20 bg-surface border-b border-border px-4 h-[52px] flex items-center gap-3" style={{ top: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}>
        {isGlobalAdmin && (
          <>
            <Link
              href="/admin"
              className="flex items-center gap-1 text-foreground-faint hover:text-foreground-muted transition-colors text-sm flex-shrink-0 min-h-12 min-w-12 justify-center sm:justify-start sm:min-w-0"
            >
              <ChevronLeft size={18} strokeWidth={2} />
              <span className="hidden sm:inline">{t("allUsers")}</span>
            </Link>

            <div className="w-px h-4 bg-border flex-shrink-0" />
          </>
        )}

        {/* User + status */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {/* Die EINE Ebene-1-Überschrift dieses ganzen Bereichs.
              
              Sie steht hier, weil dieses Bauteil im Layout hängt und damit auf allen ~25
              Unterseiten erscheint — vorher hatte keine davon eine Wurzel, die
              Überschriften-Navigation begann mitten im Inhalt. Der Name des Trägers ist auch das
              richtige Thema: die Unterseiten sind seine Reiter, nicht eigene Bildschirme.

              Daraus folgt die Regel für alles, was DARUNTER rendert: die Aktions-Hülle, die
              Auswertung und die Geräte-Seiten schreiben in diesem Bereich `h2` statt `h1` — sonst
              hätte die Seite zwei Wurzeln. Dieselben Bauteile schreiben im Träger-Bereich weiterhin
              `h1`, weil sie dort selbst die Landmarke aufspannen.

              Die Klassen bleiben unverändert — das Aussehen ändert sich nicht. */}
          <h1 className="font-bold text-foreground text-sm truncate">{username}</h1>
          {/* Grün verschlossen, Rosa offen — das PAAR ist die Aussage. Hier stand für „offen"
              vorher Grau; die Keyholderin sieht mehrere Träger nebeneinander, und Grau liesse
              offen, ob da niemand verschlossen ist oder nur niemand nachgesehen hat. Ihre eigene
              Welt bleibt davon unberührt: sie ist immer Indigo, der Zustand ist Akzent, nie Fläche. */}
          <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${isLocked ? "text-lock" : "text-unlock"}`}>
            {isLocked
              /* `format="long"`, nicht `short`: `short` faltet die Tage in die Stunden (siehe
                 `formatShort` in `TimerDisplay`), und die Keyholderin las hier `105:43:09`, während
                 jede andere Stelle der App `4T 9h 43min` schreibt. Eine Oberfläche, die dieselbe
                 Dauer in zwei Sprachen nennt, zwingt zum Kopfrechnen.

                 Monoschrift und Zustandsfarbe sind mit weg: `TimerDisplay` setzte beides fest, obwohl
                 die Farbe beim Hochzählen nichts bedeutet. Die umgebende Zeile trägt die
                 Zustandsfarbe ohnehin — dort steht sie richtig, weil sie am Schloss-Zeichen hängt
                 und nicht an der Zahl. */
              /* Läuft eine befristete Sperrzeit, ist die RESTZEIT die Zahl, die die Keyholderin
                 braucht (#10) — sie steht sonst nur weiter unten in der Session-Karte. Ohne
                 befristete Sperrzeit bleibt es bei der Zeit SEIT dem Verschluss. */
              ? <><LockClosedIcon size={11} strokeWidth={2} />{
                  lockEndsAt
                    ? <LockPeriodRemaining endsAt={lockEndsAt} className="font-semibold" />
                    : since && <TimerDisplay targetDate={since} mode="countup" format="long" className="font-semibold" />
                }</>
              : currentStatus
                ? <><LockOpenIcon size={11} strokeWidth={2} /> {t("opened")}</>
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
              <UserAvatar username={u.username} size="sm" locked={u.isLocked} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${u.id === userId ? "text-foreground" : "text-foreground-muted"}`}>
                  {u.username}
                </p>
              </div>
              {/* Drei Ausgänge: verschlossen, offen — und „noch nichts vorliegend", das gar kein
                  Schloss-Zeichen bekommt. Ein rosa offenes Schloss an einem frisch angelegten Konto
                  behauptete, jemand hätte aufgeschlossen. */}
              {u.isLocked === undefined
                ? null
                : u.isLocked
                  ? <LockClosedIcon size={14} strokeWidth={1.75} className="text-lock flex-shrink-0" />
                  : <LockOpenIcon size={14} strokeWidth={1.75} className="text-unlock flex-shrink-0" />
              }
              {u.id === userId && (
                <span className="text-neben text-foreground-faint flex-shrink-0">{t("active")}</span>
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
