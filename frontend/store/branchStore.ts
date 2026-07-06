import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Branch } from "@/lib/api/admin";

interface BranchState {
  activeBranchId: number | null;
  activeBranch: Branch | null;
  setBranch: (branch: Branch) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranchId: null,
      activeBranch: null,
      setBranch: (branch) =>
        set({
          activeBranchId: branch.id,
          activeBranch: branch,
        }),
      clearBranch: () =>
        set({
          activeBranchId: null,
          activeBranch: null,
        }),
    }),
    {
      name: "branch-storage",
      storage:
        typeof window !== "undefined"
          ? createJSONStorage(() => localStorage)
          : undefined,
      partialize: (state) => ({
        activeBranchId: state.activeBranchId,
        activeBranch: state.activeBranch,
      }),
    }
  )
);


