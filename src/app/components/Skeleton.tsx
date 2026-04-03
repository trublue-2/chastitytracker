type SkeletonVariant = "text" | "text-block" | "card" | "avatar" | "image" | "stat";

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  count?: number;
  className?: string;
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
