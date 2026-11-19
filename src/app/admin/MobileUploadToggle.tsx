"use client";

import { useState } from "react";
import Toggle from "@/app/components/Toggle";
import { useTranslations } from "next-intl";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

export default function MobileUploadToggle({
  userId,
  initialValue,
}: {
  userId: string;
  initialValue: boolean;
}) {
  const t = useTranslations("admin");
  const { saving, saveToggle } = useUserSettingsSave(userId);
  const [value, setValue] = useState(initialValue);

  // Über den geteilten Saver: er wertet die Antwort aus und meldet sich. Das eigene `fetch` von
  // früher prüfte die Antwort nicht — ein abgelehnter Patch liess den Schalter falsch stehen.
  return (
    <Toggle
      label={t("mobileUploadAdminTitle")}
      description={t("mobileUploadAdminDesc")}
      checked={value}
      disabled={saving}
      onChange={(checked) => saveToggle("mobileDesktopUpload", checked, setValue)}
    />
  );
}
