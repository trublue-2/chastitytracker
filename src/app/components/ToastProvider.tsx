"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Toast, { type ToastData, type ToastType } from "./Toast";

const MAX_TOASTS = 3;

interface ToastAPI {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

interface ToastOptions {
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export const ToastContext = createContext<ToastAPI | null>(null);

let counter = 0;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = `toast-${++counter}`;
    setToasts((prev) => {
      const next = [...prev, { id, type, message, ...opts }];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api: ToastAPI = {
    success: (msg, opts) => addToast("success", msg, opts),
    error: (msg, opts) => addToast("error", msg, opts),
    warning: (msg, opts) => addToast("warning", msg, opts),
    info: (msg, opts) => addToast("info", msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[9999] flex flex-col gap-2 items-center sm:items-end w-full max-w-sm px-4 sm:px-0 pointer-events-none"
            aria-live="polite"
            aria-label="Benachrichtigungen"
          >
            {toasts.map((t) => (
              <div key={t.id} className="pointer-events-auto w-full">
                <Toast toast={t} onDismiss={dismiss} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
