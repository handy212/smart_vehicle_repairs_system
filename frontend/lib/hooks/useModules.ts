"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { ensureApiSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useMemo, useState } from "react";

/**
 * Hook to fetch and manage system module statuses
 */
export function useModules() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    ensureApiSession().then((ok) => {
      if (!cancelled) setSessionReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const { data: moduleData, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => adminApi.modules.list(),
    enabled: isAuthenticated && sessionReady,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  const modules = useMemo(() => {
    if (!moduleData?.results) return [];
    return moduleData.results;
  }, [moduleData]);

  /**
   * Check if a specific module is enabled
   * @param slug The module slug (e.g., 'hr', 'accounting')
   */
  const isModuleEnabled = useMemo(() => {
    return (slug: string) => {
      // No bypass for super-admin - they should respect system-wide module settings

      if (!modules.length) return true; // Default to true if not loaded yet
      const matchedModule = modules.find((m) => m.slug === slug);
      return matchedModule ? matchedModule.is_enabled : true;
    };
  }, [modules]);

  return {
    modules,
    isModuleEnabled,
    isLoading,
    error,
    refetch,
  };
}
