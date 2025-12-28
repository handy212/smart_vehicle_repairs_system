import { useCallback } from "react";
import { useToastStore, Toast as ToastType } from "@/store/useToastStore";

export function useToast() {
  const { toasts, addToast, removeToast } = useToastStore();

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

  type ToastOptions = {
    title?: string;
    description?: string;
    variant?: "default" | "destructive" | "success" | "warning" | "info";
    duration?: number;
  };

  const toast = useCallback(
    ({ title, description, variant, duration }: ToastOptions) => {
      const type =
        variant === "destructive"
          ? "error"
          : variant === "success"
            ? "success"
            : variant === "warning"
              ? "warning"
              : variant === "info"
                ? "info"
                : "info";
      return addToast({
        title,
        message: description || title || "",
        type,
        duration,
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

