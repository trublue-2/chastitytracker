import Skeleton from "@/app/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto w-full">
      {/* Status hero */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-background-subtle animate-shimmer flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" className="h-7" />
        </div>
      </div>

      {/* Primary action button */}
      <Skeleton variant="text" width="100%" className="h-12 rounded-2xl" />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1.5">
            <Skeleton variant="text" width="70%" className="h-6" />
            <Skeleton variant="text" width="80%" />
          </div>
        ))}
      </div>

      {/* Session timeline card */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="120px" />
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-background-subtle animate-shimmer flex-shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="60%" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent entries */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="80px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <Skeleton variant="text" width="60px" />
              <Skeleton variant="text" width="100px" />
              <div className="ml-auto">
                <Skeleton variant="text" width="50px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
