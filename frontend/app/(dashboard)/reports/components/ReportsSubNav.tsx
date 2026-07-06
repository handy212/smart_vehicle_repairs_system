"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export const REPORT_HUB_SECTIONS = [
  { slug: "financial", label: "Financial", href: "/reports/financial" },
  { slug: "operational", label: "Operational", href: "/reports/operational" },
  { slug: "inventory", label: "Inventory", href: "/reports/inventory" },
  { slug: "customers", label: "Customers", href: "/reports/customers" },
  { slug: "subscriptions", label: "Subscriptions", href: "/reports/subscriptions" },
  { slug: "vehicles", label: "Vehicles", href: "/reports/vehicles" },
  { slug: "controls", label: "Controls", href: "/reports/controls" },
] as const;

export type ReportHubSection = (typeof REPORT_HUB_SECTIONS)[number]["slug"];

interface ReportsSubNavProps {
  className?: string;
  isPerfex?: boolean;
}

export function ReportsSubNav({ className, isPerfex = false }: ReportsSubNavProps) {
  const pathname = usePathname();
  const onDirectory = pathname === "/reports";

  return (
    <nav
      className={cn(
        "flex gap-0 overflow-x-auto border-b border-border",
        isPerfex ? "bg-card" : "",
        className
      )}
      aria-label="Report sections"
    >
      <Link
        href="/reports"
        className={cn(
          "shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
          onDirectory
            ? "border-primary text-foreground font-semibold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Directory
      </Link>
      {REPORT_HUB_SECTIONS.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.slug}
            href={section.href}
            className={cn(
              "shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              active
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
