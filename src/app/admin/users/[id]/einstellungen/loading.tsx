import Skeleton from "@/app/components/Skeleton";

export default function EinstellungenLoading() {
  return (
    <main className="flex-1 w-full max-w-2xl px-4 py-6 flex flex-col gap-6">
      {/* Konto */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="80px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Skeleton variant="text" width="100px" />
                <Skeleton variant="text" width="140px" />
              </div>
              <Skeleton variant="text" width="80px" className="h-9 rounded-xl" />
            </div>
          ))}
        </div>
      </div>

      {/* App settings (toggles) */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="100px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
              <Skeleton variant="text" width="160px" />
              <Skeleton variant="text" width="44px" className="h-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Trainingsvorgaben */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <Skeleton variant="text" width="140px" />
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2">
              <div className="flex flex-col gap-1">
                <Skeleton variant="text" width="120px" />
                <Skeleton variant="text" width="80px" />
              </div>
              <Skeleton variant="text" width="60px" />
            </div>
          ))}
          <Skeleton variant="text" width="100%" className="h-10 rounded-xl mt-2" />
        </div>
      </div>
    </main>
  );
}
