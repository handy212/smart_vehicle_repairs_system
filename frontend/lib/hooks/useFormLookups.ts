"use client";

import { useQuery } from "@tanstack/react-query";
import { branchesApi } from "@/lib/api/branches";
import { hrApi } from "@/lib/api/hr";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { adminApi } from "@/lib/api/admin";
import { billingApi } from "@/lib/api/billing";

const LOOKUP_STALE = 5 * 60 * 1000;

/** Active branches — shared cache for filters and forms. */
export function useActiveBranches() {
  return useQuery({
    queryKey: ["branches", "active"],
    queryFn: () => branchesApi.list({ is_active: true }),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

/** Active HR staff list for assignment dropdowns. */
export function useActiveStaff() {
  return useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => (await hrApi.staff.list({ employment_status: "active" })).data,
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

/** Staff users (sales agents / assignable users). */
export function useStaffUsers() {
  return useQuery({
    queryKey: ["users", "staff"],
    queryFn: () => adminApi.users.staffList(),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

export function useAssetCategories() {
  return useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => fixedAssetsApi.categories.active(),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

export function useTaxConfig() {
  return useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

export function useHrDepartments() {
  return useQuery({
    queryKey: ["hr", "departments"],
    queryFn: () => hrApi.departments.list({ is_active: true }).then((res) => res.data),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}

export function useHrPositions() {
  return useQuery({
    queryKey: ["hr", "positions"],
    queryFn: () => hrApi.positions.list({ is_active: true }).then((res) => res.data),
    staleTime: LOOKUP_STALE,
    refetchOnWindowFocus: false,
  });
}
