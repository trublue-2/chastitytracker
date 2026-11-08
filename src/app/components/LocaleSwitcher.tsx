"use client";

import { LOCALES } from "@/lib/shared/constants";
import SegmentedControl from "@/app/components/SegmentedControl";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";

export default function LocaleSwitcher({ current }: { current: string }) {
  const switchLocale = useLocaleSwitcher();

  return <SegmentedControl options={LOCALES} value={current} onChange={switchLocale} />;
}
