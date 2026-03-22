import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { reinigungErlaubt: true, reinigungMaxMinuten: true },
  });

  return (
    <SettingsForm
      reinigungErlaubt={user?.reinigungErlaubt ?? false}
      reinigungMaxMinuten={user?.reinigungMaxMinuten ?? 15}
    />
  );
}
