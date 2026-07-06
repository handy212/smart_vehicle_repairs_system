import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@/components/shared/EmptyState';

describe('EmptyState', () => {
    it('should render with title', () => {
        render(<EmptyState title="No items found" />);

        expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('should render with description', () => {
        render(<EmptyState title="No items" description="Try adding some items" />);

        expect(screen.getByText('Try adding some items')).toBeInTheDocument();
    });

    it('should render default icon when none provided', () => {
        const { container } = render(<EmptyState title="Empty" />);

        // Inbox icon from lucide renders as an SVG
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('should render custom icon', () => {
        render(
            <EmptyState
                title="Custom"
                icon={<span data-testid="custom-icon">🚗</span>}
            />
        );

        expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('should render action button with onClick', () => {
        const handleClick = vi.fn();
        render(
            <EmptyState
                title="Empty"
                action={{ label: 'Add Item', onClick: handleClick }}
            />
        );

        const button = screen.getByText('Add Item');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should render action button with href', () => {
        render(
            <EmptyState
                title="Empty"
                action={{ label: 'Go somewhere', href: '/items' }}
            />
        );

        const link = screen.getByText('Go somewhere').closest('a');
        expect(link).toHaveAttribute('href', '/items');
    });

    it('should accept custom className', () => {
        const { container } = render(
            <EmptyState title="Empty" className="my-custom-class" />
        );

        expect(container.firstChild).toHaveClass('my-custom-class');
    });
});
