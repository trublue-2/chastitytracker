"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
}

export default function UserSubNav({ userId }: Props) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/users/${userId}`;

  // Kategorien-Verwaltung lebt im Devices-Tab (per Button), nicht als eigener Reiter.
  const tabs = [
    { href: base, label: t("overview_tab"), exact: true },
    { href: `${base}/aktionen`, label: t("actions_tab"), exact: false },
    { href: `${base}/eintraege`, label: t("entries_tab"), exact: false },
    { href: `${base}/kontrollen`, label: t("inspections_tab"), exact: false },
    { href: `${base}/aufgaben`, label: t("tasks_tab"), exact: false },
    { href: `${base}/stats`, label: t("stats_tab"), exact: false },
    { href: `${base}/strafbuch`, label: t("strafbuch_tab"), exact: false },
    { href: `${base}/geraete`, label: t("devices_tab"), exact: false },
    { href: `${base}/einstellungen`, label: t("user_settings_tab"), exact: false },
  ];

  const active = tabs.find((tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  );

  return (
    <div className="sticky z-10 bg-surface border-b border-border-subtle" style={{ top: "calc(3.5rem + 52px + env(safe-area-inset-top, 0px))" }}>
      {/* Mobile: select dropdown */}
      <div className="lg:hidden px-4 py-2">
        <select
          value={active?.href ?? base}
          onChange={(e) => router.push(e.target.value)}
          // `aria-label`, weil das Feld keine sichtbare Beschriftung hat: ein Screenreader las nur
          // den gewählten Reiter vor, ohne zu sagen, wozu die Auswahl gehört.
          aria-label={t("userTabsLabel")}
          // GAR KEINE Fokus-Klasse: die Regel in `globals.css` steht ausserhalb jeder `@layer` und
          // schlägt damit jede Tailwind-Utility — der Ring ist also schon da. Der frühere
          // `focus:outline-none focus:ring-foreground/20` machte ihn nur kaputt: 20 % Deckung
          // liegen unter den 3:1 aus WCAG 2.4.11, und ein `ring` ist ein `box-shadow`, den der
          // Windows-Kontrastmodus ersatzlos entfernt — dort blieb dank `outline-none` überhaupt
          // keine Fokusanzeige übrig.
          className="w-full border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-surface-raised"
        >
          {tabs.map((tab) => (
            <option key={tab.href} value={tab.href}>{tab.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop: tab bar — als `nav`, weil neun Links auf Unterseiten desselben Trägers eine
          Navigation SIND. Als `div` fehlten sie in der Landmarken-Liste, und der Name
          unterscheidet sie von der Seitenleiste daneben. */}
      <nav aria-label={t("userTabsLabel")} className="hidden lg:flex px-4 lg:px-6">
        {tabs.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              // Der aktive Reiter war allein an Unterstrich und Textfarbe zu erkennen — beides
              // nichts, was ein Screenreader vorliest.
              aria-current={isActive ? "page" : undefined}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-foreground-faint hover:text-foreground-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
