"use client";

import { useQuery } from "@tanstack/react-query";
import { quickbooksApi } from "@/lib/api/quickbooks";

export function useQuickBooksConnection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["qbo", "status"],
    queryFn: () => quickbooksApi.getStatus(),
    staleTime: 60 * 1000,
    refetchInterval: 30000,
  });

  return {
    isConnected: data?.is_connected ?? false,
    hasKeys: data?.has_keys ?? false,
    companyName: data?.company_name ?? null,
    lastSync: data?.last_sync ?? null,
    isLoading,
    isError,
  };
}
