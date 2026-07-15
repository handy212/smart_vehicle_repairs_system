import { create } from "zustand";

export type ToastType = "default" | "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "type" | "duration"> & {
    type?: ToastType;
    duration?: number;
  }) => string;
  removeToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
}

const MAX_TOASTS = 4;

const DEFAULT_DURATION: Record<ToastType, number> = {
  default: 4000,
  success: 4000,
  info: 4500,
  warning: 5500,
  error: 7000,
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const remaining = new Map<string, number>();
const startedAt = new Map<string, number>();

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function scheduleRemove(
  id: string,
  duration: number,
  removeToast: (id: string) => void
) {
  clearTimer(id);
  remaining.set(id, duration);
  startedAt.set(id, Date.now());
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      remaining.delete(id);
      startedAt.delete(id);
      removeToast(id);
    }, duration)
  );
}

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = nextId();
    const type = toast.type ?? "default";
    const duration = toast.duration ?? DEFAULT_DURATION[type];
    const next: Toast = {
      id,
      title: toast.title,
      message: toast.message,
      type,
      duration,
    };

    set((state) => {
      const stacked = [...state.toasts, next];
      // Drop oldest when over the cap
      const overflow = stacked.length - MAX_TOASTS;
      if (overflow > 0) {
        stacked.slice(0, overflow).forEach((t) => clearTimer(t.id));
      }
      return { toasts: stacked.slice(-MAX_TOASTS) };
    });

    scheduleRemove(id, duration, get().removeToast);
    return id;
  },

  removeToast: (id) => {
    clearTimer(id);
    remaining.delete(id);
    startedAt.delete(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  pauseToast: (id) => {
    const start = startedAt.get(id);
    const left = remaining.get(id);
    if (start == null || left == null) return;
    const elapsed = Date.now() - start;
    remaining.set(id, Math.max(0, left - elapsed));
    clearTimer(id);
  },

  resumeToast: (id) => {
    const left = remaining.get(id);
    if (left == null) return;
    if (left <= 0) {
      get().removeToast(id);
      return;
    }
    scheduleRemove(id, left, get().removeToast);
  },
}));
