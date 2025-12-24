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

