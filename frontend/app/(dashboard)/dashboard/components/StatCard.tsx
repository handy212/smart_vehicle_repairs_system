"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { memo } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "./Sparkline";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  link?: string;
  trendData?: number[];
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  color,
  link,
  trendData,
}: StatCardProps) {
  const cardContent = (
    <Card
      className={cn(
        "precision-card h-32 relative overflow-hidden group transition-all duration-300",
        link && "cursor-pointer hover:shadow-xl hover:-translate-y-1"
      )}
    >
      <CardContent className="p-5 flex h-full items-center justify-between gap-4">
        <div className="flex flex-col justify-between h-full z-10 min-w-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">{title}</p>
            <h3 className="text-2xl font-bold tracking-tighter text-foreground">
              {value}
            </h3>
          </div>
          
           <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", "bg-muted")}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            {link && <span className="text-[9px] font-black uppercase tracking-widest text-primary opacity-60">Live View</span>}
          </div>
        </div>

        <div className="flex-1 h-16 max-w-[140px] relative z-0">
          {trendData && <Sparkline data={trendData} color={color} />}
        </div>
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
