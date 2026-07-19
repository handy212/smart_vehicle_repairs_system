import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import * as React from 'react';

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// jsdom does not implement pointer-capture APIs used by Radix Select.
Object.defineProperties(Element.prototype, {
    hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => false),
    },
    setPointerCapture: {
        configurable: true,
        value: vi.fn(),
    },
    releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
    },
    scrollIntoView: {
        configurable: true,
        value: vi.fn(),
    },
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
        pathname: '/',
        query: {},
        asPath: '/',
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => {
        return React.createElement('a', { href }, children);
    },
}));

// Mock axios client
vi.mock('@/lib/api/client', () => {
    const mockAxiosInstance = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn(), eject: vi.fn() },
            response: { use: vi.fn(), eject: vi.fn() },
        },
    };

    return {
        default: mockAxiosInstance,
        apiClient: mockAxiosInstance,
    };
});

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000/api';
