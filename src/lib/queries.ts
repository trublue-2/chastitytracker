import { prisma } from "@/lib/prisma";

/** Returns true if the user is currently locked (latest VERSCHLUSS/OEFFNEN entry is VERSCHLUSS). */
export async function getIsLocked(userId: string): Promise<boolean> {
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true },
  });
  return latest?.type === "VERSCHLUSS";
}

/** Returns the currently active TrainingVorgabe for a user, or null. */
export async function getActiveVorgabe(userId: string, now: Date) {
  return prisma.trainingVorgabe.findFirst({
    where: {
      userId,
      gueltigAb: { lte: now },
      OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }],
    },
    orderBy: { gueltigAb: "desc" },
  });
}
