import { readingColCls } from "@/app/components/inputStyles";
import Skeleton from "@/app/components/Skeleton";

export default function EintraegeLoading() {
  return (
    // Dieselbe Hülle wie die Seite (`eintraege/page.tsx`): ohne `flex-1`, mit `gap-2`. Das Skelett
    // stand auf `gap-4` und war damit um 8 px je Zeile lockerer als die Liste, die es ankündigt.
    <main className={`${readingColCls} py-6 flex flex-col gap-2`}>
      <Skeleton variant="text" width="140px" className="h-7" />

      <div className="flex flex-col gap-2">
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-1 py-3 flex items-center gap-3">
              <Skeleton variant="text" width="70px" className="h-6 rounded-full flex-shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <Skeleton variant="text" width="120px" />
                <Skeleton variant="text" width="80px" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Skeleton variant="text" width="32px" className="h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
