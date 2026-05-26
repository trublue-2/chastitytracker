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

  // Multiple devices: gather reference images
  // Query per device so each gets up to 2 recent photos regardless of relative usage frequency.
  // A single global query with `take` would be biased toward the most-used device.
  const entryImagesByDevice = await Promise.all(
    devices.map((device) =>
      prisma.entry.findMany({
        where: {
          userId: session.user.id,
          type: "VERSCHLUSS",
          deviceId: device.id,
          imageUrl: { not: null },
        },
        select: { imageUrl: true },
        orderBy: { startTime: "desc" },
        take: 2,
      })
    )
  );

  const references: DeviceReference[] = devices.map((device, i) => {
    const imageUrls: string[] = [];
    if (device.imageUrl) imageUrls.push(device.imageUrl);
    for (const entry of entryImagesByDevice[i]) {
      if (entry.imageUrl) imageUrls.push(entry.imageUrl);
    }
    return { deviceId: device.id, deviceName: device.name, imageUrls };
  });

  const result = await detectDevice(imageUrl, references);
  return NextResponse.json({
    deviceId: result?.deviceId ?? null,
    deviceName: result?.deviceName ?? null,
  });
}
