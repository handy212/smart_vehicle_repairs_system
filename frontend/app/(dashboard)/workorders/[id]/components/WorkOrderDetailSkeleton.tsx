import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkOrderDetailSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header Skeleton */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-4 w-64 mb-1" />
                        <Skeleton className="h-8 w-96" />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Skeleton className="h-9 w-24" />
                        <Skeleton className="h-9 w-24" />
                    </div>
                </div>
            </div>

            {/* Workflow Progress Skeleton */}
            <Card>
                <CardContent className="py-4 px-4">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-5 w-24" />
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex space-x-4 overflow-x-auto pb-2 flex-1">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <div key={i} className="flex flex-col items-center gap-2">
                                        <Skeleton className="h-8 w-8 rounded-full" />
                                        <Skeleton className="h-3 w-12" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs Skeleton */}
            <div className="space-y-4">
                <div className="flex space-x-2">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                </div>

                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <Skeleton className="h-6 w-48" />
                                <div className="grid grid-cols-2 gap-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Skeleton className="h-6 w-48" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
