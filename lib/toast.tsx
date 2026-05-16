"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "info" | "warning" | "danger";
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastCtx {
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    const toast: Toast = { duration: 3000, ...t, id };
    setToasts((cur) => [...cur, toast]);
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be inside <ToastProvider>");
  return v;
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (typeof window === "undefined") return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 max-w-sm w-[calc(100vw-32px)]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    if (!toast.duration) return;
    const t = setTimeout(() => setLeave(true), toast.duration - 200);
    return () => clearTimeout(t);
  }, [toast.duration]);

  const Icon =
    toast.kind === "success" ? Check :
    toast.kind === "warning" ? AlertTriangle :
    toast.kind === "danger" ? AlertCircle :
    Info;

  return (
    <div
      className={cn(
        "pointer-events-auto glass-strong rounded-2xl px-3.5 py-2.5 flex items-start gap-3 min-w-[280px]",
        leave ? "animate-fade-down" : "animate-scale-in"
      )}
      role="status"
    >
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center",
          toast.kind === "success" && "bg-success-soft text-success",
          toast.kind === "warning" && "bg-warning-soft text-warning",
          toast.kind === "danger" && "bg-danger-soft text-danger",
          toast.kind === "info" && "bg-info-soft text-info"
        )}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-headline text-fg">{toast.title}</p>
        {toast.description && (
          <p className="text-caption mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-subtle hover:text-fg transition-colors p-1 rounded-md"
        aria-label="Fermer"
      >
        <X size={13} />
      </button>
    </div>
  );
}
