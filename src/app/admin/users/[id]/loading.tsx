import Skeleton from "@/app/components/Skeleton";

export default function AdminUserLoading() {
  return (
    <main className="flex-1 w-full max-w-4xl px-4 py-6 flex flex-col gap-4">
      {/* Laufende Session card */}
      <div className="rounded-2xl border border-border bg-surface p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-background-subtle animate-shimmer flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" width="35%" className="h-7" />
        </div>
        <Skeleton variant="text" width="90px" className="h-9 rounded-xl flex-shrink-0" />
      </div>

      {/* Session list */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="100px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <Skeleton variant="text" width="60px" className="h-6 rounded-full flex-shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton variant="text" width="140px" />
                <Skeleton variant="text" width="90px" />
              </div>
              <Skeleton variant="text" width="60px" />
            </div>
          ))}
        </div>
      </div>

      {/* Kontrollen */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="80px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <Skeleton variant="text" width="50px" className="h-6 rounded-full" />
              <Skeleton variant="text" width="120px" />
              <div className="ml-auto">
                <Skeleton variant="text" width="80px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
