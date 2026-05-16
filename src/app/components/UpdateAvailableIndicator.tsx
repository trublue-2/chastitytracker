"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { fetchUpstreamChangelog } from "@/lib/upstreamChangelog";
import { compareVersions } from "@/lib/semver";

/** Small dot + label shown when an upstream version is newer than the running one.
 *  Hidden if upstream check fails or no newer version exists. */
export default function UpdateAvailableIndicator({ currentVersion }: { currentVersion: string }) {
  const t = useTranslations("updateIndicator");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUpstreamChangelog().then((data) => {
      if (cancelled || !data || data.length === 0) return;
      const upstream = data[0].version;
      if (compareVersions(upstream, currentVersion) > 0) {
        setLatestVersion(upstream);
      }
    });
    return () => { cancelled = true; };
  }, [currentVersion]);

  if (!latestVersion) return null;

  return (
    <Link
      href="/dashboard/changelog"
      className="flex items-center gap-1.5 text-[var(--color-request)] hover:opacity-80 transition"
      title={t("tooltip", { version: latestVersion })}
    >
      <span className="w-2 h-2 rounded-full bg-[var(--color-request)] animate-pulse" />
      <span className="text-[10px] font-medium">{t("label", { version: latestVersion })}</span>
    </Link>
  );
}
