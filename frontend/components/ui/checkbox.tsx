"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  className,
  checked,
  onCheckedChange,
  onChange,
  ...props
}: CheckboxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onCheckedChange) {
      onCheckedChange(e.target.checked);
    }
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={handleChange}
      className={cn(
        "h-4 w-4 rounded border-border text-primary focus:ring-primary focus:ring-2",
        className
      )}
      {...props}
    />
  );
}

