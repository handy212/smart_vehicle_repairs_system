import { useCallback } from "react";
import { useToastStore, type ToastType } from "@/store/useToastStore";

type ToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success" | "warning" | "info";
  duration?: number;
};

function variantToType(
  variant?: ToastOptions["variant"]
): ToastType {
  switch (variant) {
    case "destructive":
      return "error";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "info":
      return "info";
    case "default":
    default:
      return "default";
  }
}

export function useToast() {
  const { toasts, addToast, removeToast } = useToastStore();

  const success = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, type: "success" }),
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, type: "error" }),
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, type: "warning" }),
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, type: "info" }),
    [addToast]
  );

  const toast = useCallback(
    ({ title, description, variant, duration }: ToastOptions) => {
      let type = variantToType(variant);

      // Common app patterns often omit variant on success/error titles
      if (!variant && title) {
        const t = title.trim().toLowerCase();
        if (t === "success" || t.startsWith("saved") || t.startsWith("created") || t.startsWith("updated") || t.startsWith("deleted")) {
          type = "success";
        } else if (
          t === "error" ||
          t === "failed" ||
          t.startsWith("couldn't") ||
          t.startsWith("could not") ||
          t.startsWith("unable")
        ) {
          type = "error";
        } else if (t === "warning" || t.startsWith("warning")) {
          type = "warning";
        }
      }

      if (title && !description) {
        return addToast({ message: title, type, duration });
      }
      if (!title && description) {
        return addToast({ message: description, type, duration });
      }
      return addToast({
        title,
        message: description || "",
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
