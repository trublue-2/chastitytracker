"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Plus, BarChart2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ViewTransitionLink from "@/app/components/ViewTransitionLink";
import useViewTransition from "@/app/hooks/useViewTransition";
import UpdateAvailableIndicator from "@/app/components/UpdateAvailableIndicator";
import { adminNavEntry } from "@/lib/adminNavEntry";
import { isEntryFormRoute } from "@/lib/entryFormRoute";
import { hapticLight } from "@/lib/haptics";

interface BottomNavProps {
  isAdmin?: boolean;
  isKeyholder?: boolean;
  isLocked?: boolean;
  onNewEntry?: () => void;
  version?: string;
}

export default function BottomNav({ isAdmin, isKeyholder, onNewEntry, version }: BottomNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // EINMAL für die ganze Leiste, nicht je Verknüpfung — Begründung an der `navigate`-Prop von
  // `ViewTransitionLink`. Muss VOR dem `return null` unten stehen: Hooks dürfen nicht bedingt
  // laufen.
  const { navigateWithTransition } = useViewTransition();

  // Auf den Erfassungs-/Bearbeitungs-Seiten die fixe Leiste ausblenden. Sonst verdeckte sie am
  // unteren Rand (Mobile) den „Speichern"-Button, der dort selbst in einer fixen Aktionsleiste sitzt.
  // Zum Verlassen gibt es dort Abbrechen + „← Neu"; die Weg-Navigation ist während der fokussierten
  // Eingabe ohnehin überflüssig. `BottomNavSpacer` lässt hier passend den reservierten Platz weg.
  if (isEntryFormRoute(pathname)) return null;

  const tabs = [
    { href: "/dashboard", icon: Home, label: t("overview"), exact: true },
    { href: "/dashboard/eintraege", icon: ClipboardList, label: t("entries"), exact: false },
    { href: "#new", icon: Plus, label: t("new"), action: true },
    { href: "/dashboard/stats", icon: BarChart2, label: t("stats"), exact: false },
    ...adminNavEntry({ isAdmin, isKeyholder, adminLabel: t("admin"), keyholderLabel: t("keyholder") }),
  ];

  return (
    // Der Name der Landmarke: ohne ihn heisst sie in der Landmarken-Liste nur „Navigation" — und
    // die Seite trägt mehrere davon (Seitenleiste, Reiter des Trägers).
    <nav aria-label={t("mainNavLabel")} className="lg:hidden fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-nav-border z-40 pb-safe">
      <div className="flex h-16">
        {tabs.map((tab) => {
          if ("action" in tab && tab.action) {
            return (
              <button
                key="new"
                type="button"
                onClick={onNewEntry}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-nav-inactive-text hover:text-foreground-muted transition-colors"
                aria-label={tab.label}
              >
                <div className="w-10 h-10 rounded-full bg-btn-primary flex items-center justify-center">
                  <Plus size={22} className="text-btn-primary-text" strokeWidth={2.5} />
                </div>
              </button>
            );
          }

          const active = "exact" in tab && tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <ViewTransitionLink
              navigate={navigateWithTransition}
              key={tab.href}
              href={tab.href}
              // Der aktive Reiter war allein über Farbe und Strichstärke erkennbar. Ein
              // Screenreader las fünf gleichwertige Einträge vor, und wer Farben nicht
              // unterscheidet, sah sie ebenso.
              aria-current={active ? "page" : undefined}
              onClick={hapticLight}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-nav-active-text" : "text-nav-inactive-text hover:text-nav-inactive-hover"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </ViewTransitionLink>
          );
        })}
      </div>
      {/* h-6 fixiert die Höhe dieser Zeile, statt sie aus Schriftgrösse und Polsterung entstehen zu
          lassen: `BottomNavSpacer` reserviert am Ende des Seiteninhalts genau die Höhe dieser Nav
          (4rem Reiter + 1.5rem hier = 5.5rem). Wächst sie hier unbemerkt, verschwindet unten auf
          JEDER Dashboard-Seite ein Streifen unter der Leiste. */}
      {version && (
        <div className="flex items-center justify-between px-4 h-6">
          <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
            &copy; trublue {new Date().getFullYear()}
          </a>
          <div className="flex items-center gap-2">
            <UpdateAvailableIndicator currentVersion={version} />
            <Link href="/dashboard/changelog" className="text-[10px] font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
              {version}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
