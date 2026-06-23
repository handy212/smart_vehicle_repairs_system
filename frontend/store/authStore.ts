import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/lib/api/auth";
import { useBranchStore } from "@/store/branchStore";
import { clearTokens } from "@/lib/utils/token";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setUser: (user: User | null) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      logout: () => {
        clearTokens();
        useBranchStore.getState().clearBranch();
        set({
          user: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "auth-storage",
      storage: typeof window !== "undefined" ? createJSONStorage(() => localStorage) : undefined,
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

