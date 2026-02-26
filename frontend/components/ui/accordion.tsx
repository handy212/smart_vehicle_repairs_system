"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { ChevronDown } from "lucide-react";

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
  onToggle: () => void;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | undefined>(undefined);

interface AccordionContextValue {
  openItems: Set<string>;
  toggleItem: (value: string) => void;
  type: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined);

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  defaultValue,
  value: controlledValue,
  onValueChange,
  collapsible = true,
  children,
  className,
}: AccordionProps) {
  const [internalOpenItems, setInternalOpenItems] = React.useState<Set<string>>(() => {
    if (defaultValue) {
      const items = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
      return new Set(items);
    }
    return new Set();
  });

  const isControlled = controlledValue !== undefined;
  const openItems = isControlled
    ? new Set(Array.isArray(controlledValue) ? controlledValue : [controlledValue])
    : internalOpenItems;

  const toggleItem = React.useCallback(
    (itemValue: string) => {
      const newOpenItems = new Set(openItems);
      const isCurrentlyOpen = newOpenItems.has(itemValue);

      if (isCurrentlyOpen) {
        // Item is open, close it
        if (collapsible || type === "multiple") {
          newOpenItems.delete(itemValue);
        }
      } else {
        // Item is closed, open it
        if (type === "single") {
          newOpenItems.clear(); // Close all other items
        }
        newOpenItems.add(itemValue);
      }

      if (!isControlled) {
        setInternalOpenItems(newOpenItems);
      }
      if (onValueChange) {
        if (type === "single") {
          const firstValue = Array.from(newOpenItems)[0] || "";
          onValueChange(firstValue);
        } else {
          onValueChange(Array.from(newOpenItems));
        }
      }
    },
    [openItems, collapsible, type, isControlled, onValueChange]
  );

  return (
    <AccordionContext.Provider
      value={{
        openItems,
        toggleItem,
        type,
      }}
    >
      <div className={cn("w-full", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  const context = React.useContext(AccordionContext);
  if (!context) {
    throw new Error("AccordionItem must be used within Accordion");
  }

  const isOpen = context.openItems.has(value);
  const onToggle = () => context.toggleItem(value);

  return (
    <AccordionItemContext.Provider value={{ value, isOpen, onToggle }}>
      <div
        className={cn(
          "border-b border-border",
          className
        )}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

export function AccordionTrigger({ children, className, asChild }: AccordionTriggerProps) {
  const itemContext = React.useContext(AccordionItemContext);
  if (!itemContext) {
    throw new Error("AccordionTrigger must be used within AccordionItem");
  }

  const { isOpen, onToggle } = itemContext;

  if (asChild && React.isValidElement(children)) {

    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: onToggle,
      "aria-expanded": isOpen,
      "data-state": isOpen ? "open" : "closed",

      className: cn(className, (children.props as any).className),
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "flex w-full items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
    </button>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const itemContext = React.useContext(AccordionItemContext);
  if (!itemContext) {
    throw new Error("AccordionContent must be used within AccordionItem");
  }

  const { isOpen } = itemContext;

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        "overflow-hidden text-sm transition-all",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
    >
      <div className="pb-4 pt-0">{children}</div>
    </div>
  );
}

