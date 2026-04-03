import Link from "next/link";
import OrgasmusForm from "../../OrgasmusForm";
import { getTranslations } from "next-intl/server";

export default async function NewOrgasmusPage() {
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("orgasmForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard/new" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <OrgasmusForm />
    </div>
  );
}
