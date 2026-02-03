
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReceiveItemsDialog from '@/app/(dashboard)/inventory/purchase-orders/components/ReceiveItemsDialog';
import { PurchaseOrder } from '@/lib/api/inventory';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock API hooks
// ...

// Helper for Radix UI
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock hooks
vi.mock('@/lib/hooks/useCurrency', () => ({
    useCurrency: () => ({
        formatCurrency: (val: number) => `$${val}`,
    }),
}));

vi.mock('@/lib/hooks/useToast', () => ({
    useToast: () => ({
        toast: vi.fn(),
    }),
}));

vi.mock('@/store/branchStore', () => ({
    useBranchStore: () => ({
        activeBranch: { id: 1, name: 'Main Branch' },
    }),
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const mockPurchaseOrder: PurchaseOrder = {
    id: 1,
    po_number: 'PO001',
    supplier: { id: 1, name: 'Test Supplier', email: 'test@example.com', phone: '1234567890', address: '123 St', is_active: true },
    status: 'confirmed',
    order_date: '2023-01-01',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    total_items: 2,
    total_quantity: 20,
    received_quantity: 0,
    subtotal: 100,
    tax_amount: 10,
    shipping_cost: 5,
    total: 115,
    items: [
        {
            id: 101,
            purchase_order: 1,
            part: { id: 50, name: 'Part A', part_number: 'PA-01', category: 1, quantity_in_stock: 0, reorder_point: 5, minimum_stock: 2, cost_price: '10.00', selling_price: '20.00', is_active: true },
            part_name: 'Part A',
            part_number: 'PA-01',
            quantity: 10,
            quantity_received: 0,
            remaining_quantity: 10,
            unit_cost: 10,
            total: 100,
            is_fully_received: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
        },
        {
            id: 102,
            purchase_order: 1,
            part: { id: 51, name: 'Part B', part_number: 'PB-02', category: 1, quantity_in_stock: 0, reorder_point: 5, minimum_stock: 2, cost_price: '5.00', selling_price: '10.00', is_active: true },
            part_name: 'Part B',
            part_number: 'PB-02',
            quantity: 10,
            quantity_received: 10,
            remaining_quantity: 0,
            unit_cost: 5,
            total: 50,
            is_fully_received: true,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
        }
    ]
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('ReceiveItemsDialog', () => {
    it('renders the "Receive Items" button even when some items are fully received', () => {
        render(
            <Wrapper>
                <ReceiveItemsDialog purchaseOrder={mockPurchaseOrder} />
            </Wrapper>
        );
        // console.log("DEBUG HTML:", document.body.innerHTML);
        expect(screen.getByText('Receive Items')).toBeInTheDocument();
        // throw new Error("Force Fail to see Output");
    });

    it('opens the dialog and shows unreceived items', async () => {
        render(
            <Wrapper>
                <ReceiveItemsDialog purchaseOrder={mockPurchaseOrder} />
            </Wrapper>
        );

        fireEvent.click(screen.getByText('Receive Items'));

        // Should show Part A which has remaining quantity
        expect(screen.getByText('Part A')).toBeInTheDocument();

        // Should show correct remaining quantity
        // The dialog logic filters unreceived items. Part B is fully received so it might effectively be filtered out or show separately?
        // Let's check logic: `unreceivedItems = purchaseOrder.items?.filter((item) => getRemainingQuantity(item) > 0) || [];`
        // So Part B should NOT be in the main list or at least filtered out of "unreceivedItems".

        expect(screen.queryByText('Part B')).not.toBeInTheDocument();
    });

    it('renders correctly when NO items are remaining (all received)', async () => {
        const fullyReceivedPO = {
            ...mockPurchaseOrder,
            items: [
                {
                    ...mockPurchaseOrder.items![1], // Part B (fully received)
                    id: 103
                }
            ]
        };

        render(
            <Wrapper>
                <ReceiveItemsDialog purchaseOrder={fullyReceivedPO} />
            </Wrapper>
        );

        // Button should still be visible because we removed the "return null" check
        expect(screen.getByText('Receive Items')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Receive Items'));

        // Should show "All items have been received" message
        expect(screen.getByText('All items have been received')).toBeInTheDocument();
    });
});
