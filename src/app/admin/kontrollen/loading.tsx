import { wideColCls } from "@/app/components/inputStyles";
import Skeleton from "@/app/components/Skeleton";

export default function AdminKontrollenLoading() {
  return (
    <main className={`flex-1 ${wideColCls} py-6 flex flex-col gap-4`}>
      <Skeleton variant="text" width="120px" className="h-7" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Skeleton variant="text" width="80px" />
          <Skeleton variant="text" width="60px" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-1 py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-background-subtle animate-shimmer flex-shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton variant="text" width="100px" />
                <Skeleton variant="text" width="160px" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton variant="text" width="70px" className="h-6 rounded-full" />
                <Skeleton variant="text" width="80px" className="h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
