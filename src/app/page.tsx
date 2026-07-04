import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveLandingPath } from "@/lib/landing";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");
  redirect(await resolveLandingPath(session));
}
