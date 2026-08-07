import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { resolveInspectionEntry } from "@/lib/kontrolleService";
import { serviceResponse, errorResponse } from "@/lib/serviceResult";

/**
 * Urteil über eine eingereichte Kontrolle, adressiert über den EINTRAG (`action`:
 * `manuallyVerify` | `reject`).
 *
 * Braucht es, weil /api/admin/kontrollen/[id] eine `KontrollAnforderung` voraussetzt — die
 * freiwillige Selbstkontrolle hat keine und war darüber nicht zu beurteilen.
 *
 * Abgrenzung zu PATCH /api/entries/[id]: dort KANN ein Keyholder `verifikationStatus` ebenfalls
 * setzen, aber als reinen Feld-Edit — ohne Meldung an den Sub. Ein Urteil ist mehr als der Wert im
 * Feld, deshalb diese Route: `resolveInspectionEntry` schreibt den Status UND benachrichtigt,
 * gleich wie der Weg über die Anforderung.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await req.json();

  const entry = await prisma.entry.findUnique({ where: { id }, select: { userId: true } });
  if (!entry) return errorResponse(404, "INSPECTION_NOT_FOUND");
  const err = await requireKeyholderOrAdminApi(entry.userId);
  if (err) return err;

  return serviceResponse(await resolveInspectionEntry(id, action));
}
