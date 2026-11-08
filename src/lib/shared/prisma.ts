import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
    datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL ?? ""),
  });

/** Ensures SQLite uses a single connection to prevent SQLITE_BUSY errors. */
function appendConnectionLimit(url: string): string {
  if (!url || url.includes("connection_limit")) return url;
  return url + (url.includes("?") ? "&" : "?") + "connection_limit=1";
}

globalForPrisma.prisma = prisma;
