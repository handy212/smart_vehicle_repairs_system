"use client";

import { useState, useCallback } from "react";

export interface Toast {
  id: string;
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(7);
    const newToast = { ...toast, id };

    setToasts((prev) => [...prev, newToast]);

    // Auto remove after duration (default 5 seconds)
    const duration = toast.duration || 5000;
    setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message: string, title?: string) => {
      return addToast({ message, title, type: "success" });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string) => {
      return addToast({ message, title, type: "error" });
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => {
      return addToast({ message, title, type: "warning" });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string) => {
      return addToast({ message, title, type: "info" });
    },
    [addToast]
  );

  const toast = useCallback(
    (options: {
      title?: string;
      description?: string;
      variant?: "default" | "destructive" | "success" | "warning" | "info";
    }) => {
      const type =
        options.variant === "destructive"
          ? "error"
          : options.variant === "success"
          ? "success"
          : options.variant === "warning"
          ? "warning"
          : options.variant === "info"
          ? "info"
          : "info";
      return addToast({
        title: options.title,
        message: options.description || options.title || "",
        type,
      });
    },
    [addToast]
  );

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    toast,
  };
}

