import Skeleton from "@/app/components/Skeleton";
import StatsMainSkeleton from "@/app/components/StatsMainSkeleton";
import { blockStackCls } from "@/app/components/inputStyles";

// Dieselbe Hülle wie `StatsMain compact` (`StatsMain.tsx`, `wrapper`): die Seite rendert die
// SCHMALE Fassung. Das Skelett stand auf der breiten und sprang beim Austausch um Spaltenbreite
// und Seitenrand zugleich.
export default function StatsLoading() {
  return (
    <main className={`flex-1 py-6 ${blockStackCls}`}>
      {/* Page title */}
      <Skeleton variant="text" width="120px" className="h-7" />

      <StatsMainSkeleton orgasmFreeRow />
    </main>
  );
}
