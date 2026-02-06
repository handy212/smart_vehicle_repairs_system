import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { memo } from "react";
import { LucideIcon, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  link?: string;
  alert?: boolean;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  badge?: string | number;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  color,
  link,
  alert,
  subtitle,
  trend,
  badge,
}: StatCardProps) {
  // Extract color classes for gradient effect
  const isColorClass = color.includes("bg-");
  const colorVariant = isColorClass ? color : "bg-gray-500";

  const cardContent = (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200 group",
        link && "cursor-pointer hover:shadow-lg hover:-translate-y-1",
        alert && "border-2 border-red-300 dark:border-red-700",
        !alert && !link && "hover:shadow-md"
      )}
    >
      {/* Decorative gradient background */}
      <div
        className={cn(
          "absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl -translate-y-1/2 translate-x-1/2",
          colorVariant
        )}
      />

      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 relative z-10">
        <div className="flex-1 min-w-0 pr-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              "p-2.5 sm:p-3 rounded-xl shadow-sm transition-transform duration-200",
              link && "group-hover:scale-110",
              colorVariant
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          {badge !== undefined && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {badge}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative z-10 pt-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-foreground truncate">
              {typeof value === "number" && !isNaN(value)
                ? value.toLocaleString()
                : value}
            </div>
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-xs font-medium",
                  trend.positive !== false
                    ? "text-success"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {trend.positive !== false ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>{trend.value > 0 ? "+" : ""}</span>
                <span>
                  {typeof trend.value === "number"
                    ? trend.value.toLocaleString()
                    : trend.value}
                </span>
                {trend.label && (
                  <span className="text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </div>
          {link && (
            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-hover:translate-x-1" />
          )}
        </div>

        {alert && (
          <div className="mt-3 pt-2 border-t border-red-200 dark:border-red-800">
            <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-600 dark:bg-red-400 rounded-full animate-pulse" />
              Action required
            </p>
          </div>
        )}
      </CardContent>

      {/* Hover effect overlay */}
      {link && (
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/5 dark:to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
      )}
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
