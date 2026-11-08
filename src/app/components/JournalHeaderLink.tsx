"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { actionIcon } from "@/app/entries/actionSign";
import { JOURNAL_HREF } from "@/lib/journal/journal";
import { headerIconBtnCls } from "./inputStyles";

/**
 * Der Eingang zum eigenen Tagebuch in der Kopfzeile — neben der Glocke, aber anders als sie OHNE jede
 * Zahl und ohne Punkt, und das gehört zum Feature: ein Zähler („3 Einträge", „seit 5 Tagen nichts")
 * machte aus der Einladung eine Mahnung und verriete beim Blick über die Schulter, ob und wie viel
 * geschrieben wird. Wer hier einen Badge ergänzt, bricht Issue #114.
 *
 * Nicht in der Bottom-Nav: deren fünf Plätze sind bei Doppelrolle (Sub und Keyholder) belegt.
 */
export default function JournalHeaderLink() {
  const t = useTranslations("journal");
  const pathname = usePathname();
  const Icon = actionIcon("JOURNAL");
  return (
    <Link
      href={JOURNAL_HREF}
      aria-label={t("title")}
      aria-current={pathname.startsWith(JOURNAL_HREF) ? "page" : undefined}
      className={headerIconBtnCls}
    >
      <Icon size={18} />
    </Link>
  );
}
