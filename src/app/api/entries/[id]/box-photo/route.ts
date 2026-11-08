import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/auth/authGuards";
import { submitBoxPhoto } from "@/lib/box/boxPhotoDueService";
import { serviceResponse } from "@/lib/shared/serviceResult";

/**
 * Das Box-Foto, das NACH „Riegel zu" fällig wurde (`boxPhotoDue.ts`). Es hängt am Verschluss und
 * landet in `boxImageUrl`, wo es bisher auch hing. Die Regeln (fällig, laufender Verschluss, nicht
 * wiederverwendet) stehen im Dienst.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await submitBoxPhoto(session.user.id, id, body);
  if (result.ok) revalidatePath("/dashboard", "layout");
  return serviceResponse(result);
}
