"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Select from "@/app/components/Select";
import SettingLabel from "@/app/components/SettingLabel";
import { nativePlatformNow } from "@/lib/nativeApp";
import { APP_LOCK_OPTIONS, readAppLock, writeAppLock, type AppLockOption } from "@/lib/nativeAppLock";

/**
 * „App-Sperre" — nur in der App-Hülle: ob der Sperrbildschirm nach dem Verlassen wieder fragt und
 * nach welcher Schonfrist. Der Wert liegt auf dem GERÄT (siehe `nativeAppLock.ts`); erst nach dem
 * Mount gelesen, weil es im Server-Rendering keine Hülle gibt.
 */
export default function AppLockRow() {
  const t = useTranslations("settings");
  const [value, setValue] = useState<AppLockOption | null>(null);
  useEffect(() => {
    if (!nativePlatformNow()) return;
    void readAppLock().then(setValue);
  }, []);
  if (value === null) return null;

  const options = APP_LOCK_OPTIONS.map((o) => ({
    value: o,
    label: o === "off" ? t("appLockOff") : o === "0" ? t("appLockImmediate") : t("appLockAfter", { minutes: Number(o) }),
  }));

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <SettingLabel label={t("appLockTitle")} description={t("appLockHint")} />
      <Select
        className="w-44"
        aria-label={t("appLockTitle")}
        value={value}
        onChange={(e) => {
          const next = e.target.value as AppLockOption;
          setValue(next);
          void writeAppLock(next);
        }}
        options={options}
      />
    </div>
  );
}
