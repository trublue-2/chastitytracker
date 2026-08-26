import Skeleton from "@/app/components/Skeleton";

export default function EinstellungenLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Konto */}
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="80px" />
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-1 py-3 flex items-center justify-between gap-4">
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
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="100px" />
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-1 py-3 flex items-center justify-between gap-4">
              <Skeleton variant="text" width="160px" />
              <Skeleton variant="text" width="44px" className="h-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Trainingsvorgaben */}
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="140px" />
        <div className="px-1 py-3 flex flex-col gap-4">
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
    </div>
  );
}
