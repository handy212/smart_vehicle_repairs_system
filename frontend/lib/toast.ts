/**
 * App toast API — drop-in replacement for sonner.
 * Uses the shared workshop toaster (store + <Toaster />).
 */
import { useToastStore, type ToastType } from "@/store/useToastStore";

type SonnerOptions = {
  description?: string;
  duration?: number;
};

function push(type: ToastType, message: string, options?: SonnerOptions) {
  const description = options?.description?.trim();
  const title = message.trim();

  if (description) {
    return useToastStore.getState().addToast({
      title,
      message: description,
      type,
      duration: options?.duration,
    });
  }

  return useToastStore.getState().addToast({
    message: title,
    type,
    duration: options?.duration,
  });
}

function toastFn(message: string, options?: SonnerOptions) {
  return push("default", message, options);
}

toastFn.success = (message: string, options?: SonnerOptions) =>
  push("success", message, options);
toastFn.error = (message: string, options?: SonnerOptions) =>
  push("error", message, options);
toastFn.warning = (message: string, options?: SonnerOptions) =>
  push("warning", message, options);
toastFn.info = (message: string, options?: SonnerOptions) =>
  push("info", message, options);
toastFn.message = (message: string, options?: SonnerOptions) =>
  push("default", message, options);

export const toast = toastFn;
