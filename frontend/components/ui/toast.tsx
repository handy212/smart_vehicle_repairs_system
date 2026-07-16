"use client";

import * as React from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ToastType } from "@/store/useToastStore";

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

const ICONS = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const ACCENT = {
  default: "border-l-primary text-primary",
  success: "border-l-success text-success",
  error: "border-l-destructive text-destructive",
  warning: "border-l-warning text-warning",
  info: "border-l-info text-info",
} as const;

const ICON_BG = {
  default: "bg-primary/10",
  success: "bg-success/10",
  error: "bg-destructive/10",
  warning: "bg-warning/10",
  info: "bg-info/10",
} as const;

const PROGRESS = {
  default: "bg-primary",
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
} as const;

export function Toast({
  id,
  title,
  message,
  type = "default",
  duration = 4000,
  onClose,
  onPause,
  onResume,
}: ToastProps) {
  const Icon = ICONS[type];
  const showTitle = Boolean(title && title !== message);

  return (
    <div
      role="status"
      aria-live={type === "error" ? "assertive" : "polite"}
      onMouseEnter={() => onPause?.(id)}
      onMouseLeave={() => onResume?.(id)}
      onFocus={() => onPause?.(id)}
      onBlur={() => onResume?.(id)}
      className={cn(
        "group/toast pointer-events-auto relative w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-lg border border-[color:var(--outline-variant)] border-l-4 bg-[var(--panel-bg,var(--card))] text-foreground shadow-workshop",
        "animate-in fade-in slide-in-from-right-4 duration-200",
        ACCENT[type]
      )}
    >
      <div className="flex items-start gap-3 p-3.5 pr-2">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            ICON_BG[type]
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          {showTitle && (
            <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
          )}
          {message ? (
            <p
              className={cn(
                "text-sm leading-snug text-muted-foreground",
                showTitle && "mt-0.5"
              )}
            >
              {message}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onClose(id)}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-0.5 w-full bg-muted/70">
        <div
          className={cn(
            "toast-progress-bar h-full origin-left group-hover/toast:[animation-play-state:paused]",
            PROGRESS[type]
          )}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: Omit<ToastProps, "onClose" | "onPause" | "onResume">[];
  onClose: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

export function ToastContainer({
  toasts,
  onClose,
  onPause,
  onResume,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(100vw-1.5rem,22rem)] flex-col-reverse gap-2 sm:bottom-6 sm:right-6"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={onClose}
          onPause={onPause}
          onResume={onResume}
        />
      ))}
    </div>
  );
}
