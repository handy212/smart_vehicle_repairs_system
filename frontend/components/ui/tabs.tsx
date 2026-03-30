"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value: propValue, defaultValue, onValueChange, children, className }: TabsProps) {
  const [value, setValue] = React.useState(defaultValue || "");

  const currentValue = propValue !== undefined ? propValue : value;

  const handleValueChange = (newValue: string) => {
    if (propValue === undefined) {
      setValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-muted/60 p-1 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<"button"> {
  value: string;
}

export function TabsTrigger({ value, children, className, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }

  const isActive = context.value === value;

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-background/70",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsContent must be used within Tabs");
  }

  if (context.value !== value) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  );
}
