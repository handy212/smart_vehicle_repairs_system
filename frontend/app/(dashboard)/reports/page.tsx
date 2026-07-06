"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { reportingApi } from "@/lib/api/reporting";
import { ReportCatalogDirectory } from "./components/ReportCatalogDirectory";
import { ReportsSubNav, REPORT_HUB_SECTIONS } from "./components/ReportsSubNav";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useTheme } from "@/lib/hooks/useTheme";

const TAB_REDIRECTS = Object.fromEntries(
  REPORT_HUB_SECTIONS.map((section) => [section.slug, section.href])
) as Record<string, string>;

export default function ReportsIndexPage() {
  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme.startsWith("perfex");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TAB_REDIRECTS[tab]) {
      router.replace(TAB_REDIRECTS[tab]);
    }
  }, [router, searchParams]);

  const { data: reportCatalog } = useQuery({
    queryKey: ["reporting", "catalog"],
    queryFn: () => reportingApi.catalog(),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div>
        <h1 className={`${isPerfex ? "text-base font-semibold" : "text-2xl sm:text-3xl font-bold"} text-foreground`}>
          Reports & Analytics
        </h1>
        <div className="mt-2">
          <BranchReportChip />
        </div>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
          Browse the report directory or open a hub section for filtered analytics.
        </p>
      </div>

      <ReportsSubNav isPerfex={isPerfex} />

      {reportCatalog?.reports && reportCatalog.reports.length > 0 ? (
        <ReportCatalogDirectory reports={reportCatalog.reports} isPerfex={isPerfex} />
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading report catalog…</p>
      )}
    </div>
  );
}
