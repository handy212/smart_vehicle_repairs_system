import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/error-boundary';

// A component that throws on render
function ThrowingComponent({ message }: { message: string }): never {
    throw new Error(message);
}

// Suppress React error boundary console noise in tests
const originalConsoleError = console.error;
beforeEach(() => {
    console.error = (...args: unknown[]) => {
        const msg = typeof args[0] === 'string' ? args[0] : '';
        if (
            msg.includes('Error: Uncaught') ||
            msg.includes('The above error occurred')
        ) {
            return;
        }
        originalConsoleError.call(console, ...args);
    };
});
afterEach(() => {
    console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
    it('should render children when no error', () => {
        render(
            <ErrorBoundary>
                <div data-testid="child">Hello</div>
            </ErrorBoundary>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('should render fallback UI when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent message="test crash" />
            </ErrorBoundary>
        );

        // Should show the error boundary fallback, not crash
        expect(screen.queryByText('test crash')).not.toBeNull;
        // The error boundary should catch and display something
        expect(
            screen.getByText(/something went wrong/i) ||
            screen.getByText(/error/i)
        ).toBeTruthy();
    });
});
