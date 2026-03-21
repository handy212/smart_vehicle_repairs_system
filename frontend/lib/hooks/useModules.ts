"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemModule } from "@/lib/api/admin";
import { useMemo } from "react";
import { useAuthStore } from "@/store/authStore";

/**
 * Hook to fetch and manage system module statuses
 */
export function useModules() {
  const { user } = useAuthStore();
  const { data: moduleData, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => adminApi.modules.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
      const module = modules.find((m) => m.slug === slug);
      return module ? module.is_enabled : true;
    };
  }, [modules, user?.role]);

  return {
    modules,
    isModuleEnabled,
    isLoading,
    error,
    refetch,
  };
}
