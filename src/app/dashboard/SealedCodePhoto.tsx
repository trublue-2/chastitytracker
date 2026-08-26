"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import { LockClosedIcon } from "@/app/components/lockIcons";

/**
 * Zeigt das versiegelte Schlüsselbox-Code-Foto (Bildersafe). Die Sichtbarkeit entscheidet der
 * Server: das Foto-Gate liefert 403, solange versiegelt, sonst 200. Wir zeigen entweder
 * „versiegelt" oder einen „Code anzeigen"-Button (Vollbild).
 *
 * `revealed` ist das Urteil, das der SERVER schon gefällt hat (abgeschlossene Session → das Gate
 * gibt frei, weil ein späteres OEFFNEN existiert). Ohne dieses Urteil proben wir das Gate selbst —
 * und das kostet den vollen Bild-Download für einen einzigen Boolean, weshalb ein Aufrufer, der
 * die Antwort kennt, sie durchreichen soll statt sie erneut erfragen zu lassen.
 */
export default function SealedCodePhoto({ url, revealed }: { url: string; revealed?: boolean }) {
  const t = useTranslations("dashboard");
  const [probed, setProbed] = useState<"loading" | "sealed" | "revealed">("loading");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (revealed !== undefined) return;
    let cancelled = false;
    fetch(url)
      .then((r) => { if (!cancelled) setProbed(r.ok ? "revealed" : "sealed"); })
      .catch(() => { if (!cancelled) setProbed("sealed"); });
    return () => { cancelled = true; };
  }, [url, revealed]);

  // Das Urteil des Servers wird ABGELEITET, nicht in den State kopiert: sonst bliebe der einmal
  // geprobte Stand stehen, wenn `revealed` nach dem Erfassen des Aufschlusses nachrückt.
  const state = revealed === undefined ? probed : revealed ? "revealed" : "sealed";

  if (state === "loading") {
    return <p className="text-xs text-foreground-faint mt-1">…</p>;
  }
  if (state === "sealed") {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-sperrzeit border border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] px-2 py-1 rounded-lg">
        <LockClosedIcon size={12} /> {t("codeSealed")}
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
