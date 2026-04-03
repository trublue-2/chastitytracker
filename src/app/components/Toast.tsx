"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: "bg-ok-bg", border: "border-ok-border", text: "text-ok-text", icon: "text-ok" },
  error:   { bg: "bg-warn-bg", border: "border-warn-border", text: "text-warn-text", icon: "text-warn" },
  warning: { bg: "bg-inspect-bg", border: "border-inspect-border", text: "text-inspect-text", icon: "text-inspect" },
  info:    { bg: "bg-unlock-bg", border: "border-unlock-border", text: "text-unlock-text", icon: "text-unlock" },
};

const defaultDurations: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 6000,
  info: 4000,
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);
  const Icon = icons[toast.type];
  const colors = colorMap[toast.type];
  const duration = toast.duration ?? defaultDurations[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(() => onDismiss(toast.id), 200);
      return () => clearTimeout(timer);
    }
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "flex items-start gap-3 w-full max-w-sm px-4 py-3 rounded-xl border shadow-raised",
        colors.bg,
        `border-[var(--color-${toast.type === "success" ? "ok" : toast.type === "error" ? "warn" : toast.type === "warning" ? "inspect" : "unlock"}-border)]`,
        exiting ? "animate-toast-exit" : "animate-toast-enter",
      ].join(" ")}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${colors.icon}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${colors.text}`}>{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className={`text-sm font-semibold underline mt-1 ${colors.text}`}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setExiting(true)}
        className="shrink-0 p-1 rounded-md text-foreground-faint hover:text-foreground transition-colors"
        aria-label="Schliessen"
      >
        <X size={14} />
      </button>
    </div>
  );
}
