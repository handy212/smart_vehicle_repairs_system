"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { reportingApi } from "@/lib/api/reporting";
import { ReportCatalogDirectory } from "./components/ReportCatalogDirectory";
import { ReportsSubNav, REPORT_HUB_SECTIONS } from "./components/ReportsSubNav";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";

const TAB_REDIRECTS = Object.fromEntries(
  REPORT_HUB_SECTIONS.map((section) => [section.slug, section.href])
) as Record<string, string>;

export default function ReportsIndexPage() {
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Reports & Analytics
        </h1>
        <div className="mt-2">
          <BranchReportChip />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse the report directory or open a hub section for filtered analytics.
        </p>
      </div>

      <ReportsSubNav />

      {reportCatalog?.reports && reportCatalog.reports.length > 0 ? (
        <ReportCatalogDirectory reports={reportCatalog.reports} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading report catalog…</p>
      )}
    </div>
  );
}
