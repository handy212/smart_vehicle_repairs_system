import { Skeleton } from "./skeleton";
import { Card, CardContent, CardHeader } from "./card";

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex space-x-4">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-12 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

export { DashboardSkeleton } from "./skeleton";

