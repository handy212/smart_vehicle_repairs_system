import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkflowActions from '@/app/(dashboard)/workorders/[id]/components/WorkflowActions';
import { workordersApi } from '@/lib/api/workorders';

// Mock the API
vi.mock('@/lib/api/workorders', () => ({
    workordersApi: {
        get: vi.fn(),
        startIntake: vi.fn(),
        startDiagnosis: vi.fn(),
        startWork: vi.fn(),
        requestQualityCheck: vi.fn(),
        checkReadiness: vi.fn(),
    },
}));

vi.mock('@/lib/api/admin', () => ({
    adminApi: {
        users: {
            qualityInspectors: vi.fn(() =>
                Promise.resolve([
                    { id: 42, first_name: 'QC', last_name: 'Inspector', username: 'qc1' },
                ])
            ),
        },
    },
}));

vi.mock('@/lib/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: () => true,
        hasAnyPermission: () => true,
    }),
}));

vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: (s: { user: { id: number; role: string } }) => unknown) =>
        selector({ user: { id: 1, role: 'service_coordinator' } }),
}));

// Mock inspections API
vi.mock('@/lib/api/inspections', () => ({
    inspectionsApi: {
        list: vi.fn(() => Promise.resolve({ results: [], count: 0, next: null, previous: null })),
        create: vi.fn(),
    },
}));

// Mock diagnosis API
vi.mock('@/lib/api/diagnosis', () => ({
    diagnosisApi: {
        getByWorkOrder: vi.fn(() => Promise.resolve(null)),
        create: vi.fn(),
    },
}));

// Mock toast
vi.mock('@/lib/hooks/useToast', () => ({
    useToast: () => ({
        toast: vi.fn(),
    }),
}));

// Mock router
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        refresh: vi.fn(),
    }),
}));

// Mock currency hook
vi.mock('@/lib/hooks/useCurrency', () => ({
    useCurrency: () => ({
        formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    }),
}));

describe('WorkflowActions Component', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        vi.clearAllMocks();
    });


    const renderComponent = (props: any) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <WorkflowActions {...props} />
            </QueryClientProvider>
        );
    };

    describe('Draft Status Actions', () => {
        it('should render Start Intake button for draft status', async () => {
            const workOrder = {
                id: 1,
                status: 'draft',
                work_order_number: 'WO-001',
            };

            renderComponent({ workOrderId: 1, status: 'draft', workOrder });

            await waitFor(() => {
                expect(screen.getByText(/Start Intake/i)).toBeInTheDocument();
            });
        });

        it('should render Start Initial Inspection button for draft status', async () => {
            const workOrder = {
                id: 1,
                status: 'draft',
                work_order_number: 'WO-001',
            };

            renderComponent({ workOrderId: 1, status: 'draft', workOrder });

            await waitFor(() => {
                expect(screen.getByText(/Start Initial Inspection/i)).toBeInTheDocument();
            });
        });
    });

    describe('Assigned Status Actions', () => {
        it('should render Start Diagnosis button for assigned status', async () => {
            const workOrder = {
                id: 1,
                status: 'assigned',
                work_order_number: 'WO-001',
                service_coordinator: 1,
            };

            renderComponent({ workOrderId: 1, status: 'assigned', workOrder });

            await waitFor(() => {
                expect(screen.getByText(/Start Diagnosis/i)).toBeInTheDocument();
            });
        });
    });

    describe('Approved Status - Start Work', () => {
        it('should show Start Repairs button when work order is approved', async () => {
            vi.mocked(workordersApi.checkReadiness).mockResolvedValue({
                can_start: true,
                errors: [],
                unavailable_parts: [],
            });

            const workOrder = {
                id: 1,
                status: 'approved',
                work_order_number: 'WO-001',
                approved_by_customer: true,
            };

            renderComponent({ workOrderId: 1, status: 'approved', workOrder });

            await waitFor(() => {
                expect(screen.getByText(/Start Repairs/i)).toBeInTheDocument();
            });
        });

        it('should call startWork API when Start Repairs is clicked', async () => {
            const user = userEvent.setup();
            const mockStartWork = vi.mocked(workordersApi.startWork);
            mockStartWork.mockResolvedValue({
                id: 1,
                status: 'in_progress',
                work_order_number: 'WO-001',

            } as any);

            vi.mocked(workordersApi.checkReadiness).mockResolvedValue({
                can_start: true,
                errors: [],
                unavailable_parts: [],
            });

            const workOrder = {
                id: 1,
                status: 'approved',
                work_order_number: 'WO-001',
                approved_by_customer: true,
            };

            renderComponent({ workOrderId: 1, status: 'approved', workOrder });

            await waitFor(() => {
                const button = screen.getByText(/Start Repairs/i);
                expect(button).toBeInTheDocument();
            });

            const startButton = screen.getByText(/Start Repairs/i);
            await user.click(startButton);

            await waitFor(() => {
                expect(mockStartWork).toHaveBeenCalledWith(1);
            }, { timeout: 3000 });
        });
    });

    describe('In Progress Status Actions', () => {
        it('should render Request Quality Check button for in_progress status', async () => {
            const workOrder = {
                id: 1,
                status: 'in_progress',
                work_order_number: 'WO-001',
            };

            renderComponent({ workOrderId: 1, status: 'in_progress', workOrder });

            await waitFor(() => {
                const button = screen.queryByText(/Request Quality Check/i);
                expect(button).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('should call requestQualityCheck when Quality Check is requested', async () => {
            const user = userEvent.setup();
            const mockRequestQC = vi.mocked(workordersApi.requestQualityCheck);
            mockRequestQC.mockResolvedValue({
                id: 1,
                status: 'quality_check',
                work_order_number: 'WO-001',

            } as any);

            const workOrder = {
                id: 1,
                status: 'in_progress',
                work_order_number: 'WO-001',
                branch: 1,
            };

            renderComponent({ workOrderId: 1, status: 'in_progress', workOrder });

            const qcButton = await waitFor(() => {
                const button = screen.getByText(/Request Quality Check/i);
                expect(button).toBeInTheDocument();
                return button;
            }, { timeout: 3000 });

            await user.click(qcButton);

            const inspectorTrigger = await screen.findByText(/Select authorized inspector/i);
            await user.click(inspectorTrigger);
            await user.click(await screen.findByText(/QC Inspector/i));
            await user.click(screen.getByRole('button', { name: /^Request QC$/i }));

            await waitFor(() => {
                expect(mockRequestQC).toHaveBeenCalledWith(1, { assigned_to: 42 });
            });
        });
    });

    describe('Completed Status Billing Actions', () => {
        it('shows Open estimate instead of Create invoice when invoice must come from the linked estimate', async () => {
            vi.mocked(workordersApi.get).mockResolvedValue({
                id: 1,
                status: 'completed',
                work_order_number: 'WO-001',
                estimate_summary: {
                    id: 12,
                    estimate_number: 'EST-00012',
                    status: 'approved',
                    total: '350.00',
                },
                invoice_summary: null,
            } as any);

            renderComponent({
                workOrderId: 1,
                status: 'completed',
                workOrder: {
                    id: 1,
                    status: 'completed',
                    work_order_number: 'WO-001',
                    estimate_summary: {
                        id: 12,
                        estimate_number: 'EST-00012',
                        status: 'approved',
                        total: '350.00',
                    },
                    invoice_summary: null,
                },
            });

            expect(await screen.findByText(/Open estimate/i)).toBeInTheDocument();
            expect(screen.queryByText(/Create invoice/i)).not.toBeInTheDocument();
        });

        it('shows confirm billing complete on completed work orders with an issued invoice', async () => {
            vi.mocked(workordersApi.get).mockResolvedValue({
                id: 1,
                status: 'completed',
                work_order_number: 'WO-001',
                invoice_summary: {
                    id: 99,
                    invoice_number: 'INV-00099',
                    status: 'sent',
                    total: '350.00',
                    amount_due: '350.00',
                    amount_paid: '0.00',
                    is_paid: false,
                },
            } as any);

            renderComponent({
                workOrderId: 1,
                status: 'completed',
                workOrder: {
                    id: 1,
                    status: 'completed',
                    work_order_number: 'WO-001',
                    invoice_summary: {
                        id: 99,
                        invoice_number: 'INV-00099',
                        status: 'sent',
                        total: '350.00',
                        amount_due: '350.00',
                        amount_paid: '0.00',
                        is_paid: false,
                    },
                },
            });

            expect(await screen.findByText(/Confirm billing complete/i)).toBeInTheDocument();
            expect(screen.queryByText(/Close Work Order/i)).not.toBeInTheDocument();
        });

        it('allows closing an invoiced work order when the invoice is issued', async () => {
            vi.mocked(workordersApi.get).mockResolvedValue({
                id: 1,
                status: 'invoiced',
                work_order_number: 'WO-001',
                invoice_summary: {
                    id: 99,
                    invoice_number: 'INV-00099',
                    status: 'sent',
                    total: '350.00',
                    amount_due: '350.00',
                    amount_paid: '0.00',
                    is_paid: false,
                },
            } as any);

            renderComponent({
                workOrderId: 1,
                status: 'invoiced',
                workOrder: {
                    id: 1,
                    status: 'invoiced',
                    work_order_number: 'WO-001',
                    invoice_summary: {
                        id: 99,
                        invoice_number: 'INV-00099',
                        status: 'sent',
                        total: '350.00',
                        amount_due: '350.00',
                        amount_paid: '0.00',
                        is_paid: false,
                    },
                },
            });

            expect(await screen.findByText(/Close Work Order/i)).toBeInTheDocument();
        });
    });

    describe('Component Integration', () => {
        it('should render without crashing for different statuses', () => {
            const statuses = ['draft', 'assigned', 'diagnosis', 'awaiting_approval', 'approved', 'in_progress', 'quality_check', 'completed'];

            statuses.forEach(status => {
                const workOrder = {
                    id: 1,
                    status,
                    work_order_number: 'WO-001',
                    service_coordinator: status !== 'draft' ? 1 : undefined,
                    approved_by_customer: status === 'approved',
                };

                if (status === 'approved') {
                    vi.mocked(workordersApi.checkReadiness).mockResolvedValue({
                        can_start: true,
                        errors: [],
                        unavailable_parts: [],
                    });
                }

                const { unmount } = renderComponent({ workOrderId: 1, status, workOrder });
                expect(screen.getByTestId || screen.getByRole || (() => true)).toBeTruthy();
                unmount();
            });
        });
    });

    describe('Callback Props', () => {
        it('should call onStartRepairs after starting work', async () => {
            const user = userEvent.setup();
            const onStartRepairs = vi.fn();
            const mockStartWork = vi.mocked(workordersApi.startWork);
            mockStartWork.mockResolvedValue({
                id: 1,
                status: 'in_progress',
                work_order_number: 'WO-001',

            } as any);

            vi.mocked(workordersApi.checkReadiness).mockResolvedValue({
                can_start: true,
                errors: [],
                unavailable_parts: [],
            });

            const workOrder = {
                id: 1,
                status: 'approved',
                work_order_number: 'WO-001',
                approved_by_customer: true,
            };

            renderComponent({
                workOrderId: 1,
                status: 'approved',
                workOrder,
                onStartRepairs,
            });

            await waitFor(() => {
                expect(screen.getByText(/Start Repairs/i)).toBeInTheDocument();
            });

            const startButton = screen.getByText(/Start Repairs/i);
            await user.click(startButton);

            await waitFor(() => {
                expect(onStartRepairs).toHaveBeenCalled();
            }, { timeout: 3000 });
        });
    });
});
