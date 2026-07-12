"use client";

import { useQuery } from "@tanstack/react-query";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { QBO_STATUS_PERMISSIONS } from "@/lib/utils/permissions";

type Options = {
  /** When false, skip the status poll entirely. Defaults to QBO-related permissions. */
  enabled?: boolean;
};

export function useQuickBooksConnection(options?: Options) {
  const { hasAnyPermission } = usePermissions();
  const canCheckStatus = hasAnyPermission([...QBO_STATUS_PERMISSIONS]);
  const enabled = options?.enabled ?? canCheckStatus;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["qbo", "status"],
    queryFn: () => quickbooksApi.getStatus(),
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: enabled ? 30000 : false,
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
    isLoading: enabled ? isLoading : false,
    isError,
    refetch,
  };
}
