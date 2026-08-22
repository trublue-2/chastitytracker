import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi, deviceCategoriesGate } from "@/lib/authGuards";
import { entryManageAccess } from "@/lib/keyholder";
import { errorResponse } from "@/lib/serviceResult";
import { createCategory } from "@/lib/deviceCategoryService";
import { validateCategoryInput } from "@/lib/categoryConstants";
import { DEVICE_NAME_MAX_LENGTH } from "@/lib/constants";
import { CATEGORY_LIST_ORDER, CATEGORY_LIST_SELECT } from "@/lib/queries";

/** GET /api/categories — list current user's DeviceCategories.
 *  Admin may pass ?userId=<id> to fetch another user's categories.
 *  Includes counts (devices, vorgaben) so the list page can show usage. */
export async function GET(req: NextRequest) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  let userId = session.user.id;
  const queryUserId = req.nextUrl.searchParams.get("userId");
  if (queryUserId && queryUserId !== session.user.id) {
    if (!(await entryManageAccess(session.user.id, session.user.role, queryUserId)).allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = queryUserId;
  }

  const categories = await prisma.deviceCategory.findMany({
    where: { userId },
    orderBy: [...CATEGORY_LIST_ORDER],
    select: CATEGORY_LIST_SELECT,
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      icon: c.icon,
      isBuiltIn: c.isBuiltIn,
      trackingEnabled: c.trackingEnabled,
      requirePhoto: c.requirePhoto,
      allowVorgaben: c.allowVorgaben,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      deviceCount: c._count.devices,
      vorgabeCount: c._count.vorgaben,
    })),
  );
}

/** POST /api/categories — create a new user-defined DeviceCategory.
 *  Built-in (slug "kg") cannot be created via API — it's seeded by ensureKgCategory. */
export async function POST(req: NextRequest) {
  const gate = deviceCategoriesGate();
  if (gate) return gate;
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { name, color, icon, sortOrder } = body;
  // Der Name des ERSTEN Geräts, optional. Eine Kategorie ohne Gerät ist eine Sackgasse: erfassen
  // lässt sich darin nichts, und gesagt wird es dem Nutzer nirgends deutlich (Issue #49 — zwei
  // Instanzen standen wochenlang so da und haben danach nie wieder etwas erfasst). Beide Schritte
  // in EINEM Vorgang, damit die Sackgasse gar nicht erst entstehen kann.
  const firstDeviceName = typeof body.firstDeviceName === "string" ? body.firstDeviceName.trim() : "";

  let userId = session.user.id;
  // Handelt der Aufrufer als Keyholder/Admin? Beim eigenen Konto ist ein Träger Eigentümer und damit
  // NICHT erhaben (ein globaler Admin schon) — dieselbe Regel wie in `entryManageAccess`.
  let elevated = session.user.role === "admin";
  if (body.userId && body.userId !== session.user.id) {
    const access = await entryManageAccess(session.user.id, session.user.role, body.userId);
    if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    userId = body.userId;
    elevated = access.elevated;
  }

  const validationError = validateCategoryInput({ name, color, icon });
  if (validationError) return NextResponse.json({ error: validationError.error }, { status: 400 });

  // Prosa wie die Prüfungen darüber: diese Route gibt anzeigbare Meldungen zurück, der Aufrufer
  // rendert sie unverändert (`parseApiError`). Ein Code stünde dem Nutzer roh im Fehlerfeld.
  if (firstDeviceName.length > DEVICE_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `Gerätename zu lang (max. ${DEVICE_NAME_MAX_LENGTH} Zeichen)` }, { status: 400 });
  }

  // Regel-Prüfung, Slug-Vergabe und Anlegen liegen im Service — dieselbe Kette bedient den
  // MCP-Write. Die drei Regeln darf auch beim ANLEGEN nur der Keyholder setzen: sonst wäre die
  // Schranke beim Ändern umgehbar, indem man die Kategorie gleich mit abgeschalteter
  // Zeiterfassung anlegt.
  const created = await createCategory(
    prisma,
    userId,
    {
      name: name as string,
      color: color as string | undefined,
      icon: icon as string | undefined,
      sortOrder: typeof sortOrder === "number" ? sortOrder : undefined,
      firstDeviceName,
    },
    { elevated },
    body,
  );
  if (!created.ok) {
    if (created.reason === "rules") return errorResponse(created.status, created.code);
    if (created.reason === "slug-exhausted") {
      return NextResponse.json({ error: "Zu viele Kategorien mit ähnlichem Namen" }, { status: 409 });
    }
    return NextResponse.json({ error: created.error }, { status: 400 });
  }
  return NextResponse.json(created.category, { status: 201 });
}
