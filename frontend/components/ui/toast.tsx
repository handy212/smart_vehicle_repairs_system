"use client";

import * as React from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
  onClose: (id: string) => void;
}

export function Toast({ id, title, message, type = "info", onClose }: ToastProps) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const styles = {
    success: "bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100",
    error: "bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100",
    warning: "bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100",
    info: "bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100",
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        "flex items-start space-x-3 p-4 rounded-lg border-2 shadow-xl backdrop-blur-sm max-w-md animate-in slide-in-from-top-2 duration-300",
        styles[type]
      )}
    >
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm mb-1">{title}</p>}
        <p className="text-sm">{message}</p>
      </div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: Omit<ToastProps, "onClose">[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  );
}

