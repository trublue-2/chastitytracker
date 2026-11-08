"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import ExpandRow from "@/app/components/ExpandRow";
import { nativePlatformNow } from "@/lib/nativeApp";

/**
 * „Android-App" — führt zur Download-Seite, nur im Browser eines Android-Geräts: in der App ist sie
 * schon installiert, auf anderen Geräten nützt sie nichts. Erst nach dem Mount entschieden
 * (User-Agent gibt es im Server-Rendering nicht).
 */
export default function AndroidAppRow({ url }: { url: string }) {
  const t = useTranslations("settings");
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!nativePlatformNow() && /android/i.test(navigator.userAgent));
  }, []);
  if (!show) return null;
  return <ExpandRow label={t("androidAppTitle")} subtitle={t("androidAppHint")} open={false} href={url} />;
}
