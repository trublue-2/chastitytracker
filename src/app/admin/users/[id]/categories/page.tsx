import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { buildCategoryRows } from "@/lib/categoryRows";
import CategoriesClient from "@/app/dashboard/categories/CategoriesClient";

export default async function AdminCategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const [user, categories] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    buildCategoryRows(id, new Date()),
  ]);
  if (!user) notFound();

  return (
    <CategoriesClient
      userId={user.id}
      username={user.username}
      categories={categories}
    />
  );
}
