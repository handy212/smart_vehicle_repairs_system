"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { memo, useState, useEffect } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "./Sparkline";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  link?: string;
  description?: string;
  linkLabel?: string;
  trendData?: number[];
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  color,
  link,
  description,
  linkLabel = "Open view",
  trendData,
}: StatCardProps) {
  const [isPerfex, setIsPerfex] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsPerfex(document.documentElement.classList.contains('perfex'));
    }
  }, []);

  const cardContent = (
    <Card
      className={cn(
        "precision-card relative overflow-hidden group transition-all duration-300",
        isPerfex ? "min-h-[60px]" : "min-h-[152px]",
        link && "cursor-pointer hover:shadow-xl hover:-translate-y-1"
      )}
    >
      {!isPerfex && (
        <div
          className="absolute inset-x-6 top-0 h-24 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: color }}
        />
      )}
      <CardContent className={cn("relative flex h-full flex-col justify-between p-5", isPerfex ? "p-3 gap-0" : "gap-5")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={cn("font-bold uppercase tracking-[0.2em] text-gray-400 mb-1", isPerfex ? "text-[8px]" : "text-[10px]")}>{title}</p>
            <h3 className={cn("font-bold tracking-tighter text-foreground", isPerfex ? "text-lg" : "text-2xl")}>
              {value}
            </h3>
            {!isPerfex && description && (
              <p className="mt-2 max-w-[18rem] text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex items-center justify-center rounded-2xl border border-white/30 bg-background/80 shadow-sm backdrop-blur-sm",
              isPerfex ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-2xl"
            )}
            style={!isPerfex ? { boxShadow: `0 12px 30px ${color}1a` } : undefined}
          >
            <Icon className={cn(isPerfex ? "h-4 w-4" : "h-5 w-5")} style={{ color }} />
          </div>
        </div>

        {!isPerfex && (
          <div className="flex items-end justify-between gap-4">
            <div className="min-h-[48px] flex-1">
              {trendData && (
                <div className="h-12 max-w-[140px]">
                  <Sparkline data={trendData} color={color} />
                </div>
              )}
            </div>
            {link && (
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">
                {linkLabel}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (link) {
    return (
      <Link href={link} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
});
