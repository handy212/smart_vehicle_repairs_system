import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkOrderCommandBar } from '@/app/(dashboard)/workorders/[id]/components/WorkOrderCommandBar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock('@/app/(dashboard)/workorders/[id]/components/WorkflowActions', () => ({
  default: () => null,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      user: {
        id: 1,
        email: 'manager@test.com',
        first_name: 'Manager',
        last_name: 'User',
        role: 'manager',
        permissions: ['edit_workorders', 'delete_workorders'],
      },
      isAuthenticated: true,
      setUser: vi.fn(),
      logout: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('WorkOrderCommandBar permission gating', () => {
  const baseProps = {
    workOrder: {
      id: 1,
      work_order_number: 'WO-100',
      status: 'draft',
    },
    workOrderId: 1,
    onStatusChange: vi.fn(),
    onPrintWorkOrder: vi.fn(),
    onDownloadPdf: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openActionsMenu() {
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);
  }

  it('shows delete action only when canDelete is true', async () => {
    renderWithClient(
      <WorkOrderCommandBar
        {...baseProps}
        canDelete
        onDelete={vi.fn()}
      />,
    );

    await openActionsMenu();
    expect(screen.getByText('Delete order')).toBeInTheDocument();
  });

  it('hides delete action when canDelete is false', async () => {
    renderWithClient(
      <WorkOrderCommandBar
        {...baseProps}
        canDelete={false}
        onDelete={vi.fn()}
      />,
    );

    await openActionsMenu();
    expect(screen.queryByText('Delete order')).not.toBeInTheDocument();
  });

  it('calls onDelete when permitted delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderWithClient(
      <WorkOrderCommandBar
        {...baseProps}
        canDelete
        onDelete={onDelete}
      />,
    );

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);
    await user.click(screen.getByText('Delete order'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
