"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";

export type WhatsAppSendResult = {
  mode: "api" | "manual" | "preview";
  success?: boolean;
  message?: string;
  phone_number?: string;
  phone_display?: string;
  portal_url?: string;
  document_pdf_url?: string;
  error?: string;
};

export type WhatsAppSendFn = (opts?: { confirm?: boolean }) => Promise<WhatsAppSendResult>;

function openManualWhatsApp(phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

export async function handleWhatsAppSendFlow(
  send: WhatsAppSendFn,
  toast: ReturnType<typeof useToast>["toast"],
  successTitle = "WhatsApp"
) {
  const preview = await send({ confirm: false });

  if (!preview.phone_number) {
    toast({
      title: "Cannot send WhatsApp",
      description: preview.error || "Customer phone number is missing.",
      variant: "destructive",
    });
    return;
  }

  const display = preview.phone_display || preview.phone_number;
  const confirmed = window.confirm(
    `Send via WhatsApp to ${display}?${
      preview.document_pdf_url ? "\n\nA PDF download link will be included." : ""
    }`
  );
  if (!confirmed) return;

  const result = await send({ confirm: true });

  if (result.mode === "api" && result.success) {
    toast({
      title: successTitle,
      description: `Sent via WhatsApp to ${result.phone_display || result.phone_number}.`,
    });
    return;
  }

  if (!result.phone_number || !result.message) {
    toast({
      title: "Cannot open WhatsApp",
      description: result.error || "Customer phone number is missing.",
      variant: "destructive",
    });
    return;
  }

  openManualWhatsApp(result.phone_number, result.message);
  toast({
    title: successTitle,
    description: `Opened WhatsApp for ${result.phone_display || result.phone_number}.`,
  });
}

/** @deprecated Prefer handleWhatsAppSendFlow for confirm + preview */
export async function handleWhatsAppSendResult(
  result: WhatsAppSendResult,
  toast: ReturnType<typeof useToast>["toast"],
  successTitle = "WhatsApp"
) {
  if (result.mode === "api" && result.success) {
    toast({
      title: successTitle,
      description: "Message sent via WhatsApp.",
    });
    return;
  }

  if (!result.phone_number || !result.message) {
    toast({
      title: "Cannot open WhatsApp",
      description: result.error || "Customer phone number is missing.",
      variant: "destructive",
    });
    return;
  }

  openManualWhatsApp(result.phone_number, result.message);
  toast({
    title: successTitle,
    description: "Opened WhatsApp with a prepared message.",
  });
}

interface DocumentWhatsAppButtonProps {
  label?: string;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  send: WhatsAppSendFn;
  successTitle?: string;
  /** Render as menu item button instead of Button */
  asMenuItem?: boolean;
  onComplete?: () => void;
}

export function DocumentWhatsAppButton({
  label = "WhatsApp",
  className,
  variant = "outline",
  size = "sm",
  disabled,
  send,
  successTitle = "WhatsApp",
  asMenuItem = false,
  onComplete,
}: DocumentWhatsAppButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    try {
      await handleWhatsAppSendFlow(send, toast, successTitle);
    } catch (error: unknown) {
      toast({
        title: "WhatsApp failed",
        description: getUserFacingError(error, "Could not send via WhatsApp."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      onComplete?.();
    }
  };

  if (asMenuItem) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isLoading}
        className={cn(
          "w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
      >
        <MessageSquare className="w-4 h-4" />
        {isLoading ? "Preparing…" : label}
      </button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      <MessageSquare className="h-4 w-4" />
      {size !== "icon" && (isLoading ? "Preparing…" : label)}
    </Button>
  );
}
