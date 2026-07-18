"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { authApi, type User } from "@/lib/api/auth";
import { ensureApiSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/authStore";

export const CURRENT_USER_QUERY_KEY = ["user"] as const;

type UseCurrentUserOptions = {
  /** When true, ensure cookie/session before calling /me (layouts/gates). */
  ensureSession?: boolean;
  /** Sync the fetched user into the auth store. */
  syncStore?: boolean;
  enabled?: boolean;
} & Pick<UseQueryOptions<User>, "staleTime" | "retry">;

/**
 * Shared current-user query. All callers share cache under ["user"].
 */
export function useCurrentUser(options: UseCurrentUserOptions = {}) {
  const {
    ensureSession = false,
    syncStore = false,
    enabled = true,
    staleTime = 5 * 60 * 1000,
    retry = false,
  } = options;

  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async () => {
      if (ensureSession) {
        const ok = await ensureApiSession();
        if (!ok) {
          throw new Error("Not authenticated");
        }
      }
      const user = await authApi.getCurrentUser();
      if (syncStore) {
        setUser(user);
      }
      return user;
    },
    enabled,
    staleTime,
    gcTime: 10 * 60 * 1000,
    retry,
    refetchOnWindowFocus: false,
  });
}

/** Customer id from portal user shape (profile or nested customer). */
export function getCustomerId(user: User | null | undefined): number | undefined {
  return user?.customer_profile?.id ?? user?.customer?.id ?? undefined;
}
