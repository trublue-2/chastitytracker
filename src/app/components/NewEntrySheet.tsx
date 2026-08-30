"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import useGuardedNavigation from "@/app/hooks/useGuardedNavigation";
import { busyDimCls } from "@/app/components/inputStyles";
import Spinner from "@/app/components/Spinner";
import PoorConnectionNote from "@/app/components/PoorConnectionNote";
import Sheet from "./Sheet";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle, wearActionHref } from "@/lib/categoryConstants";
import { entryFormBase, inspectionHref } from "@/lib/entryFormRoute";
import { actionIcon } from "@/app/entries/actionSign";

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
  /** Wartet ein Verschluss-AUFRUF auf den Riegel (docs/riegel-konzept.md)? Dann ist „Verschluss"
   *  nicht wählbar — die Route lehnte einen zweiten mit `LOCK_ALREADY_PENDING` ab, und ein Weg, der
   *  in eine Absage führt, ist schlimmer als keiner. Nur die Träger-Sicht kennt den Fall. */
  lockCallPending?: boolean;
  /** Non-KG categories with their active-session state. Empty/undefined when feature flag is off. */
  categoryRows?: NewEntryCategoryRow[];
  /** Bildersafe-Instanz: die Schlüsselbox-Code-Aktionen (versiegeln + anzeigen) einblenden. */
  bildersafe?: boolean;
  /** Gewichtstracking für DIESEN Träger freigeschaltet (Instanz-Schalter UND Keyholder-Schalter). */
  weight?: boolean;
  /** Gesetzt = Keyholder-Sicht: das Sheet erfasst FÜR diesen Sub und zeigt auf dessen
   *  Aktionen-Formulare statt auf `/dashboard/new`. Ungesetzt = der Sub erfasst für sich selbst. */
  adminUserId?: string;
  /**
   * Die dringendste OFFENE Kontroll-Anforderung des Trägers, falls es eine gibt.
   *
   * Ohne sie führte die Kontroll-Zeile auf das nackte Formular, und das WÜRFELT einen Code. Der
   * Träger sah auf dem Dashboard „Kontrolle überfällig · Code 48219", tippte auf (+) → Kontrolle,
   * bekam 67984, schrieb den aufs Papier, fotografierte, speicherte — und die Anforderung lief
   * weiter in „zu spät". Er hatte genau das getan, was die App ihm angeboten hat.
   *
   * NUR auf dem Sub-Pfad. Erfasst die Keyholderin für ihren Träger, hakt das die Anforderung
   * ohnehin nicht ab (`entryFulfilment.ts`: die Kontroll-Anforderung erfüllt nur der Sub selbst) —
   * dort wäre ein vorbelegter Code ein falsches Versprechen.
   */
  openInspection?: { code: string | null; href: string } | null;
}

/** Das Zeilen-Mass — steht hier EINMAL, weil es die anwählbare und die gesperrte Zeile teilen. */
const ROW_CLS = "flex items-center gap-4 px-4 py-3.5 rounded-xl";

/**
 * Eine Zeile des Blatts. Layout, Hover und Laufzustand stehen NUR hier — die `options`-Liste, die
 * Kategorie-Zeilen, die Bildersafe-Zeilen UND die gesperrte Darstellung teilen sie sich.
 *
 * Die Farbe kommt als `tone` und wird von Zeichen und Ladezeichen gemeinsam benutzt. Vorher trug
 * der Aufrufer sie zweimal (im fertigen Knoten und in `spinnerCls`), und eine der fünf Stellen
 * hatte die zweite schon vergessen — dort wäre beim Warten die Bedeutung der Zeile umgesprungen.
 * `leading` gibt es nur noch für die Kategorien, die statt eines Strichzeichens ein eingefärbtes
 * Kästchen tragen.
 *
 * Die Zeile kennt ihr eigenes Ziel (`href`) und das gerade laufende (`navTarget`) — daraus leitet
 * sie ab, ob SIE unterwegs ist oder auf eine andere wartet. Als zwei Wahrheitswerte an fünf
 * Aufrufstellen wäre genau das die Sorte Zustand, die an einer davon vergessen wird.
 */
function SheetActionRow({
  icon: Icon,
  leading,
  tone = "text-foreground-muted",
  label,
  desc,
  href,
  navTarget,
  onSelect,
  disabled = false,
}: {
  icon?: LucideIcon;
  /** Nur für Zeichen, die kein Strich-Icon sind (Kategorie-Kachel). Schlägt `icon`. */
  leading?: ReactNode;
  /** Farbe von Zeichen UND Ladezeichen — die Zeile behält beim Warten ihre Bedeutung. */
  tone?: string;
  label: string;
  desc: string;
  href: string;
  /** Das Ziel, dessen Seite gerade geholt wird — `null`, wenn nichts läuft. */
  navTarget: string | null;
  onSelect: (href: string) => void;
  /** Die Aktion ist gerade nicht möglich (Verschluss bei geschlossenem KG und umgekehrt). */
  disabled?: boolean;
}) {
  const loading = navTarget === href;
  const zeichen = leading ?? (Icon ? <Icon size={22} className={`${tone} shrink-0`} /> : null);

  // Gesperrt heisst: kein Ziel, keine Trefferfläche, kein Knopf. Das war einmal ein eigener Block
  // 120 Zeilen weiter unten — mit demselben Zeilen-Mass, von Hand abgeschrieben.
  if (disabled) {
    return (
      <div className={`${ROW_CLS} opacity-40 cursor-not-allowed`}>
        {Icon && <Icon size={22} className="text-foreground-faint shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-foreground-faint">{desc}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(href)}
      // `aria-disabled` statt `disabled`: die getippte Zeile hält gerade den Fokus, und ein
      // `disabled` schöbe ihn an den Dokumentanfang. Die Schranke sitzt im Handler des Aufrufers.
      aria-disabled={navTarget !== null || undefined}
      className={`${ROW_CLS} hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full ${navTarget !== null && !loading ? busyDimCls : ""}`}
    >
      {loading ? <Spinner size="default" className={`${tone} shrink-0`} /> : zeichen}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {/* Bewusst OHNE `truncate`: die Kategorie-Zeilen hatten es, die übrigen nicht. Umbrechen
            verbirgt nie etwas, Abschneiden schon — und hinter einer dieser Zeilen steht der
            Kontroll-Code. */}
        <p className="text-xs text-foreground-muted">{desc}</p>
      </div>
    </button>
  );
}

export default function NewEntrySheet({ open, onClose, isLocked, lockCallPending = false, categoryRows = [], bildersafe = false, weight = false, adminUserId, openInspection }: Props) {
  const t = useTranslations("newEntry");
  const tw = useTranslations("wearForm");
  // Das Blatt schliesst erst, wenn die Seite wirklich gewechselt hat — nicht schon beim Tippen.
  const nav = useGuardedNavigation(onClose);
  const base = entryFormBase(adminUserId);

  const options = [
    {
      type: "verschluss",
      icon: actionIcon("VERSCHLUSS"),
      label: t("lock"),
      desc: t("lockSubtitle"),
      disabled: isLocked || lockCallPending,
      disabledText: lockCallPending ? t("lockPending") : t("lockDisabled"),
      color: "text-lock",
      href: `${base}/verschluss`,
    },
    {
      type: "oeffnen",
      icon: actionIcon("OEFFNEN"),
      label: t("open"),
      desc: t("openSubtitle"),
      disabled: !isLocked,
      disabledText: t("openDisabled"),
      color: "text-unlock",
      href: `${base}/oeffnen`,
    },
    {
      type: "pruefung",
      icon: actionIcon("PRUEFUNG"),
      label: t("inspection"),
      // Liegt eine Anforderung an, führt die Zeile DORTHIN und sagt es auch. Sonst wie bisher:
      // die freiwillige Selbstkontrolle mit frisch gewürfeltem Code.
      desc: openInspection
        ? (openInspection.code
            // Ohne Code-Pflicht trägt die Anforderung keine Zahl — dann nennt die Zeile sie eben
            // nicht, führt aber trotzdem dorthin. Der Weg ist das Wichtige, nicht die Ziffer.
            ? t("inspectionOpenSubtitle", { code: openInspection.code })
            : t("inspectionOpenPlain"))
        : t("inspectionSubtitle"),
      disabled: false,
      color: "text-inspect",
      href: openInspection?.href ?? inspectionHref(null, { adminUserId }),
    },
    {
      type: "orgasmus",
      icon: actionIcon("ORGASMUS"),
      label: t("orgasm"),
      desc: t("orgasmSubtitle"),
      disabled: false,
      color: "text-orgasm",
      href: `${base}/orgasmus`,
    },
  ];

  // Das Blatt bleibt gemountet, sein Zustand überlebt also das Schliessen. Ohne dieses Zurücksetzen
  // fände der Nutzer beim nächsten Öffnen die alte Warnung vor und alle Zeilen gedämpft — mit dem
  // „Erneut versuchen" eines Ziels, das er längst aufgegeben hat.
  useEffect(() => {
    if (!open) nav.reset();
  }, [open, nav.reset]);

  const handleSelect = useCallback((href: string) => {
    // Solange eine Seite unterwegs ist, nimmt das Blatt keinen zweiten Auftrag an — sonst stünden
    // zwei Ziele im Rennen und das gewinnende wäre Zufall.
    if (nav.pending) return;
    nav.go(href);
  }, [nav.pending, nav.go]);

  // Der Durchstich, den JEDE Zeile braucht. Einmal gebaut statt fünfmal getippt: die sechste Zeile
  // hätte ihn sonst vergessen und lautlos weder Ladezeichen noch Dämpfung bekommen.
  const rowNav = { navTarget: nav.target, onSelect: handleSelect };

  return (
    // `busy` nur, SOLANGE es läuft: das Blatt soll sich nicht unter der laufenden Navigation
    // wegklicken. Steht es fest, gibt es die Sperre wieder frei — sonst sässe der Nutzer in einem
    // Blatt, das sich nicht mehr schliessen lässt, und das wäre schlimmer als der Fehler selbst.
    <Sheet open={open} onClose={onClose} title={t("title")} busy={nav.pending}>
      {/* Der Inhalt entsteht nur im offenen Zustand. `Sheet` wirft ihn geschlossen ohnehin weg —
          aber zwei dieser Blätter hängen dauerhaft in jedem Dashboard-Layout (Seitenleiste und
          Fussleiste), und beide bauten bei JEDEM Render die ganze Zeilenliste samt Übersetzungen
          für niemanden. Nicht `return null` im Blatt selbst: dann verlöre `Sheet` seine
          Fokus-Rückgabe beim Schliessen. */}
      {open && (
      <div className="flex flex-col gap-2">
        {/* Die Auskunft, die vorher fehlte. Sie ersetzt die Zeilen nicht, sie steht über ihnen —
            der Nutzer soll sehen, WAS er getippt hat und dass es klemmt. */}
        {nav.stalled && <PoorConnectionNote onRetry={nav.retry} />}
        {options.map((opt) => (
          <SheetActionRow
            key={opt.type}
            {...rowNav}
            icon={opt.icon}
            tone={opt.color}
            label={opt.label}
            desc={opt.disabled ? (opt.disabledText ?? opt.desc) : opt.desc}
            href={opt.href}
            disabled={opt.disabled}
          />
        ))}

        {/* Per-Category wear actions (begin or end based on state). */}
        {categoryRows.map((c) => {
          const active = c.activeDeviceName !== null;
          const href = wearActionHref({ categoryId: c.id, active, adminUserId });
          const desc = active
            ? `${tw("endShort")} · ${c.activeDeviceName}`
            : tw("titleBegin");
          const style = categoryStyle(c.color);
          return (
            <SheetActionRow
              key={c.id}
              {...rowNav}
              leading={
                <span
                  className="size-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: style.backgroundColor, color: style.color }}
                  aria-hidden
                >
                  <CategoryIconRender name={c.icon} className="size-4" />
                </span>
              }
              label={c.name}
              desc={desc}
              href={href}
            />
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
                {...rowNav}
                icon={actionIcon("BILDERSAFE_SEAL")}
                tone="text-lock"
                label={t("bildersafeAction")}
                desc={t("bildersafeActionDesc")}
                href={`${base}/bildersafe`}
              />
            )}
            {/* Anzeigen bewusst OHNE `isLocked` — sonst ist der eigene Code nach dem Erfassen des
                Aufschlusses unerreichbar (Lockout, issue #53). */}
            {/* `Eye` und neutral, nicht das offene Schloss in der Zustandsfarbe: der Bildersafe hat
                mit dem Verschluss nichts zu tun. Diese Zeile trug dasselbe Zeichen und dieselbe
                Farbe wie „Verschluss öffnen" weiter oben im selben Blatt — solange das offene
                Schloss nichtssagend war, fiel es nicht auf; seit es deutlich ist, behauptet es
                „aufgeschlossen". */}
            <SheetActionRow
              {...rowNav}
              icon={actionIcon("BILDERSAFE_SHOW")}
              label={t("bildersafeShowAction")}
              desc={t("bildersafeShowActionDesc")}
              href={`${base}/bildersafe/anzeigen`}
            />
          </>
        )}

        {/* Gewicht — anders als der Bildersafe AUCH in der Keyholder-Sicht: sie darf für ihren
            Träger nachtragen, und das Formular dafür gibt es unter `/admin/users/<id>/aktionen`.
            Ohne Freischaltung erscheint die Zeile gar nicht; die Seite dahinter prüft es erneut. */}
        {weight && (
          <SheetActionRow
            {...rowNav}
            icon={actionIcon("WEIGHT")}
            tone="text-foreground-faint"
            label={t("weight")}
            desc={t("weightSubtitle")}
            href={`${base}/gewicht`}
          />
        )}

        {/* Bewusst KEINE Box-Zeile mehr: „Neu erfassen" erfasst Einträge, die Box folgt ihnen.
            Box-Status + Sonderzustände wohnen auf der BoxStatusCard (Dashboard); das
            Notfall-Öffnen/Verschliessen bleibt in Heimdall. */}
      </div>
      )}
    </Sheet>
  );
}
