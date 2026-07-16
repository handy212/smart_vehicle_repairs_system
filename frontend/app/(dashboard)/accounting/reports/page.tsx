"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Clock,
  DollarSign,
  FileBarChart,
  Library,
  Percent,
  PieChart,
  Scale,
  Target,
  Wallet,
} from "lucide-react";
import { ACCOUNTING_REPORT_SECTIONS } from "./components/AccountingReportsSubNav";
import type { LucideIcon } from "lucide-react";

const REPORT_ICONS: Record<string, LucideIcon> = {
  "general-ledger": Library,
  "account-register": Library,
  "balance-sheet": Scale,
  "profit-loss": PieChart,
  "trial-balance": BarChart3,
  "cash-flow": Activity,
  aging: Clock,
  tax: Percent,
  "vat-return": Percent,
  "tax-reconciliation": Percent,
  "withholding-tax": Percent,
  "financial-ratios": Target,
  management: BarChart3,
  "margin-analysis": Target,
  "cost-control": Target,
  "opex-variance": Wallet,
  "job-profitability": DollarSign,
  "expense-breakdown": FileBarChart,
};

export default function AccountingReportsIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Financial Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GL statements, profitability, aging, tax, and management analytics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {ACCOUNTING_REPORT_SECTIONS.map((section) => {
          const Icon = REPORT_ICONS[section.slug] ?? FileBarChart;
          return (
            <Link
              key={section.slug}
              href={section.href}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {section.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Open report</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
