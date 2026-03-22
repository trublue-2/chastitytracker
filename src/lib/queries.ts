import { prisma } from "@/lib/prisma";

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
