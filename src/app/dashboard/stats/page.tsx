import { auth } from "@/lib/auth";
import StatsMain from "@/app/components/StatsMain";
import WearStatsByCategory from "./WearStatsByCategory";
import { deviceCategoriesEnabled } from "@/lib/constants";

export default async function StatsPage() {
  const session = await auth();
  const userId = session!.user.id;

  return (
    <>
      <StatsMain userId={userId} compact />
      {deviceCategoriesEnabled() && (
        <div className="w-full max-w-2xl mx-auto px-4 pb-6">
          <WearStatsByCategory userId={userId} />
        </div>
      )}
    </>
  );
}
