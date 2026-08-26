type SkeletonVariant = "text" | "text-block" | "card" | "avatar" | "image" | "stat";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}

/**
 * EIN pulsierender Balken — der Baustein, aus dem die Seiten-Skelette ihre Form bauen.
 *
 * Exportiert, weil `Skeleton` ihn nicht durchreicht: dessen `className` landet am WRAPPER, und der
 * Balken darin ist fest `h-4`. Wer ein Skelett mit `<Skeleton className="h-0.5">` baut, bekommt
 * einen 16-px-Puls in einem 2-px-Kasten, der 14 px in die nächste Zeile hängt — sichtbar falsch,
 * und im Diff nicht zu erkennen. Ein Balken, dessen Höhe man setzen kann, muss also ein eigenes
 * Bauteil sein.
 *
 * Ohne `role="status"`: das gehört EINMAL um das ganze Skelett, nicht an jeden Balken. Ein Dutzend
 * Regionen, die alle „Laden…" melden, ist für einen Screenreader keine Auskunft, sondern Lärm.
 */
export function SkeletonBar({
  width, height, rounded = "rounded-lg", className = "",
}: { width?: string; height?: string; rounded?: string; className?: string }) {
  return (
    <div
      className={`bg-background-subtle animate-shimmer ${rounded} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function SkeletonPulse({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-background-subtle rounded-lg animate-shimmer ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

function TextBlockSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-4/5" />
      <SkeletonPulse className="h-4 w-3/5" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <SkeletonPulse className="h-5 w-2/5" />
      <SkeletonPulse className="h-4 w-full" />
      <SkeletonPulse className="h-4 w-3/4" />
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      <SkeletonPulse className="h-8 w-20" />
      <SkeletonPulse className="h-3 w-16" />
    </div>
  );
}

export default function Skeleton({
  variant = "text",
  width,
  height,
  count = 1,
  className = "",
}: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Laden…">
      {items.map((i) => {
        switch (variant) {
          case "text":
            return <SkeletonPulse key={i} className="h-4" style={{ width: width ?? "60%" }} />;
          case "text-block":
            return <TextBlockSkeleton key={i} />;
          case "card":
            return <CardSkeleton key={i} />;
          case "avatar":
            return <SkeletonPulse key={i} className="rounded-full" style={{ width: width ?? "40px", height: height ?? "40px" }} />;
          case "image":
            return <SkeletonPulse key={i} className="aspect-video w-full" />;
          case "stat":
            return <StatSkeleton key={i} />;
          default:
            return <SkeletonPulse key={i} className="h-4" style={{ width, height }} />;
        }
      })}
      <span className="sr-only">Laden…</span>
    </div>
  );
}
