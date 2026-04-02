import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TYPE_LABELS, TYPE_COLORS } from "@/lib/constants";
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  VERSCHLUSS: <Lock size={12} />,
  OEFFNEN: <LockOpen size={12} />,
  PRUEFUNG: <ClipboardList size={12} />,
  ORGASMUS: <Droplets size={12} />,
};

interface Entry {
  id: string;
  type: string;
  startTime: Date;
  note: string | null;
  orgasmusArt: string | null;
  kontrollCode: string | null;
}

interface Props {
  entry: Entry;
  locale: string;
  /** Optional action slot (e.g. EntryActions menu) */
  actions?: ReactNode;
}

export default function EntryRow({ entry: e, locale, actions }: Props) {
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${TYPE_COLORS[e.type] ?? "text-foreground-muted"}`}>
        {ICONS[e.type]}
        {TYPE_LABELS[e.type] ?? e.type}
      </span>
      <span className="text-sm text-foreground tabular-nums">
        {formatDateTime(e.startTime, locale)}
      </span>
      {e.orgasmusArt && (
        <span className="text-xs text-[var(--color-orgasm)] font-medium">{e.orgasmusArt}</span>
      )}
      {e.type === "VERSCHLUSS" && e.kontrollCode && (
        <span className="text-xs text-[var(--color-lock)] font-mono tabular-nums">#{e.kontrollCode}</span>
      )}
      {e.note && (
        <span className="text-xs text-foreground-faint italic truncate min-w-0">„{e.note}"</span>
      )}
      {actions && <div className="ml-auto flex-shrink-0">{actions}</div>}
    </div>
  );
}
