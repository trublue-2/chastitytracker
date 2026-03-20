import Link from "next/link";
import OrgasmusForm from "../../OrgasmusForm";
import { getTranslations } from "next-intl/server";

export default async function NewOrgasmusPage() {
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("orgasmForm");
  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href="/dashboard/new" className="text-sm text-gray-400 hover:text-gray-600 transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-1 mb-8">{tf("title")}</h1>
      <div className="max-w-lg"><OrgasmusForm /></div>
    </div>
  );
}
