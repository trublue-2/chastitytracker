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
    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLocale(l.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            current === l.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
