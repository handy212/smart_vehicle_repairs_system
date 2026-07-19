import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserMenu } from '@/components/layout/UserMenu';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { branchesApi } from '@/lib/api/admin';

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/store/branchStore', () => ({
  useBranchStore: vi.fn(),
}));

vi.mock('@/lib/api/admin', () => ({
  branchesApi: {
    accessible: vi.fn(),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  authApi: {
    logout: vi.fn(),
  },
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    asChild,
    ...props
  }: React.ComponentProps<'div'> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <div {...props}>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const branches = [
  { id: 10, name: 'Alpha Branch', code: 'ALP', is_active: true, is_headquarters: false },
  { id: 20, name: 'Beta Branch', code: 'BET', is_active: true, is_headquarters: true },
];

function renderUserMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserMenu />
    </QueryClientProvider>,
  );
}

describe('UserMenu branch switcher', () => {
  const setBranch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 1,
        email: 'manager@example.com',
        first_name: 'Branch',
        last_name: 'Manager',
        role: 'manager',
      },
      logout: vi.fn(),
    } as never);
    vi.mocked(useBranchStore).mockReturnValue({
      activeBranchId: 10,
      activeBranch: branches[0],
      setBranch,
      clearBranch: vi.fn(),
    });
    vi.mocked(branchesApi.accessible).mockResolvedValue(branches as never);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  it('shows branch selector when user has multiple branches', async () => {
    renderUserMenu();

    expect(await screen.findByText(/switch branch/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /alpha branch/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /beta branch \(hq\)/i })).toBeInTheDocument();
  });

  it('calls setBranch when a different branch is selected', async () => {
    renderUserMenu();

    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: '20' } });

    await waitFor(() => {
      expect(setBranch).toHaveBeenCalledWith(
        expect.objectContaining({ id: 20, name: 'Beta Branch' }),
      );
    });
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
