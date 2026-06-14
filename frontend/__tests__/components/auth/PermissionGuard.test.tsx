import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/lib/api/auth';

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

type MockAuthState = {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
};

describe('PermissionGuard', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockImplementation(((selector?: (state: MockAuthState) => unknown) => {
      const state: MockAuthState = {
        user: {
          id: 1,
          email: 'staff@test.com',
          first_name: 'Staff',
          last_name: 'User',
          role: 'technician',
          permissions: ['view_workorders', 'view_own_workorders'],
        } as User,
        isAuthenticated: true,
        setUser: vi.fn(),
        logout: vi.fn(),
      };
      return selector ? selector(state) : state;
    }) as typeof useAuthStore);
  });

  it('renders children when permission is granted', () => {
    render(
      <PermissionGuard permission="view_workorders">
        <button type="button">Allowed Action</button>
      </PermissionGuard>,
    );

    expect(screen.getByRole('button', { name: 'Allowed Action' })).toBeInTheDocument();
  });

  it('hides children when permission is missing', () => {
    render(
      <PermissionGuard permission="delete_workorders">
        <button type="button">Delete Work Order</button>
      </PermissionGuard>,
    );

    expect(screen.queryByRole('button', { name: 'Delete Work Order' })).not.toBeInTheDocument();
  });

  it('supports any-of permission checks', () => {
    render(
      <PermissionGuard permissions={['create_payments', 'process_payments']}>
        <button type="button">Record Payment</button>
      </PermissionGuard>,
    );

    expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument();
  });
});
