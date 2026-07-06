"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  className?: string;
  children: ReactElement;
}

/**
 * Wraps Recharts so ResponsiveContainer only mounts once the parent has real dimensions.
 * Avoids "width(-1) and height(-1)" warnings in flex/grid layouts and during hydration.
 */
export function ChartContainer({ className, children }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const { width, height } = node.getBoundingClientRect();
      const nextWidth = Math.floor(width);
      const nextHeight = Math.floor(height);

      if (nextWidth <= 0 || nextHeight <= 0) return;

      setSize((current) =>
        current?.width === nextWidth && current?.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={cn("w-full min-w-0", className)}>
      {size ? (
        <ResponsiveContainer width={size.width} height={size.height}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
