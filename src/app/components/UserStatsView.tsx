import StatsMain from "@/app/components/StatsMain";
import WearStatsByCategory from "@/app/dashboard/stats/WearStatsByCategory";
import { deviceCategoriesEnabled } from "@/lib/constants";

/** A user's full stats view: the StatsMain block plus per-category wear stats (when categories are
 *  enabled). Shared by the admin user-stats page and the keyholder control panel. */
export default function UserStatsView({ userId }: { userId: string }) {
  return (
    <>
      <StatsMain userId={userId} />
      {deviceCategoriesEnabled() && (
        <div className="mt-4">
          <WearStatsByCategory userId={userId} />
        </div>
      )}
    </>
  );
}
