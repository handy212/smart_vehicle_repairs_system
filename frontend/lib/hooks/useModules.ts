"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { ensureApiSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useMemo, useState } from "react";

const CONTROLLED_MODULE_SLUGS = new Set([
  "dashboard",
  "customers",
  "vehicles",
  "appointments",
  "workorders",
  "gatepass",
  "roadside",
  "technicians",
  "hr",
  "inventory",
  "billing",
  "accounting",
  "fixed-assets",
  "subscriptions",
  "inspections",
  "diagnosis",
  "reports",
  "sms",
  "chat",
]);

/**
 * Hook to fetch and manage system module statuses
 */
export function useModules() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const canViewModuleManagement = user?.role === "super-admin";
  const [sessionReady, setSessionReady] = useState(canViewModuleManagement ? false : true);

  useEffect(() => {
    if (!canViewModuleManagement) {
      setSessionReady(true);
      return;
    }

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
  }, [canViewModuleManagement, isAuthenticated]);

  const { data: moduleData, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => adminApi.modules.list(),
    enabled: isAuthenticated && sessionReady && canViewModuleManagement,
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

  const enabledModuleSlugs = useMemo(
    () => new Set(user?.enabled_modules || []),
    [user?.enabled_modules]
  );
  const hasModuleAvailability = Array.isArray(user?.enabled_modules);

  /**
   * Check if a specific module is enabled
   * @param slug The module slug (e.g., 'hr', 'accounting')
   */
  const isModuleEnabled = useMemo(() => {
    return (slug: string) => {
      // Dashboard is the staff home route; do not hide it when optional module slugs omit it.
      if (slug === "dashboard" && isAuthenticated) {
        return true;
      }

      if (!canViewModuleManagement) {
        if (!hasModuleAvailability) return true;
        return CONTROLLED_MODULE_SLUGS.has(slug) ? enabledModuleSlugs.has(slug) : true;
      }
      if (!modules.length) return true; // Default to true if not loaded yet
      const matchedModule = modules.find((m) => m.slug === slug);
      return matchedModule ? matchedModule.is_enabled : true;
    };
  }, [canViewModuleManagement, enabledModuleSlugs, hasModuleAvailability, isAuthenticated, modules]);

  return {
    modules,
    canViewModuleManagement,
    isModuleEnabled,
    isLoading,
    error,
    refetch,
  };
}
