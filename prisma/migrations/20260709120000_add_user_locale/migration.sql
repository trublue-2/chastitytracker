-- AlterTable: per-user UI + notification language ("de" | "en"). Default "de" keeps existing users unchanged.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'de';
