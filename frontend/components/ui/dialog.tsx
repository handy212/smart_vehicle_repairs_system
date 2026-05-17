"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="pointer-events-none relative z-[100] flex w-full justify-center animate-in fade-in zoom-in-95 duration-200">{children}</div>
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
          "pointer-events-auto relative bg-card rounded-lg shadow-lg w-full max-w-lg border border-border max-h-[calc(100vh-1.5rem)] sm:max-h-[90vh] overflow-y-auto flex flex-col gap-4 p-4 sm:p-6",
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
    className={cn("flex flex-col space-y-1.5 text-left", className)}
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
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2", className)}
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
    const child = children as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
    return React.cloneElement(child, {
      ...props,
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        child.props.onClick?.(e);
      },
    });
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
