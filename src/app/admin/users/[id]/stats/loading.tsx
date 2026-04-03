import Skeleton from "@/app/components/Skeleton";

export default function AdminStatsLoading() {
  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      {/* Back link + title */}
      <div className="flex flex-col gap-1">
        <Skeleton variant="text" width="80px" />
        <Skeleton variant="text" width="120px" className="h-7 mt-1" />
      </div>

      {/* Summary stats grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4 sm:p-5 flex flex-col gap-2">
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="50%" className="h-7" />
          </div>
        ))}
      </section>

      {/* Trainingsziele */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="140px" />
        </div>
        <div className="px-6 py-4 flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" width="60px" />
                <Skeleton variant="text" width="40px" />
              </div>
              <Skeleton variant="text" width="100%" className="h-2.5 rounded-full" />
              <Skeleton variant="text" width="120px" />
            </div>
          ))}
        </div>
      </div>

      {/* Calendar placeholder */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="140px" />
        </div>
        <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, mi) => (
            <div key={mi}>
              <Skeleton variant="text" width="100px" className="mb-2" />
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 35 }).map((_, di) => (
                  <div key={di} className="aspect-square rounded bg-background-subtle animate-shimmer" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="80px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex flex-col gap-1">
                <Skeleton variant="text" width="120px" />
                <Skeleton variant="text" width="80px" />
              </div>
              <Skeleton variant="text" width="60px" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
