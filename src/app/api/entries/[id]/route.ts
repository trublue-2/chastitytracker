import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ORGASMUS_ARTEN, OEFFNEN_GRUENDE, isValidImageUrl, parseOrgasmusArtBase } from "@/lib/constants";
import { validateDeviceOwnership } from "@/lib/queries";
import { isDevBypassEnabled } from "@/lib/devMode";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode, verifikationStatus, deviceId } = body;

  if (!isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Ungültige imageUrl" }, { status: 400 });
  }
  if (oeffnenGrund !== undefined && oeffnenGrund !== null && !OEFFNEN_GRUENDE.includes(oeffnenGrund)) {
    return NextResponse.json({ error: "Ungültiger Öffnungsgrund" }, { status: 400 });
  }
  if (orgasmusArt !== undefined && orgasmusArt !== null) {
    const base = parseOrgasmusArtBase(orgasmusArt as string);
    if (!base || !(ORGASMUS_ARTEN as readonly string[]).includes(base)) {
      return NextResponse.json({ error: "Ungültige Art" }, { status: 400 });
    }
  }

  const devBypass = isDevBypassEnabled(req.headers.get("host"));

  // Time-shift direction enforcement for non-admins (anti-cheat)
  // Skipped when running on localhost in dev (test enablement).
  if (startTime && session.user.role !== "admin" && !devBypass) {
    const newTime = new Date(startTime);
    const oldTime = existing.startTime;
    // Forward-only: VERSCHLUSS, PRUEFUNG, WEAR_BEGIN
    if ((existing.type === "VERSCHLUSS" || existing.type === "PRUEFUNG" || existing.type === "WEAR_BEGIN") && newTime < oldTime) {
      return NextResponse.json({ error: "Zeitpunkt darf nur nach vorne verschoben werden" }, { status: 400 });
    }
    // Backward-only: OEFFNEN, ORGASMUS, WEAR_END
    if ((existing.type === "OEFFNEN" || existing.type === "ORGASMUS" || existing.type === "WEAR_END") && newTime > oldTime) {
      return NextResponse.json({ error: "Zeitpunkt darf nur nach hinten verschoben werden" }, { status: 400 });
    }
  }

  // Validate deviceId ownership (VERSCHLUSS + WEAR_BEGIN/END entries)
  const persistsDevice = existing.type === "VERSCHLUSS" || existing.type === "WEAR_BEGIN" || existing.type === "WEAR_END";
  if (deviceId && persistsDevice) {
    const device = await validateDeviceOwnership(deviceId, existing.userId);
    if (!device) return NextResponse.json({ error: "Ungültiges Gerät" }, { status: 400 });
  }

  let entry;
  try {
    entry = await prisma.$transaction(async (tx) => {
      // Re-validate temporal ordering when startTime is changed on a paired entry
      // (VERSCHLUSS/OEFFNEN globally, WEAR_BEGIN/WEAR_END scoped to the device's category).
      // Skipped entirely on localhost dev for test enablement.
      const isKgPair = existing.type === "VERSCHLUSS" || existing.type === "OEFFNEN";
      const isWearPair = existing.type === "WEAR_BEGIN" || existing.type === "WEAR_END";
      if (!devBypass && startTime && (isKgPair || isWearPair)) {
        const newTime = new Date(startTime);
        if (newTime > new Date()) throw Object.assign(new Error(), { _code: "FUTURE" });
        const pairTypes = isKgPair
          ? (["VERSCHLUSS", "OEFFNEN"] as const)
          : (["WEAR_BEGIN", "WEAR_END"] as const);
        const wearCategoryId = isWearPair && existing.deviceId
          ? (await tx.device.findUnique({ where: { id: existing.deviceId }, select: { categoryId: true } }))?.categoryId
          : null;
        const others = await tx.entry.findMany({
          where: {
            userId: existing.userId,
            type: { in: [...pairTypes] },
            id: { not: id },
            ...(isWearPair && wearCategoryId ? { device: { categoryId: wearCategoryId } } : {}),
          },
          orderBy: { startTime: "asc" },
          select: { type: true, startTime: true },
        });
        const insertIdx = others.findIndex(e => e.startTime > newTime);
        const prev = insertIdx === -1 ? others[others.length - 1] : others[insertIdx - 1];
        const next = insertIdx === -1 ? null : others[insertIdx];
        if ((prev && prev.type === existing.type) || (next && next.type === existing.type)) {
          throw Object.assign(new Error(), { _code: "INVALID_ORDER" });
        }
      }

      return tx.entry.update({
        where: { id },
        data: {
          ...(startTime && { startTime: new Date(startTime) }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(imageExifTime !== undefined && {
            imageExifTime: imageExifTime ? new Date(imageExifTime) : null,
          }),
          ...(note !== undefined && { note }),
          ...(oeffnenGrund !== undefined && { oeffnenGrund }),
          ...(orgasmusArt !== undefined && { orgasmusArt }),
          ...(kontrollCode !== undefined && { kontrollCode }),
          ...(deviceId !== undefined && persistsDevice && { deviceId: deviceId || null }),
          // verifikationStatus only settable by admins
          ...(verifikationStatus !== undefined && session.user.role === "admin" && { verifikationStatus }),
        },
      });
    });
  } catch (e: unknown) {
    const code = (e as { _code?: string })?._code;
    if (code === "FUTURE") return NextResponse.json({ error: "Zeitpunkt darf nicht in der Zukunft liegen" }, { status: 400 });
    if (code === "INVALID_ORDER") return NextResponse.json({ error: "Zeitpunkt verletzt die chronologische Reihenfolge" }, { status: 400 });
    throw e;
  }

  return NextResponse.json(entry);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.entry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const withPartner = req.nextUrl.searchParams.get("withPartner") === "true";
  const partnerId = req.nextUrl.searchParams.get("partnerId");

  const isKgPair = existing.type === "VERSCHLUSS" || existing.type === "OEFFNEN";
  const isWearPair = existing.type === "WEAR_BEGIN" || existing.type === "WEAR_END";
  const isPair = isKgPair || isWearPair;

  // Chain-break detection for paired entries (VERSCHLUSS/OEFFNEN global; WEAR-pair per category)
  if (isPair && !force) {
    const pairTypes = isKgPair
      ? (["VERSCHLUSS", "OEFFNEN"] as const)
      : (["WEAR_BEGIN", "WEAR_END"] as const);
    const wearCategoryId = isWearPair && existing.deviceId
      ? (await prisma.device.findUnique({ where: { id: existing.deviceId }, select: { categoryId: true } }))?.categoryId
      : null;
    const categoryFilter = isWearPair && wearCategoryId ? { device: { categoryId: wearCategoryId } } : {};
    const [prev, next] = await Promise.all([
      prisma.entry.findFirst({
        where: { userId: existing.userId, type: { in: [...pairTypes] }, startTime: { lt: existing.startTime }, ...categoryFilter },
        orderBy: { startTime: "desc" },
        select: { id: true, type: true, startTime: true },
      }),
      prisma.entry.findFirst({
        where: { userId: existing.userId, type: { in: [...pairTypes] }, startTime: { gt: existing.startTime }, ...categoryFilter },
        orderBy: { startTime: "asc" },
        select: { id: true, type: true, startTime: true },
      }),
    ]);

    const wouldBreak = prev && next && prev.type === next.type;

    if (wouldBreak) {
      // Pair partner is "next" for the start-half (VERSCHLUSS/WEAR_BEGIN), "prev" for the end-half.
      const isStartHalf = existing.type === "VERSCHLUSS" || existing.type === "WEAR_BEGIN";
      const partner = isStartHalf ? next : prev;

      if (withPartner) {
        if (partnerId && partnerId !== partner.id) {
          return NextResponse.json({ error: "Partner changed" }, { status: 409 });
        }
        try {
          await prisma.$transaction(async (tx) => {
            const verified = await tx.entry.findUnique({ where: { id: partner.id }, select: { id: true } });
            if (!verified) throw Object.assign(new Error(), { _code: "PARTNER_GONE" });
            await tx.entry.deleteMany({ where: { id: { in: [id, partner.id] } } });
          });
        } catch (e: unknown) {
          if ((e as { _code?: string })?._code === "PARTNER_GONE") {
            return NextResponse.json({ error: "Partner changed" }, { status: 409 });
          }
          throw e;
        }
        revalidatePath("/dashboard", "layout");
        return new NextResponse(null, { status: 204 });
      }

      // Return chain break info without deleting
      return NextResponse.json({
        chainBreak: true,
        partner: { id: partner.id, type: partner.type, startTime: partner.startTime },
      });
    }
  }

  // No chain break, force=true, or non-VO entry: delete normally
  await prisma.$transaction(async (tx) => {
    if (existing.type === "PRUEFUNG") {
      await tx.kontrollAnforderung.updateMany({
        where: { entryId: id },
        data: { entryId: null, fulfilledAt: null },
      });
    }
    await tx.entry.delete({ where: { id } });
  });

  if (isPair) {
    revalidatePath("/dashboard", "layout");
  }

  return new NextResponse(null, { status: 204 });
}
