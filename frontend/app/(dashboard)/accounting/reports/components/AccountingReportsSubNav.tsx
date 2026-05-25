"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export const ACCOUNTING_REPORT_SECTIONS = [
  { slug: "general-ledger", label: "General Ledger", href: "/accounting/reports/general-ledger" },
  { slug: "balance-sheet", label: "Balance Sheet", href: "/accounting/reports/balance-sheet" },
  { slug: "profit-loss", label: "Profit & Loss", href: "/accounting/reports/profit-loss" },
  { slug: "trial-balance", label: "Trial Balance", href: "/accounting/reports/trial-balance" },
  { slug: "cash-flow", label: "Cash Flow", href: "/accounting/reports/cash-flow" },
  { slug: "aging", label: "AR/AP Aging", href: "/accounting/reports/aging" },
  { slug: "tax", label: "Tax Report", href: "/accounting/reports/tax" },
  { slug: "management", label: "Management", href: "/accounting/reports/management" },
  { slug: "margin-analysis", label: "Margin Analysis", href: "/accounting/reports/margin-analysis" },
  { slug: "cost-control", label: "Cost Control", href: "/accounting/reports/cost-control" },
  { slug: "opex-variance", label: "OPEX Variance", href: "/accounting/reports/opex-variance" },
  { slug: "job-profitability", label: "Job Profitability", href: "/accounting/reports/job-profitability" },
  { slug: "expense-breakdown", label: "Expense Breakdown", href: "/accounting/reports/expense-breakdown" },
] as const;

interface AccountingReportsSubNavProps {
  className?: string;
}

export function AccountingReportsSubNav({ className }: AccountingReportsSubNavProps) {
  const pathname = usePathname();
  const onDirectory = pathname === "/accounting/reports";

  return (
    <nav
      className={cn(
        "flex gap-0 overflow-x-auto border-b border-border bg-card/50 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-4",
        className
      )}
      aria-label="Financial report sections"
    >
      <Link
        href="/accounting/reports"
        className={cn(
          "shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
          onDirectory
            ? "border-primary text-foreground font-semibold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        All Reports
      </Link>
      {ACCOUNTING_REPORT_SECTIONS.map((section) => {
        const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.slug}
            href={section.href}
            className={cn(
              "shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
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
