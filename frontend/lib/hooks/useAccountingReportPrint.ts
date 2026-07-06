"use client";

import { useCallback, useState } from "react";
import { isAxiosError } from "axios";
import apiClient from "@/lib/api/client";
import {
  buildAccountingReportApiPath,
  type AccountingReportPrintSlug,
} from "@/lib/accounting/accounting-report-print";

function parseError(err: unknown): string {
  if (isAxiosError(err) && err.response) {
    const data = err.response.data;
    if (typeof data === "object" && data !== null) {
      const body = data as { error?: string; detail?: string };
      return body.error || body.detail || err.message;
    }
    if (typeof data === "string" && data.trim()) {
      return data.trim();
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Failed to open print view";
}

export function useAccountingReportPrint() {
  const [isOpeningPrint, setIsOpeningPrint] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openReportPrint = useCallback(
    async (slug: AccountingReportPrintSlug, params: Record<string, string | undefined>) => {
      setIsOpeningPrint(true);
      setError(null);
      try {
        const path = buildAccountingReportApiPath(slug, "print", params);
        const response = await apiClient.get<string>(path, {
          responseType: "text",
          headers: { Accept: "text/html" },
        });
        const win = window.open("", "_blank");
        if (!win) {
          throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
        }
        win.document.write(response.data);
        win.document.close();
      } catch (err) {
        const msg = parseError(err);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsOpeningPrint(false);
      }
    },
    []
  );

  const downloadReportPdf = useCallback(
    async (
      slug: AccountingReportPrintSlug,
      params: Record<string, string | undefined>,
      filename: string
    ) => {
      setIsDownloadingPdf(true);
      setError(null);
      try {
        const path = buildAccountingReportApiPath(slug, "pdf", params);
        const response = await apiClient.get<Blob>(path, { responseType: "blob" });
        const url = URL.createObjectURL(response.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (err) {
        const msg = parseError(err);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsDownloadingPdf(false);
      }
    },
    []
  );

  return {
    openReportPrint,
    downloadReportPdf,
    isOpeningPrint,
    isDownloadingPdf,
    error,
  };
}
