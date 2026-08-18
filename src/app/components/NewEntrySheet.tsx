"use client";

import { useRouter } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, Droplets, KeyRound, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle, wearActionHref } from "@/lib/categoryConstants";
import { entryFormBase, inspectionHref } from "@/lib/entryFormRoute";

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
  /** Bildersafe-Instanz: die Schlüsselbox-Code-Aktionen (versiegeln + anzeigen) einblenden. */
  bildersafe?: boolean;
  /** Gesetzt = Keyholder-Sicht: das Sheet erfasst FÜR diesen Sub und zeigt auf dessen
   *  Aktionen-Formulare statt auf `/dashboard/new`. Ungesetzt = der Sub erfasst für sich selbst. */
  adminUserId?: string;
}

/** Eine anwählbare Zeile des Sheets. Zeilen-Layout und Hover-Verhalten stehen NUR hier — die
 *  `options`-Liste und die Bildersafe-Zeilen teilen sie sich, damit eine Abstands- oder
 *  Fokus-Änderung nicht drei Kopien treffen muss. */
function SheetActionRow({
  icon: Icon,
  iconClass,
  label,
  desc,
  onSelect,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  desc: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
    >
      <Icon size={22} className={`${iconClass} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-foreground-muted">{desc}</p>
      </div>
    </button>
  );
}

export default function NewEntrySheet({ open, onClose, isLocked, categoryRows = [], bildersafe = false, adminUserId }: Props) {
  const t = useTranslations("newEntry");
  const tw = useTranslations("wearForm");
  const router = useRouter();
  const base = entryFormBase(adminUserId);

  const options = [
    {
      type: "verschluss",
      icon: Lock,
      label: t("lock"),
      desc: t("lockSubtitle"),
      disabled: isLocked,
      disabledText: t("lockDisabled"),
      color: "text-lock",
      href: `${base}/verschluss`,
    },
    {
      type: "oeffnen",
      icon: LockOpen,
      label: t("open"),
      desc: t("openSubtitle"),
      disabled: !isLocked,
      disabledText: t("openDisabled"),
      color: "text-unlock",
      href: `${base}/oeffnen`,
    },
    {
      type: "pruefung",
      icon: ClipboardCheck,
      label: t("inspection"),
      desc: t("inspectionSubtitle"),
      disabled: false,
      color: "text-inspect",
      href: inspectionHref(null, { adminUserId }),
    },
    {
      type: "orgasmus",
      icon: Droplets,
      label: t("orgasm"),
      desc: t("orgasmSubtitle"),
      disabled: false,
      color: "text-orgasm",
      href: `${base}/orgasmus`,
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
            <SheetActionRow
              key={opt.type}
              icon={Icon}
              iconClass={opt.color}
              label={opt.label}
              desc={opt.desc}
              onSelect={() => handleSelect(opt.href)}
            />
          );
        })}

        {/* Per-Category wear actions (begin or end based on state). */}
        {categoryRows.map((c) => {
          const active = c.activeDeviceName !== null;
          const href = wearActionHref({ categoryId: c.id, active, adminUserId });
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

        {/* Bildersafe — beide Zeilen NICHT in der Keyholder-Sicht: unter `/admin/users/<id>/…`
            gibt es weder Versiegelungs- noch Anzeige-Seite, die Einträge führten dort ins Leere.
            Versiegeln ist ohnehin eine Handlung des Subs (er allein hat den Code vor sich), und
            der Keyholder erreicht das Foto über die Session-Timeline. */}
        {bildersafe && !adminUserId && (
          <>
            {/* Versiegeln nur während verschlossen: es hängt am aktuellen Verschluss und deckt
                damit auch das Neu-Versiegeln nach einer Reinigungsöffnung ab. */}
            {isLocked && (
              <SheetActionRow
                icon={KeyRound}
                iconClass="text-lock"
                label={t("bildersafeAction")}
                desc={t("bildersafeActionDesc")}
                onSelect={() => handleSelect(`${base}/bildersafe`)}
              />
            )}
            {/* Anzeigen bewusst OHNE `isLocked` — sonst ist der eigene Code nach dem Erfassen des
                Aufschlusses unerreichbar (Lockout, issue #53). */}
            <SheetActionRow
              icon={LockOpen}
              iconClass="text-unlock"
              label={t("bildersafeShowAction")}
              desc={t("bildersafeShowActionDesc")}
              onSelect={() => handleSelect(`${base}/bildersafe/anzeigen`)}
            />
          </>
        )}

        {/* Bewusst KEINE Box-Zeile mehr: „Neu erfassen" erfasst Einträge, die Box folgt ihnen.
            Box-Status + Sonderzustände wohnen auf der BoxStatusCard (Dashboard); das
            Notfall-Öffnen/Verschliessen bleibt in Heimdall. */}
      </div>
    </Sheet>
  );
}
