import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { waiveBoxPhoto } from "@/lib/boxPhotoDueService";
import { errorResponse, serviceResponse } from "@/lib/serviceResult";

/**
 * Die Keyholderin erlässt das fällige Box-Foto — der Notausgang, wenn es nicht zu beschaffen ist
 * (Kamera defekt, Schlüssel im Fenster nicht zu erkennen). Body: `{ userId }`. Der Verschluss selbst
 * bleibt unberührt; ohne diesen Weg bliebe die Aufforderung für immer stehen.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return errorResponse(400, "USER_ID_REQUIRED");

  const denied = await requireKeyholderOrAdminApi(userId);
  if (denied) return denied;

  const result = await waiveBoxPhoto(userId);
  if (result.ok) {
    revalidatePath("/dashboard", "layout");
    revalidatePath(`/admin/users/${userId}`, "layout");
  }
  return serviceResponse(result);
}
