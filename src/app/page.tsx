import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveLandingPath } from "@/lib/landing";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");
  // Landing-Ziel VOR dem redirect() auflösen: ein Prisma-Hiccup soll "/" nicht 500en, sondern auf
  // den eigenen Tracker fallen. redirect() selbst wirft NEXT_REDIRECT → bewusst außerhalb try/catch.
  let target = "/dashboard";
  try {
    target = await resolveLandingPath(session);
  } catch {
    // Fallback /dashboard (oben gesetzt).
  }
  redirect(target);
}
