"use client";

import { useRouter } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  isLocked: boolean;
}

export default function NewEntrySheet({ open, onClose, isLocked }: Props) {
  const t = useTranslations("newEntry");
  const router = useRouter();

  const options = [
    {
      type: "verschluss",
      icon: Lock,
      label: t("lock"),
      desc: t("lockSubtitle"),
      disabled: isLocked,
      disabledText: t("lockDisabled"),
      color: "text-lock",
      href: "/dashboard/new/verschluss",
    },
    {
      type: "oeffnen",
      icon: LockOpen,
      label: t("open"),
      desc: t("openSubtitle"),
      disabled: !isLocked,
      disabledText: t("openDisabled"),
      color: "text-unlock",
      href: "/dashboard/new/oeffnen",
    },
    {
      type: "pruefung",
      icon: ClipboardCheck,
      label: t("inspection"),
      desc: t("inspectionSubtitle"),
      disabled: false,
      color: "text-inspect",
      href: "/dashboard/new/pruefung",
    },
    {
      type: "orgasmus",
      icon: Droplets,
      label: t("orgasm"),
      desc: t("orgasmSubtitle"),
      disabled: false,
      color: "text-orgasm",
      href: "/dashboard/new/orgasmus",
    },
  ];

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          if (opt.disabled) {
            return (
              <div
                key={opt.type}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl opacity-40 cursor-not-allowed"
              >
                <Icon size={22} className="text-foreground-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-foreground-faint">{opt.disabledText ?? opt.desc}</p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => handleSelect(opt.href)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <Icon size={22} className={`${opt.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-foreground-muted">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
