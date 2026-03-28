import Link from "next/link";
import PruefungForm from "../../PruefungForm";
import { getTranslations } from "next-intl/server";

export default async function NewPruefungPage({ searchParams }: { searchParams: Promise<{ code?: string; kommentar?: string }> }) {
  const { code, kommentar } = await searchParams;
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("inspectionForm");
  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href="/dashboard/new" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-8">{tf("title")}</h1>
      <div className="max-w-lg"><PruefungForm initialCode={code} initialKommentar={kommentar} /></div>
    </div>
  );
}
