import { auth } from "@/lib/auth";
import StatsMain from "@/app/components/StatsMain";

export default async function StatsPage() {
  const session = await auth();
  const userId = session!.user.id;

  return <StatsMain userId={userId} />;
}
