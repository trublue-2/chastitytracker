import Skeleton from "@/app/components/Skeleton";
import StatsMainSkeleton from "@/app/components/StatsMainSkeleton";
import { blockStackCls } from "@/app/components/inputStyles";

export default function AdminStatsLoading() {
  return (
    // Dieselbe Hülle wie `StatsMain` in diesem Reiter: die Spalte kommt vom Layout, die Landmarke
    // auch — hier steht nur der Stapel. `flex-1` gehört dazu, sonst schrumpft das Skelett auf
    // seinen Inhalt.
    <div className={`flex-1 ${blockStackCls}`}>
      {/* Back link + title */}
      <div className="flex flex-col gap-1">
        <Skeleton variant="text" width="80px" />
        <Skeleton variant="text" width="120px" className="h-7 mt-1" />
      </div>

      <StatsMainSkeleton />
    </div>
  );
}
