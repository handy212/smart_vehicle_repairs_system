"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/utils/body-scroll-lock";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  side?: "right" | "left";
}

const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <div
        className="fixed inset-0 bg-foreground/40 dark:bg-black/70 animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {children}
    </div>,
    document.body
  );
};

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = "right", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "fixed z-[101] flex h-full flex-col border-border bg-[var(--panel-bg,var(--card))] shadow-workshop",
          "w-full max-w-md animate-in duration-300",
          side === "right" && "inset-y-0 right-0 border-l slide-in-from-right",
          side === "left" && "inset-y-0 left-0 border-r slide-in-from-left",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-4 border-b border-border", className)} {...props} />
);

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
  )
);
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";

const SheetClose = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
  <Button
    variant="ghost"
    size="icon"
    className="absolute right-4 top-4"
    onClick={() => onOpenChange(false)}
    aria-label="Close"
  >
    <X className="h-4 w-4" />
  </Button>
);

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose };
