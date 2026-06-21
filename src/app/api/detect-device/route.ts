import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl } from "@/lib/constants";
import { detectDevice, type DeviceReference } from "@/lib/detectDevice";

/**
 * POST /api/detect-device
 *
 * Identifies which of the user's active devices appears in the uploaded photo.
 * Combines device reference images and recent Verschluss entry photos as references.
 *
 * Special case: if the user has exactly one active device, returns it directly
 * without a Claude Vision call.
 *
 * Body: { imageUrl: string }
 * Response: { deviceId: string | null, deviceName: string | null }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`detect-device:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await req.json();
  const { imageUrl } = body as { imageUrl?: unknown };
  if (!imageUrl || typeof imageUrl !== "string" || !isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  }

  // KG-only filter: mirrors getUserDeviceOptions — Verschluss/Öffnen flows are KG-only.
  // Plug, Collar etc. (user-defined categories) are excluded by design.
  // Legacy devices without a category (categoryId: null) are included for safety.
  const devices = await prisma.device.findMany({
    where: {
      userId: session.user.id,
      archivedAt: null,
      OR: [{ category: { isBuiltIn: true } }, { categoryId: null }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });

  // No devices at all
  if (devices.length === 0) {
    return NextResponse.json({ deviceId: null, deviceName: null });
  }

  // Single device: skip Claude, return directly
  if (devices.length === 1) {
    return NextResponse.json({ deviceId: devices[0].id, deviceName: devices[0].name });
  }

  // Referenzen je Gerät: bevorzugt KURATIERTE Referenzfotos (DeviceReferenceImage = „Trainingsmaterial"),
  // sonst Fallback auf die bisherige Heuristik (Geräte-Foto + letzte 2 Verschluss-Fotos), damit Geräte
  // ohne Kuration nicht regressieren. Cap pro Gerät begrenzt Prompt-Größe/Latenz (v.a. lokales Modell).
  // Query per device, sonst wäre ein globales `take` zum meistgenutzten Gerät verzerrt.
  const MAX_REFS_PER_DEVICE = 5;
  const curatedByDevice = await Promise.all(
    devices.map((device) =>
      prisma.deviceReferenceImage.findMany({
        where: { deviceId: device.id },
        select: { imageUrl: true },
        orderBy: { createdAt: "desc" },
        take: MAX_REFS_PER_DEVICE,
      })
    )
  );
  // Fallback-Fotos (Geräte-Foto + letzte Verschluss-Fotos) NUR für Geräte ohne kuratierte Referenzen laden.
  const fallbackByDevice = await Promise.all(
    devices.map((device, i) =>
      curatedByDevice[i].length > 0
        ? Promise.resolve([] as { imageUrl: string | null }[])
        : prisma.entry.findMany({
            where: { userId: session.user.id, type: "VERSCHLUSS", deviceId: device.id, imageUrl: { not: null } },
            select: { imageUrl: true },
            orderBy: { startTime: "desc" },
            take: 2,
          })
    )
  );

  const references: DeviceReference[] = devices.map((device, i) => {
    const curated = curatedByDevice[i].map((r) => r.imageUrl);
    if (curated.length > 0) {
      return { deviceId: device.id, deviceName: device.name, imageUrls: curated };
    }
    const imageUrls: string[] = [];
    if (device.imageUrl) imageUrls.push(device.imageUrl);
    for (const entry of fallbackByDevice[i]) {
      if (entry.imageUrl) imageUrls.push(entry.imageUrl);
    }
    return { deviceId: device.id, deviceName: device.name, imageUrls: imageUrls.slice(0, MAX_REFS_PER_DEVICE) };
  });

  const result = await detectDevice(imageUrl, references);
  return NextResponse.json({
    deviceId: result?.deviceId ?? null,
    deviceName: result?.deviceName ?? null,
  });
}
