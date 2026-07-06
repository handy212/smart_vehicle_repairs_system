import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
    Skeleton,
    CardSkeleton,
    TableSkeleton,
    DashboardSkeleton,
    ListSkeleton
} from '@/components/ui/skeleton';

describe('Skeleton Components', () => {
    describe('Skeleton', () => {
        it('should render base skeleton', () => {
            const { container } = render(<Skeleton />);
            const skeleton = container.firstChild as HTMLElement;

            expect(skeleton).toBeInTheDocument();
            expect(skeleton).toHaveClass('animate-pulse');
            expect(skeleton).toHaveClass('rounded-md');
        });

        it('should accept custom className', () => {
            const { container } = render(<Skeleton className="h-10 w-full" />);
            const skeleton = container.firstChild as HTMLElement;

            expect(skeleton).toHaveClass('h-10');
            expect(skeleton).toHaveClass('w-full');
        });
    });

    describe('CardSkeleton', () => {
        it('should render card skeleton with multiple elements', () => {
            const { container } = render(<CardSkeleton />);
            const skeletons = container.querySelectorAll('.animate-pulse');

            expect(skeletons.length).toBeGreaterThan(1);
        });
    });

    describe('TableSkeleton', () => {
        it('should render default 5 rows', () => {
            const { container } = render(<TableSkeleton />);
            const skeletons = container.querySelectorAll('.animate-pulse');

            // 1 header + 5 rows = 6 total
            expect(skeletons.length).toBe(6);
        });

        it('should render custom number of rows', () => {
            const { container } = render(<TableSkeleton rows={3} />);
            const skeletons = container.querySelectorAll('.animate-pulse');

            // 1 header + 3 rows = 4 total
            expect(skeletons.length).toBe(4);
        });
    });

    describe('DashboardSkeleton', () => {
        it('should render dashboard skeleton with multiple sections', () => {
            const { container } = render(<DashboardSkeleton />);
            const skeletons = container.querySelectorAll('.animate-pulse');

            // Should have title, subtitle, stat cards, and chart skeletons
            expect(skeletons.length).toBeGreaterThan(8);
        });

        it('should render 6 card skeletons for stats', () => {
            const { container } = render(<DashboardSkeleton />);
            const cardSkeletons = container.querySelectorAll('.rounded-lg.border');

            // 6 stat cards + 2 chart containers = 8 total
            expect(cardSkeletons.length).toBe(8);
        });
    });

    describe('ListSkeleton', () => {
        it('should render default 5 items', () => {
            const { container } = render(<ListSkeleton />);
            const items = container.querySelectorAll('.flex.items-center.space-x-4');

            expect(items.length).toBe(5);
        });

        it('should render custom number of items', () => {
            const { container } = render(<ListSkeleton items={3} />);
            const items = container.querySelectorAll('.flex.items-center.space-x-4');

            expect(items.length).toBe(3);
        });

        it('should render avatar and text skeletons for each item', () => {
            const { container } = render(<ListSkeleton items={1} />);
            const avatarSkeleton = container.querySelector('.rounded-full');
            const textSkeletons = container.querySelectorAll('.flex-1 .animate-pulse');

            expect(avatarSkeleton).toBeInTheDocument();
            expect(textSkeletons.length).toBe(2); // Title and subtitle
        });
    });
});
