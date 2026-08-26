import Skeleton from "@/app/components/Skeleton";
import { blockStackCls } from "@/app/components/inputStyles";

// Dieselbe Hülle wie `StatsMain compact` (`StatsMain.tsx`, `wrapper`): die Seite rendert die
// SCHMALE Fassung. Das Skelett stand auf der breiten und sprang beim Austausch um Spaltenbreite
// und Seitenrand zugleich.
export default function StatsLoading() {
  return (
    <main className={`flex-1 py-6 ${blockStackCls}`}>
      {/* Page title */}
      <Skeleton variant="text" width="120px" className="h-7" />

      {/* Summary stats grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="50%" className="h-7" />
          </div>
        ))}
      </section>

      {/* Orgasmusfreie Zeit */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="80px" className="h-7" />
      </div>

      {/* Trainingsziele */}
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="140px" />
        <div className="px-1 py-3 flex flex-col gap-4">
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
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="140px" />
        <div className="px-1 py-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
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
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="80px" />
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-1 py-3">
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
