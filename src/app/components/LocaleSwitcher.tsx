"use client";

import { useRouter } from "next/navigation";

const LOCALES = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
];

export default function LocaleSwitcher({ current }: { current: string }) {
  const router = useRouter();

  function setLocale(value: string) {
    document.cookie = `locale=${value}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 bg-background-subtle rounded-xl p-1">
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLocale(l.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            current === l.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-foreground-faint hover:text-foreground-muted"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
