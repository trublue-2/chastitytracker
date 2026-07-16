"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, Droplets, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";
import { boxIsPhysicallyLocked, boxIstLabel, boxJumpHref } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import useToast from "@/app/hooks/useToast";

export interface NewEntryCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Set when an active wear-session exists in this category. Null otherwise. */
  activeDeviceName: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  isLocked: boolean;
  /** Non-KG categories with their active-session state. Empty/undefined when feature flag is off. */
  categoryRows?: NewEntryCategoryRow[];
  /** Bildersafe-Instanz: „Schlüsselbox-Code versiegeln"-Aktion (während verschlossen) anzeigen. */
  bildersafe?: boolean;
}

export default function NewEntrySheet({ open, onClose, isLocked, categoryRows = [], bildersafe = false }: Props) {
  const t = useTranslations("newEntry");
  const tw = useTranslations("wearForm");
  const tBox = useTranslations("boxStatus");
  const router = useRouter();

  // Box-Status, nur solange das (+)-Menü offen ist — die Box folgt den Verschluss-/Öffnen-
  // Einträgen. EINE Ausnahme: steht die Box offen, während die Session läuft (z.B. Sperrzeit
  // abgelaufen, Öffnung vollzogen/scharfgestellt), gibt es keinen Eintrag, der sie wieder
  // schliesst — dann wird die Zeile zur Reparatur-Aktion (Schliessbefehl neu setzen).
  const { boxes } = useBoxStatus(open);
  const toast = useToast();
  const apiError = useApiError();
  const [relocking, setRelocking] = useState(false);

  async function relockBox() {
    if (relocking) return;
    setRelocking(true);
    try {
      const res = await fetch("/api/box/relock", { method: "POST" });
      if (!res.ok) {
        toast.error(apiError(await parseApiErrorCode(res)));
        return;
      }
      // Präsenz-Guard der Box: der Riegel fährt erst zu, wenn jemand am Gerät ist.
      toast.success(tBox("relockSent"));
      onClose();
    } catch {
      toast.error(apiError(null));
    } finally {
      setRelocking(false);
    }
  }

  const options = [
    {
      type: "verschluss",
      icon: Lock,
      label: t("lock"),
      desc: t("lockSubtitle"),
      disabled: isLocked,
      disabledText: t("lockDisabled"),
      color: "text-lock",
      href: "/dashboard/new/verschluss",
    },
    {
      type: "oeffnen",
      icon: LockOpen,
      label: t("open"),
      desc: t("openSubtitle"),
      disabled: !isLocked,
      disabledText: t("openDisabled"),
      color: "text-unlock",
      href: "/dashboard/new/oeffnen",
    },
    {
      type: "pruefung",
      icon: ClipboardCheck,
      label: t("inspection"),
      desc: t("inspectionSubtitle"),
      disabled: false,
      color: "text-inspect",
      href: "/dashboard/new/pruefung",
    },
    {
      type: "orgasmus",
      icon: Droplets,
      label: t("orgasm"),
      desc: t("orgasmSubtitle"),
      disabled: false,
      color: "text-orgasm",
      href: "/dashboard/new/orgasmus",
    },
  ];

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          if (opt.disabled) {
            return (
              <div
                key={opt.type}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl opacity-40 cursor-not-allowed"
              >
                <Icon size={22} className="text-foreground-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-foreground-faint">{opt.disabledText ?? opt.desc}</p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => handleSelect(opt.href)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <Icon size={22} className={`${opt.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-foreground-muted">{opt.desc}</p>
              </div>
            </button>
          );
        })}

        {/* Per-Category wear actions (begin or end based on state). */}
        {categoryRows.map((c) => {
          const active = c.activeDeviceName !== null;
          const href = active
            ? `/dashboard/new/wear-end?category=${c.id}`
            : `/dashboard/new/wear-begin?category=${c.id}`;
          const desc = active
            ? `${tw("endShort")} · ${c.activeDeviceName}`
            : tw("titleBegin");
          const style = categoryStyle(c.color);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(href)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <span
                className="size-7 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: style.backgroundColor, color: style.color }}
                aria-hidden
              >
                <CategoryIconRender name={c.icon} className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-foreground-muted truncate">{desc}</p>
              </div>
            </button>
          );
        })}

        {/* Bildersafe: Schlüsselbox-Code (neu) versiegeln — nur während verschlossen (hängt am
            aktuellen Verschluss; deckt das Neu-Versiegeln nach einer Reinigungsöffnung ab). */}
        {bildersafe && isLocked && (
          <>
            <button
              type="button"
              onClick={() => handleSelect("/dashboard/new/bildersafe")}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <KeyRound size={22} className="text-lock shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t("bildersafeAction")}</p>
                <p className="text-xs text-foreground-muted">{t("bildersafeActionDesc")}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleSelect("/dashboard/new/bildersafe/anzeigen")}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <LockOpen size={22} className="text-unlock shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t("bildersafeShowAction")}</p>
                <p className="text-xs text-foreground-muted">{t("bildersafeShowActionDesc")}</p>
              </div>
            </button>
          </>
        )}

        {/* Heimdall-Box(en): Status-Anzeige + Sprung in den passenden Flow. Die Box folgt den
            Verschluss-/Öffnen-Einträgen — keine Direkt-Kommandos (Notfall-Öffnen bleibt in Heimdall).
            AUSNAHME Reparatur: Box offen + Session läuft → kein Eintrag kann sie schliessen (das
            Verschluss-Formular lehnt bei laufender Session ab) → Schliessbefehl direkt neu setzen. */}
        {boxes.map((b) => {
          const istLocked = boxIsPhysicallyLocked(b);
          // SOLL offen, aber Session läuft → kein Eintrag kann schliessen: Befehl neu setzen.
          const needsRelock = !b.locked && isLocked;
          // SOLL zu, steht aber offen → die Box wartet aufs Präsenz-Fenster; hier gibt es
          // nichts zu tippen ausser dem Knopf AM GERÄT — reine Info, keine Navigation.
          const awaitingLock = b.locked && istLocked === false;
          const subtitle = needsRelock
            ? tBox("relockAction")
            : awaitingLock
              ? tBox("awaitingLockAtDevice")
              : b.locked
                ? tBox("jumpOpen")
                : tBox("jumpLock");
          const row = (
            <>
              <KeyRound size={22} className={`${istLocked ? "text-lock" : "text-unlock"} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{b.name}</p>
                <p className="text-xs text-foreground-muted">{boxIstLabel(b, tBox)} · {subtitle}</p>
              </div>
            </>
          );
          if (awaitingLock) {
            return (
              <div key={b.boxId} className="flex items-center gap-4 px-4 py-3.5 rounded-xl">
                {row}
              </div>
            );
          }
          return (
            <button
              key={b.boxId}
              type="button"
              disabled={needsRelock && relocking}
              onClick={() => (needsRelock ? relockBox() : handleSelect(boxJumpHref(b)))}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full disabled:opacity-50"
            >
              {row}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
