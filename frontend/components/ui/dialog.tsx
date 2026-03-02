"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open || !mounted) return null;

  // Use createPortal to render outside the current DOM hierarchy (Stacking Context)
  // This ensures z-index works relative to the viewport/body, not the parent container
  const { createPortal } = require("react-dom");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-[100] animate-in fade-in zoom-in-95 duration-200">{children}</div>
    </div>,
    document.body
  );
};

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative bg-card rounded-lg shadow-lg max-w-lg w-full mx-4 border border-border max-h-[90vh] overflow-hidden flex flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-left p-6", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4", className)}
    {...props}
  />
);

const DialogClose = ({
  onOpenChange,
  className,
}: {
  onOpenChange: (open: boolean) => void;
  className?: string;
}) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn("absolute right-4 top-4", className)}
    onClick={() => onOpenChange(false)}
  >
    <X className="h-4 w-4" />
  </Button>
);

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }
>(({ asChild, children, onClick, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {

    const childProps = children.props as any;
    return React.cloneElement(children, {
      ...props,
      ref,
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        if (childProps?.onClick) {
          childProps.onClick(e);
        }
      },

    } as any);
  }
  return (
    <button ref={ref} onClick={onClick} {...props}>
      {children}
    </button>
  );
});
DialogTrigger.displayName = "DialogTrigger";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
};

