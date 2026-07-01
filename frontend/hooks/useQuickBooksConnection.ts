"use client";

import { useQuery } from "@tanstack/react-query";
import { quickbooksApi } from "@/lib/api/quickbooks";

export function useQuickBooksConnection() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["qbo", "status"],
    queryFn: () => quickbooksApi.getStatus(),
    staleTime: 60 * 1000,
    refetchInterval: 30000,
  });

  const isLinked = data?.is_connected ?? false;
  const isApiReady = data?.api_ready ?? false;
  /** True when outbound/inbound sync actions should be enabled in the UI. */
  const isOperational = isLinked && isApiReady;

  return {
    isConnected: isLinked,
    isLinked,
    isApiReady,
    isOperational,
    connectionIssue: data?.connection_issue ?? null,
    hasKeys: data?.has_keys ?? false,
    companyName: data?.company_name ?? null,
    lastSync: data?.last_sync ?? null,
    tokenExpiresAt: data?.token_expires_at ?? null,
    refreshTokenExpiresAt: data?.refresh_token_expires_at ?? null,
    outboundPending: data?.outbound_pending ?? null,
    isLoading,
    isError,
    refetch,
  };
}
