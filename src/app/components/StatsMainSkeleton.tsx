import Skeleton from "@/app/components/Skeleton";

/**
 * Der Platzhalter für `StatsMain` — Zusammenfassung, Trainingsziele, Kalender, Rekorde.
 *
 * Die Seite dahinter ist längst geteilt (`StatsMain`, benutzt von `/dashboard/stats` und
 * `/admin/users/[id]/stats`); ihr Skelett war es nicht. Beide `loading.tsx` trugen dieselben rund
 * fünfzig Zeilen, und der v6-Umbau hat sie im Gleichschritt geändert — dieselbe Änderung zweimal
 * bezahlt, was genau der Moment ist, sie herauszuziehen.
 *
 * Was NICHT hierher gehört, bleibt an den beiden Aufrufstellen: die Hülle (`<main>` beim Träger,
 * `<div>` im Keyholder-Reiter, wo Spalte und Landmarke vom Layout kommen) und der Titel-Stummel,
 * der dort einen Zurück-Link mitbringt.
 */
export default function StatsMainSkeleton({
  orgasmFreeRow = false,
}: {
  /** Die Zeile „Orgasmusfreie Zeit" steht nur in der Träger-Sicht — sie sitzt zwischen
   *  Zusammenfassung und Trainingszielen, lässt sich also nicht am Ende anhängen. */
  orgasmFreeRow?: boolean;
}) {
  return (
    <>
      {/* Summary stats grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="50%" className="h-7" />
          </div>
        ))}
      </section>

      {orgasmFreeRow && (
        <div className="flex items-center justify-between gap-4">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="80px" className="h-7" />
        </div>
      )}

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
    </>
  );
}
