import { DashboardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="animate-in fade-in duration-500">
            <DashboardSkeleton />
        </div>
    );
}
