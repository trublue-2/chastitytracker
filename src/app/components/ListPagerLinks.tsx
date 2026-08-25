import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { blockInsetCls } from "@/app/components/inputStyles";

/**
 * Die Blätter-Zeile einer SERVERSEITIGEN Liste — dieselbe Zeile wie `ListPager`, nur mit Links
 * statt Rückrufen.
 *
 * Zwei Bauteile für eine Zeile, weil der Unterschied nicht die Gestalt ist, sondern wer die Seite
 * hält: eine Client-Liste kennt sie als Zustand, eine Server-Liste als Adresse. Ein gemeinsames
 * Bauteil müsste den einen Fall als `<button>` und den anderen als `<a>` rendern und beide Wege
 * durchreichen — mehr Gerüst als die zwanzig Zeilen, die es spart.
 *
 * Was es hier zu sparen GAB, war eine echte Doppelung: die Eintragslisten des Trägers und der
 * Keyholderin trugen diese Zeile wortgleich, samt der Klassenkette für den abgeschalteten Zustand.
 */
export default function ListPagerLinks({
  page,
  totalPages,
  href,
  previousLabel,
  nextLabel,
}: {
  /** Nullbasiert — wie bei `ListPager`. */
  page: number;
  totalPages: number;
  /** Baut die Adresse einer Seite. */
  href: (page: number) => string;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;

  const cls = (disabled: boolean) =>
    `flex items-center gap-1 text-neben font-medium transition ${
      disabled ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"
    }`;
  const first = page === 0;
  const last = page >= totalPages - 1;

  return (
    <div className={`flex items-center justify-between ${blockInsetCls} py-4 border-t border-border-subtle`}>
      <Link href={first ? "#" : href(page - 1)} aria-disabled={first} className={cls(first)}>
        <ChevronLeft size={14} /> {previousLabel}
      </Link>
      <span className="text-neben text-foreground-faint tabular-nums">
        {page + 1} / {totalPages}
      </span>
      <Link href={last ? "#" : href(page + 1)} aria-disabled={last} className={cls(last)}>
        {nextLabel} <ChevronRight size={14} />
      </Link>
    </div>
  );
}
