import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { buildCategoryRows } from "@/lib/categoryRows";
import CategoriesClient from "./CategoriesClient";

export default async function CategoriesPage() {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");

  const categories = await buildCategoryRows(session.user.id, new Date());

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
      {/* Auf der EIGENEN Seite ist ein Träger Eigentümer und damit nicht erhaben; ein globaler
          Admin schon. Exakt die Fallunterscheidung aus `entryManageAccess` — die Oberfläche zeigt
          also genau das, was die Route auch annehmen würde. */}
      <CategoriesClient categories={categories} canEditRules={session.user.role === "admin"} />
    </main>
  );
}
