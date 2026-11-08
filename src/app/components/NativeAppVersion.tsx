"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getNativeAppInfo, type NativeAppInfo } from "@/lib/nativeApp";

/** Version und Build der nativen App-Hülle (iOS/Android) — die Web-Version daneben kommt vom
 *  Server und sagt darüber nichts. Ausserhalb der App leer. */
export default function NativeAppVersion({ className }: { className?: string }) {
  const t = useTranslations("common");
  const [info, setInfo] = useState<NativeAppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNativeAppInfo().then((i) => { if (!cancelled) setInfo(i); });
    return () => { cancelled = true; };
  }, []);

  if (!info) return null;
  return (
    <p className={className}>
      {t("nativeAppVersion", { ...info })}
    </p>
  );
}
