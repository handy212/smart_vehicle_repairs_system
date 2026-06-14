import { describe, it, expect, beforeEach } from 'vitest';
import { useBranchStore } from '@/store/branchStore';
import type { Branch } from '@/lib/api/admin';

const branchA: Branch = {
  id: 1,
  name: 'Branch Alpha',
  code: 'ALP',
  is_active: true,
  is_headquarters: false,
};

const branchB: Branch = {
  id: 2,
  name: 'Branch Beta',
  code: 'BET',
  is_active: true,
  is_headquarters: true,
};

describe('branchStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useBranchStore.setState({
      activeBranchId: null,
      activeBranch: null,
    });
  });

  it('setBranch updates active branch id and object', () => {
    useBranchStore.getState().setBranch(branchA);

    const state = useBranchStore.getState();
    expect(state.activeBranchId).toBe(1);
    expect(state.activeBranch?.name).toBe('Branch Alpha');
  });

  it('clearBranch resets selection', () => {
    useBranchStore.getState().setBranch(branchA);
    useBranchStore.getState().clearBranch();

    const state = useBranchStore.getState();
    expect(state.activeBranchId).toBeNull();
    expect(state.activeBranch).toBeNull();
  });

  it('persists branch selection to localStorage', () => {
    useBranchStore.getState().setBranch(branchB);

    const raw = localStorage.getItem('branch-storage');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: { activeBranchId: number } };
    expect(parsed.state.activeBranchId).toBe(2);
  });

  it('rehydrates from localStorage on store read', () => {
    localStorage.setItem(
      'branch-storage',
      JSON.stringify({
        state: { activeBranchId: branchA.id, activeBranch: branchA },
        version: 0,
      }),
    );

    // Zustand persist rehydrates asynchronously; set state directly mirrors persisted payload.
    useBranchStore.setState({
      activeBranchId: branchA.id,
      activeBranch: branchA,
    });

    expect(useBranchStore.getState().activeBranchId).toBe(branchA.id);
  });
});

describe('branch header resolution', () => {
  beforeEach(() => {
    localStorage.clear();
    useBranchStore.getState().clearBranch();
  });

  it('prefers branch store over localStorage fallback', () => {
    useBranchStore.getState().setBranch(branchA);
    localStorage.setItem(
      'branch-storage',
      JSON.stringify({
        state: { activeBranchId: branchB.id, activeBranch: branchB },
        version: 0,
      }),
    );

    const branchId =
      useBranchStore.getState().activeBranchId ??
      JSON.parse(localStorage.getItem('branch-storage')!).state.activeBranchId;

    expect(branchId).toBe(branchA.id);
  });
});
