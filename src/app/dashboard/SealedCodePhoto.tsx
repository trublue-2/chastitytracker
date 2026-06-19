"use client";

import { useEffect, useState } from "react";
import { Lock, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { FullscreenImageModal } from "@/app/components/ImageViewer";

/**
 * Zeigt das versiegelte Schlüsselbox-Code-Foto (Bildersafe). Die Sichtbarkeit entscheidet der
 * Server: das Foto-Gate liefert 403, solange versiegelt, sonst 200. Wir proben den Status und
 * zeigen entweder „versiegelt" oder einen „Code anzeigen"-Button (Vollbild).
 */
export default function SealedCodePhoto({ url }: { url: string }) {
  const t = useTranslations("dashboard");
  const [state, setState] = useState<"loading" | "sealed" | "revealed">("loading");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => { if (!cancelled) setState(r.ok ? "revealed" : "sealed"); })
      .catch(() => { if (!cancelled) setState("sealed"); });
    return () => { cancelled = true; };
  }, [url]);

  if (state === "loading") {
    return <p className="text-xs text-foreground-faint mt-1">…</p>;
  }
  if (state === "sealed") {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-sperrzeit border border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] px-2 py-1 rounded-lg">
        <Lock size={12} /> {t("codeSealed")}
      </div>
    );
  }
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ok)] border border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ok)_15%,transparent)] transition px-2.5 py-1 rounded-lg"
      >
        <Eye size={12} /> {t("codeShow")}
      </button>
      {open && <FullscreenImageModal src={url} alt={t("codePhotoTitle")} onClose={() => setOpen(false)} />}
    </div>
  );
}
