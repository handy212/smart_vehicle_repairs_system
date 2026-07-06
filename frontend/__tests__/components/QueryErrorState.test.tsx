import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryErrorState } from '@/components/shared/QueryErrorState';

describe('QueryErrorState', () => {
    it('should render default title', () => {
        render(<QueryErrorState error={null} />);

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render custom title', () => {
        render(<QueryErrorState error={null} title="Failed to load data" />);

        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });

    it('should display error message', () => {
        const error = new Error('Network error occurred');
        render(<QueryErrorState error={error} />);

        expect(screen.getByText('Network error occurred')).toBeInTheDocument();
    });

    it('should render retry button when onRetry is provided', () => {
        const onRetry = vi.fn();
        render(<QueryErrorState error={null} onRetry={onRetry} />);

        const button = screen.getByText('Try Again');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('should not render retry button when onRetry is not provided', () => {
        render(<QueryErrorState error={null} />);

        expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('should have role="alert" for accessibility', () => {
        const { container } = render(<QueryErrorState error={null} />);

        expect(container.querySelector('[role="alert"]')).toBeInTheDocument();
    });

    it('should accept custom className', () => {
        const { container } = render(
            <QueryErrorState error={null} className="custom-class" />
        );

        expect(container.querySelector('[role="alert"]')).toHaveClass('custom-class');
    });
});
