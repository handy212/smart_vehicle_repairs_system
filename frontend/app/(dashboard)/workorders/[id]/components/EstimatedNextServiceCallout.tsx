"use client";

import { useQuery } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Gauge,
  Info,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EstimatedNextServiceCalloutProps {
  workOrderId: number;
  /** True when the work order has a linked vehicle (object or id). */
  hasVehicle: boolean;
  className?: string;
}

const calloutTheme = "border-primary/20 bg-primary/5 [&>svg]:text-primary";

export function EstimatedNextServiceCallout({
  workOrderId,
  hasVehicle,
  className,
}: EstimatedNextServiceCalloutProps) {
  const { data: prediction, isLoading, isError } = useQuery({
    queryKey: ["workorder-prediction", workOrderId],
    queryFn: () => workordersApi.predictService(workOrderId),
    enabled: !!workOrderId && hasVehicle,
    staleTime: 5 * 60 * 1000,
  });

  if (!hasVehicle) {
    return null;
  }

  if (isLoading) {
    return (
      <Alert className={cn(calloutTheme, className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle className="text-sm">Estimated next service</AlertTitle>
        <AlertDescription>
          <div className="mt-2 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className={className}>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Estimated next service</AlertTitle>
        <AlertDescription>
          Unable to load service estimate. Try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (prediction?.message) {
    return (
      <Alert className={cn("border-border bg-muted/40 [&>svg]:text-muted-foreground", className)}>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Estimated next service</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          {prediction.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!prediction) {
    return null;
  }

  return (
    <Alert className={cn(calloutTheme, className)}>
      <Sparkles className="h-4 w-4" />
      <div className="flex items-start justify-between gap-2">
        <AlertTitle className="text-sm">Estimated next service</AlertTitle>
        <Badge variant="outline" className="h-5 shrink-0 text-[10px] font-normal">
          History-based
        </Badge>
      </div>
      <AlertDescription className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border bg-card p-2">
            <span className="flex items-center text-muted-foreground">
              <Calendar className="mr-1 h-3 w-3" />
              Projected date
            </span>
            <p className="mt-1 font-semibold text-foreground">{prediction.predicted_date}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2">
            <span className="flex items-center text-muted-foreground">
              <Gauge className="mr-1 h-3 w-3" />
              Target odometer
            </span>
            <p className="mt-1 font-semibold text-foreground">
              {prediction.predicted_odometer.toLocaleString()} km
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{prediction.recommendation}</p>

        <div>
          <div className="mb-1 flex justify-between text-[10px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Confidence
            </span>
            <span>{Math.round(prediction.confidence_score * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${prediction.confidence_score * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Based on prior completed work orders and odometer readings (~
            {prediction.km_per_day.toLocaleString()} km/day).
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
