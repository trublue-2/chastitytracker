import Link from "next/link";
import UpdateAvailableIndicator from "@/app/components/UpdateAvailableIndicator";

/**
 * Fusszeile jeder Navigation: links Urheber-Zeile mit Link, rechts Update-Hinweis und Versions-Chip.
 * Rendert zwei Geschwister ohne Container — Reiterleiste und Seitenleiste fassen die Zeile
 * verschieden ein (`h-6 px-4` bzw. `px-2 gap-2`), und die Höhe der Reiterleiste ist als
 * `--bottom-nav-h` festgeschrieben, gehört also dem Aufrufer.
 *
 * Nur aus Client-Komponenten rendern: das Jahr kommt von `new Date()`; auf dem Server gerendert
 * bliebe es nach einem Jahreswechsel auf dem Stand des Renders stehen.
 */
export default function AppFooterMeta({ version }: { version: string }) {
  return (
    <>
      <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="text-[10px] text-foreground-faint hover:text-foreground-muted transition">
        &copy; trublue {new Date().getFullYear()}
      </a>
      <div className="flex items-center gap-2">
        <UpdateAvailableIndicator currentVersion={version} />
        <Link href="/dashboard/changelog" className="text-[10px] font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded hover:text-foreground-muted transition">
          {version}
        </Link>
      </div>
    </>
  );
}
