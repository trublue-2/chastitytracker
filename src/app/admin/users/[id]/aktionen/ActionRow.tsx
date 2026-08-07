import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Eine Zeile der Aktions-Liste (Icon-Kachel + Titel + Hinweis + Chevron), wahlweise anklickbar oder
 * ausgegraut mit Begründung.
 *
 * Extrahiert, weil derselbe Block in `aktionen/page.tsx` elfmal stand — je Aktion einmal aktiv und
 * einmal deaktiviert. Jede neue Aktion hätte zwei weitere Kopien bedeutet, und ein Stil-Fix hätte
 * alle Kopien einzeln treffen müssen.
 *
 * Die Ecken-Rundung liegt bewusst NICHT hier: der Container klippt sie per `overflow-hidden`, sonst
 * müsste jede Zeile wissen, ob sie die erste oder letzte ist — was bei bedingt gezeigten Zeilen
 * ohnehin falsch wird.
 */
export default function ActionRow({
  href,
  icon,
  iconStyle,
  title,
  hint,
}: {
  /** Fehlt der Link, ist die Zeile deaktiviert — `hint` sagt dann, warum. */
  href?: string;
  icon: React.ReactNode;
  /** Hintergrund + Vordergrund der Icon-Kachel. Ohne Angabe (oder deaktiviert) der neutrale Ton. */
  iconStyle?: React.CSSProperties;
  title: string;
  hint: string;
}) {
  const tile = (
    <div
      className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
        href && iconStyle ? "" : "bg-surface-raised text-foreground-faint"
      }`}
      style={href ? iconStyle : undefined}
    >
      {icon}
    </div>
  );

  if (!href) {
    return (
      <div className="flex items-center gap-4 px-5 py-4 opacity-40 cursor-not-allowed">
        {tile}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-muted">{title}</p>
          <p className="text-xs text-foreground-faint">{hint}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised transition active:scale-[0.98]"
    >
      {tile}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-foreground-faint truncate">{hint}</p>
      </div>
      <ChevronRight size={16} className="text-foreground-faint flex-shrink-0" />
    </Link>
  );
}

/** Die umschliessende Liste — die Rundung klippt hier, damit die Zeilen sie nicht kennen müssen. */
export function ActionRowGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-1 mb-2">{title}</p>
      <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
        {children}
      </div>
    </div>
  );
}
