import Skeleton from "@/app/components/Skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-5xl mx-auto w-full">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4">
          {/* User header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-background-subtle animate-shimmer flex-shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton variant="text" width="120px" className="h-5" />
              <Skeleton variant="text" width="80px" />
            </div>
            <Skeleton variant="text" width="70px" className="h-6 rounded-full" />
          </div>

          {/* Status row */}
          <div className="rounded-xl bg-background-subtle px-4 py-3 flex items-center justify-between gap-3">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80px" className="h-7" />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} variant="text" width="110px" className="h-9 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
