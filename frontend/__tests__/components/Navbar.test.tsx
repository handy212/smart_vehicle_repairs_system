import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { useAuthStore } from '@/store/authStore';

// Mock the auth store
vi.mock('@/store/authStore', () => ({
    useAuthStore: vi.fn(),
}));

// Mock the branch store
vi.mock('@/store/branchStore', () => ({
    useBranchStore: vi.fn(() => ({
        activeBranchId: null,
        activeBranch: null,
        setBranch: vi.fn(),
    })),
}));

// Mock API modules
vi.mock('@/lib/api/notifications', () => ({
    notificationsApi: {
        unreadCount: vi.fn(() => Promise.resolve({ unread_count: 5 })),
    },
}));

vi.mock('@/lib/api/admin', () => ({
    branchesApi: {
        accessible: vi.fn(() => Promise.resolve([])),
    },
}));

vi.mock('@/lib/api/auth', () => ({
    authApi: {
        logout: vi.fn(),
    },
}));

vi.mock('@/lib/api/search', () => ({
    searchApi: {
        global: vi.fn(() => Promise.resolve({ results: [] })),
    },
}));

vi.mock('@/lib/hooks/useBranding', () => ({
    useBranding: vi.fn(() => ({
        siteName: 'Smart Vehicle Repairs',
        logoSrc: null,
        primaryColor: null,
        getMediaUrl: vi.fn(),
    })),
}));

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};

describe('Navbar Component', () => {
    beforeEach(() => {
        (useAuthStore as any).mockReturnValue({
            user: {
                id: 1,
                email: 'test@example.com',
                first_name: 'Test',
                last_name: 'User',
                role: 'admin',
            },
            isAuthenticated: true,
            logout: vi.fn(),
        });
    });

    it('should render navbar with user information', async () => {
        render(<Navbar />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByText('Smart Vehicle Repairs')).toBeInTheDocument();
        });
    });

    it('should display user name and role', async () => {
        render(<Navbar />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByText('Test User')).toBeInTheDocument();
            expect(screen.getByText('admin')).toBeInTheDocument();
        });
    });

    it('should show notification bell', async () => {
        render(<Navbar />, { wrapper: createWrapper() });

        const bellButton = await screen.findByLabelText('Notifications');
        expect(bellButton).toBeInTheDocument();
    });

    it('should display search button', async () => {
        render(<Navbar />, { wrapper: createWrapper() });

        const searchButton = screen.getByLabelText(/open search/i);
        expect(searchButton).toBeInTheDocument();
    });

    it('should have mobile menu toggle button', () => {
        const onMenuToggle = vi.fn();
        render(<Navbar onMenuToggle={onMenuToggle} />, { wrapper: createWrapper() });

        const menuButton = screen.getByLabelText('Toggle menu');
        expect(menuButton).toBeInTheDocument();
    });
});
